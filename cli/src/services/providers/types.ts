// ... existing imports
export interface AIResult {
	success: boolean;
	response: string;
	inputTokens: number;
	outputTokens: number;
	sessionId?: string; // Added field
	cost?: string;
	error?: string;
}

export interface ProviderOptions {
	modelOverride?: string;
	resumeSessionId?: string; // Added field
	providerArgs?: string[];
    extraIncludes?: string[]; // Added: Force include directories (e.g. for Worktrees)
}

// ... rest of file
export type ProgressCallback = (step: string, content?: string) => void;

export interface AIProvider {
	name: string;
	cliCommand: string;
	isAvailable(): Promise<boolean>;
	getModelName?(): Promise<string | undefined>;
	execute(prompt: string, workDir: string, options?: ProviderOptions): Promise<AIResult>;
	executeStreaming?(
		prompt: string,
		workDir: string,
		onProgress: ProgressCallback,
		options?: ProviderOptions,
	): Promise<AIResult>;
}

export type AIProviderName =
	| "claude"
	| "opencode"
	| "cursor"
	| "codex"
	| "qwen"
	| "droid"
	| "copilot"
    | "gemini";