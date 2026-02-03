import { z } from "zod";

// Settings schema for ~/.pickle/settings.json
export const PickleSettingsSchema = z.object({
  model: z.object({
    provider: z.enum(["gemini", "opencode", "claude", "cursor", "codex", "qwen", "droid", "copilot"]).optional(),
    model: z.string().optional(),
  }).optional(),
  max_iterations: z.number().optional(),
});

export type PickleSettings = z.infer<typeof PickleSettingsSchema>;

export const SessionStateSchema = z.object({
  active: z.boolean(),
  working_dir: z.string(),
  step: z.enum(["prd", "breakdown", "research", "plan", "implement", "refactor", "done"]),
  iteration: z.number(),
  max_iterations: z.number(),
  max_time_minutes: z.number(),
  worker_timeout_seconds: z.number(),
  start_time_epoch: z.number(),
  completion_promise: z.string().nullable(),
  original_prompt: z.string(),
  current_ticket: z.string().nullable(),
  history: z.array(z.any()), // Placeholder
  is_prd_mode: z.boolean().optional(),
  interrogation_history: z.array(z.object({
    role: z.enum(["user", "agent"]),
    content: z.string(),
    timestamp: z.string()
  })).optional(),
  started_at: z.string(),
  session_dir: z.string(),
  cli_mode: z.boolean().optional(),
  gemini_session_id: z.string().optional(),
});

export type SessionState = z.infer<typeof SessionStateSchema>;