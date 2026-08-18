import { createEffect, createSignal, Show } from "solid-js";
import Dialog from "../ui/Dialog";
import { createStash } from "../../services/gitService";
import { notify } from "../../utils/notifications";
import { useLoading } from "../ui/LoadingContext";
import { useApp } from "../../context/AppContext";

export type CreateStashModalProps = {
  open: boolean;
  repoPath: string;
  onClose: () => void;
  onCreated: () => Promise<void> | void;
};

export default function CreateStashModal(props: CreateStashModalProps) {
  const [message, setMessage] = createSignal("");
  const [includeUntracked, setIncludeUntracked] = createSignal(true);
  const [keepIndex, setKeepIndex] = createSignal(false);
  const [stagedOnly, setStagedOnly] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const { showLoading, hideLoading } = useLoading();
  const { t } = useApp();

  createEffect(() => {
    if (props.open) {
      setMessage("");
      setIncludeUntracked(true);
      setKeepIndex(false);
      setStagedOnly(false);
    }
  });

  const submit = async () => {
    if (keepIndex() && stagedOnly()) {
      notify.error(t("common").error, t("stash").invalid_options);
      return;
    }

    setSaving(true);
    showLoading(t("stash").create_title);
    try {
      await createStash(props.repoPath, message(), includeUntracked(), keepIndex(), stagedOnly());
      notify.success(t("common").success, t("stash").create);
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
    <Dialog open={props.open} title={t("stash").create_title} onClose={props.onClose}>
      <div class="space-y-4 text-gray-700 dark:text-gray-200">
        <input
          class="w-full input-text"
          value={message()}
          placeholder={t("stash").message}
          onInput={(event) => setMessage(event.currentTarget.value)}
          disabled={saving()}
        />

        <div class="space-y-3 text-sm">
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeUntracked()}
              onChange={(event) => setIncludeUntracked(event.currentTarget.checked)}
              disabled={saving()}
            />
            {t("stash").include_untracked}
          </label>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              checked={keepIndex()}
              onChange={(event) => {
                setKeepIndex(event.currentTarget.checked);
                if (event.currentTarget.checked) setStagedOnly(false);
              }}
              disabled={saving() || stagedOnly()}
            />
            {t("stash").keep_index}
          </label>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              checked={stagedOnly()}
              onChange={(event) => {
                setStagedOnly(event.currentTarget.checked);
                if (event.currentTarget.checked) setKeepIndex(false);
              }}
              disabled={saving() || keepIndex()}
            />
            {t("stash").staged_only}
          </label>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button class="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600" onClick={props.onClose} disabled={saving()}>
            {t("common").cancel}
          </button>
          <button class="px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50" onClick={submit} disabled={saving()}>
            <Show when={saving()} fallback={t("stash").create}>
              {t("common").loading}
            </Show>
          </button>
        </div>
      </div>
    </Dialog>
  );
}
