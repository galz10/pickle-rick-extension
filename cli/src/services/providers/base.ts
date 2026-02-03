import { spawn } from "node:child_process";
import type { AIProvider, AIResult, ProviderOptions, ProgressCallback } from "./types.js";

// Check if running in Bun
const isBun = typeof Bun !== "undefined";
const isWindows = process.platform === "win32";

/**
 * Check if a command is available in PATH
 */
export async function commandExists(command: string): Promise<boolean> {
	try {
		const checkCommand = isWindows ? "where" : "which";
		if (isBun) {
			const proc = Bun.spawn([checkCommand, command], {
				stdout: "pipe",
				stderr: "pipe",
			});
			const exitCode = await proc.exited;
			return exitCode === 0;
		}
		// Node.js fallback - where/which don't need shell
		return new Promise((resolve) => {
			const proc = spawn(checkCommand, [command], { stdio: "pipe" });
			proc.on("close", (code) => resolve(code === 0));
			proc.on("error", () => resolve(false));
		});
	} catch {
		return false;
	}
}

/**
 * Execute a command and return stdout
 * @param stdinContent - Optional content to pass via stdin (useful for multi-line prompts on Windows)
 */
export async function execCommand(
	command: string,
	args: string[],
	workDir: string,
	env?: Record<string, string>,
	stdinContent?: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	if (isBun) {
		// On Windows, run through cmd.exe to handle .cmd wrappers (npm global packages)
		const spawnArgs = isWindows ? ["cmd.exe", "/c", command, ...args] : [command, ...args];
		const proc = Bun.spawn(spawnArgs, {
			cwd: workDir,
			stdin: stdinContent ? "pipe" : "ignore",
			stdout: "pipe",
			stderr: "pipe",
			env: { ...process.env, ...env },
		});

		// Write stdin content if provided
		if (stdinContent && proc.stdin) {
			proc.stdin.write(stdinContent);
			proc.stdin.end();
		}

		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);

		return { stdout, stderr, exitCode };
	}

	// Node.js fallback - use shell on Windows to execute .cmd wrappers
	return new Promise((resolve) => {
		const proc = spawn(command, args, {
			cwd: workDir,
			env: { ...process.env, ...env },
			stdio: [stdinContent ? "pipe" : "ignore", "pipe", "pipe"],
			shell: isWindows, // Required on Windows for npm global commands (.cmd wrappers)
		});

		// Write stdin content if provided
		if (stdinContent && proc.stdin) {
			proc.stdin.write(stdinContent);
			proc.stdin.end();
		}

		let stdout = "";
		let stderr = "";

		proc.stdout?.on("data", (data) => {
			stdout += data.toString();
		});

		proc.stderr?.on("data", (data) => {
			stderr += data.toString();
		});

		proc.on("close", (exitCode) => {
			resolve({ stdout, stderr, exitCode: exitCode ?? 1 });
		});

		proc.on("error", (err) => {
			// Maintain backward compatibility - don't reject, include error in stderr
			stderr += `\nSpawn error: ${err.message}`;
			resolve({ stdout, stderr, exitCode: 1 });
		});
	});
}

/**
 * Parse token counts from stream-json output (Claude/Qwen/Gemini format)
 */
export function parseStreamJsonResult(output: string): {
	response: string;
	inputTokens: number;
	outputTokens: number;
} {
	const lines = output.split("\n").filter(Boolean);
	let response = "";
	let inputTokens = 0;
	let outputTokens = 0;

	for (const line of lines) {
		try {
			const parsed = JSON.parse(line);
			if (parsed.type === "message" && parsed.role === "assistant") {
                response += parsed.content || "";
            } else if (parsed.type === "result") {
				inputTokens = parsed.usage?.input_tokens || parsed.stats?.input_tokens || 0;
				outputTokens = parsed.usage?.output_tokens || parsed.stats?.output_tokens || 0;
			}
		} catch {
			// Ignore non-JSON lines
		}
	}

	return { response: response || "Task completed", inputTokens, outputTokens };
}

/**
 * Check for errors in stream-json output
 */
export function checkForErrors(output: string): string | null {
	const lines = output.split("\n").filter(Boolean);

	for (const line of lines) {
		try {
			const parsed = JSON.parse(line);
			if (parsed.type === "error") {
				return parsed.error?.message || parsed.message || "Unknown error";
			}
		} catch {
			// Ignore non-JSON lines
		}
	}

	return null;
}

/**
 * Read a stream line by line, calling onLine for each non-empty line
 */
async function readStream(
	stream: ReadableStream<Uint8Array>,
	onLine: (line: string) => void,
): Promise<void> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split("\n");
			buffer = lines.pop() || "";
			for (const line of lines) {
				if (line.trim()) onLine(line);
			}
		}
		if (buffer.trim()) onLine(buffer);
	} finally {
		reader.releaseLock();
	}
}

/**
 * Execute a command with streaming output, calling onLine for each line
 * @param stdinContent - Optional content to pass via stdin (useful for multi-line prompts on Windows)
 */
export async function execCommandStreaming(
	command: string,
	args: string[],
	workDir: string,
	onLine: (line: string) => void,
	env?: Record<string, string>,
	stdinContent?: string,
): Promise<{ exitCode: number }> {
	if (isBun) {
		// On Windows, run through cmd.exe to handle .cmd wrappers (npm global packages)
		const spawnArgs = isWindows ? ["cmd.exe", "/c", command, ...args] : [command, ...args];
		const proc = Bun.spawn(spawnArgs, {
			cwd: workDir,
			stdin: stdinContent ? "pipe" : "ignore",
			stdout: "pipe",
			stderr: "pipe",
			env: { ...process.env, ...env },
		});

		// Write stdin content if provided
		if (stdinContent && proc.stdin) {
			proc.stdin.write(stdinContent);
			proc.stdin.end();
		}

		// Process both stdout and stderr in parallel
		await Promise.all([readStream(proc.stdout, onLine), readStream(proc.stderr, onLine)]);

		const exitCode = await proc.exited;
		return { exitCode };
	}

	// Node.js fallback - use shell on Windows to execute .cmd wrappers
	return new Promise((resolve) => {
		const proc = spawn(command, args, {
			cwd: workDir,
			env: { ...process.env, ...env },
			stdio: [stdinContent ? "pipe" : "ignore", "pipe", "pipe"],
			shell: isWindows, // Required on Windows for npm global commands (.cmd wrappers)
		});

		// Write stdin content if provided
		if (stdinContent && proc.stdin) {
			proc.stdin.write(stdinContent);
			proc.stdin.end();
		}

		let stdoutBuffer = "";
		let stderrBuffer = "";

		const processBuffer = (buffer: string, isStderr = false) => {
			const lines = buffer.split("\n");
			const remaining = lines.pop() || "";
			for (const line of lines) {
				if (line.trim()) onLine(line);
			}
			return remaining;
		};

		proc.stdout?.on("data", (data) => {
			stdoutBuffer += data.toString();
			stdoutBuffer = processBuffer(stdoutBuffer);
		});

		proc.stderr?.on("data", (data) => {
			stderrBuffer += data.toString();
			stderrBuffer = processBuffer(stderrBuffer, true);
		});

		proc.on("close", (exitCode) => {
			// Process any remaining data
			if (stdoutBuffer.trim()) onLine(stdoutBuffer);
			if (stderrBuffer.trim()) onLine(stderrBuffer);
			resolve({ exitCode: exitCode ?? 1 });
		});

		proc.on("error", (err) => {
			// Maintain backward compatibility - don't reject, report error via onLine
			onLine(`Spawn error: ${err.message}`);
			resolve({ exitCode: 1 });
		});
	});
}

/**
 * Check if a file path looks like a test file
 */
function isTestFile(filePath: string): boolean {
	const lower = filePath.toLowerCase();
	return (
		lower.includes(".test.") ||
		lower.includes(".spec.") ||
		lower.includes("__tests__") ||
		lower.includes("_test.go")
	);
}

/**
 * Detect the current step from a JSON output line
 * Returns step name like "Reading code", "Implementing", etc.
 */
export function detectStepFromOutput(line: string): string | null {
	// Fast path: skip non-JSON lines
	const trimmed = line.trim();
	if (!trimmed.startsWith("{")) {
		return null;
	}

	try {
		const parsed = JSON.parse(trimmed);

		// Normalize the object structure to a common shape
        const root = parsed.part || parsed.item || parsed;
        
		const toolName =
			root.tool?.toLowerCase() ||
			root.name?.toLowerCase() ||
			root.tool_name?.toLowerCase() ||
            parsed.tool?.toLowerCase() || // Fallback to root
			"";
            
        const command = (
            root.command || 
            root.input?.command || 
            root.state?.input?.command ||
            parsed.command
        )?.toLowerCase() || "";
        
		const filePath = (
            root.file_path || 
            root.filePath || 
            root.path || 
            root.files?.[0] || // Handle array
            root.paths?.[0] || // Handle array
            parsed.file_path || 
            ""
        ).toLowerCase();
        
		const description = (
            root.description || 
            root.metadata?.description || 
            root.state?.title ||
            parsed.description || 
            ""
        ).toLowerCase();
        
        const title = (root.title || root.metadata?.title || "").toLowerCase();
        const combined = `${title} ${description} ${command}`.toLowerCase();

		// Check tool name first to determine operation type
		const isReadOperation = 
            toolName.includes("read") || 
            toolName.includes("glob") || 
            toolName.includes("grep") ||
            toolName.includes("search") ||
            toolName.includes("list");
            
		const isWriteOperation = 
            toolName.includes("write") || 
            toolName.includes("edit") || 
            toolName.includes("patch") ||
            toolName.includes("file");

		// Reading code
		if (isReadOperation) {
			return "Reading code";
		}

		// Git commit
		if (combined.includes("git commit")) {
			return "Committing";
		}

		// Git add/staging
		if (combined.includes("git add")) {
			return "Staging";
		}

		// Linting
		if (
			combined.includes("lint") ||
			combined.includes("eslint") ||
			combined.includes("biome") ||
			combined.includes("prettier")
		) {
			return "Linting";
		}

		// Testing
		if (
			combined.includes("vitest") ||
			combined.includes("jest") ||
			combined.includes("bun test") ||
			combined.includes("npm test") ||
			combined.includes("pytest") ||
			combined.includes("go test")
		) {
			return "Testing";
		}

		// Writing tests
		if (isWriteOperation && isTestFile(filePath)) {
			return "Writing tests";
		}

		// Writing/Editing code
		if (isWriteOperation) {
			return "Implementing";
		}
        
        // Generic command fallback
        if (toolName === "bash" || toolName === "exec" || toolName.includes("command")) {
             if (READ_COMMAND_HINTS.some(h => command.startsWith(h) || command.includes(" " + h))) {
                 return "Reading code";
             }
        }

		return null;
	} catch {
		return null;
	}
}

const READ_COMMAND_HINTS = [
  "rg", "ripgrep", "grep", "sed", "cat", "ls", "find", "fd", "tree", "head", "tail"
];

/**
 * Base implementation for AI providers
 */
export abstract class BaseProvider implements AIProvider {
	abstract name: string;
	abstract cliCommand: string;

	async isAvailable(): Promise<boolean> {
		return commandExists(this.cliCommand);
	}

	abstract execute(prompt: string, workDir: string, options?: ProviderOptions): Promise<AIResult>;

	/**
	 * Execute with streaming progress updates (optional implementation)
	 */
	executeStreaming?(
		prompt: string,
		workDir: string,
		onProgress: (step: string, content?: string) => void,
		options?: ProviderOptions,
	): Promise<AIResult>;
}