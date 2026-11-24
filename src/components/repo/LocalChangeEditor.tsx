import { createEffect, createMemo, createSignal, For, JSX, on, onCleanup, onMount, Show } from "solid-js";
import FileIcon from "../ui/FileIcon";
import ConfirmModal from "../ui/ConfirmModal";
import CodeEditor from "../ui/CodeEditor";
import DiffScrollArea from "../ui/DiffScrollArea";
import vsCodeIcon from "../../assets/vscode.png";
import { Diff } from "../../models/Diff.model";
import { readWorktreeFile, saveWorktreeFile } from "../../services/gitService";
import { openVsCode } from "../../services/openService";
import { notify } from "../../utils/notifications";
import { useApp } from "../../context/AppContext";

export type LocalChangeEditorController = {
  isEditing: () => boolean;
  mode: () => "hunks" | "full";
  isDirty: () => boolean;
  canEdit: () => boolean;
  startEdit: () => Promise<void>;
  showFullCode: () => void;
  save: () => Promise<void>;
  cancel: () => void;
};

type Props = {
  repoPath: string;
  /** Caminho do arquivo relativo ao repositório. */
  file: string;
  diff: Diff;
  isStaged: boolean;
  status?: string;
  /** Bloqueia a edição (ex.: resolvedor de merge aberto). */
  disabled?: boolean;
  /** Chamado depois que o arquivo é gravado em disco. */
  onSaved?: () => void | Promise<void>;
  /** Avisa o pai quando entra/sai do modo de edição. */
  onEditingChange?: (editing: boolean) => void;
  /** Visualização normal (DiffViewer), exibida fora do modo de edição. */
  children: JSX.Element;
  onController?: (controller: LocalChangeEditorController) => void;
};

type EditableHunk = {
  header: string;
  /** Linha inicial (1-based) do lado novo, conforme o cabeçalho @@. */
  newStart: number;
  /** Linhas do lado novo (contexto + adicionadas) como estão no disco. */
  origLines: string[];
  /** Linhas removidas, exibidas só como referência. */
  delLines: string[];
};

type FileModel = {
  lines: string[];
  eol: "\r\n" | "\n";
  trailingNewline: boolean;
};

const parseFile = (raw: string): FileModel => {
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const normalized = raw.replace(/\r\n/g, "\n");
  const trailingNewline = normalized.endsWith("\n");
  const lines = normalized.split("\n");
  if (trailingNewline) lines.pop();
  return { lines, eol, trailingNewline };
};

const toNormalizedText = (model: FileModel, lines = model.lines) =>
  lines.join("\n") + (model.trailingNewline ? "\n" : "");

const toLines = (text: string) => (text === "" ? [] : text.split("\n"));

function parseHunks(diff: string): EditableHunk[] {
  const hunks: EditableHunk[] = [];
  let current: EditableHunk | null = null;

  for (const raw of (diff || "").split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (line.startsWith("@@")) {
      const match = /@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      if (!match) return [];
      current = { header: line, newStart: parseInt(match[1], 10), origLines: [], delLines: [] };
      hunks.push(current);
      continue;
    }
    if (!current || line === "" || line.startsWith("\\")) continue;

    if (line.startsWith("+")) current.origLines.push(line.slice(1));
    else if (line.startsWith("-")) current.delLines.push(line.slice(1));
    else current.origLines.push(line.slice(1));
  }

  return hunks;
}

/** Índice (0-based) onde o trecho do hunk começa no arquivo. */
const hunkIndex = (hunk: EditableHunk) =>
  hunk.origLines.length === 0 ? hunk.newStart : hunk.newStart - 1;

export default function LocalChangeEditor(props: Props) {
  const { t } = useApp();
  const tr = () => t("editor");

  const [editing, setEditing] = createSignal(false);
  const [mode, setMode] = createSignal<"hunks" | "full">("hunks");
  const [loading, setLoading] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [fileModel, setFileModel] = createSignal<FileModel | null>(null);
  const [hunks, setHunks] = createSignal<EditableHunk[]>([]);
  const [hunkTexts, setHunkTexts] = createSignal<string[]>([]);
  const [fullText, setFullText] = createSignal("");
  const [confirmDiscard, setConfirmDiscard] = createSignal<null | (() => void)>(null);


  const fileName = () => props.file.split(/[\\/]/).pop() || props.file;
  const fileDir = () => {
    const parts = props.file.split(/[\\/]/);
    parts.pop();
    return parts.join("/");
  };

  const diffHasConflict = () => {
    const d = props.diff.diff || "";
    return Boolean(props.diff.hasConflict) || (d.includes("<<<<<<<") && d.includes(">>>>>>>"));
  };

  const canEdit = createMemo(() =>
    Boolean(props.file) &&
    !props.disabled &&
    !props.diff.isBinary &&
    props.status !== "deleted" &&
    props.status !== "conflicted" &&
    !diffHasConflict()
  );

  // A edição por trechos vale também para arquivos novos e para "Preparadas":
  // antes de liberar, os trechos são conferidos com o arquivo em disco.
  const canEditHunks = () => props.diff.isPreviewable !== false;

  const isNewFile = () => props.status === "untracked" || props.status === "added";

  const cannotEditReason = () => {
    if (props.disabled) return tr().cannot_edit;
    if (props.diff.isBinary) return tr().cannot_edit_binary;
    if (props.status === "deleted") return tr().cannot_edit_deleted;
    if (props.status === "conflicted" || diffHasConflict()) return tr().cannot_edit_conflict;
    return tr().cannot_edit;
  };

  const isDirty = createMemo(() => {
    const model = fileModel();
    if (!editing() || !model) return false;
    if (mode() === "full") return fullText() !== toNormalizedText(model);
    const texts = hunkTexts();
    return hunks().some((hunk, i) => texts[i] !== hunk.origLines.join("\n"));
  });

  createEffect(() => props.onEditingChange?.(editing()));

  const resetEditor = () => {
    setEditing(false);
    setMode("hunks");
    setFileModel(null);
    setHunks([]);
    setHunkTexts([]);
    setFullText("");
  };

  // Trocar de arquivo (ou entre "preparadas"/"alterações") sai do modo de edição.
  // A chave é uma string memorizada: o polling do repositório recria o objeto
  // `repo` a cada atualização, e sem comparar o valor isso fechava o editor.
  const editorKey = createMemo(() => `${props.repoPath}\u0000${props.file}\u0000${props.isStaged ? 1 : 0}`);
  createEffect(on(editorKey, resetEditor, { defer: true }));

  const enterFullMode = (model: FileModel, lines = model.lines) => {
    setFullText(toNormalizedText(model, lines));
    setMode("full");
  };

  const startEdit = async () => {
    if (!canEdit() || loading()) return;
    setLoading(true);
    try {
      const raw = await readWorktreeFile(props.repoPath, props.file);
      const model = parseFile(raw);
      setFileModel(model);

      let parsed = canEditHunks() ? parseHunks(props.diff.diff) : [];
      // Arquivo novo: o diff sintético não tem cabeçalho @@ (ou vem truncado),
      // então o arquivo inteiro vira um único trecho editável.
      if (isNewFile() && (parsed.length === 0 || props.diff.truncated)) {
        parsed = [{
          header: `@@ -0,0 +1,${model.lines.length} @@ ${tr().new_file}`,
          newStart: 1,
          origLines: [...model.lines],
          delLines: [],
        }];
      }
      const inSync = parsed.length > 0 && parsed.every(hunk => {
        const start = hunkIndex(hunk);
        const slice = model.lines.slice(start, start + hunk.origLines.length);
        return slice.length === hunk.origLines.length && slice.every((l, i) => l === hunk.origLines[i]);
      });

      if (inSync) {
        setHunks(parsed);
        setHunkTexts(parsed.map(hunk => hunk.origLines.join("\n")));
        setMode("hunks");
      } else {
        if (parsed.length > 0) notify.info(tr().out_of_sync_title, tr().out_of_sync);
        setHunks([]);
        setHunkTexts([]);
        enterFullMode(model);
      }
      setEditing(true);
    } catch (error) {
      notify.error(t("error").error, String(error));
    } finally {
      setLoading(false);
    }
  };

  /** Aplica as edições dos trechos sobre o arquivo (de baixo para cima). */
  const linesFromHunks = (model: FileModel) => {
    const lines = [...model.lines];
    const texts = hunkTexts();
    hunks()
      .map((hunk, i) => ({ hunk, text: texts[i] }))
      .sort((a, b) => hunkIndex(b.hunk) - hunkIndex(a.hunk))
      .forEach(({ hunk, text }) => {
        lines.splice(hunkIndex(hunk), hunk.origLines.length, ...toLines(text));
      });
    return lines;
  };

  const showFullCode = () => {
    const model = fileModel();
    if (!model) return;
    enterFullMode(model, linesFromHunks(model));
  };

  const save = async () => {
    const model = fileModel();
    if (!editing() || !model || saving()) return;
    if (!isDirty()) {
      notify.info(tr().no_changes_title, tr().no_changes);
      return;
    }

    const wasFull = mode() === "full";
    const normalized = wasFull ? fullText() : toNormalizedText(model, linesFromHunks(model));
    const content = model.eol === "\r\n" ? normalized.replace(/\n/g, "\r\n") : normalized;

    setSaving(true);
    try {
      await saveWorktreeFile(props.repoPath, props.file, content);
      notify.success(tr().saved_title, tr().saved.replace("{{file}}", fileName()));
      if (wasFull) {
        // Continua editando o código completo, com a nova versão como base.
        setFileModel(parseFile(content));
        setFullText(normalized);
      } else {
        // As posições dos trechos mudam depois de salvar: volta para o diff atualizado.
        resetEditor();
      }
      await props.onSaved?.();
    } catch (error) {
      notify.error(t("error").saving, String(error));
    } finally {
      setSaving(false);
    }
  };

  const askDiscard = (action: () => void) => {
    if (isDirty()) setConfirmDiscard(() => action);
    else action();
  };

  const cancelEdit = () => askDiscard(resetEditor);

  props.onController?.({
    isEditing: editing,
    mode,
    isDirty,
    canEdit,
    startEdit,
    showFullCode,
    save,
    cancel: cancelEdit,
  });
  const backToChanges = () => askDiscard(() => { resetEditor(); void startEdit(); });

  const openInVsCode = async () => {
    try {
      const separator = props.repoPath.includes("\\") ? "\\" : "/";
      const base = props.repoPath.replace(/[\\/]+$/, "");
      await openVsCode(`${base}${separator}${props.file.replace(/[\\/]/g, separator)}`);
    } catch (error) {
      notify.error(t("error").error, String(error));
    }
  };

  onMount(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!editing()) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    onCleanup(() => window.removeEventListener("keydown", onKeyDown));
  });

  /** Tab insere indentação em vez de mudar o foco. */
  const handleTab = (e: KeyboardEvent & { currentTarget: HTMLTextAreaElement }) => {
    if (e.key !== "Tab" || e.ctrlKey || e.altKey || e.metaKey) return;
    e.preventDefault();
    const el = e.currentTarget;
    const indent = (fileModel()?.lines.some(l => l.startsWith("\t")) ? "\t" : "  ");
    if (!document.execCommand?.("insertText", false, indent)) {
      el.setRangeText(indent, el.selectionStart, el.selectionEnd, "end");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  };

  const headerButton = "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div class="flex h-full min-h-0 flex-col">
      <Show when={props.file}>
        <div class="flex shrink-0 items-center gap-2 border-b border-gray-300 bg-gray-100 px-3 py-1.5 dark:border-gray-700 dark:bg-gray-800">
          <FileIcon fileName={fileName()} class="h-4 w-4 shrink-0" />
          <div class="flex min-w-0 flex-1 items-baseline gap-2" title={props.file}>
            <span class="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{fileName()}</span>
            <Show when={fileDir()}>
              <span class="truncate text-[11px] text-gray-400">{fileDir()}</span>
            </Show>
            <Show when={isDirty()}>
              <span class="shrink-0 text-amber-500" title={tr().unsaved}>●</span>
            </Show>
          </div>

          <div class="flex shrink-0 items-center gap-1.5">
            <Show when={editing()}>
              <Show when={mode() === "hunks"} fallback={
                <Show when={canEditHunks()}>
                  <button type="button" class={`${headerButton} text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700`}
                    onClick={backToChanges} disabled={saving()}>
                    <i class="fa-solid fa-code-compare"></i>{tr().only_changes}
                  </button>
                </Show>
              }>
                <button type="button" class={`${headerButton} text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700`}
                  onClick={showFullCode} disabled={saving()}>
                  <i class="fa-solid fa-file-code"></i>{tr().full_code}
                </button>
              </Show>
              <button type="button" class={`${headerButton} text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700`}
                onClick={cancelEdit} disabled={saving()}>
                <i class="fa-solid fa-xmark"></i>{t("common").cancel}
              </button>
              <button type="button" class={`${headerButton} bg-blue-600 text-white hover:bg-blue-500`}
                onClick={save} disabled={!isDirty() || saving()} title={`${tr().save} (Ctrl+S)`}>
                <Show when={saving()} fallback={<i class="fa-solid fa-floppy-disk"></i>}>
                  <i class="fa-solid fa-spinner animate-spin"></i>
                </Show>
                {tr().save}
              </button>
            </Show>

            <Show when={!editing()}>
              <button type="button" class={`${headerButton} border border-gray-300 text-gray-700 hover:bg-gray-200 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700`}
                onClick={startEdit} disabled={!canEdit() || loading()} title={canEdit() ? tr().edit : cannotEditReason()}>
                <Show when={loading()} fallback={<i class="fa-solid fa-pen"></i>}>
                  <i class="fa-solid fa-spinner animate-spin"></i>
                </Show>
                {tr().edit}
              </button>
            </Show>

            <button type="button" class="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
              onClick={openInVsCode} title={tr().open_vscode} aria-label={tr().open_vscode}>
              <img src={vsCodeIcon} class="h-4 w-4" alt="VS Code" />
            </button>
          </div>
        </div>
      </Show>

      <DiffScrollArea class="flex-1" innerClass="p-2">
        <Show when={editing()} fallback={props.children}>
          <Show when={mode() === "hunks"} fallback={
            <CodeEditor
              fill
              class="min-h-[200px] rounded-md border border-blue-300 dark:border-blue-900/60"
              value={fullText()}
              fileName={props.file}
              onInput={setFullText}
              onKeyDown={handleTab}
            />
          }>
            <div class="flex flex-col gap-3">
              <For each={hunks()}>
                {(hunk, index) => {
                  const text = () => hunkTexts()[index()] ?? "";
                  const changed = () => text() !== hunk.origLines.join("\n");
                  return (
                    <div class="overflow-hidden rounded-md border font-mono text-sm"
                      classList={{
                        "border-amber-400 dark:border-amber-600": changed(),
                        "border-gray-300 dark:border-gray-700": !changed(),
                      }}>
                      <div class="bg-blue-50 px-3 py-1 text-xs font-bold text-blue-600 opacity-80 dark:bg-slate-800 dark:text-blue-300">
                        {hunk.header}
                      </div>
                      <Show when={hunk.delLines.length > 0}>
                        <div class="border-b border-gray-200 bg-red-100 dark:border-gray-700 dark:bg-red-900/30" title={tr().removed_lines}>
                          <For each={hunk.delLines}>
                            {(line) => (
                              <div class="whitespace-pre px-3 leading-6 text-red-900 opacity-70 line-through decoration-red-400/40 dark:text-red-200">
                                <span class="mr-2 select-none">-</span>{line}
                              </div>
                            )}
                          </For>
                        </div>
                      </Show>
                      <CodeEditor
                        value={text()}
                        fileName={props.file}
                        startLine={hunk.newStart}
                        onInput={(value) => setHunkTexts(prev => prev.map((item, i) => (i === index() ? value : item)))}
                        onKeyDown={handleTab}
                      />
                    </div>
                  );
                }}
              </For>
            </div>
          </Show>
        </Show>
      </DiffScrollArea>

      <ConfirmModal
        isOpen={confirmDiscard() !== null}
        title={tr().discard_title}
        message={tr().discard_message}
        confirmText={tr().discard}
        isDanger={true}
        onConfirm={() => {
          const action = confirmDiscard();
          setConfirmDiscard(null);
          action?.();
        }}
        onCancel={() => setConfirmDiscard(null)}
      />
    </div>
  );
}
