import { createEffect, createSignal, For, Show } from "solid-js";
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
import { Repo } from "../../models/Repo.model";

type CommitDetailsModalProps = {
  commit: any;
  repo: Repo;
  branch?: string;
  openParent?: boolean;
  openProfile?: boolean;
  selectCommit?: (hash: string) => void;
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
    case "conflicted":
    case "u":
      return "bg-orange-500/15 text-orange-600 dark:text-orange-300";
    default:
      return "bg-amber-500/15 text-amber-600 dark:text-amber-300";
  }
};

const fileStatusLabel = (status: string) => status || "modified";

export function CommitDetailsModal(props: CommitDetailsModalProps) {
  const [activeTab, setActiveTab] = createSignal<"overview" | "files">("overview");
  const [selectedFile, setSelectedFile] = createSignal<any>(null);
  const [fileDiff, setFileDiff] = createSignal<any>(null);
  const [loadingDiff, setLoadingDiff] = createSignal(false);
  const [profileOpen, setProfileOpen] = createSignal(false);
  const [copied, setCopied] = createSignal(false);
  let lastProcessedHash: string | undefined;

  const { t, locale } = useApp();

  const fetchFileDiff = async (file: any) => {
    if (!props.commit?.hash) return;

    setSelectedFile(file);
    setLoadingDiff(true);
    try {
      const result = await getCommitFileDiff(props.repo.path, props.commit.hash, file.file);
      setFileDiff(result);
    } catch (error) {
      notify.error(t("error").error, String(error));
    } finally {
      setLoadingDiff(false);
    }
  };

  const getFileName = (path: string) => path.split(/[\\/]/).pop() || path;

  const copyHash = async () => {
    if (!props.commit?.hash) return;

    try {
      await navigator.clipboard.writeText(props.commit.hash);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      notify.error(t("error").error, String(error));
    }
  };

  createEffect(() => {
    const commit = props.commit;
    if (!commit) {
      setSelectedFile(null);
      setFileDiff(null);
      lastProcessedHash = undefined;
      return;
    }

    if (commit.hash === lastProcessedHash) return;
    lastProcessedHash = commit.hash;
    setActiveTab("overview");

    const firstFile = commit.files?.[0];
    if (firstFile) {
      void fetchFileDiff(firstFile);
    } else {
      setSelectedFile(null);
      setFileDiff(null);
    }
  });

  return (
    <div class="flex h-full min-h-0 flex-col overflow-hidden bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100">
      <Show when={props.commit} fallback={
        <div class="flex h-full items-center justify-center text-sm text-gray-400">
          {t("commits").select_commit}
        </div>
      }>
        <header class="border-b border-gray-200/80 bg-white px-6 py-5 dark:border-gray-800 dark:bg-gray-800">
          <div class="flex flex-wrap items-start justify-between gap-5">
            <div class="flex min-w-0 items-center gap-4">
              <button
                class="shrink-0 rounded-full transition-transform hover:scale-105 disabled:cursor-default"
                disabled={!props.openProfile}
                onClick={() => props.openProfile && setProfileOpen(true)}
                title={props.openProfile ? t("auth").user_profile : undefined}
              >
                <img
                  src={getGravatarUrl(props.commit.authorEmail, 120)}
                  alt={props.commit.authorName}
                  class="h-14 w-14 rounded-full border-4 border-blue-500/15 object-cover shadow-lg"
                />
              </button>
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <button
                    class="truncate text-lg font-bold tracking-tight text-gray-900 disabled:cursor-default dark:text-white"
                    disabled={!props.openProfile}
                    onClick={() => props.openProfile && setProfileOpen(true)}
                  >
                    {formatContributorName(props.commit.authorName)}
                  </button>
                  <Show when={props.branch}>
                    <span class="rounded-full bg-blue-500/10 px-2.5 py-1 text-[10px] font-bold text-blue-600 dark:text-blue-300">
                      <i class="fa-solid fa-code-branch mr-1" aria-hidden="true"></i>{props.branch}
                    </span>
                  </Show>
                </div>
                <p class="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">{props.commit.authorEmail}</p>
                <p class="mt-1 text-xs text-gray-400">{formatDate(props.commit.authorDate, locale())}</p>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <button
                class="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-blue-950/30"
                onClick={copyHash}
                title={props.commit.hash}
              >
                <i class={`fa-regular ${copied() ? "fa-circle-check text-emerald-500" : "fa-copy"}`} aria-hidden="true"></i>
                <span class="hidden sm:inline">{copied() ? t("common").done : props.commit.hash.slice(0, 8)}</span>
              </button>
              <Show when={props.onCreateTag}>
                <button
                  class="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-600 transition-colors hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300"
                  title={t("tag").create}
                  aria-label={t("tag").create}
                  onClick={() => props.onCreateTag?.({ hash: props.commit.hash, subject: props.commit.subject })}
                >
                  <i class="fa-solid fa-tag" aria-hidden="true"></i>
                </button>
              </Show>
            </div>
          </div>

          <div class="mt-5 grid grid-cols-3 gap-2 sm:max-w-md">
            <div class="rounded-xl border border-gray-200/80 bg-gray-50 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-700/70">
              <span class="block text-[10px] font-bold uppercase tracking-wider text-gray-400">{t("file").files}</span>
              <strong class="mt-1 block text-lg text-gray-800 dark:text-gray-100">{props.commit.files?.length || 0}</strong>
            </div>
            <div class="rounded-xl border border-gray-200/80 bg-gray-50 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-700/70">
              <span class="block text-[10px] font-bold uppercase tracking-wider text-gray-400">Parents</span>
              <strong class="mt-1 block text-lg text-gray-800 dark:text-gray-100">{props.commit.parents?.length || 0}</strong>
            </div>
            <div class="rounded-xl border border-gray-200/80 bg-gray-50 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-700/70">
              <span class="block text-[10px] font-bold uppercase tracking-wider text-gray-400">SHA</span>
              <strong class="mt-1 block font-mono text-sm text-gray-800 dark:text-gray-100">{props.commit.hash.slice(0, 8)}</strong>
            </div>
          </div>
        </header>

        <nav class="flex shrink-0 gap-1 border-b border-gray-200 bg-gray-200 px-6 pt-1 dark:border-gray-700 dark:bg-gray-900" aria-label={t("commits").details}>
          <button
            class={`rounded-t-xl px-4 py-3 text-xs -mb-[1px] font-bold transition-colors ${activeTab() === "overview" ? "border-t border-l border-r border-b-0 border-gray-100 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-blue-600 dark:text-blue-300" : "text-gray-400 hover:text-gray-700"}`}
            onClick={() => setActiveTab("overview")}
          >
            <i class="fa-solid fa-align-left mr-2" aria-hidden="true"></i>{t("common").general}
          </button>
          <button
            class={`rounded-t-xl px-4 py-3 text-xs -mb-1 font-bold transition-colors ${activeTab() === "files" ? "border-t border-l border-r border-b-0 border-gray-100 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-blue-600 dark:text-blue-300" : "text-gray-400 hover:text-gray-700"}`}
            onClick={() => setActiveTab("files")}
          >
            <i class="fa-solid fa-file-lines mr-2" aria-hidden="true"></i>{t("file").files} ({props.commit.files?.length || 0})
          </button>
        </nav>

        <div class="min-h-0 flex-1 overflow-hidden">
          <Show when={activeTab() === "overview"}>
            <div class="h-full overflow-y-auto p-6 custom-scrollbar">
              <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(260px,0.38fr)]">
                <section class="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-700/70">
                  <div class="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">
                    <i class="fa-solid fa-message text-blue-500" aria-hidden="true"></i>{t("commits").message}
                  </div>
                  <h2 class="text-xl font-bold leading-snug text-gray-900 dark:text-white">
                    <CommitMessage message={props.commit.subject} />
                  </h2>
                  <Show when={props.commit.body}>
                    <div class="mt-5 whitespace-pre-wrap border-t border-gray-100 pt-5 text-sm leading-7 text-gray-600 dark:border-gray-800 dark:text-gray-300">
                      {props.commit.body}
                    </div>
                  </Show>
                </section>

                <section class="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-700/70">
                  <div class="mb-4 text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">Commit metadata</div>
                  <div class="space-y-4 text-xs">
                    <div>
                      <span class="mb-1 block text-gray-400">SHA completo</span>
                      <span class="block break-all rounded-lg bg-gray-50 px-3 py-2 font-mono text-gray-600 dark:bg-gray-800 dark:text-gray-300">{props.commit.hash}</span>
                    </div>
                    <Show when={props.commit.parents?.length}>
                      <div>
                        <span class="mb-2 block text-gray-400">Parents</span>
                        <div class="flex flex-wrap gap-2">
                          <For each={props.commit.parents}>
                            {(parentHash) => (
                              <Show when={props.openParent !== false && props.selectCommit} fallback={<span class="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 font-mono text-[10px] text-gray-500 dark:border-gray-700 dark:bg-gray-800">{parentHash.slice(0, 8)}</span>}>
                                <button
                                  class="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 font-mono text-[10px] text-blue-600 transition-colors hover:bg-blue-100 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300"
                                  title={parentHash}
                                  onClick={() => props.selectCommit?.(parentHash)}
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
          </Show>

          <Show when={activeTab() === "files"}>
            <div class="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[minmax(240px,0.4fr)_minmax(0,1fr)]">
              <aside class="min-h-0 overflow-y-auto border-b border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-800 lg:border-b-0 lg:border-r">
                <div class="mb-3 flex items-center justify-between">
                  <span class="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">{t("file").files}</span>
                  <span class="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-bold text-gray-500 dark:bg-gray-800 dark:text-gray-300">{props.commit.files?.length || 0}</span>
                </div>
                <div class="space-y-1.5">
                  <For each={props.commit.files} fallback={<div class="rounded-xl border border-dashed border-gray-300 p-6 text-center text-xs text-gray-400 dark:border-gray-700">{t("common").no_data}</div>}>
                    {(file) => (
                      <button
                        class={`group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all ${selectedFile()?.file === file.file ? "border-blue-200 bg-blue-50 dark:border-blue-900/60 dark:bg-blue-950/30" : "border-transparent hover:border-gray-200 hover:bg-gray-50 dark:hover:border-gray-700 dark:hover:bg-gray-800"}`}
                        onClick={() => void fetchFileDiff(file)}
                      >
                        <FileIcon fileName={getFileName(file.file)} class="h-5 w-5 shrink-0" />
                        <span class="min-w-0 flex-1">
                          <span class="block truncate text-xs font-semibold text-gray-700 dark:text-gray-200">{getFileName(file.file)}</span>
                          <span class="mt-0.5 block truncate text-[10px] text-gray-400">{file.file}</span>
                        </span>
                        <span class={`shrink-0 rounded-md px-1.5 py-1 text-[9px] font-black uppercase ${fileStatusClass(file.status || "modified")}`}>{fileStatusLabel(file.status || "M")}</span>
                      </button>
                    )}
                  </For>
                </div>
              </aside>

              <section class="min-h-0 overflow-auto bg-gray-100 p-4 dark:bg-gray-900">
                <Show when={selectedFile()} fallback={<div class="flex h-full min-h-48 items-center justify-center rounded-2xl border border-dashed border-gray-300 text-sm text-gray-400 dark:border-gray-800">{t("pr").select_file_see_changes}</div>}>
                  <div class="mb-3 flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-800">
                    <FileIcon fileName={getFileName(selectedFile().file)} class="h-5 w-5" />
                    <div class="min-w-0">
                      <p class="truncate text-xs font-bold text-gray-700 dark:text-gray-200">{getFileName(selectedFile().file)}</p>
                      <p class="truncate text-[10px] text-gray-400">{selectedFile().file}</p>
                    </div>
                    <span class={`ml-auto rounded-md px-2 py-1 text-[9px] font-black uppercase ${fileStatusClass(selectedFile().status || "modified")}`}>{fileStatusLabel(selectedFile().status || "M")}</span>
                  </div>
                  <Show when={!loadingDiff()} fallback={<div class="flex min-h-64 items-center justify-center rounded-2xl border border-gray-200 bg-white text-sm text-gray-400 dark:border-gray-800 dark:bg-gray-800"><i class="fa-solid fa-spinner mr-2 animate-spin text-blue-500" />{t("common").loading}</div>}>
                    <div class="min-h-64 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-800">
                      <DiffViewer path={props.repo.path} file={selectedFile().file} diff={fileDiff()} class="text-xs" isStaged={true} />
                    </div>
                  </Show>
                </Show>
              </section>
            </div>
          </Show>
        </div>
      </Show>

      <Show when={profileOpen()}>
        <Dialog open={profileOpen()} onClose={() => setProfileOpen(false)} title={t("auth").user_profile} icon="fa-solid fa-user" iconColor="text-indigo-600 dark:text-indigo-300" width="90vw">
          <UserProfileDialog
            repo={props.repo}
            branch={props.branch || ""}
            email={props.commit?.authorEmail}
            fallbackName={props.commit?.authorName}
            open={profileOpen()}
            onClose={() => setProfileOpen(false)}
          />
        </Dialog>
      </Show>
    </div>
  );
}
