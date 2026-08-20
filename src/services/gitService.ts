import { invoke } from "@tauri-apps/api/core";
import { Branch, BranchFileContentResponse, BranchFileMetadataResponse } from "../models/Banch.model";
import { Diff } from "../models/Diff.model";
import { GitPullResult } from "../models/Pull.model";
import { Commit, FileEntry } from "../models/Commit.model";
import { CoverageStats } from "../models/Dashboard.model";
import { Stash } from "../models/Stash.model";
import { Tag, TagKind } from "../models/Tag.model";
import { LocalChange } from "../models/LocalChanges.model";

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

export type RepositorySnapshot = {
  branches: Branch[];
  remoteBranches: string[];
  activeBranch: string | null;
  localChanges: LocalChange[];
  localChangesCount: number;
  gitRevision: string | null;
  statusSignature: string;
};

export async function getRepositorySnapshot(repoPath: string): Promise<RepositorySnapshot> {
  return await invoke<RepositorySnapshot>("get_repository_snapshot", { path: repoPath });
}

export async function getCurrentBranch(repoPath: string): Promise<string> {
  return await invoke("get_current_branch", { path: repoPath });
}

export async function checkoutBranch(repoPath: string, branch: string): Promise<string> {
  return await invoke("checkout_branch", { repoPath, branch });
}

export async function getCommits(path: string, branch: string, limit?: number, skip?: number) {
  const args: { path: string; branch: string; limit?: number; skip?: number } = { path, branch };
  if (limit !== undefined) args.limit = limit;
  if (skip !== undefined && skip > 0) args.skip = skip;

  return await invoke<{ hash: string; message: string; author: string; date: string }[]>(
    "list_commits",
    args
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

export async function getLocalChanges(path: string): Promise<LocalChange[]> {
  return await invoke<LocalChange[]>("list_local_changes", { path });
}

export type RepositoryStatus = {
  hasChanges: boolean;
  changeCount: number;
  head: string;
  branch: string;
};

export async function getRepositoryStatus(path: string): Promise<RepositoryStatus> {
  return await invoke<RepositoryStatus>("get_repository_status", { path });
}

export async function ignoreFile(repoPath: string, filePath: string): Promise<string> {
  return await invoke<string>("ignore_file", { path: repoPath, filePath });
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
  branch: string = "HEAD",
  token?: string,
  provider?: string
): Promise<string> {
  return await invoke("push_repo", { path: repoPath, remote, branch, token, provider });
}

export async function pull(repoPath: string, branch: string, token?: string, provider?: string): Promise<GitPullResult> {
  try {
    const result = await invoke<GitPullResult>("git_pull", { repoPath, branch, token, provider  });
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

export async function fetchRepo(path: string, remote: string, token?: string, provider?: string): Promise<string> {
  return await invoke("fetch_repo", { repoPath: path, remote, token, provider });
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

export async function listStashes(repoPath: string): Promise<Stash[]> {
  return await invoke<Stash[]>("list_stashes", { repoPath });
}

export async function createStash(
  repoPath: string,
  message: string,
  includeUntracked: boolean,
  keepIndex: boolean,
  stagedOnly: boolean,
): Promise<string> {
  return await invoke<string>("create_stash", {
    repoPath,
    message: message.trim() || null,
    includeUntracked,
    keepIndex,
    stagedOnly,
  });
}

export async function getStashDiff(repoPath: string, reference: string): Promise<Diff> {
  return await invoke<Diff>("get_stash_diff", { repoPath, reference });
}

export async function applyStash(repoPath: string, reference: string, restoreIndex = false): Promise<string> {
  return await invoke<string>("apply_stash", { repoPath, reference, restoreIndex });
}

export async function popStash(repoPath: string, reference: string, restoreIndex = false): Promise<string> {
  return await invoke<string>("pop_stash", { repoPath, reference, restoreIndex });
}

export async function dropStash(repoPath: string, reference: string): Promise<string> {
  return await invoke<string>("drop_stash", { repoPath, reference });
}

export async function clearStashes(repoPath: string): Promise<string> {
  return await invoke<string>("clear_stashes", { repoPath });
}

export async function applyStashToBranch(
  repoPath: string,
  reference: string,
  targetBranch: string,
  restoreIndex = false,
): Promise<string> {
  return await invoke<string>("apply_stash_to_branch", {
    repoPath,
    reference,
    targetBranch,
    restoreIndex,
  });
}

export async function stashChanges(repoPath: string) {
  return createStash(repoPath, "", true, false, false);
}

export async function stashPop(repoPath: string) {
  const stashes = await listStashes(repoPath);
  if (!stashes.length) throw new Error("Nenhum stash disponível");
  return popStash(repoPath, stashes[0].reference);
}

export async function resetHard(repoPath: string) {
  return await invoke("reset_hard", { repoPath });
}

export async function listTags(repoPath: string): Promise<Tag[]> {
  return await invoke<Tag[]>("list_tags", { repoPath });
}

export async function createTag(
  repoPath: string,
  name: string,
  targetCommit: string,
  kind: TagKind,
  message: string,
): Promise<string> {
  return await invoke<string>("create_tag", {
    repoPath,
    name: name.trim(),
    targetCommit,
    kind,
    message: message.trim() || null,
  });
}

export async function editTagMessage(repoPath: string, name: string, message: string): Promise<string> {
  return await invoke<string>("edit_tag_message", { repoPath, name, message: message.trim() });
}

export async function renameTag(repoPath: string, oldName: string, newName: string): Promise<string> {
  return await invoke<string>("rename_tag", { repoPath, oldName, newName: newName.trim() });
}

export async function deleteTag(repoPath: string, name: string): Promise<string> {
  return await invoke<string>("delete_tag", { repoPath, name });
}

export async function checkoutTag(repoPath: string, name: string): Promise<string> {
  return await invoke<string>("checkout_tag", { repoPath, name });
}

export async function getTagDiff(repoPath: string, name: string): Promise<Diff> {
  return await invoke<Diff>("get_tag_diff", { repoPath, name });
}

export async function pushTag(
  repoPath: string,
  remote: string,
  name: string | null,
  all: boolean,
  token?: string,
  provider?: string,
): Promise<string> {
  return await invoke<string>("push_tag", { repoPath, remote, name, all, token, provider });
}

export async function deleteRemoteTag(
  repoPath: string,
  remote: string,
  name: string,
  token?: string,
  provider?: string,
): Promise<string> {
  return await invoke<string>("delete_remote_tag", { repoPath, remote, name, token, provider });
}

export async function openPullRequestUrl(path: string, branch: string) {
  return await invoke("open_pull_request", { path, branch });
}

export async function mergeBranch(repoPath: string, fromBranch: string, toBranch: string) {
  return await invoke("merge_branch", { repoPath, fromBranch, toBranch });
}

export type ConflictWorkspace = {
  workspace_path: string;
  source_branch: string;
  target_branch: string;
  expected_head_sha: string;
  conflicts: string[];
};

export type ConflictWorkspaceStatus = {
  conflicts: string[];
  changed_files: string[];
  clean: boolean;
};

export async function preparePRConflict(
  repoPath: string,
  sourceBranch: string,
  targetBranch: string,
  token?: string,
  provider?: string,
): Promise<ConflictWorkspace> {
  return await invoke("prepare_pr_conflict", {
    repoPath,
    sourceBranch,
    targetBranch,
    token,
    provider,
  });
}

export async function getPRConflictStatus(workspacePath: string): Promise<ConflictWorkspaceStatus> {
  return await invoke("get_pr_conflict_status", { workspacePath });
}

export async function commitPRConflict(
  workspacePath: string,
  sourceBranch: string,
  expectedHeadSha: string,
  message: string,
  token?: string,
  provider?: string,
): Promise<{ commit_sha: string; pushed: boolean }> {
  return await invoke("commit_pr_conflict", {
    workspacePath,
    sourceBranch,
    expectedHeadSha,
    message,
    token,
    provider,
  });
}

export async function cleanupPRConflict(repoPath: string, workspacePath: string): Promise<void> {
  await invoke("cleanup_pr_conflict", { repoPath, workspacePath });
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

export async function getBranchFilePage(
  repoPath: string,
  branch: string,
  filePath: string,
  startLine: number,
): Promise<BranchFileContentResponse> {
  return await invoke("get_branch_file_page", { path: repoPath, branch, filePath, startLine });
}

export async function getBranchFileMetadata(repoPath: string, branch: string, filePath: string): Promise<BranchFileMetadataResponse> {
  return await invoke("get_file_metadata", { path: repoPath, branch, filePath });
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