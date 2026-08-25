import { invoke } from "@tauri-apps/api/core";

export async function generateCommitSuggestion(repoPath: string): Promise<[string, string]> {
  return await invoke<[string, string]>("generate_commit_suggestion", { repoPath });
}