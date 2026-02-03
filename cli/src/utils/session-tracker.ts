/**
 * Global session tracking utility
 * Tracks sessions created from the current UI instance (LandingView/Dashboard)
 */

export interface TrackedSession {
  id: string;
  prompt: string;
  createdAt: number;
  startedAt: string;
  sessionDir: string;
  status?: string;
  iteration?: number;
}

class SessionTracker {
  private sessions: Map<string, TrackedSession> = new Map();

  /**
   * Add a session to the tracking list
   */
  public addSession(session: TrackedSession): void {
    this.sessions.set(session.id, session);
  }

  /**
   * Update status/iteration metadata for a tracked session
   */
  public updateSession(sessionId: string, partial: Partial<TrackedSession>): void {
    const existing = this.sessions.get(sessionId);
    if (!existing) return;
    this.sessions.set(sessionId, { ...existing, ...partial });
  }

  /**
   * Remove a session from tracking
   */
  public removeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /**
   * Get all tracked sessions
   */
  public getTrackedSessions(): TrackedSession[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) => b.createdAt - a.createdAt
    );
  }

  /**
   * Clear all tracked sessions (for testing/cleanup)
   */
  public clear(): void {
    this.sessions.clear();
  }

  /**
   * Check if a session is being tracked
   */
  public isTracked(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }
}

// Export singleton instance
export const sessionTracker = new SessionTracker();
