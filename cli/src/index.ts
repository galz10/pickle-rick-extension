// Apply browser API polyfills for gameboy-emulator (must be first)
import { applyPolyfills } from "./games/gameboy/gameboy-polyfills.js";
applyPolyfills();

import { Command } from "commander";
import pc from "picocolors";
import { createSession, loadState, listSessions, GLOBAL_SESSIONS_DIR } from "./services/config/state.js";
import { createProvider } from "./services/providers/index.js";
import { validateSettings, loadSettingsWithValidation, saveSettings } from "./services/config/settings.js";
import { SequentialExecutor } from "./services/execution/sequential.js";
import { startDashboard } from "./ui/dashboard.js";
import { join } from "node:path";
import { existsSync } from "node:fs";

const program = new Command();

program
  .name("pickle")
  .description("Hyper-intelligent coding agent loop (Morty-mode)")
  .version("1.0.0")
  .argument("[prompt]", "The task description")
  .option("-m, --max-iterations <n>", "Max iterations", "20")
  .option("-r, --resume <path>", "Resume an existing session")
  .option("--completion-promise <text>", "Stop when this text is found in output", "I AM DONE")
  .option("--tui", "Force TUI mode", false)
  .action(async (prompt, options) => {
    // If no prompt and no resume, we HAVE to go to TUI (home screen)
    const isTuiRequested = options.tui || (!prompt && !options.resume);

    if (isTuiRequested) {
        await startDashboard(prompt);
        return;
    }

    // CLI Mode
    let state;
    if (options.resume) {
        state = await loadState(options.resume);
        if (!state) {
            console.error(pc.red(`❌ Failed to load session at ${options.resume}`));
            process.exit(1);
        }
        console.log(pc.green(`🥒 Pickle Rick is resuming session at ${options.resume}...`));
    } else {
        state = await createSession(process.cwd(), prompt);
        state.max_iterations = parseInt(options.maxIterations);
        state.completion_promise = options.completionPromise;
        console.log(pc.green("🥒 Pickle Rick is starting a new session..."));
    }

    const provider = await createProvider();
    const executor = new SequentialExecutor(state, provider, undefined, true);
    
    try {
        await executor.run();
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(pc.red(`💥 Execution failed: ${msg}`));
        process.exit(1);
    }
  });

program
  .command("sessions")
  .description("List all active and past sessions")
  .action(async () => {
    const sessions = await listSessions(process.cwd());
    if (sessions.length === 0) {
        console.log(pc.yellow("No sessions found."));
        return;
    }

    console.log(pc.bold(pc.cyan("\nRecent Sessions:")));
    for (const s of sessions) {
        const date = new Date(s.started_at).toLocaleString();
        console.log(`${pc.dim(date)} | ${pc.bold(s.status)} | ${pc.white(s.original_prompt.substring(0, 50))}...`);
        console.log(`  ${pc.dim("Path: ")}${s.session_dir}`);
    }
    console.log("");
  });

program
  .command("validate-settings")
  .description("Validate ~/.pickle/settings.json configuration")
  .option("--fix", "Automatically fix common issues (like trailing commas)")
  .action(async (options) => {
    const { settings, validation } = await loadSettingsWithValidation();
    
    console.log(pc.bold(pc.cyan("\n🔍 Settings Validation Report\n")));
    
    if (validation.errors.length === 0) {
      console.log(pc.green("✅ Settings are valid!\n"));
    } else {
      console.log(pc.red("❌ Validation Errors:"));
      validation.errors.forEach((err) => {
        console.log(pc.red(`  • ${err}`));
      });
      console.log("");
    }
    
    if (validation.warnings.length > 0) {
      console.log(pc.yellow("⚠️  Warnings:"));
      validation.warnings.forEach((warn) => {
        console.log(pc.yellow(`  • ${warn}`));
      });
      console.log("");
    }
    
    // Display current configuration
    console.log(pc.bold("Current Configuration:"));
    if (settings.model?.provider) {
      console.log(`  Provider: ${pc.cyan(settings.model.provider)}`);
    } else {
      console.log(`  Provider: ${pc.dim("Not configured (will use default)")}`);
    }
    
    if (settings.model?.model) {
      console.log(`  Model: ${pc.cyan(settings.model.model)}`);
    } else {
      console.log(`  Model: ${pc.dim("Not configured (will use provider default)")}`);
    }
    console.log("");
    
    // Auto-fix if requested and possible
    if (options.fix && validation.fixed && validation.errors.length > 0) {
      console.log(pc.yellow("📝 Auto-fixing settings file..."));
      try {
        await saveSettings(settings);
        console.log(pc.green("✅ Settings file fixed and saved!\n"));
      } catch (e) {
        console.error(pc.red(`❌ Failed to save fixed settings: ${e}\n`));
        process.exit(1);
      }
    }
    
    if (validation.errors.length > 0) {
      process.exit(1);
    }
  });

program.parse();