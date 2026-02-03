import { logInfo, logSuccess, logError } from "./logger.js";

export class ProgressSpinner {
  private active = false;
  private currentLabel: string;

  constructor(label: string, activeSettings?: string[]) {
    this.currentLabel = label;
    if (activeSettings && activeSettings.length > 0) {
      this.currentLabel += ` [${activeSettings.join(", ")}]`;
    }
  }

  updateStep(step: string) {
    this.active = true;
    // In a real TUI, this would update a specific line.
    // For now, we just print if it's a significant change or debug
    // To avoid spamming stdout, we might throttle this or only show significant updates
    // For this implementation, we'll keep it simple:
    process.stdout.write(`\r${this.currentLabel}: ${step}`);
  }

  success(msg = "Done") {
    this.active = false;
    process.stdout.write("\n"); // Clear line end
    logSuccess(`${this.currentLabel}: ${msg}`);
  }

  error(msg = "Failed") {
    this.active = false;
    process.stdout.write("\n"); // Clear line end
    logError(`${this.currentLabel}: ${msg}`);
  }

  stop() {
    if (this.active) {
      process.stdout.write("\n");
      this.active = false;
    }
  }
}
