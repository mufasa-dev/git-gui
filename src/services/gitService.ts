import { invoke } from "@tauri-apps/api/core";
import { Branch } from "../models/Banch.model";

export async function validateRepo(path: string): Promise<string> {
  return await invoke("open_repo", { path });
}

export async function getBranches(path: string): Promise<string[]> {
  return await invoke("list_branches", { path });
}

export async function getRemoteBranches(path: string): Promise<string[]> {
  return await invoke("list_remote_branches", { path });
}

export async function getBranchStatus(repoPath: string): Promise<Branch[]> {
  return await invoke<Branch[]>(
    "get_branch_status",
    { repoPath }
  );
}

export async function getCommits(path: string, branch: string) {
  return await invoke<{ hash: string; message: string; author: string; date: string }[]>(
    "list_commits",
    { path, branch }
  );
}

export async function getCommitDetails(path: string, hash: string) {
  return await invoke<{
    hash: string;
    authorName: string;
    authorEmail: string;
    authorDate: string;
    subject: string;
    files: { file: string; changes: string }[];
  }>("get_commit_details", { path, hash });
}

export async function getLocalChanges(path: string) {
  return await invoke<
    { path: string; status: string; staged: boolean }[]
  >("list_local_changes", { path });
}

export async function stageFiles(repoPath: string, paths: string[]) {
  return await invoke("stage_files", { path: repoPath, files: paths });
}

export async function unstageFiles(repoPath: string, paths: string[]) {
  return await invoke("unstage_files", { path: repoPath, files: paths });
}

export async function commit(
  repoPath: string,
  message: string,
  description: string,
  amend: boolean
): Promise<string> {
  return await invoke("git_commit", {
    repoPath,
    message,
    description,
    amend,
  });
}

export async function pushRepo(
  repoPath: string,
  remote: string = "origin",
  branch: string = "HEAD"
): Promise<string> {
  return await invoke("push_repo", { path: repoPath, remote, branch });
}