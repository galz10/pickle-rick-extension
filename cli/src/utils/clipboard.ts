import { $ } from "bun";
import { platform } from "os";

/**
 * Simple clipboard utility for copying text to system clipboard
 */
export namespace Clipboard {
  const getCopyMethod = () => {
    const os = platform();

    if (os === "darwin" && Bun.which("pbcopy")) {
      return async (text: string) => {
        const proc = Bun.spawn(["pbcopy"], {
          stdin: "pipe",
          stdout: "ignore",
          stderr: "ignore",
        });
        proc.stdin.write(text);
        proc.stdin.end();
        await proc.exited.catch(() => {});
      };
    }

    if (os === "linux") {
      if (Bun.which("wl-copy")) {
        return async (text: string) => {
          const proc = Bun.spawn(["wl-copy"], {
            stdin: "pipe",
            stdout: "ignore",
            stderr: "ignore",
          });
          proc.stdin.write(text);
          proc.stdin.end();
          await proc.exited.catch(() => {});
        };
      }
      if (Bun.which("xclip")) {
        return async (text: string) => {
          const proc = Bun.spawn(["xclip", "-selection", "clipboard"], {
            stdin: "pipe",
            stdout: "ignore",
            stderr: "ignore",
          });
          proc.stdin.write(text);
          proc.stdin.end();
          await proc.exited.catch(() => {});
        };
      }
      if (Bun.which("xsel")) {
        return async (text: string) => {
          const proc = Bun.spawn(["xsel", "--clipboard", "--input"], {
            stdin: "pipe",
            stdout: "ignore",
            stderr: "ignore",
          });
          proc.stdin.write(text);
          proc.stdin.end();
          await proc.exited.catch(() => {});
        };
      }
    }

    if (os === "win32") {
      return async (text: string) => {
        const proc = Bun.spawn(
          [
            "powershell.exe",
            "-NonInteractive",
            "-NoProfile",
            "-Command",
            "Set-Clipboard",
          ],
          {
            stdin: "pipe",
            stdout: "ignore",
            stderr: "ignore",
          },
        );

        proc.stdin.write(text);
        proc.stdin.end();
        await proc.exited.catch(() => {});
      };
    }

    // Fallback: no clipboard support
    return async (_text: string) => {
      console.warn("Clipboard not supported on this platform");
    };
  };

  export async function copy(text: string): Promise<void> {
    try {
      const copyMethod = getCopyMethod();
      await copyMethod(text);
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
    }
  }
}