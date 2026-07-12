export type MessageContent = string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
export interface ChatMessage { role: "system" | "user" | "assistant" | "tool"; content: MessageContent; tool_call_id?: string; }
export interface ModelTool { type:"function"; function:{name:string;description:string;parameters:Record<string,unknown>}; }
export interface CompletionOptions { model: string; messages: ChatMessage[]; reasoningBudget?: number; enableReasoning?: boolean; tools?: ModelTool[]; responseJson?: boolean; }
export interface ToolCall { id:string; name:string; arguments:string; }
export interface NormalizedCompletionResponse { text: string; model: string; provider: string; requestId:string; durationMs:number; retryCount:number; finishReason?: string; usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number; reasoningTokens?: number }; toolCalls?: ToolCall[]; rawMetadata?: Record<string, unknown>; }
