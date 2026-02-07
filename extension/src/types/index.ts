export interface State {
  active: boolean;
  working_dir: string;
  step: string;
  iteration: number;
  max_iterations: number;
  max_time_minutes: number;
  worker_timeout_seconds: number;
  start_time_epoch: number;
  completion_promise: string | null;
  original_prompt: string;
  current_ticket: string | null;
  history: any[];
  started_at: string;
  session_dir: string;
  jar_complete?: boolean;
  worker?: boolean;
}

export interface HookInput {
  prompt_response?: string;
}
