import { createSignal, For, Show } from "solid-js";
import { Repo } from "../../models/Repo.model";
import { Stash } from "../../models/Stash.model";
import {
  applyStash,
  applyStashToBranch,
  clearStashes,
  dropStash,
  getStashDiff,
  popStash,
} from "../../services/gitService";
import { notify } from "../../utils/notifications";
import { useLoading } from "../ui/LoadingContext";
import { useApp } from "../../context/AppContext";
import { formatDate } from "../../utils/date";
import Dialog from "../ui/Dialog";
import ConfirmModal from "../ui/ConfirmModal";
import DiffViewer from "../ui/DiffViewer";
import CreateStashModal from "./CreateStashModal";

export type StashListProps = {
  repo: Repo;
  refresh: () => Promise<void>;
};

type Confirmation = "pop" | "drop" | "clear" | null;

export default function StashList(props: StashListProps) {
  const [open, setOpen] = createSignal(false);
  const [createOpen, setCreateOpen] = createSignal(false);
  const [diffOpen, setDiffOpen] = createSignal(false);
  const [diff, setDiff] = createSignal<{ diff: string }>({ diff: "" });
  const [selectedStash, setSelectedStash] = createSignal<Stash | null>(null);
  const [confirmation, setConfirmation] = createSignal<Confirmation>(null);
  const [branchDialogOpen, setBranchDialogOpen] = createSignal(false);
  const [targetBranch, setTargetBranch] = createSignal("");
  const [working, setWorking] = createSignal(false);
  const { showLoading, hideLoading } = useLoading();
  const { t, locale } = useApp();

  const stashes = () => props.repo.stashes ?? [];
  const branches = () => props.repo.branches.filter((branch) => branch.name !== props.repo.activeBranch);

  const run = async (operation: () => Promise<unknown>, successMessage: string) => {
    setWorking(true);
    showLoading(t("common").loading);
    try {
      await operation();
      notify.success(t("common").success, successMessage);
      await props.refresh();
    } catch (error) {
      notify.error(t("common").error, String(error));
    } finally {
      setWorking(false);
      hideLoading();
    }
  };

  const showDiff = async (stash: Stash) => {
    setWorking(true);
    try {
      setSelectedStash(stash);
      setDiff(await getStashDiff(props.repo.path, stash.reference));
      setDiffOpen(true);
    } catch (error) {
      notify.error(t("common").error, String(error));
    } finally {
      setWorking(false);
    }
  };

  const confirmMessage = () => {
    if (confirmation() === "clear") return t("stash").confirm_clear;
    if (confirmation() === "pop") return t("stash").pop + "?";
    return t("stash").confirm_drop;
  };

  const confirmAction = async () => {
    const action = confirmation();
    const stash = selectedStash();
    setConfirmation(null);
    if (action === "clear") {
      await run(() => clearStashes(props.repo.path), t("stash").clear);
    } else if (stash && action === "pop") {
      await run(() => popStash(props.repo.path, stash.reference), t("stash").pop);
    } else if (stash && action === "drop") {
      await run(() => dropStash(props.repo.path, stash.reference), t("stash").drop);
    }
  };

  const openApplyToBranch = (stash: Stash) => {
    setSelectedStash(stash);
    setTargetBranch(branches()[0]?.name ?? "");
    setBranchDialogOpen(true);
  };

  const applyToBranch = async () => {
    const stash = selectedStash();
    if (!stash || !targetBranch()) return;
    setBranchDialogOpen(false);
    await run(
      () => applyStashToBranch(props.repo.path, stash.reference, targetBranch()),
      `${t("stash").apply}: ${targetBranch()}`,
    );
  };

  return (
    <div class="mt-3 border-t border-gray-300 dark:border-gray-700 pt-2">
      <div class="flex items-center w-full px-2 py-1 cursor-pointer border-b border-gray-300 dark:border-gray-700" onClick={() => setOpen(!open())}>
        <i class="fa-solid fa-box-archive text-amber-500 mr-2"></i>
        <b class="text-sm">{t("stash").title}</b>
        <span class="ml-2 text-[10px] rounded-full px-1.5 py-0.5 bg-amber-500/20 text-amber-600 dark:text-amber-300">{stashes().length}</span>
        <button
          class="ml-auto px-2 py-0.5 text-xs rounded bg-blue-600 text-white"
          onClick={(event) => {
            event.stopPropagation();
            setCreateOpen(true);
          }}
          disabled={working()}
        >
          <i class="fa-solid fa-plus"></i>
        </button>
        <i class={`fa-solid ml-2 text-xs ${open() ? "fa-angle-down" : "fa-angle-right"}`}></i>
      </div>

      <Show when={open()}>
        <div class="px-2 mt-1">
          <Show when={stashes().length > 0} fallback={<div class="py-2 text-xs text-gray-500">{t("stash").empty}</div>}>
            <For each={stashes()}>
              {(stash) => (
                <div class="group rounded-lg border border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50 p-2 mb-1">
                  <div class="flex items-start gap-2">
                    <i class="fa-solid fa-box-archive text-amber-500 text-xs mt-1"></i>
                    <div class="min-w-0 flex-1">
                      <div class="font-mono text-xs truncate" title={stash.reference}>{stash.reference}</div>
                      <div class="text-xs truncate" title={stash.message || stash.branch}>
                        {stash.message || stash.branch || "WIP"}
                      </div>
                      <div class="text-[10px] text-gray-500 truncate">
                        {stash.branch || "-"} · {stash.createdAt ? formatDate(stash.createdAt, locale()) : "-"}
                      </div>
                    </div>
                  </div>
                  <div class="flex gap-1 mt-2 opacity-70 group-hover:opacity-100">
                    <button class="text-[10px] px-1.5 py-0.5 rounded bg-blue-600 text-white" title={t("stash").apply} onClick={() => void run(() => applyStash(props.repo.path, stash.reference), t("stash").apply)} disabled={working()}>
                      <i class="fa-solid fa-download"></i>
                    </button>
                    <button class="text-[10px] px-1.5 py-0.5 rounded bg-indigo-600 text-white" title={t("stash").pop} onClick={() => { setSelectedStash(stash); setConfirmation("pop"); }} disabled={working()}>
                      <i class="fa-solid fa-arrow-up-from-bracket"></i>
                    </button>
                    <button class="text-[10px] px-1.5 py-0.5 rounded bg-gray-600 text-white" title={t("stash").show_diff} onClick={() => void showDiff(stash)} disabled={working()}>
                      <i class="fa-solid fa-code-compare"></i>
                    </button>
                    <button class="text-[10px] px-1.5 py-0.5 rounded bg-purple-600 text-white" title={t("stash").apply_to_branch} onClick={() => openApplyToBranch(stash)} disabled={working() || branches().length === 0}>
                      <i class="fa-solid fa-code-branch"></i>
                    </button>
                    <button class="text-[10px] px-1.5 py-0.5 rounded bg-red-600 text-white" title={t("stash").drop} onClick={() => { setSelectedStash(stash); setConfirmation("drop"); }} disabled={working()}>
                      <i class="fa-solid fa-trash"></i>
                    </button>
                  </div>
                </div>
              )}
            </For>
            <button class="w-full text-left text-xs text-red-500 hover:text-red-400 px-1 py-1 disabled:opacity-50" onClick={() => setConfirmation("clear")} disabled={working()}>
              <i class="fa-solid fa-broom mr-1"></i>{t("stash").clear}
            </button>
          </Show>
        </div>
      </Show>

      <CreateStashModal
        open={createOpen()}
        repoPath={props.repo.path}
        onClose={() => setCreateOpen(false)}
        onCreated={props.refresh}
      />

      <ConfirmModal
        isOpen={confirmation() !== null}
        title={t("common").confirm}
        message={confirmMessage()}
        onConfirm={() => void confirmAction()}
        onCancel={() => setConfirmation(null)}
        isDanger
      />

      <Dialog
        open={branchDialogOpen()}
        title={t("stash").apply_to_branch}
        icon="fa-solid fa-code-branch"
        iconColor="text-blue-600 dark:text-blue-300"
        onClose={() => setBranchDialogOpen(false)}
      >
        <div class="space-y-4">
          <select class="w-full input-text" value={targetBranch()} onChange={(event) => setTargetBranch(event.currentTarget.value)}>
            <For each={branches()}>{(branch) => <option value={branch.name}>{branch.name}</option>}</For>
          </select>
          <p class="text-xs text-gray-500 dark:text-gray-400">{t("stash").clean_tree_required}</p>
          <div class="flex justify-end gap-2">
            <button class="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600" onClick={() => setBranchDialogOpen(false)}>{t("common").cancel}</button>
            <button class="px-4 py-2 rounded-lg bg-purple-600 text-white" onClick={() => void applyToBranch()}>{t("stash").apply}</button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={diffOpen()}
        title={`${t("stash").show_diff}: ${selectedStash()?.reference ?? ""}`}
        icon="fa-solid fa-code-compare"
        iconColor="text-cyan-600 dark:text-cyan-300"
        width="80vw"
        height="80vh"
        onClose={() => setDiffOpen(false)}
        bodyClass="p-0 h-[calc(80vh-64px)]"
      >
        <DiffViewer path={props.repo.path} file={selectedStash()?.reference ?? ""} diff={diff()} class="h-full" isStaged={false} />
      </Dialog>
    </div>
  );
}
