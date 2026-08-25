import { createEffect, createMemo, createSignal, For, on, Show } from "solid-js";
import { createCodeMirror } from "solid-codemirror";
import { EditorView, lineNumbers } from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import { githubLight } from "@uiw/codemirror-theme-github";
import { Annotation } from "@codemirror/state";
import { notify } from "../../utils/notifications";
import { useApp } from "../../context/AppContext";
import { highlightCode } from "../../utils/highlight";

// Helper para identificar mudanças programáticas vs manuais
const ExternalChange = Annotation.define<boolean>();

type Resolution = "current" | "incoming" | "both";

type NormalSegment = {
  type: "normal";
  lines: string[];
};

type ConflictSegment = {
  type: "conflict";
  id: number;
  startLine: number;
  current: string[];
  incoming: string[];
};

type Segment = NormalSegment | ConflictSegment;

type Props = {
  diffContent: string;
  fileName: string;
  onSave: (resolved: string) => void;
  onClose: () => void;
};

function parseMergeContent(content: string): Segment[] {
  const rawLines = (content || "").split("\n");
  const segments: Segment[] = [];
  let normalLines: string[] = [];
  let conflictId = 0;

  const flushNormal = () => {
    if (normalLines.length > 0) {
      segments.push({ type: "normal", lines: normalLines });
      normalLines = [];
    }
  };

  let index = 0;
  while (index < rawLines.length) {
    if (!rawLines[index].startsWith("<<<<<<<")) {
      normalLines.push(rawLines[index]);
      index++;
      continue;
    }

    let separator = -1;
    let end = -1;
    for (let cursor = index + 1; cursor < rawLines.length; cursor++) {
      if (separator === -1 && rawLines[cursor].startsWith("=======")) {
        separator = cursor;
      } else if (separator !== -1 && rawLines[cursor].startsWith(">>>>>>>")) {
        end = cursor;
        break;
      }
    }

    if (separator === -1 || end === -1) {
      normalLines.push(rawLines[index]);
      index++;
      continue;
    }

    flushNormal();
    conflictId++;
    segments.push({
      type: "conflict",
      id: conflictId,
      startLine: index + 1,
      current: rawLines.slice(index + 1, separator),
      incoming: rawLines.slice(separator + 1, end),
    });
    index = end + 1;
  }

  flushNormal();
  return segments;
}

function conflictMarkers(segment: ConflictSegment): string[] {
  return [
    "<<<<<<< CURRENT",
    ...segment.current,
    "=======",
    ...segment.incoming,
    ">>>>>>> INCOMING",
  ];
}

function resolveSegments(segments: Segment[], resolutions: Record<number, Resolution | null>): string {
  const result: string[] = [];

  for (const segment of segments) {
    if (segment.type === "normal") {
      result.push(...segment.lines);
      continue;
    }

    const resolution = resolutions[segment.id];
    if (!resolution) {
      result.push(...conflictMarkers(segment));
    } else if (resolution === "current") {
      result.push(...segment.current);
    } else if (resolution === "incoming") {
      result.push(...segment.incoming);
    } else {
      result.push(...segment.current, ...segment.incoming);
    }
  }

  return result.join("\n");
}

function applyResolutionToText(
  content: string,
  conflictId: number,
  resolution: Resolution,
  originalResolutions: Record<number, Resolution | null>,
): string {
  const segments = parseMergeContent(content);
  const manualConflicts = segments.filter((segment): segment is ConflictSegment => segment.type === "conflict");
  const unresolvedOriginalIds = Object.keys(originalResolutions)
    .map(Number)
    .filter(id => !originalResolutions[id]);
  const targetPosition = unresolvedOriginalIds.indexOf(conflictId);
  const target = manualConflicts[targetPosition];

  if (!target) return content;
  return resolveSegments(segments, { [target.id]: resolution });
}

export default function MergeResolver(props: Props) {
  const [segments, setSegments] = createSignal<Segment[]>([]);
  const [resolutions, setResolutions] = createSignal<Record<number, Resolution | null>>({});
  const [manualResult, setManualResult] = createSignal<string | null>(null);
  const [activeConflict, setActiveConflict] = createSignal<number | null>(null);
  const [isDark] = createSignal(localStorage.getItem("theme") === "dark");
  const { t } = useApp();

  const conflictRefs: Record<number, HTMLButtonElement | undefined> = {};

  const conflicts = createMemo(() => segments().filter((segment): segment is ConflictSegment => segment.type === "conflict"));
  const unresolvedCount = createMemo(() => conflicts().filter(conflict => !resolutions()[conflict.id]).length);
  const autoResult = createMemo(() => resolveSegments(segments(), resolutions()));
  const displayResult = () => manualResult() ?? autoResult();

  const language = createMemo(() => {
    const extension = props.fileName.toLowerCase().split(".").pop() || "";
    return javascript({
      jsx: ["js", "jsx", "ts", "tsx"].includes(extension),
      typescript: ["ts", "tsx"].includes(extension),
    });
  });

  // Configuração do CodeMirror
  const { ref: codeMirrorRef, editorView: view, createExtension } = createCodeMirror({
    value: displayResult(),
  });

  createExtension(() => {
    const dark = isDark();
    const extensions = [
      language(),
      lineNumbers(),
      EditorView.lineWrapping,
    ];

    if (dark) {
      extensions.push(oneDark);
    } else {
      extensions.push(githubLight);
    }

    extensions.push(
      EditorView.theme({
        "&": {
          height: "100%",
          backgroundColor: dark ? "rgb(31 41 55 / 1) !important" : "#ffffff !important",
        },
        ".cm-scroller": {
          overflow: "auto",
          backgroundColor: dark ? "rgb(31 41 55 / 1) !important" : "#ffffff !important",
        },
        ".cm-gutters": {
          backgroundColor: dark ? "rgb(31 41 55 / 1) !important" : "#f5f5f5",
          border: "none",
        },
        ".cm-content": {
          color: dark ? "#abb2bf" : "#000000",
        },
      }, { dark }),
    );

    extensions.push(
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !update.transactions.some(transaction => transaction.annotation(ExternalChange))) {
          setManualResult(update.state.doc.toString());
        }
      }),
    );

    return extensions;
  });

  const selectConflict = (id: number) => {
    setActiveConflict(id);
    conflictRefs[id]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const setResolution = (id: number, resolution: Resolution) => {
    const currentResolutions = resolutions();
    setResolutions(previous => ({ ...previous, [id]: resolution }));
    setManualResult(previous => previous === null ? null : applyResolutionToText(previous, id, resolution, currentResolutions));
  };

  const resetResolution = (id: number) => {
    setResolutions(previous => ({ ...previous, [id]: null }));
    setManualResult(null);
  };

  const resetAll = () => {
    const next: Record<number, Resolution | null> = {};
    conflicts().forEach(conflict => { next[conflict.id] = null; });
    setResolutions(next);
    setManualResult(null);
  };

  const handleCompleteMerge = () => {
    const finalContent = view()?.state.doc.toString() ?? displayResult();
    const hasMarkers = /^(<<<<<<<|=======|>>>>>>>)/m.test(finalContent);

    if (hasMarkers) {
      notify.error(t('merge').merge_incomplete, t('merge').unresolved_conflicts);
      return;
    }

    props.onSave(finalContent);
  };

  createEffect(() => {
    const currentView = view();
    if (!currentView) return;

    const target = displayResult();
    if (currentView.state.doc.toString() !== target) {
      currentView.dispatch({
        changes: { from: 0, to: currentView.state.doc.length, insert: target },
        annotations: ExternalChange.of(true),
      });
    }
  });

  createEffect(on(() => props.diffContent, (newContent) => {
    const parsed = parseMergeContent(newContent);
    const nextResolutions: Record<number, Resolution | null> = {};
    parsed.forEach(segment => {
      if (segment.type === "conflict") nextResolutions[segment.id] = null;
    });
    setSegments(parsed);
    setResolutions(nextResolutions);
    setManualResult(null);
    setActiveConflict(parsed.find(segment => segment.type === "conflict")?.id ?? null);
  }));

  return (
    <div class="flex h-full min-h-0 flex-col font-sans text-[12px] border border-gray-200 dark:border-gray-900 bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200">
      <div class="flex items-center justify-between gap-4 border-b border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3">
        <div class="min-w-0">
          <div class="font-semibold truncate">{props.fileName}</div>
          <div class="text-xs text-gray-500 dark:text-gray-400">
            {conflicts().length} {t('merge').conflicts_found}
            <Show when={unresolvedCount() > 0}>
              <span class="text-amber-600 dark:text-amber-400"> · {unresolvedCount()} {t('merge').unresolved_conflicts}</span>
            </Show>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <Show when={manualResult() !== null}>
            <button onClick={() => setManualResult(null)} class="px-2 py-1 text-gray-500 hover:text-gray-900 dark:hover:text-white">{t('merge').reset_auto}</button>
          </Show>
          <button onClick={resetAll} class="px-2 py-1 text-gray-500 hover:text-gray-900 dark:hover:text-white">{t('merge').reset_all}</button>
          <button onClick={props.onClose} class="px-3 py-1.5 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700">{t('common').cancel}</button>
          <button onClick={handleCompleteMerge} class="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-semibold">{t('merge').complete_merge}</button>
        </div>
      </div>

      <div class="flex flex-1 min-h-0">
        <aside class="w-[280px] shrink-0 overflow-auto border-r border-gray-300 dark:border-gray-700 bg-white/70 dark:bg-gray-900/40 p-3 custom-scrollbar">
          <Show when={conflicts().length > 0} fallback={<div class="p-4 text-center text-gray-500">{t('merge').no_conflicts}</div>}>
            <div class="space-y-2">
              <For each={conflicts()}>
                {(conflict) => {
                  const resolution = () => resolutions()[conflict.id];
                  return (
                    <button
                      ref={(element) => { conflictRefs[conflict.id] = element; }}
                      onClick={() => selectConflict(conflict.id)}
                      class="w-full text-left rounded-lg border p-3 transition-colors"
                      classList={{
                        "border-blue-500 bg-blue-50 dark:bg-blue-950/40": activeConflict() === conflict.id,
                        "border-gray-200 dark:border-gray-700 hover:border-blue-300": activeConflict() !== conflict.id,
                      }}
                    >
                      <div class="flex items-center justify-between gap-2">
                        <span class="font-semibold">#{conflict.id}</span>
                        <span class={resolution() ? "text-green-600" : "text-amber-600"}>{resolution() ? t('merge').resolved : t('merge').unresolved}</span>
                      </div>
                      <div class="mt-1 text-[11px] text-gray-500">{t('merge').line} {conflict.startLine} · {conflict.current.length}/{conflict.incoming.length} {t('merge').lines}</div>
                      <div class="mt-2 grid grid-cols-2 gap-1">
                        <span onClick={(event) => { event.stopPropagation(); setResolution(conflict.id, "current"); }} class="rounded bg-green-100 dark:bg-green-900/40 px-1.5 py-1 text-center text-[10px] text-green-800 dark:text-green-200">{t('merge').current}</span>
                        <span onClick={(event) => { event.stopPropagation(); setResolution(conflict.id, "incoming"); }} class="rounded bg-blue-100 dark:bg-blue-900/40 px-1.5 py-1 text-center text-[10px] text-blue-800 dark:text-blue-200">{t('merge').incoming}</span>
                        <span onClick={(event) => { event.stopPropagation(); setResolution(conflict.id, "both"); }} class="rounded bg-purple-100 dark:bg-purple-900/40 px-1.5 py-1 text-center text-[10px] text-purple-800 dark:text-purple-200">{t('merge').both}</span>
                        <span onClick={(event) => { event.stopPropagation(); resetResolution(conflict.id); }} class="rounded bg-gray-100 dark:bg-gray-700 px-1.5 py-1 text-center text-[10px]">{t('merge').reset}</span>
                      </div>
                    </button>
                  );
                }}
              </For>
            </div>
          </Show>
        </aside>

        <section class="flex min-w-0 flex-1 flex-col bg-white dark:bg-gray-800">
          <div class="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4 py-2">
            <span class="font-semibold text-gray-600 dark:text-gray-300">{t('merge').merged_version}</span>
            <Show when={manualResult() !== null}>
              <span class="text-[10px] text-amber-600 dark:text-amber-400">{t('merge').manual_edit}</span>
            </Show>
          </div>
          <div class="min-h-0 flex-1 overflow-hidden">
            <div class="h-full" ref={codeMirrorRef} />
          </div>
        </section>
      </div>
    </div>
  );
}
