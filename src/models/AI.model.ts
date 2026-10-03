export type AIProvider = "gemini" | "openai" | "anthropic";
export type AIAgentMode = "chat" | "agent";

export interface AIConfig {
  provider: AIProvider;
  model: string;
  apiKey: string;
  mode: AIAgentMode;
}

export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

export const AI_PROVIDER_DEFAULTS: Record<AIProvider, { label: string; model: string; models: string[] }> = {
  gemini: {
    label: "Google Gemini",
    model: "gemini-2.5-flash",
    models: ["gemini-2.5-flash", "gemini-2.5-pro"],
  },
  openai: {
    label: "OpenAI",
    model: "gpt-4o-mini",
    models: ["gpt-4o-mini", "gpt-4o"],
  },
  anthropic: {
    label: "Anthropic Claude",
    model: "claude-3-5-sonnet-latest",
    models: ["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest"],
  },
};
