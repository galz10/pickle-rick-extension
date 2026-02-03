import { expect, test, describe, beforeEach } from "bun:test";
import { sessionTracker, type TrackedSession } from "./session-tracker.js";

describe("SessionTracker", () => {
    beforeEach(() => {
        sessionTracker.clear();
    });

    const mockSession: TrackedSession = {
        id: "session-1",
        prompt: "Test Prompt",
        createdAt: 1000,
        startedAt: "2026-02-03T00:00:00Z",
        sessionDir: "/tmp/session-1"
    };

    test("should add and track a session", () => {
        sessionTracker.addSession(mockSession);
        expect(sessionTracker.isTracked("session-1")).toBe(true);
        expect(sessionTracker.getTrackedSessions()).toHaveLength(1);
    });

    test("should update a session", () => {
        sessionTracker.addSession(mockSession);
        sessionTracker.updateSession("session-1", { status: "running", iteration: 5 });
        
        const sessions = sessionTracker.getTrackedSessions();
        expect(sessions[0].status).toBe("running");
        expect(sessions[0].iteration).toBe(5);
    });

    test("should remove a session", () => {
        sessionTracker.addSession(mockSession);
        sessionTracker.removeSession("session-1");
        expect(sessionTracker.isTracked("session-1")).toBe(false);
    });

    test("should sort sessions by createdAt descending", () => {
        sessionTracker.addSession({ ...mockSession, id: "old", createdAt: 1000 });
        sessionTracker.addSession({ ...mockSession, id: "new", createdAt: 2000 });
        
        const sessions = sessionTracker.getTrackedSessions();
        expect(sessions[0].id).toBe("new");
        expect(sessions[1].id).toBe("old");
    });
});
