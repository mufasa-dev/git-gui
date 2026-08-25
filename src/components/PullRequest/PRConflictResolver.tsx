import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { open } from "@tauri-apps/plugin-shell";
import DiffViewer from "../ui/DiffViewer";
import Dialog from "../ui/Dialog";
import { useApp } from "../../context/AppContext";
import { notify } from "../../utils/notifications";
import { azureService } from "../../services/azure";
import { githubService } from "../../services/github";
import {
  cleanupPRConflict,
  commitPRConflict,
  ConflictWorkspace,
  ConflictWorkspaceStatus,
  getDiff,
  getPRConflictStatus,
  preparePRConflict,
  stageFiles,
} from "../../services/gitService";
import { GitProvider } from "../../utils/gitProvider";
import { Diff } from "../../models/Diff.model";

interface PRConflictResolverProps {
  repoPath: string;
  sourceBranch: string;
  targetBranch: string;
  expectedHeadSha?: string;
  provider: GitProvider;
  webUrl: string;
  onClose: () => void;
  onComplete: () => void;
}

export default function PRConflictResolver(props: PRConflictResolverProps) {
  const { t } = useApp();
  const [workspace, setWorkspace] = createSignal<ConflictWorkspace | null>(null);
  const [status, setStatus] = createSignal<ConflictWorkspaceStatus | null>(null);
  const [selectedFile, setSelectedFile] = createSignal("");
  const [diff, setDiff] = createSignal<Diff>({ diff: "" });
  const [commitMessage, setCommitMessage] = createSignal("chore: resolve pull request conflicts");
  const [preparing, setPreparing] = createSignal(true);
  const [loadingDiff, setLoadingDiff] = createSignal(false);
  const [finishing, setFinishing] = createSignal(false);
  const [confirming, setConfirming] = createSignal(false);
  const [error, setError] = createSignal("");

  const cleanup = async () => {
    const current = workspace();
    if (!current) return;
    try {
      await cleanupPRConflict(props.repoPath, current.workspace_path);
    } catch (cleanupError) {
      console.warn("Não foi possível limpar o workspace de conflitos:", cleanupError);
    }
    setWorkspace(null);
  };

  onCleanup(() => {
    void cleanup();
  });

  const loadStatus = async () => {
    const current = workspace();
    if (!current) return;
    const nextStatus = await getPRConflictStatus(current.workspace_path);
    setStatus(nextStatus);
    if (!selectedFile() && nextStatus.conflicts.length > 0) {
      setSelectedFile(nextStatus.conflicts[0]);
    }
  };

  const loadDiff = async (file = selectedFile()) => {
    const current = workspace();
    if (!current || !file) {
      setDiff({ diff: "" });
      return;
    }
    setLoadingDiff(true);
    try {
      setDiff(await getDiff(current.workspace_path, file, false));
    } catch (loadError) {
      setError(String(loadError));
    } finally {
      setLoadingDiff(false);
    }
  };

  const prepare = async () => {
    try {
      const token = props.provider === "azure"
        ? await azureService.getToken()
        : await githubService.getToken();
      const prepared = await preparePRConflict(
        props.repoPath,
        props.sourceBranch,
        props.targetBranch,
        token || undefined,
        props.provider,
      );
      setWorkspace(prepared);
      setStatus({ conflicts: prepared.conflicts, changed_files: prepared.conflicts, clean: false });
      if (prepared.conflicts.length > 0) setSelectedFile(prepared.conflicts[0]);
      setPreparing(false);
    } catch (prepareError) {
      setError(String(prepareError));
      setPreparing(false);
    }
  };

  onMount(() => {
    void prepare();
  });

  createEffect(() => {
    const file = selectedFile();
    if (file && workspace()) void loadDiff(file);
  });

  const handleSaveSuccess = async () => {
    const current = workspace();
    const file = selectedFile();
    if (current && file) {
      try {
        await stageFiles(current.workspace_path, [file]);
      } catch (stageError) {
        setError(String(stageError));
        return;
      }
    }
    await loadStatus();
    await loadDiff();
  };

  const finish = async () => {
    const current = workspace();
    const currentStatus = status();
    if (!current || !currentStatus) return;
    if (currentStatus.conflicts.length > 0) {
      notify.error(t("merge").merge_incomplete, t("merge").unresolved_conflicts);
      return;
    }

    setFinishing(true);
    try {
      const token = props.provider === "azure"
        ? await azureService.getToken()
        : await githubService.getToken();
      await commitPRConflict(
        current.workspace_path,
        current.source_branch,
        props.expectedHeadSha || current.expected_head_sha,
        commitMessage(),
        token || undefined,
        props.provider,
      );
      await cleanup();
      notify.success(t("merge").conflicts_resolved, t("merge").conflict_push_success);
      props.onComplete();
    } catch (finishError) {
      setError(String(finishError));
    } finally {
      setFinishing(false);
      setConfirming(false);
    }
  };

  const close = async () => {
    await cleanup();
    props.onClose();
  };

  return (
    <div class="flex h-full min-h-0 flex-col bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200">
      <div class="flex items-center justify-between gap-4 border-b border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2 text-sm font-semibold truncate">
            <i class="fa-solid fa-code-merge text-blue-500" />
            {props.sourceBranch} <span class="text-gray-400">→</span> {props.targetBranch}
          </div>
          <div class="text-xs text-gray-500 dark:text-gray-400">
            <Show when={status()} fallback={t("merge").preparing_workspace}>
              {(currentStatus) => currentStatus().conflicts.length > 0
                ? `${currentStatus().conflicts.length} ${t("merge").conflicts_found}`
                : t("merge").all_conflicts_resolved}
            </Show>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button class="px-3 py-1.5 rounded-md text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700" onClick={close}>
            {t("common").cancel}
          </button>
          <button
            class="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold disabled:opacity-50"
            disabled={preparing() || finishing() || !status() || status()!.conflicts.length > 0 || !commitMessage().trim()}
            onClick={() => setConfirming(true)}
          >
            <Show when={!finishing()} fallback={<i class="fa-solid fa-circle-notch fa-spin" />}>
              {t("merge").review_and_push}
            </Show>
          </button>
        </div>
      </div>

      <Show when={preparing()}>
        <div class="flex flex-1 items-center justify-center gap-3 text-sm text-gray-500">
          <i class="fa-solid fa-circle-notch fa-spin text-blue-500" /> {t("merge").preparing_workspace}
        </div>
      </Show>

      <Show when={!preparing() && error()}>
        <div class="flex flex-1 items-center justify-center p-8">
          <div class="max-w-xl w-full rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-6">
            <div class="flex items-center gap-3 text-red-600 dark:text-red-400 font-semibold">
              <i class="fa-solid fa-triangle-exclamation" />
              {t("merge").local_resolution_unavailable}
            </div>
            <p class="mt-3 text-sm text-red-700 dark:text-red-200 break-words">{error()}</p>
            <div class="mt-5 flex gap-2">
              <button class="px-3 py-2 rounded-md bg-blue-600 text-white text-xs" onClick={() => open(props.webUrl)}>
                {t("merge").open_provider_conflicts}
              </button>
              <button class="px-3 py-2 rounded-md bg-gray-200 dark:bg-gray-700 text-xs" onClick={close}>
                {t("common").cancel}
              </button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={!preparing() && workspace() && !error()}>
        <div class="flex flex-1 min-h-0">
          <aside class="w-[280px] shrink-0 overflow-auto border-r border-gray-300 dark:border-gray-700 bg-white/70 dark:bg-gray-900/40 p-3 custom-scrollbar">
            <div class="mb-3 text-[10px] font-black uppercase tracking-widest text-gray-400">{t("merge").conflicted_files}</div>
            <Show when={(status()?.conflicts.length || 0) > 0} fallback={<div class="p-4 text-center text-xs text-green-600">{t("merge").all_conflicts_resolved}</div>}>
              <div class="space-y-2">
                <For each={status()?.conflicts || []}>
                  {(file) => (
                    <button
                      class={`w-full rounded-lg border p-3 text-left text-xs transition-colors ${selectedFile() === file ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40" : "border-gray-200 dark:border-gray-700 hover:border-blue-300"}`}
                      onClick={() => setSelectedFile(file)}
                    >
                      <i class="fa-regular fa-file-code mr-2 text-red-500" />{file}
                    </button>
                  )}
                </For>
              </div>
            </Show>
            <div class="mt-6 border-t border-gray-200 dark:border-gray-700 pt-4">
              <label class="text-[10px] font-black uppercase tracking-widest text-gray-400">{t("merge").resolution_commit_message}</label>
              <textarea
                class="mt-2 w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 p-2 text-xs outline-none focus:border-blue-500"
                rows="4"
                value={commitMessage()}
                onInput={(event) => setCommitMessage(event.currentTarget.value)}
              />
            </div>
          </aside>
          <section class="flex min-w-0 flex-1 flex-col bg-white dark:bg-gray-800">
            <Show when={!loadingDiff()} fallback={<div class="flex flex-1 items-center justify-center text-sm text-gray-500"><i class="fa-solid fa-circle-notch fa-spin mr-2" />{t("common").loading}</div>}>
              <Show when={selectedFile()} fallback={<div class="flex flex-1 items-center justify-center text-sm text-gray-500">{t("merge").select_conflicted_file}</div>}>
                <DiffViewer
                  path={workspace()!.workspace_path}
                  file={selectedFile()}
                  diff={diff()}
                  class="h-full"
                  isStaged={false}
                  onSaveSuccess={handleSaveSuccess}
                />
              </Show>
            </Show>
          </section>
        </div>
      </Show>

      <Dialog
        open={confirming()}
        title={t("merge").review_and_push}
        icon="fa-solid fa-cloud-arrow-up"
        iconColor="text-blue-600 dark:text-blue-300"
        onClose={() => setConfirming(false)}
        width="min(520px, 92vw)"
      >
        <div class="space-y-4 text-sm">
          <p>{t("merge").confirm_resolution_push}</p>
          <div class="rounded-lg bg-gray-100 dark:bg-gray-800 p-3 text-xs space-y-1">
            <div><span class="text-gray-500">{t("merge").source_branch}:</span> {props.sourceBranch}</div>
            <div><span class="text-gray-500">{t("merge").target_branch}:</span> {props.targetBranch}</div>
            <div><span class="text-gray-500">{t("merge").resolution_commit_message}:</span> {commitMessage()}</div>
          </div>
          <div class="flex justify-end gap-2">
            <button class="px-3 py-2 rounded-md text-xs bg-gray-200 dark:bg-gray-700" onClick={() => setConfirming(false)}>{t("common").cancel}</button>
            <button class="px-3 py-2 rounded-md text-xs bg-blue-600 text-white disabled:opacity-50" disabled={finishing()} onClick={finish}>{t("merge").confirm_push}</button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
