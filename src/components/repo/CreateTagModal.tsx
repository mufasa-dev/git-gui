import { createEffect, createSignal, Show } from "solid-js";
import Dialog from "../ui/Dialog";
import { createTag } from "../../services/gitService";
import { TagKind } from "../../models/Tag.model";
import { notify } from "../../utils/notifications";
import { useLoading } from "../ui/LoadingContext";
import { useApp } from "../../context/AppContext";

export type CreateTagModalProps = {
  open: boolean;
  repoPath: string;
  targetCommit: string;
  onClose: () => void;
  onCreated: () => Promise<void> | void;
};

export default function CreateTagModal(props: CreateTagModalProps) {
  const [name, setName] = createSignal("");
  const [kind, setKind] = createSignal<TagKind>("annotated");
  const [message, setMessage] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const { showLoading, hideLoading } = useLoading();
  const { t } = useApp();

  createEffect(() => {
    if (props.open) {
      setName("");
      setKind("annotated");
      setMessage("");
    }
  });

  const submit = async () => {
    if (!name().trim()) {
      notify.error(t("common").error, t("tag").name);
      return;
    }
    if (kind() === "annotated" && !message().trim()) {
      notify.error(t("common").error, t("tag").annotated_requires_message);
      return;
    }

    setSaving(true);
    showLoading(t("tag").create_title);
    try {
      await createTag(props.repoPath, name(), props.targetCommit, kind(), message());
      notify.success(t("common").success, t("tag").create);
      props.onClose();
      await props.onCreated();
    } catch (error) {
      notify.error(t("common").error, String(error));
    } finally {
      setSaving(false);
      hideLoading();
    }
  };

  return (
    <Dialog
      open={props.open}
      title={t("tag").create_title}
      icon="fa-solid fa-tag"
      iconColor="text-amber-600 dark:text-amber-300"
      onClose={props.onClose}
    >
      <div class="space-y-4 text-gray-700 dark:text-gray-200">
        <div class="text-xs text-gray-500 dark:text-gray-400">
          {t("tag").target_commit}: <span class="font-mono">{props.targetCommit.slice(0, 12)}</span>
        </div>
        <input
          class="w-full input-text"
          value={name()}
          placeholder={t("tag").name}
          onInput={(event) => setName(event.currentTarget.value)}
          disabled={saving()}
        />
        <select
          class="w-full input-text"
          value={kind()}
          onChange={(event) => setKind(event.currentTarget.value as TagKind)}
          disabled={saving()}
        >
          <option value="annotated">{t("tag").annotated}</option>
          <option value="lightweight">{t("tag").lightweight}</option>
        </select>
        <Show when={kind() === "annotated"}>
          <textarea
            class="w-full input-text min-h-[90px] resize-y"
            value={message()}
            placeholder={t("tag").message}
            onInput={(event) => setMessage(event.currentTarget.value)}
            disabled={saving()}
          />
        </Show>
        <div class="flex justify-end gap-2 pt-2">
          <button class="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600" onClick={props.onClose} disabled={saving()}>
            {t("common").cancel}
          </button>
          <button class="px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50" onClick={submit} disabled={saving()}>
            <Show when={saving()} fallback={t("tag").create}>
              {t("common").loading}
            </Show>
          </button>
        </div>
      </div>
    </Dialog>
  );
}
