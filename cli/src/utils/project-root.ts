import { join, dirname } from "node:path";
import { existsSync } from "node:fs";

export function findProjectRoot(startDir: string): string {
    let current = startDir;
    const markers = [".pickle-root", ".git", "package.json", "gemini-extension.json"];

    while (true) {
        for (const marker of markers) {
            if (existsSync(join(current, marker))) {
                return current;
            }
        }

        const parent = dirname(current);
        if (parent === current) {
            // Reached root without finding marker
            return startDir; // Fallback to original CWD
        }
        current = parent;
    }
}
