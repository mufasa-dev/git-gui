import { invoke } from "@tauri-apps/api/core";

export async function validateRepo(path: string): Promise<string> {
  return await invoke("open_repo", { path });
}

export async function getBranches(path: string): Promise<string[]> {
  return await invoke("list_branches", { path });
}

export async function getRemoteBranches(path: string): Promise<string[]> {
  return await invoke("list_remote_branches", { path });
}

export async function getCommits(path: string, branch: string) {
  return await invoke<{ hash: string; message: string; author: string; date: string }[]>(
    "list_commits",
    { path, branch }
  );
}