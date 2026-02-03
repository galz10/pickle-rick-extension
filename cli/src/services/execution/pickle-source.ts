import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Task, TaskSource } from "../../types/tasks.js";
import { loadState, saveState } from "../config/state.js";
import type { SessionState } from "../config/types.js";
export class PickleTaskSource implements TaskSource {
    constructor(private sessionDir: string) {}

    private async getState(): Promise<SessionState> {
        const state = await loadState(this.sessionDir);
        if (!state) throw new Error(`State not found in ${this.sessionDir}`);
        return state;
    }

    private async saveState(state: SessionState) {
        await saveState(this.sessionDir, state);
    }

    async getNextTask(): Promise<Task | null> {
        const state = await this.getState();

        // 1. PRD Phase
        if (state.step === "prd") {
            return {
                id: "phase-prd",
                title: "Draft PRD",
                body: state.original_prompt,
                completed: false,
                metadata: { type: "phase", phase: "prd" }
            };
        }

        // 2. Breakdown Phase
        if (state.step === "breakdown") {
             return {
                id: "phase-breakdown",
                title: "Breakdown Tickets",
                body: "Break down the PRD into atomic Linear tickets in the session directory.",
                completed: false,
                metadata: { type: "phase", phase: "breakdown" }
            };
        }

        // 3. Ticket Loop
        // If we are already working on a ticket, return it
        if (state.current_ticket) {
             const ticket = await this.getTask(state.current_ticket);
             if (ticket && !ticket.completed) {
                 return ticket;
             }
             // If completed (should have been marked), or invalid, fall through to find next
        }

        // Find next available ticket
        const nextTicket = await this.findNextTicket(state.session_dir);
        if (nextTicket) {
            // Update state to lock onto this ticket
            state.current_ticket = nextTicket.id;
            state.step = "research"; // Reset loop phase
            await this.saveState(state);
            return nextTicket;
        }

        return null; // No more work
    }

    async getTask(id: string): Promise<Task | null> {
        if (id === "phase-prd" || id === "phase-breakdown") {
            // Re-construct phase tasks if asked
            const state = await this.getState();
            if (id === "phase-prd") return { id, title: "Draft PRD", completed: state.step !== "prd", body: state.original_prompt };
            if (id === "phase-breakdown") return { id, title: "Breakdown", completed: state.step !== "breakdown" && state.step !== "prd", body: "Breakdown..." };
            return null;
        }

        // It's a ticket ID
        const ticketFile = await this.findTicketFile(this.sessionDir, id);
        if (!ticketFile) return null;

        const content = await readFile(ticketFile, "utf-8");
        // Simple frontmatter parse
        const statusMatch = content.match(/status:\s*(.+)/);
        const titleMatch = content.match(/title:\s*(.+)/);
        
        const status = statusMatch ? statusMatch[1].trim() : "Unknown";
        const title = titleMatch ? titleMatch[1].trim() : "Untitled";
        const isDone = status.toLowerCase() === "done" || status.toLowerCase() === "canceled";

        return {
            id: id,
            title: title,
            body: content, // The full ticket content
            completed: isDone,
            metadata: { type: "ticket", path: ticketFile, status }
        };
    }

    async getAllTasks(): Promise<Task[]> {
        const state = await this.getState();
        const all: Task[] = [];
        await this.scanTickets(state.session_dir, all);
        // Add Phase tasks if applicable?
        // Actually, just returning tickets is fine for verification.
        return all;
    }

    async markComplete(id: string): Promise<void> {
        const state = await this.getState();

        if (id === "phase-prd") {
            state.step = "breakdown";
            await this.saveState(state);
            return;
        }

        if (id === "phase-breakdown") {
            state.step = "research"; // Ready for first ticket
            state.current_ticket = null; // Ensure we scan
            await this.saveState(state);
            return;
        }

        // Ticket
        const ticketFile = await this.findTicketFile(this.sessionDir, id);
        if (ticketFile) {
            let content = await readFile(ticketFile, "utf-8");
            content = content.replace(/status:\s*.+/, "status: Done");
            content = content.replace(/updated:\s*.+/, `updated: ${new Date().toISOString().split("T")[0]}`);
            await writeFile(ticketFile, content, "utf-8");
            
            state.current_ticket = null; // Release lock
            await this.saveState(state);
        }
    }

    async countRemaining(): Promise<number> {
        const state = await this.getState();
        if (state.step === "prd") return 2 + await this.countTickets(state.session_dir, false); // PRD + Breakdown + Tickets
        if (state.step === "breakdown") return 1 + await this.countTickets(state.session_dir, false);
        return this.countTickets(state.session_dir, false);
    }

    // --- Helpers ---

    private async findTicketFile(dir: string, id: string): Promise<string | null> {
        // Search recursively
        const entries = await readdir(dir);
        for (const entry of entries) {
            const fullPath = join(dir, entry);
            const entryStat = await stat(fullPath);
            if (entryStat.isDirectory()) {
                const found = await this.findTicketFile(fullPath, id);
                if (found) return found;
            } else if (entry.endsWith(".md")) {
                const content = await readFile(fullPath, "utf-8");
                if (content.includes(`id: ${id}`)) {
                    return fullPath;
                }
            }
        }
        return null;
    }

    private async findNextTicket(dir: string): Promise<Task | null> {
         const allTickets: Task[] = [];
         await this.scanTickets(dir, allTickets);
         
         // Filter out Parent/Epic tickets
         const implementable = allTickets.filter(t => {
             const isParentId = t.id === "parent" || t.id === "linear_ticket_parent" || t.id === "task_priority_parent";
             const isEpicTitle = t.title.toLowerCase().includes("[epic]");
             // Epics are usually in the root of the session dir, not in a subdirectory hash
             const isRootFile = t.metadata?.path && !join(this.sessionDir, t.id).includes(t.metadata.path);

             return !isParentId && !isEpicTitle;
         });
         
         // Sort by order (asc) then birthtime (asc)
         implementable.sort((a, b) => {
             const orderA = a.metadata?.order ?? Infinity;
             const orderB = b.metadata?.order ?? Infinity;
             if (orderA !== orderB) return orderA - orderB;

             const timeA = a.metadata?.birthtime ?? 0;
             const timeB = b.metadata?.birthtime ?? 0;
             return timeA - timeB;
         });
         
         const next = implementable.find(t => !t.completed);
         return next || null;
    }
    
    private async scanTickets(dir: string, list: Task[]) {
        try {
            const entries = await readdir(dir);
            for (const entry of entries) {
                // Slop Filter: Skip ignored directories
                if (entry === ".git" || entry === "node_modules" || entry === ".pickle") {
                    continue;
                }

                const fullPath = join(dir, entry);
                try {
                    const entryStat = await stat(fullPath);
                    if (entryStat.isDirectory()) {
                        await this.scanTickets(fullPath, list);
                    } else if (entry.endsWith(".md")) {
                        const content = await readFile(fullPath, "utf-8");
                        const idMatch = content.match(/id:\s*(.+)/);
                        const statusMatch = content.match(/status:\s*(.+)/);
                        const titleMatch = content.match(/title:\s*(.+)/);
                        const orderMatch = content.match(/order:\s*(\d+)/);
                        
                        let id = "";
                        let status = "Triage";
                        let title = "Untitled";
                        let order = orderMatch ? parseInt(orderMatch[1], 10) : Infinity;
                        const birthtime = entryStat.birthtime.getTime();

                        if (idMatch) {
                            id = idMatch[1].trim();
                            if (statusMatch) status = statusMatch[1].trim();
                            if (titleMatch) title = titleMatch[1].trim();
                        } else {
                            // Fallback: Try to extract ID from filename
                            const filenameMatch = entry.match(/^linear_ticket_(.+)\.md$/);
                            if (filenameMatch) {
                                id = filenameMatch[1];
                                // Attempt to find title in content (# Title)
                                const headerMatch = content.match(/^#\s+(.+)$/m);
                                if (headerMatch) title = headerMatch[1].trim();
                                console.warn(`⚠️ Warning: No frontmatter ID in ${entry}. Using filename ID: ${id}`);
                            }
                        }

                        if (id) {
                            const isDone = status.toLowerCase() === "done" || status.toLowerCase() === "canceled";
                            list.push({
                                id,
                                title,
                                completed: isDone,
                                metadata: { path: fullPath, status, order, birthtime }
                            });
                        }
                    }
                } catch (e) {
                    // Ignore file access errors
                }
            }
        } catch (e) {
            // Ignore dir access errors
        }
    }
    
    private async countTickets(dir: string, done: boolean): Promise<number> {
        const all: Task[] = [];
        await this.scanTickets(dir, all);
        return all.filter(t => {
            const isParentId = t.id === "parent" || t.id === "linear_ticket_parent" || t.id === "task_priority_parent";
            const isEpicTitle = t.title.toLowerCase().includes("[epic]");
            return t.completed === done && !isParentId && !isEpicTitle;
        }).length;
    }
}
