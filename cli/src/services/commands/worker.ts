import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { readFile, mkdir, appendFile } from "node:fs/promises";
import { getExtensionRoot, resolveResource, resolveSkillPath } from "../../utils/resources.js";
import { spawn } from "node:child_process";
import pc from "picocolors";

export async function runWorker(
    task: string, 
    ticketId: string, 
    ticketPath: string, 
    timeout: string,
    skillName?: string
): Promise<void> {
    const startEpoch = Date.now();
    let timeoutMs = parseInt(timeout) * 1000;
    
    // 1. Setup paths
    // Normalize ticketPath to ensure we have the directory
    let targetDir = ticketPath;
    if (ticketPath.endsWith(".md")) {
        targetDir = dirname(ticketPath);
    } else if (existsSync(ticketPath) && existsSync(join(ticketPath, "..", "state.json"))) {
         // If ticketPath is a dir but the state is in parent, it might be a sub-ticket.
         // But usually ticketPath IS the ticket directory.
         // Let's stick to the logic: targetDir is where we run.
         targetDir = ticketPath;
    }
    
    // Ensure absolute path if not already
    if (!targetDir.startsWith("/")) {
        targetDir = join(process.cwd(), targetDir);
    }

    await mkdir(targetDir, { recursive: true });
    
    const sessionLog = join(targetDir, `worker_session_${process.pid}.log`);
    const extensionRoot = getExtensionRoot();

    // --- Timeout Clamping Logic (Ported from spawn_morty.py) ---
    // Check parent dir (Manager state) first, then current dir (Worker state resume)
    let timeoutStatePath: string | null = null;
    const parentState = join(targetDir, "..", "state.json");
    const workerState = join(targetDir, "state.json");

    if (existsSync(parentState)) {
        timeoutStatePath = parentState;
    } else if (existsSync(workerState)) {
        timeoutStatePath = workerState;
    }

    if (timeoutStatePath) {
        try {
            const stateContent = await readFile(timeoutStatePath, "utf-8");
            const state = JSON.parse(stateContent);
            const maxMins = state.max_time_minutes || 0;
            const startTime = state.start_time_epoch || 0;

            if (maxMins > 0 && startTime > 0) {
                // startTime is in seconds in python script usually, let's check input.
                // In JS Date.now() is ms. Python time.time() is seconds.
                // The state file usually stores seconds (from python).
                // Let's assume seconds if it's small, ms if it's huge.
                // Actually, let's look at `state.json` convention. 
                // Usually Python `time.time()` -> float seconds.
                // JS `Date.now()` -> int ms.
                
                // If it's < 10^11, it's seconds.
                const nowSeconds = Date.now() / 1000;
                let startSeconds = startTime;
                if (startSeconds > 100000000000) { // It's MS
                    startSeconds = startSeconds / 1000;
                }

                const remaining = (maxMins * 60) - (nowSeconds - startSeconds);
                if (remaining * 1000 < timeoutMs) {
                    const clamped = Math.max(10, Math.floor(remaining));
                    timeoutMs = clamped * 1000;
                    console.log(pc.yellow(`⚠️  Worker timeout clamped: ${clamped}s (Global Session Limit)`));
                }
            }
        } catch (e) {
            // Ignore state read errors
        }
    }

    // 2. Build Prompt
    const tomlPath = resolveResource("commands/send-to-morty.toml");
    let basePrompt = '# **TASK REQUEST**\n$ARGUMENTS\n\nYou are a Morty Worker. Implement the request above.';
    
    try {
        if (existsSync(tomlPath)) {
            const content = await readFile(tomlPath, "utf-8");
            const match = content.match(/prompt = \"""([\s\S]*?)\"""/);
            if (match) {
                basePrompt = match[1].trim();
            }
        }
    } catch (e) {
        console.warn(pc.yellow("⚠️ Failed to load prompt TOML, using fallback."));
    }

    let workerPrompt = basePrompt.replace("${extensionPath}", extensionRoot);
    workerPrompt = workerPrompt.replace("$ARGUMENTS", task);

    // Inject Skill if provided
    if (skillName) {
        const skillPath = resolveSkillPath(skillName);
        console.log(pc.dim(`🔍 Resolving skill '${skillName}' -> '${skillPath}'`));
        
        if (skillPath && existsSync(skillPath)) {
            const skillContent = await readFile(skillPath, "utf-8");
            console.log(pc.dim(`📄 Skill content loaded (${skillContent.length} chars)`));
            
            if (skillContent.length > 0) {
                workerPrompt += `\n\n<skill_injection>\n${skillContent}\n</skill_injection>`;
            } else {
                console.warn(pc.yellow(`⚠️ Skill file is empty: ${skillPath}`));
            }
        } else {
            console.warn(pc.yellow(`⚠️ Skill '${skillName}' not found at ${skillPath}`));
        }
    }

    // Fallback prompt enforcement
    if (workerPrompt.length < 200) {
        workerPrompt += `\n\nTask: "${task}"\n1. Activate persona: activate_skill("load-pickle-persona").\n2. Output: <promise>I AM DONE</promise>`;
    }

    // 3. Build Command
    const includes = [
        process.cwd(), // Current workspace
        targetDir,
        join(targetDir, ".."),
        extensionRoot,
        join(extensionRoot, "scripts"),
        join(extensionRoot, "skills"),
        join(extensionRoot, "sessions"),
        join(extensionRoot, "jar"),
        join(extensionRoot, "worktrees")
    ];

    // Filter unique and existing paths
    const uniqueIncludes = [...new Set(includes)].filter(p => existsSync(p));

    let args = ["-s", "-y", "-o", "text"];
    for (const p of uniqueIncludes) {
        args.push("--include-directories", p);
    }
    args.push("-p", workerPrompt);
    
    let command = "gemini";
    let cmdArgs = args;

    // Check for Command Override (for testing or specialized environments)
    if (process.env.PICKLE_WORKER_CMD_OVERRIDE) {
        const parts = process.env.PICKLE_WORKER_CMD_OVERRIDE.split(" ");
        command = parts[0];
        // We assume the override includes necessary base args, but we might need to append prompt/includes
        // Actually, spawn_morty.py REPLACES the cmd with the override + prompt.
        // Let's assume the override replaces the 'gemini' part but keeps the args we built, 
        // OR replaces the whole thing.
        // spawn_morty.py: cmd = shlex.split(os.environ["PICKLE_WORKER_CMD_OVERRIDE"])
        // It ignores the built args if override is present?
        // Wait, spawn_morty.py lines:
        //   cmd = ["gemini", ...]
        //   ... build cmd ...
        //   if "PICKLE_WORKER_CMD_OVERRIDE": cmd = shlex.split(...)
        // So it COMPLETELY replaces it. That seems wrong if we want to pass the prompt.
        // BUT, if the override is just the binary, we should prepend it.
        // Let's assume the user knows what they are doing if they use the override.
        // FOR NOW: Let's stick to standard behavior unless forced.
        // If I want to match spawn_morty exactly:
        if (process.env.PICKLE_WORKER_CMD_OVERRIDE) {
             const override = process.env.PICKLE_WORKER_CMD_OVERRIDE.split(" ");
             command = override[0];
             cmdArgs = [...override.slice(1), ...args]; // Prepend flags from override, append ours?
             // Actually, usually override is like "gemini-beta".
             cmdArgs = [...override.slice(1), ...args]; 
        }
    }

    console.log(pc.cyan(`🥒 Spawning Morty Worker [Ticket: ${ticketId}]`));
    console.log(pc.dim(`   Log: ${sessionLog}`));
    console.log(pc.dim(`   Timeout: ${timeoutMs/1000}s`));

    // 4. Spawn Process
    const logStream = {
        write: async (msg: string) => {
            try {
                await appendFile(sessionLog, msg);
            } catch (e) {}
        }
    };

    // Header
    await logStream.write(`CWD: ${process.cwd()}\nCommand: ${command} ${cmdArgs.join(" ")}\n${"-".repeat(80)}\n\n`);

    return new Promise((resolve, reject) => {
        const child = spawn(command, cmdArgs, {
            cwd: process.cwd(),
            env: { 
                ...process.env, 
                PYTHONUNBUFFERED: "1",
                PICKLE_STATE_FILE: workerState // Pass state file location to worker
            },
            stdio: ["ignore", "pipe", "pipe"]
        });

        let outputBuffer = "";

        child.stdout.on("data", async (data) => {
            const str = data.toString();
            outputBuffer += str;
            await logStream.write(str);
            process.stdout.write("."); // Spinner tick
        });

        child.stderr.on("data", async (data) => {
            const str = data.toString();
            outputBuffer += str;
            await logStream.write(str);
        });

        // Timeout Logic
        const timer = setTimeout(() => {
            child.kill();
            const msg = `\n\n[TIMEOUT] Worker exceeded ${timeoutMs/1000}s limit.\n`;
            logStream.write(msg).catch(() => {});
            console.error(pc.red(msg));
            reject(new Error("Timeout"));
        }, timeoutMs);

        child.on("close", (code) => {
            clearTimeout(timer);
            
            // Check for explicit success promise
            const isSuccess = outputBuffer.includes("<promise>I AM DONE</promise>") || outputBuffer.includes("I AM DONE");
            
            if (isSuccess) {
                console.log(pc.green(`\n✅ Worker Succeeded (Exit: ${code})`));
                resolve();
            } else {
                console.log(pc.red(`\n❌ Worker Failed (Exit: ${code}) - Check logs at ${sessionLog}`));
                // We resolve, but set exitCode to 1 so the CLI fails gracefully after cleanup if needed
                if (code !== 0) {
                    process.exitCode = code || 1;
                } else {
                    process.exitCode = 1;
                }
                resolve(); 
            }
        });

        child.on("error", (err) => {
            clearTimeout(timer);
            logStream.write(`\n\n[ERROR] Spawn failed: ${err.message}\n`).catch(() => {});
            reject(err);
        });
    });
}