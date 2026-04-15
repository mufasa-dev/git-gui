import { invoke } from "@tauri-apps/api/core";
import { Branch, BranchFileContentResponse } from "../models/Banch.model";
import { Diff } from "../models/Diff.model";
import { GitPullResult } from "../models/Pull.model";
import { Commit, FileEntry } from "../models/Commit.model";
import { CoverageStats } from "../models/Dashboard.model";

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

export async function getCurrentBranch(repoPath: string): Promise<string> {
  return await invoke("get_current_branch", { path: repoPath });
}

export async function checkoutBranch(repoPath: string, branch: string): Promise<string> {
  return await invoke("checkout_branch", { repoPath, branch });
}

export async function getCommits(path: string, branch: string) {
  return await invoke<{ hash: string; message: string; author: string; date: string }[]>(
    "list_commits",
    { path, branch }
  );
}

export async function getUserCommits(path: string, branch: string, email: string) {
  return await invoke<{ hash: string; message: string; author: string; date: string }[]>(
    "list_user_commits",
    { path, branch, email }
  );
}

export async function getLastCommitForPath(path: string, branch: string, filePath: string) {
  return await invoke<Commit>(
    "get_last_commit_for_path",
    { path, branch, filePath }
  );
}

export async function getPathHistory(path: string, branch: string, filePath: string) {
  return await invoke<Commit[]>(
    "get_path_history",
    { path, branch, filePath }
  );
}

export async function listDirectory(repoPath: string, branch: string, folderPath: string) {
  return await invoke<FileEntry[]>(
    "list_directory_with_commits",
    { repoPath, branch, folderPath }
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

export async function discard_changes(repoPath: string, paths: string[]) {
  return await invoke("discard_changes", { path: repoPath, files: paths });
}

export async function getDiff(
  repoPath: string,
  file: string,
  staged: boolean = false
): Promise<Diff> {
  let relativeFile =file;
  if (file.startsWith(repoPath)) {
    relativeFile = file.replace(repoPath + "/", "");
  }
  return await invoke<Diff>("get_diff", {
    repoPath,
    file: relativeFile,
    staged,
  });
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

export async function getCommitFileDiff(
  repoPath: string,
  commitSha: string,
  filePath: string
): Promise<any> {
  return await invoke("get_commit_file_diff", {
    repoPath,
    commitSha,
    filePath
  });
}

export async function pushRepo(
  repoPath: string,
  remote: string = "origin",
  branch: string = "HEAD"
): Promise<string> {
  return await invoke("push_repo", { path: repoPath, remote, branch });
}

export async function pull(repoPath: string, branch: string): Promise<GitPullResult> {
  try {
    const result = await invoke<GitPullResult>("git_pull", { repoPath, branch });
    return result;
  } catch (err: any) {
    throw new Error(err);
  }
}

export async function configPullMode(repoPath: string, mode: "merge" | "rebase" | "ff"): Promise<void> {
  try {
    await invoke("git_config_pull", { repoPath, mode });
  } catch (err: any) {
    throw new Error(err);
  }
}

export async function fetchRepo(path: string, remote: string): Promise<string> {
  return await invoke("fetch_repo", { repoPath: path, remote });
}

export async function createBranch(branchName: string, branchType: string, checkout: boolean, baseBranch: string, repoPath: string) {
  return await invoke<string>("create_branch", {
    repoPath,
    branchName,
    branchType,
    baseBranch,
    checkout,
  });
}

export async function stashChanges(repoPath: string) {
  return await invoke("stash_changes", { repoPath });
}

export async function stashPop(repoPath: string) {
  return await invoke("stash_pop", { repoPath });
}

export async function resetHard(repoPath: string) {
  return await invoke("reset_hard", { repoPath });
}

export async function openPullRequestUrl(path: string, branch: string) {
  return await invoke("open_pull_request", { path, branch });
}

export async function mergeBranch(repoPath: string, fromBranch: string, toBranch: string) {
  return await invoke("merge_branch", { repoPath, fromBranch, toBranch });
}

export async function saveFile(path: string = '', content: string) {
  return await invoke("save_file", { path, content });
}

export async function checkoutRemoteBranch(repoPath: string, branchName: string) {
  return await invoke("checkout_remote_branch", { repoPath, branchName });
}

export async function deleteBranch(repoPath: string, branch: string, force: boolean = false) {
  return await invoke("delete_branch", { path: repoPath, branch: branch, force: force });
}

export async function deleteRemoteBranch(repoPath: string, branch: string, remote: string = "origin") {
  return await invoke("delete_remote_branch", { path: repoPath, branch, remote });
}

export async function getGitConfig(path: string, key: string): Promise<string> {
  return await invoke("get_git_config", { path, key });
}

export async function setGitConfig(path: string, key: string, value: string): Promise<void> {
  // Executa: git config --local <key> <value>
  await invoke("set_git_config", { path, key, value });
}

export async function listBranchFiles(repoPath: string, branch: string): Promise<string[]> {
  return await invoke("list_branch_files", { path: repoPath, branch });
}

export async function listBranchFilesWithSize(repoPath: string, branch: string): Promise<[string, number][]> {
  return await invoke("list_branch_files_with_size", { path: repoPath, branch });
}

export async function getBranchFileContent(repoPath: string, branch: string, filePath: string): Promise<BranchFileContentResponse> {
  return await invoke("get_branch_file_content", { path: repoPath, branch, filePath });
}

export async function getCodeCoverageRatio(path: string, branch: string): Promise<CoverageStats> {
  return await invoke("get_code_coverage_ratio", { path, branch });
}

export async function getMostModifiedFiles(path: string, branch: string): Promise<any[]> {
  try {
    return await invoke("get_most_modified_files", { path, branch });
  } catch (error) {
    console.error("Erro ao buscar hotspots:", error);
    return [];
  }
}

export async function getUserMostModifiedFiles(path: string, branch: string, email: string): Promise<any[]> {
  try {
    return await invoke("get_user_most_modified_files", { path, branch, email });
  } catch (error) {
    console.error("Erro ao buscar hotspots:", error);
    return [];
  }
}

export async function getRemoteUrl(path: string): Promise<string> {
  try {
    return await invoke("get_remote_url", { path });
  } catch (e) {
    console.error("Erro ao buscar URL remota", e);
    return "";
  }
}

export async function cloneRepository(url: string, targetPath: string): Promise<void> {
  try{
    return await invoke("clone_repo", { url, targetPath });
  } catch (e) {
    throw e;
  }
}