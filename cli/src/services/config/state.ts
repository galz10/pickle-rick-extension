import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { SessionStateSchema, type SessionState } from "./types.js";
import { findProjectRoot } from "../../utils/project-root.js";
import { loadSettings } from "./settings.js";

export const GLOBAL_SESSIONS_DIR = join(homedir(), ".gemini", "extensions", "pickle-rick", "sessions");

export interface SessionSummary {
    original_prompt: string;
    status: string;
    started_at: string;
    session_dir: string;
}

// Helper to get session path relative to CWD
export function getSessionPath(cwd: string, sessionId: string): string {
    return join(cwd, ".pickle", "sessions", sessionId);
}

export async function loadState(sessionDir: string): Promise<SessionState | null> {
    const path = join(sessionDir, "state.json");
    if (!existsSync(path)) return null;
    
    try {
        const content = await readFile(path, "utf-8");
        const json = JSON.parse(content);
        return SessionStateSchema.parse(json);
    } catch (e) {
        console.error("Failed to load state:", e);
        return null;
    }
}

export async function saveState(sessionDir: string, state: SessionState): Promise<void> {
    const path = join(sessionDir, "state.json");
    await writeFile(path, JSON.stringify(state, null, 2), "utf-8");
}

export async function createSession(cwd: string, prompt: string, is_prd_mode: boolean = false): Promise<SessionState> {
    const root = findProjectRoot(cwd);
    const today = new Date().toISOString().split("T")[0];
    const hash = Math.random().toString(36).substring(2, 10);
    const sessionId = `${today}-${hash}`;
    const sessionDir = getSessionPath(root, sessionId);
    
    await mkdir(sessionDir, { recursive: true });
    
    // Load settings from ~/.pickle/settings.json to get max_iterations
    const settings = await loadSettings();
    const maxIterations = settings.max_iterations ?? 10;
    
    const state: SessionState = {
        active: true,
        working_dir: root,
        step: "prd",
        iteration: 1,
        max_iterations: maxIterations,
        max_time_minutes: 60,
        worker_timeout_seconds: 1200,
        start_time_epoch: Math.floor(Date.now() / 1000),
        completion_promise: "I AM DONE",
        original_prompt: prompt,
        current_ticket: null,
        history: [],
        is_prd_mode,
        started_at: new Date().toISOString(),
        session_dir: sessionDir
    };
    
    await saveState(sessionDir, state);
    return state;
}

export async function listSessions(cwd?: string): Promise<SessionSummary[]> {
    const sessionDirs = new Set<string>();

    // 1. Check Global Sessions
    if (existsSync(GLOBAL_SESSIONS_DIR)) {
        try {
            const entries = await readdir(GLOBAL_SESSIONS_DIR, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    sessionDirs.add(join(GLOBAL_SESSIONS_DIR, entry.name));
                }
            }
        } catch (e) {}
    }

    // 2. Check Local Sessions (if CWD provided)
    if (cwd) {
        try {
            const root = findProjectRoot(cwd);
            const localDir = join(root, ".pickle", "sessions");
            if (existsSync(localDir)) {
                const entries = await readdir(localDir, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.isDirectory()) {
                        sessionDirs.add(join(localDir, entry.name));
                    }
                }
            }
        } catch (e) {
            // Project root might not exist yet
        }
    }

    const sessions: SessionSummary[] = [];

    for (const sessionDir of sessionDirs) {
        const state = await loadState(sessionDir);
        
        if (state) {
            const status = state.active && state.step !== "done"
                ? `${state.step.toUpperCase()} (Iteration ${state.iteration})` 
                : "Done";
            
            sessions.push({
                original_prompt: state.original_prompt,
                status,
                started_at: state.started_at,
                session_dir: state.session_dir
            });
        }
    }

    return sessions.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
}