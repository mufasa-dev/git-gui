import { createSignal, Show, For, createEffect } from "solid-js";
import { getGravatarUrl } from "../../services/gravatarService";
import { formatDate } from "../../utils/date";
import { getCommitFileDiff } from "../../services/gitService";
import DiffViewer from "../ui/DiffViewer";
import { notify } from "../../utils/notifications";
import FileIcon from "../ui/FileIcon";
import CommitMessage from "../ui/CommitMessage";
import { UserProfileDialog } from "../Config/UserProfile";
import { formatContributorName } from "../../utils/user";
import Dialog from "../ui/Dialog";
import { useApp } from "../../context/AppContext";
import { GitProvider } from "../../utils/gitProvider";
import { Repo } from "../../models/Repo.model";
import { Diff } from "../../models/Diff.model";

type CommitDetailsProps = {
  commit: any;
  repo?: Repo;
  repoName?: string;
  repoPath?: string;
  branch: string;
  openParent: boolean;
  openProfile?: boolean;
  provider?: GitProvider;
  org?: string;
  isLogged?: boolean;
  selectCommit: (hash: string) => void;
  onCreateTag?: (commit: { hash: string; subject: string }) => void;
};

const fileStatusClass = (status: string) => {
  switch (status.toLowerCase()) {
    case "added":
    case "a":
      return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300";
    case "deleted":
    case "d":
      return "bg-rose-500/15 text-rose-600 dark:text-rose-300";
    case "renamed":
    case "r":
      return "bg-sky-500/15 text-sky-600 dark:text-sky-300";
    default:
      return "bg-amber-500/15 text-amber-600 dark:text-amber-300";
  }
};

const fileStatusLabel = (status: string) => status || "M";

export function CommitDetails(props: CommitDetailsProps) {
  const repository = props.repo ?? {
    path: props.repoPath ?? "",
    name: props.repoName ?? "",
    branches: [],
  };
  const [activeTab, setActiveTab] = createSignal<"geral" | "arquivos">("geral");
  const [selectedFile, setSelectedFile] = createSignal<any>(null);
  const [fileDiff, setFileDiff] = createSignal<Diff | null>(null);
  const [diffError, setDiffError] = createSignal<string | null>(null);
  const [lastProcessedHash, setLastProcessedHash] = createSignal<string | null>(null);
  const [loadingDiff, setLoadingDiff] = createSignal(false);
  const [modalUserProfileOpen, setModalUserProfileOpen] = createSignal(false);
  let diffRequestId = 0;
  const { t, locale } = useApp();

  const fetchFileDiff = async (file: any) => {
    const requestId = ++diffRequestId;
    setSelectedFile(file);
    setFileDiff(null);
    setDiffError(null);
    setLoadingDiff(true);
    try {
      const res = await getCommitFileDiff(repository.path, props.commit.hash, file.file);
      if (requestId === diffRequestId) {
        setFileDiff(res);
      }
    } catch (e) {
      if (requestId === diffRequestId) {
        console.error(e);
        setFileDiff(null);
        setDiffError(String(e));
        notify.error(t("error").error, String(e));
      }
    } finally {
      if (requestId === diffRequestId) {
        setLoadingDiff(false);
      }
    }
  };

  const getFileNameFromPath = (path: string): string => {
    if (!path) {
      return "";
    }
    const parts = path.split(/[\\/]/);
    return parts[parts.length - 1];
  };

  createEffect(() => {
    const currentCommit = props.commit;

    if (!currentCommit) {
      diffRequestId++;
      setSelectedFile(null);
      setFileDiff(null);
      setDiffError(null);
      setLoadingDiff(false);
      setLastProcessedHash(null);
      return;
    }

    const currentHash = currentCommit.hash;

    if (currentHash !== lastProcessedHash()) {
      setLastProcessedHash(currentHash);
      setActiveTab("geral");

      const files = currentCommit.files;
      if (files && files.length > 0) {
        void fetchFileDiff(files[0]);
      } else {
        diffRequestId++;
        setSelectedFile(null);
        setFileDiff(null);
        setDiffError(null);
        setLoadingDiff(false);
      }
    }
  });

  return (
    <div class="flex h-full min-h-0 flex-col overflow-hidden bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100">
      <Show when={!props.commit} fallback={
        <>
          {/* Navegação de Abas */}
          <div class="flex shrink-0 items-end gap-1 border-b border-gray-200 bg-gray-200 px-2 pt-1 dark:border-gray-700 dark:bg-gray-900">
            <button
              type="button"
              onClick={() => setActiveTab("geral")}
              class={`-mb-px rounded-t-lg border px-3 py-1.5 text-[11px] font-bold transition-colors ${
                activeTab() === "geral"
                  ? "border-gray-200 border-b-gray-100 bg-gray-100 text-blue-600 dark:border-gray-700 dark:border-b-gray-800 dark:bg-gray-800 dark:text-blue-300"
                  : "border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              <i class="fa-solid fa-align-left mr-1.5 text-[10px]" aria-hidden="true"></i>{t("common").general}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("arquivos")}
              class={`-mb-px rounded-t-lg border px-3 py-1.5 text-[11px] font-bold transition-colors ${
                activeTab() === "arquivos"
                  ? "border-gray-200 border-b-gray-100 bg-gray-100 text-blue-600 dark:border-gray-700 dark:border-b-gray-800 dark:bg-gray-800 dark:text-blue-300"
                  : "border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              <i class="fa-solid fa-file-lines mr-1.5 text-[10px]" aria-hidden="true"></i>{t("file").files} ({props.commit?.files?.length || 0})
            </button>
          </div>

          <div class="min-h-0 flex-1 overflow-hidden">
            {/* CONTEÚDO: ABA GERAL */}
            <Show when={activeTab() === "geral"}>
              <div class="h-full overflow-y-auto p-2 custom-scrollbar">
                <div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                  <div class="flex items-center gap-3 border-b border-gray-100 px-3 py-2.5 dark:border-gray-700">
                    <button
                      type="button"
                      disabled={!props.openProfile}
                      onClick={() => props.openProfile && setModalUserProfileOpen(true)}
                      class="shrink-0 rounded-full transition-transform hover:scale-105 disabled:cursor-default"
                      title={props.openProfile ? t("auth").user_profile : undefined}
                    >
                      <img
                        src={getGravatarUrl(props.commit.authorEmail, 96)}
                        alt={props.commit.authorName}
                        class="h-12 w-12 rounded-full border-2 border-blue-500/15 object-cover shadow-sm"
                      />
                    </button>
                    <div class="min-w-0 flex-1">
                      <button
                        type="button"
                        disabled={!props.openProfile}
                        onClick={() => props.openProfile && setModalUserProfileOpen(true)}
                        class="block max-w-full truncate text-sm font-bold text-gray-900 transition-colors hover:text-blue-600 disabled:cursor-default dark:text-gray-100 dark:hover:text-blue-300"
                      >
                        {formatContributorName(props.commit.authorName)}
                      </button>
                      <div class="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-400">
                        <span class="max-w-full truncate">{props.commit.authorEmail}</span>
                        <span class="text-gray-300 dark:text-gray-600">•</span>
                        <span>{formatDate(props.commit.authorDate, locale())}</span>
                      </div>
                    </div>
                    <Show when={props.onCreateTag}>
                      <button
                        type="button"
                        class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-600 transition-colors hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300"
                        title={t("tag").create}
                        aria-label={t("tag").create}
                        onClick={() => props.onCreateTag?.({ hash: props.commit.hash, subject: props.commit.subject })}
                      >
                        <i class="fa-solid fa-tag text-[10px]" aria-hidden="true"></i>
                      </button>
                    </Show>
                  </div>

                  <div class="grid gap-2.5 p-2.5 sm:grid-cols-[minmax(0,1fr)_190px]">
                    <section class="min-w-0 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-700/40">
                      <div class="mb-1 flex items-start gap-2">
                        <div class="min-w-0 flex-1 text-sm font-semibold leading-5 text-gray-800 dark:text-gray-100">
                          <CommitMessage message={props.commit.subject} />
                        </div>
                      </div>
                      <Show when={props.commit.body}>
                        <p class="mt-1 whitespace-pre-wrap border-t border-gray-200/80 pt-1.5 text-xs leading-5 text-gray-500 dark:border-gray-600 dark:text-gray-300">
                          {props.commit.body}
                        </p>
                      </Show>
                    </section>

                    <section class="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-700/40">
                      <div class="mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">Commit metadata</div>
                      <div class="space-y-1.5 text-[11px]">
                        <div class="flex items-center justify-between gap-2">
                          <span class="text-gray-400">SHA</span>
                          <span class="max-w-[145px] truncate rounded-md bg-white px-1.5 py-0.5 font-mono text-gray-600 dark:bg-gray-800 dark:text-gray-300" title={props.commit.hash}>
                            {props.commit.hash.slice(0, 8)}
                          </span>
                        </div>
                        <Show when={props.commit?.parents?.length > 0}>
                          <div class="flex items-start justify-between gap-2">
                            <span class="pt-0.5 text-gray-400">Parents</span>
                            <div class="flex max-w-[145px] flex-wrap justify-end gap-1">
                              <For each={props.commit.parents}>
                                {(parentHash) => (
                                  <Show when={props.openParent} fallback={
                                    <span class="rounded-md border border-gray-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300">
                                      {parentHash.slice(0, 8)}
                                    </span>
                                  }>
                                    <button
                                      type="button"
                                      onClick={() => props.selectCommit(parentHash)}
                                      class="rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] text-blue-600 transition-colors hover:bg-blue-100 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300"
                                      title={parentHash}
                                    >
                                      {parentHash.slice(0, 8)}
                                    </button>
                                  </Show>
                                )}
                              </For>
                            </div>
                          </div>
                        </Show>
                      </div>
                    </section>
                  </div>
                </div>
              </div>
            </Show>

            {/* CONTEÚDO: ABA ARQUIVOS */}
            <Show when={activeTab() === "arquivos"}>
              <div class="grid h-full min-h-0 grid-cols-[minmax(165px,31%)_minmax(0,1fr)]">
                {/* Sidebar de arquivos */}
                <aside class="min-h-0 overflow-y-auto border-r border-gray-200 bg-gray-50 p-1.5 custom-scrollbar dark:border-gray-700 dark:bg-gray-900/50">
                  <div class="mb-1 flex items-center justify-between px-1.5 py-1">
                    <span class="text-[9px] font-bold uppercase tracking-[0.16em] text-gray-400">{t("file").files}</span>
                    <span class="rounded-full bg-gray-200 px-1.5 py-0.5 text-[9px] font-bold text-gray-500 dark:bg-gray-700 dark:text-gray-300">{props.commit?.files?.length || 0}</span>
                  </div>
                  <div class="space-y-1">
                    <For each={props.commit.files} fallback={<div class="rounded-lg border border-dashed border-gray-300 p-4 text-center text-[10px] text-gray-400 dark:border-gray-700">{t("common").no_data}</div>}>
                      {(f) => (
                        <button
                          type="button"
                          onClick={() => void fetchFileDiff(f)}
                          class={`group flex w-full min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-all ${
                            selectedFile()?.file === f.file
                              ? "border-blue-200 bg-blue-50 shadow-sm dark:border-blue-900/60 dark:bg-blue-950/30"
                              : "border-transparent hover:border-gray-200 hover:bg-white dark:hover:border-gray-700 dark:hover:bg-gray-800"
                          }`}
                          title={f.file}
                        >
                          <FileIcon fileName={getFileNameFromPath(f.file)} class="h-4 w-4 shrink-0" />
                          <span class="min-w-0 flex-1 truncate text-[10px] font-semibold text-gray-700 dark:text-gray-200">{getFileNameFromPath(f.file)}</span>
                          <span class={`shrink-0 rounded px-1 py-0.5 text-[8px] font-black uppercase ${fileStatusClass(f.status || "M")}`}>{fileStatusLabel(f.status || "M")}</span>
                        </button>
                      )}
                    </For>
                  </div>
                </aside>

                {/* Área do Diff */}
                <section class="min-h-0 overflow-auto bg-gray-100 p-1.5 custom-scrollbar dark:bg-gray-900">
                  <Show when={selectedFile()} fallback={<div class="flex h-full min-h-32 items-center justify-center rounded-xl border border-dashed border-gray-300 text-xs text-gray-400 dark:border-gray-800">{t("pr").select_file_see_changes}</div>}>
                    <div class="mb-1.5 flex min-w-0 items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 dark:border-gray-800 dark:bg-gray-800">
                      <FileIcon fileName={getFileNameFromPath(selectedFile().file)} class="h-4 w-4 shrink-0" />
                      <span class="min-w-0 flex-1 truncate text-[10px] font-semibold text-gray-700 dark:text-gray-200" title={selectedFile().file}>{selectedFile().file}</span>
                      <span class={`shrink-0 rounded px-1.5 py-0.5 text-[8px] font-black uppercase ${fileStatusClass(selectedFile().status || "M")}`}>{fileStatusLabel(selectedFile().status || "M")}</span>
                    </div>
                    <Show when={!loadingDiff()} fallback={<div class="flex min-h-32 items-center justify-center rounded-xl border border-gray-200 bg-white text-xs text-gray-400 dark:border-gray-800 dark:bg-gray-800"><i class="fa-solid fa-spinner mr-2 animate-spin text-blue-500" aria-hidden="true"></i>{t("common").loading}</div>}>
                      <Show when={fileDiff()} fallback={<div class="flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4 text-center text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"><i class="fa-solid fa-triangle-exclamation text-lg" aria-hidden="true"></i><span>{t("file").preview_unavailable}</span><Show when={diffError()}><span class="max-w-full break-words text-[10px] opacity-75">{diffError()}</span></Show></div>}>
                        <div class="min-h-32 overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-800">
                          <DiffViewer
                            path={repository.path}
                            file={selectedFile().file}
                            diff={fileDiff()!}
                            class="h-full text-xs"
                            isStaged={true}
                          />
                        </div>
                      </Show>
                    </Show>
                  </Show>
                </section>
              </div>
            </Show>
          </div>
        </>
      }>
        <div class="flex h-full items-center justify-center text-xs text-gray-400">
          {t("commits").select_commit}
        </div>
      </Show>

      <Show when={modalUserProfileOpen()}>
        <Dialog
          open={modalUserProfileOpen()}
          onClose={() => setModalUserProfileOpen(false)}
          title={t("auth").user_profile}
          icon="fa-solid fa-user"
          iconColor="text-indigo-600 dark:text-indigo-300"
          width={"90vw"}
        >
          <UserProfileDialog
            repo={repository}
            branch={props.branch || ""}
            email={props.commit?.authorEmail}
            fallbackName={props.commit?.authorName}
            open={modalUserProfileOpen()}
            onClose={() => setModalUserProfileOpen(false)}
          />
        </Dialog>
      </Show>

    </div>
  );
}
