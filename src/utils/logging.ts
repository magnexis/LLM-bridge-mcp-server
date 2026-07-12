export const logError = (message: string, error?: unknown): void => { console.error(`[llm-bridge] ${message}${error instanceof Error ? `: ${error.message}` : ""}`); };
