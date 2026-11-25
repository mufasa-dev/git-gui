import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { EditorState } from "@codemirror/state";
import { EditorView, highlightActiveLine, lineNumbers } from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import { githubLight } from "@uiw/codemirror-theme-github";
import { readWorktreeFile } from "../../services/gitService";
import { notify } from "../../utils/notifications";
import { useApp } from "../../context/AppContext";
import {
  applyResolution,
  ConflictBlock,
  ConflictChoice,
  conflictExtension,
  parseConflicts,
} from "../../utils/conflictHighlight";

type Props = {
  /** Caminho do repositório (ou workspace) onde o arquivo está. */
  repoPath: string;
  /** Conteúdo do diff — usado apenas como fallback se o arquivo não puder ser lido. */
  diffContent: string;
  fileName: string;
  onSave: (resolved: string) => void;
  onClose: () => void;
};

const MARKER_PATTERN = /^<{7}( |$)/m;

const toolbarButton =
  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 " +
  "hover:bg-gray-200 dark:hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40 transition-colors";

const choiceButton = (choice: ConflictChoice) => {
  const palette = {
    current: "bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/50 dark:text-green-200 dark:hover:bg-green-900",
    incoming: "bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900/50 dark:text-blue-200 dark:hover:bg-blue-900",
    both: "bg-purple-100 text-purple-800 hover:bg-purple-200 dark:bg-purple-900/50 dark:text-purple-200 dark:hover:bg-purple-900",
  };
  return `rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${palette[choice]}`;
};

const previewLines = (lines: string[]) => {
  if (lines.length === 0) return "(vazio)";
  const shown = lines.slice(0, 4).join("\n");
  return lines.length > 4 ? `${shown}\n… +${lines.length - 4} linhas` : shown;
};

export default function MergeResolver(props: Props) {
  const { t } = useApp();
  const isDark = localStorage.getItem("theme") === "dark";

  const [loading, setLoading] = createSignal(true);
  const [conflicts, setConflicts] = createSignal<ConflictBlock[]>([]);
  const [totalConflicts, setTotalConflicts] = createSignal(0);
  const [activeId, setActiveId] = createSignal<number | null>(null);
  const [undoDepth, setUndoDepth] = createSignal(0);

  let container!: HTMLDivElement;
  let view: EditorView | undefined;
  let observer: ResizeObserver | undefined;
  let original = "";
  const history: string[] = [];

  const labels = {
    line: t("merge").line,
    current: t("merge").current,
    incoming: t("merge").incoming,
    both: t("merge").both,
  };

  const resolvedCount = () => Math.max(0, totalConflicts() - conflicts().length);
  const progress = () => (totalConflicts() === 0 ? 100 : Math.round((resolvedCount() / totalConflicts()) * 100));

  const pushHistory = (current: EditorView) => {
    history.push(current.state.doc.toString());
    setUndoDepth(history.length);
  };

  const resolveConflict = (current: EditorView, block: ConflictBlock, choice: ConflictChoice) => {
    pushHistory(current);
    applyResolution(current, block, choice);
  };

  const goTo = (block: ConflictBlock) => {
    if (!view) return;
    setActiveId(block.id);
    view.dispatch({
      selection: { anchor: block.from },
      effects: EditorView.scrollIntoView(block.from, { y: "center" }),
    });
    view.focus();
  };

  const step = (direction: 1 | -1) => {
    const list = conflicts();
    if (list.length === 0) return;
    const index = list.findIndex((block) => block.id === activeId());
    const next = index === -1
      ? (direction === 1 ? 0 : list.length - 1)
      : (index + direction + list.length) % list.length;
    goTo(list[next]);
  };

  const undo = () => {
    const previous = history.pop();
    setUndoDepth(history.length);
    if (previous === undefined || !view) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: previous } });
  };

  const resetAll = () => {
    if (!view || view.state.doc.toString() === original) return;
    pushHistory(view);
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: original } });
  };

  const handleComplete = () => {
    if (!view) return;
    const content = view.state.doc.toString();
    if (conflicts().length > 0 || MARKER_PATTERN.test(content)) {
      notify.error(t("merge").merge_incomplete, t("merge").unresolved_conflicts);
      return;
    }
    props.onSave(content);
  };

  const language = (() => {
    const extension = props.fileName.toLowerCase().split(".").pop() || "";
    if (!["js", "jsx", "mjs", "cjs", "ts", "tsx"].includes(extension)) return [];
    return javascript({
      jsx: ["jsx", "tsx"].includes(extension),
      typescript: ["ts", "tsx"].includes(extension),
    });
  })();

  const surface = isDark ? "#1f2937" : "#ffffff";

  const createState = (doc: string) =>
    EditorState.create({
      doc,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        EditorView.lineWrapping,
        isDark ? oneDark : githubLight,
        language,
        EditorView.theme(
          {
            "&": { height: "100%", fontSize: "13px", backgroundColor: surface },
            ".cm-scroller": {
              fontFamily: "ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', monospace",
              lineHeight: "1.6",
            },
            ".cm-gutters": {
              backgroundColor: isDark ? "#111827" : "#f9fafb",
              borderRight: "1px solid rgba(127,127,127,0.2)",
              color: "#9ca3af",
            },
          },
          { dark: isDark },
        ),
        conflictExtension({ labels, onResolve: resolveConflict }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) setConflicts(parseConflicts(update.state.doc));
        }),
      ],
    });

  const load = async () => {
    let content = props.diffContent;
    try {
      content = await readWorktreeFile(props.repoPath, props.fileName);
    } catch (error) {
      notify.error(t("error").error, String(error));
    }

    original = content;
    view = new EditorView({ state: createState(content), parent: container });

    const initial = parseConflicts(view.state.doc);
    setConflicts(initial);
    setTotalConflicts(initial.length);
    setActiveId(initial[0]?.id ?? null);
    setLoading(false);
  };

  onMount(() => {
    observer = new ResizeObserver(() => view?.requestMeasure());
    observer.observe(container);
    void load();
  });

  onCleanup(() => {
    observer?.disconnect();
    view?.destroy();
    view = undefined;
  });

  return (
    <div class="flex h-full min-h-0 flex-col bg-gray-50 dark:bg-gray-900 text-[12px] text-gray-800 dark:text-gray-200">
      <header class="flex flex-wrap items-center gap-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-5 py-3">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 text-sm font-semibold">
            <i class="fa-solid fa-code-merge text-blue-500" />
            <span class="truncate">{props.fileName}</span>
          </div>
          <div class="mt-1.5 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span class={conflicts().length === 0 ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}>
              {conflicts().length === 0
                ? t("merge").all_conflicts_resolved
                : `${conflicts().length} ${t("merge").unresolved_conflicts}`}
            </span>
            <div class="h-1.5 w-40 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div class="h-full rounded-full bg-green-500 transition-all duration-300" style={{ width: `${progress()}%` }} />
            </div>
            <span class="tabular-nums">{resolvedCount()}/{totalConflicts()}</span>
          </div>
        </div>

        <div class="flex shrink-0 flex-wrap items-center gap-1.5">
          <button class={toolbarButton} onClick={() => step(-1)} disabled={conflicts().length === 0} title={t("merge").previous_conflict}>
            <i class="fa-solid fa-arrow-up" />
          </button>
          <button class={toolbarButton} onClick={() => step(1)} disabled={conflicts().length === 0} title={t("merge").next_conflict}>
            <i class="fa-solid fa-arrow-down" />
          </button>
          <button class={toolbarButton} onClick={undo} disabled={undoDepth() === 0}>
            <i class="fa-solid fa-rotate-left" /> Desfazer
          </button>
          <button class={toolbarButton} onClick={resetAll} disabled={loading() || totalConflicts() === 0}>
            {t("merge").reset_all}
          </button>
          <button class={toolbarButton} onClick={props.onClose}>{t("common").cancel}</button>
          <button
            class="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50"
            onClick={handleComplete}
            disabled={loading()}
          >
            <i class="fa-solid fa-check" /> {t("merge").complete_merge}
          </button>
        </div>
      </header>

      <div class="flex min-h-0 flex-1">
        <aside class="custom-scrollbar w-[300px] shrink-0 overflow-auto border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3">
          <div class="mb-3 text-[10px] font-black uppercase tracking-widest text-gray-400">{t("merge").conflicts}</div>

          <Show
            when={conflicts().length > 0}
            fallback={
              <div class="flex flex-col items-center gap-2 rounded-xl border border-dashed border-green-300 dark:border-green-800 p-6 text-center text-green-600 dark:text-green-400">
                <i class="fa-solid fa-circle-check text-2xl" />
                <span class="text-xs font-medium">{t("merge").no_conflicts}</span>
              </div>
            }
          >
            <div class="space-y-3">
              <For each={conflicts()}>
                {(block) => (
                  <div
                    onClick={() => goTo(block)}
                    class="cursor-pointer rounded-xl border p-3 shadow-sm transition-colors"
                    classList={{
                      "border-blue-500 ring-1 ring-blue-500/40 bg-blue-50/60 dark:bg-blue-950/30": activeId() === block.id,
                      "border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 bg-white dark:bg-gray-800": activeId() !== block.id,
                    }}
                  >
                    <div class="flex items-center justify-between text-xs">
                      <span class="font-semibold">#{block.id}</span>
                      <span class="text-gray-500 dark:text-gray-400">{t("merge").line} {block.startLine}</span>
                    </div>

                    <div class="mt-2 overflow-hidden rounded-md border-l-2 border-green-500 bg-green-50 dark:bg-green-900/25 px-2 py-1.5">
                      <div class="text-[10px] font-semibold uppercase tracking-wide text-green-700 dark:text-green-300">{t("merge").current}</div>
                      <pre class="mt-0.5 whitespace-pre-wrap break-all font-mono text-[11px] leading-snug text-gray-700 dark:text-gray-300">{previewLines(block.currentLines)}</pre>
                    </div>

                    <div class="mt-1.5 overflow-hidden rounded-md border-l-2 border-blue-500 bg-blue-50 dark:bg-blue-900/25 px-2 py-1.5">
                      <div class="text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">{t("merge").incoming}</div>
                      <pre class="mt-0.5 whitespace-pre-wrap break-all font-mono text-[11px] leading-snug text-gray-700 dark:text-gray-300">{previewLines(block.incomingLines)}</pre>
                    </div>

                    <div class="mt-2.5 grid grid-cols-3 gap-1">
                      <button class={choiceButton("current")} onClick={(event) => { event.stopPropagation(); if (view) resolveConflict(view, block, "current"); }}>
                        {t("merge").current}
                      </button>
                      <button class={choiceButton("incoming")} onClick={(event) => { event.stopPropagation(); if (view) resolveConflict(view, block, "incoming"); }}>
                        {t("merge").incoming}
                      </button>
                      <button class={choiceButton("both")} onClick={(event) => { event.stopPropagation(); if (view) resolveConflict(view, block, "both"); }}>
                        {t("merge").both}
                      </button>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </aside>

        <section class="relative flex min-w-0 flex-1 flex-col bg-white dark:bg-gray-800">
          <div class="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4 py-2">
            <span class="font-semibold text-gray-600 dark:text-gray-300">{t("merge").merged_version}</span>
            <Show when={undoDepth() > 0}>
              <span class="text-[10px] text-amber-600 dark:text-amber-400">{t("merge").manual_edit}</span>
            </Show>
          </div>

          {/* Container absoluto: o CodeMirror recebe altura real e rola sozinho. */}
          <div class="relative min-h-0 flex-1">
            <div class="absolute inset-0 overflow-hidden" ref={container} />
          </div>

          <Show when={loading()}>
            <div class="absolute inset-0 flex items-center justify-center gap-2 bg-white/80 dark:bg-gray-800/80 text-gray-500">
              <i class="fa-solid fa-circle-notch fa-spin text-blue-500" /> {t("common").loading}
            </div>
          </Show>
        </section>
      </div>
    </div>
  );
}
