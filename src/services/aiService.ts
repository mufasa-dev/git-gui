import { invoke } from "@tauri-apps/api/core";
import { AIConfig, AIMessage } from "../models/AI.model";

export async function generateCommitSuggestion(
  repoPath: string,
  config: AIConfig,
): Promise<[string, string]> {
  return await invoke<[string, string]>("generate_commit_suggestion", { repoPath, config });
}

export async function sendAIMessage(
  repoPath: string,
  config: AIConfig,
  messages: AIMessage[],
): Promise<string> {
  return await invoke<string>("ai_chat", { request: { repoPath, config, messages } });
}

export async function openClaudeCodeTerminal(repoPath: string): Promise<void> {
  await invoke("open_claude_code_terminal", { path: repoPath });
}