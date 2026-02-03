import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DEFAULT_EXTENSION_PATH = join(homedir(), ".gemini/extensions/pickle-rick");

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Resolves a resource path, checking the bundled location first, then the default extension path.
 * @param relativePath Path relative to the extension root (e.g., "skills/my-skill.md")
 */
export function resolveResource(relativePath: string): string {
    // 1. Check bundled location (next to executable)
    // In bundled apps, resources are often placed relative to the binary.
    // We check `dirname(process.execPath)/<relativePath>`
    const bundledPath = join(dirname(process.execPath), relativePath);
    if (existsSync(bundledPath)) {
        return bundledPath;
    }

    // 2. Fallback to home directory extension path
    const homePath = join(DEFAULT_EXTENSION_PATH, relativePath);
    return homePath;
}

/**
 * Specific resolver for skills which might be in `cli/src/skills` (dev) or `skills` (bundled/legacy).
 */
export function resolveSkillPath(skillName: string): string {
    const execDir = dirname(process.execPath);

    // 0. Local Dev Priority: Check `../src/skills/<name>.md` relative to binary
    // If running from `dist/pickle`, this maps to `src/skills/<name>.md`
    const devLocalSkill = join(execDir, "../src/skills", `${skillName}.md`);
    if (existsSync(devLocalSkill)) return devLocalSkill;

    // 1. Bundled: Check `skills/<name>.md` next to binary
    const bundledSkill = join(dirname(process.execPath), "skills", `${skillName}.md`);
    if (existsSync(bundledSkill)) return bundledSkill;

    // 2. Local Source (Dev): Check `../skills/<name>.md` relative to this file
    // src/utils/resources.ts -> src/skills
    const localSrcSkill = join(__dirname, "../skills", `${skillName}.md`);
    if (existsSync(localSrcSkill)) return localSrcSkill;

    // 3. Local Source (Root): Check `../../../skills/<name>/SKILL.md` relative to this file
    // src/utils/resources.ts -> src -> cli -> pickle-rick-extension -> skills
    const localRootSkill = join(__dirname, "../../../skills", skillName, "SKILL.md");
    if (existsSync(localRootSkill)) return localRootSkill;

    // 4. Dev: Check `cli/src/skills/<name>.md` in home extension
    const devSkill = join(DEFAULT_EXTENSION_PATH, "cli", "src", "skills", `${skillName}.md`);
    if (existsSync(devSkill)) return devSkill;

    // 5. Legacy: Check `skills/<name>/SKILL.md` in home extension
    const legacySkill = join(DEFAULT_EXTENSION_PATH, "skills", skillName, "SKILL.md");
    if (existsSync(legacySkill)) return legacySkill;

    return "";
}

export function getExtensionRoot(): string {
    // Return the bundled root if resources exist there, otherwise default
    // We use 'commands' as a sentinel
    const bundledCommands = join(dirname(process.execPath), "commands");
    if (existsSync(bundledCommands)) {
        return dirname(process.execPath);
    }
    return DEFAULT_EXTENSION_PATH;
}

/**
 * Returns the command used to invoke the CLI, handling both compiled binary and script modes.
 * Returns a string with quoted paths, e.g., '"/path/to/binary"' or '"/path/to/bun" "/path/to/script.ts"'.
 */
export function getCliCommand(): string {
    const execPath = process.execPath;
    // Check if running as a specific runtime (Node or Bun)
    // Matches .../node, .../node.exe, .../bun, .../bun.exe
    const isRuntime = /\/(node|bun)(\.exe)?$/.test(execPath);
    
    if (isRuntime) {
        // We are running a script. process.argv[1] is the script path.
        return `"${execPath}" "${process.argv[1]}"`;
    }
    
    // We are running as a standalone binary
    return `"${execPath}"`;
}