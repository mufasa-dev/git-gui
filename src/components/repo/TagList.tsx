import { createSignal, For, Show } from "solid-js";
import { Repo } from "../../models/Repo.model";
import { Tag } from "../../models/Tag.model";
import {
  checkoutTag,
  deleteRemoteTag,
  deleteTag,
  editTagMessage,
  getRemoteUrl,
  pushTag,
  renameTag,
} from "../../services/gitService";
import { githubService } from "../../services/github";
import { azureService } from "../../services/azure";
import { getProviderFromUrl } from "../../utils/gitProvider";
import { notify } from "../../utils/notifications";
import { useLoading } from "../ui/LoadingContext";
import { useApp } from "../../context/AppContext";
import { formatDate } from "../../utils/date";
import Dialog from "../ui/Dialog";
import ConfirmModal from "../ui/ConfirmModal";

export type TagListProps = {
  repo: Repo;
  refresh: () => Promise<void>;
  onSelectTag: (tag: Tag) => void;
};

type Confirmation = "delete" | "remoteDelete" | "checkout" | null;

export default function TagList(props: TagListProps) {
  const [open, setOpen] = createSignal(true);
  const [selectedTag, setSelectedTag] = createSignal<Tag | null>(null);
  const [confirmation, setConfirmation] = createSignal<Confirmation>(null);
  const [editOpen, setEditOpen] = createSignal(false);
  const [renameOpen, setRenameOpen] = createSignal(false);
  const [editMessage, setEditMessage] = createSignal("");
  const [newName, setNewName] = createSignal("");
  const [working, setWorking] = createSignal(false);
  const { showLoading, hideLoading } = useLoading();
  const { t, locale } = useApp();

  const tags = () => props.repo.tags ?? [];

  const getRemoteAuth = async () => {
    const remoteUrl = await getRemoteUrl(props.repo.path);
    const provider = remoteUrl ? getProviderFromUrl(remoteUrl) : "unknown";
    const token = provider === "azure"
      ? await azureService.getToken() || ""
      : provider === "github"
        ? await githubService.getToken() || ""
        : "";
    return { provider, token };
  };

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

  const push = async (tag: Tag | null, all: boolean) => {
    const { provider, token } = await getRemoteAuth();
    await run(
      () => pushTag(props.repo.path, "origin", tag?.name ?? null, all, token, provider),
      all ? t("tag").push_all : t("tag").push,
    );
  };

  const confirmMessage = () => {
    if (confirmation() === "checkout") return t("tag").confirm_checkout;
    if (confirmation() === "remoteDelete") return t("tag").confirm_remote_delete;
    return t("tag").confirm_delete;
  };

  const confirmAction = async () => {
    const action = confirmation();
    const tag = selectedTag();
    setConfirmation(null);
    if (!tag) return;

    if (action === "delete") {
      await run(() => deleteTag(props.repo.path, tag.name), t("tag").delete);
    } else if (action === "checkout") {
      await run(() => checkoutTag(props.repo.path, tag.name), t("tag").checkout);
    } else if (action === "remoteDelete") {
      const { provider, token } = await getRemoteAuth();
      await run(() => deleteRemoteTag(props.repo.path, "origin", tag.name, token, provider), t("tag").delete_remote);
    }
  };

  const openEdit = (tag: Tag) => {
    setSelectedTag(tag);
    setEditMessage(tag.message);
    setEditOpen(true);
  };

  const saveEdit = async () => {
    const tag = selectedTag();
    if (!tag || !editMessage().trim()) return;
    setEditOpen(false);
    await run(() => editTagMessage(props.repo.path, tag.name, editMessage()), t("tag").edit_message);
  };

  const openRename = (tag: Tag) => {
    setSelectedTag(tag);
    setNewName(tag.name);
    setRenameOpen(true);
  };

  const saveRename = async () => {
    const tag = selectedTag();
    if (!tag || !newName().trim() || newName().trim() === tag.name) return;
    if (!confirm(t("tag").confirm_rename)) return;
    setRenameOpen(false);
    await run(() => renameTag(props.repo.path, tag.name, newName()), t("tag").rename);
  };

  return (
    <div class="mt-3 border-t border-gray-300 dark:border-gray-700 pt-2 pb-2">
      <div class="flex items-center w-full px-2 py-1 cursor-pointer border-b border-gray-300 dark:border-gray-700" onClick={() => setOpen(!open())}>
        <i class="fa-solid fa-tag text-green-500 mr-2"></i>
        <b class="text-sm">{t("tag").title}</b>
        <span class="ml-2 text-[10px] rounded-full px-1.5 py-0.5 bg-green-500/20 text-green-600 dark:text-green-300">{tags().length}</span>
        <Show when={tags().length > 0}>
          <button class="ml-auto text-[10px] px-2 py-0.5 rounded bg-blue-600 text-white" onClick={(event) => { event.stopPropagation(); void push(null, true); }} disabled={working()}>
            <i class="fa-solid fa-cloud-arrow-up mr-1"></i>{t("tag").push_all}
          </button>
        </Show>
        <i class={`fa-solid ml-2 text-xs ${open() ? "fa-angle-down" : "fa-angle-right"}`}></i>
      </div>

      <Show when={open()}>
        <div class="px-2 mt-1">
          <Show when={tags().length > 0} fallback={<div class="py-2 text-xs text-gray-500">{t("tag").empty}</div>}>
            <For each={tags()}>
              {(tag) => (
                <div class="group rounded-lg border border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50 p-2 mb-1">
                  <div class="flex items-start gap-2">
                    <i class="fa-solid fa-tag text-green-500 text-xs mt-1"></i>
                    <button class="text-left min-w-0 flex-1" onClick={() => props.onSelectTag(tag)} title={t("tag").open_commit}>
                      <div class="flex items-center gap-2">
                        <span class="font-mono text-xs truncate">{tag.name}</span>
                        <span class="text-[9px] uppercase rounded px-1 bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-300">{tag.kind}</span>
                      </div>
                      <div class="text-[10px] text-gray-500 truncate">{tag.shortCommit} · {tag.message || "-"}</div>
                      <div class="text-[10px] text-gray-500 truncate">{tag.createdAt ? formatDate(tag.createdAt, locale()) : "-"}</div>
                    </button>
                  </div>
                  <div class="flex gap-1 mt-2 opacity-70 group-hover:opacity-100">
                    <button class="text-[10px] px-1.5 py-0.5 rounded bg-blue-600 text-white" title={t("tag").open_commit} onClick={() => props.onSelectTag(tag)} disabled={working()}>
                      <i class="fa-solid fa-code-commit"></i>
                    </button>
                    <button class="text-[10px] px-1.5 py-0.5 rounded bg-purple-600 text-white" title={t("tag").checkout} onClick={() => { setSelectedTag(tag); setConfirmation("checkout"); }} disabled={working()}>
                      <i class="fa-solid fa-right-to-bracket"></i>
                    </button>
                    <button class="text-[10px] px-1.5 py-0.5 rounded bg-indigo-600 text-white" title={t("tag").push} onClick={() => void push(tag, false)} disabled={working()}>
                      <i class="fa-solid fa-cloud-arrow-up"></i>
                    </button>
                    <Show when={tag.kind === "annotated"}>
                      <button class="text-[10px] px-1.5 py-0.5 rounded bg-gray-600 text-white" title={t("tag").edit_message} onClick={() => openEdit(tag)} disabled={working()}>
                        <i class="fa-solid fa-pen"></i>
                      </button>
                    </Show>
                    <button class="text-[10px] px-1.5 py-0.5 rounded bg-gray-600 text-white" title={t("tag").rename} onClick={() => openRename(tag)} disabled={working()}>
                      <i class="fa-solid fa-i-cursor"></i>
                    </button>
                    <button class="text-[10px] px-1.5 py-0.5 rounded bg-red-600 text-white" title={t("tag").delete} onClick={() => { setSelectedTag(tag); setConfirmation("delete"); }} disabled={working()}>
                      <i class="fa-solid fa-trash"></i>
                    </button>
                    <button class="text-[10px] px-1.5 py-0.5 rounded bg-red-800 text-white" title={t("tag").delete_remote} onClick={() => { setSelectedTag(tag); setConfirmation("remoteDelete"); }} disabled={working()}>
                      <i class="fa-solid fa-cloud-arrow-down"></i>
                    </button>
                  </div>
                </div>
              )}
            </For>
          </Show>
        </div>
      </Show>

      <ConfirmModal
        isOpen={confirmation() !== null}
        title={t("common").confirm}
        message={confirmMessage()}
        onConfirm={() => void confirmAction()}
        onCancel={() => setConfirmation(null)}
        isDanger
      />

      <Dialog open={editOpen()} title={t("tag").edit_message} onClose={() => setEditOpen(false)}>
        <div class="space-y-4">
          <textarea class="w-full input-text min-h-[100px]" value={editMessage()} onInput={(event) => setEditMessage(event.currentTarget.value)} />
          <div class="flex justify-end gap-2">
            <button class="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600" onClick={() => setEditOpen(false)}>{t("common").cancel}</button>
            <button class="px-4 py-2 rounded-lg bg-blue-600 text-white" onClick={() => void saveEdit()}>{t("common").save}</button>
          </div>
        </div>
      </Dialog>

      <Dialog open={renameOpen()} title={t("tag").rename} onClose={() => setRenameOpen(false)}>
        <div class="space-y-4">
          <input class="w-full input-text" value={newName()} onInput={(event) => setNewName(event.currentTarget.value)} />
          <div class="flex justify-end gap-2">
            <button class="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600" onClick={() => setRenameOpen(false)}>{t("common").cancel}</button>
            <button class="px-4 py-2 rounded-lg bg-blue-600 text-white" onClick={() => void saveRename()}>{t("common").save}</button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
