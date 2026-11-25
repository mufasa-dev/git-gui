import { createEffect, createMemo, createSignal, For, Index, Match, on, onMount, Show, Switch } from "solid-js";
import CodeEditor from "../ui/CodeEditor";
import { readWorktreeFile } from "../../services/gitService";
import { notify } from "../../utils/notifications";
import { highlightCode } from "../../utils/highlight";
import { useApp } from "../../context/AppContext";
import {
  ConflictChoice,
  ConflictSegment,
  hasConflictMarkers,
  lineKinds,
  parseSegments,
  resolveAllInText,
  resolutionLines,
  resolveConflictInText,
  segmentText,
  TextSegment,
} from "../../utils/conflictHighlight";

type Props = {
  /** Caminho do repositório (ou workspace) onde o arquivo está. */
  repoPath: string;
  /** Conteúdo do diff — usado apenas como fallback se o arquivo não puder ser lido. */
  diffContent: string;
  fileName: string;
  onSave: (resolved: string) => void | Promise<void>;
  onClose: () => void;
};

type Mode = "visual" | "raw";

const TYPING_SNAPSHOT_INTERVAL = 1200;

const toolbarButton =
  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 " +
  "hover:bg-gray-200 dark:hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40 transition-colors";

const quickButton = (choice: "current" | "incoming" | "both") => {
  const palette = {
    current: "text-green-700 hover:bg-green-100 dark:text-green-300 dark:hover:bg-green-900/50",
    incoming: "text-blue-700 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900/50",
    both: "text-purple-700 hover:bg-purple-100 dark:text-purple-300 dark:hover:bg-purple-900/50",
  };
  return `flex-1 rounded px-1.5 py-1 text-[10px] font-semibold transition-colors ${palette[choice]}`;
};

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export default function MergeResolver(props: Props) {
  const { t } = useApp();
  const m = () => t("merge");

  const [loading, setLoading] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [text, setText] = createSignal("");
  const [totalConflicts, setTotalConflicts] = createSignal(0);
  const [activeId, setActiveId] = createSignal<number | null>(null);
  const [undoDepth, setUndoDepth] = createSignal(0);
  const [mode, setMode] = createSignal<Mode>("visual");

  let scroller: HTMLDivElement | undefined;
  let original = "";
  let lineEnding = "\n";
  let lastTypingSnapshot = 0;
  const history: string[] = [];

  const segments = createMemo(() => parseSegments(text()));
  const conflicts = createMemo(() => segments().filter((segment): segment is ConflictSegment => segment.kind === "conflict"));
  const kinds = createMemo(() => (mode() === "raw" ? lineKinds(text()) : []));

  const resolvedCount = () => Math.max(0, totalConflicts() - conflicts().length);
  const progress = () => (totalConflicts() === 0 ? 100 : Math.round((resolvedCount() / totalConflicts()) * 100));

  const highlight = (line: string) => {
    try {
      return highlightCode(line, props.fileName) || "&#8203;";
    } catch {
      return escapeHtml(line) || "&#8203;";
    }
  };

  // ---------- histórico ----------
  const pushHistory = (snapshot = text()) => {
    if (history[history.length - 1] === snapshot) return;
    history.push(snapshot);
    if (history.length > 200) history.shift();
    setUndoDepth(history.length);
  };

  const undo = () => {
    const previous = history.pop();
    setUndoDepth(history.length);
    if (previous !== undefined) setText(previous);
  };

  /** Edição digitada: guarda um ponto de "desfazer" a cada pausa. */
  const applyTyping = (next: string) => {
    if (Date.now() - lastTypingSnapshot > TYPING_SNAPSHOT_INTERVAL) pushHistory();
    lastTypingSnapshot = Date.now();
    setText(next);
  };

  // ---------- navegação ----------
  const scrollToConflict = (id: number, smooth = true) => {
    setActiveId(id);
    const target = scroller?.querySelector<HTMLElement>(`[data-conflict-id="${id}"]`);
    target?.scrollIntoView({ block: "center", behavior: smooth ? "smooth" : "auto" });
  };

  const step = (direction: 1 | -1) => {
    const list = conflicts();
    if (list.length === 0) return;
    const index = list.findIndex((conflict) => conflict.id === activeId());
    const next = index === -1
      ? (direction === 1 ? 0 : list.length - 1)
      : (index + direction + list.length) % list.length;
    if (mode() === "raw") setMode("visual");
    requestAnimationFrame(() => scrollToConflict(list[next].id));
  };

  // ---------- resolução ----------
  const resolve = (conflict: ConflictSegment, lines: string[]) => {
    pushHistory();
    setText(resolveConflictInText(text(), conflict.id, lines));
    // Os conflitos são renumerados: o próximo passa a ter o mesmo número do resolvido.
    const remaining = conflicts();
    if (remaining.length === 0) {
      setActiveId(null);
      return;
    }
    const next = remaining.find((candidate) => candidate.id === conflict.id) ?? remaining[remaining.length - 1];
    requestAnimationFrame(() => scrollToConflict(next.id));
  };

  const resolveChoice = (conflict: ConflictSegment, choice: ConflictChoice) => resolve(conflict, resolutionLines(conflict, choice));

  const resolveAll = (choice: "current" | "incoming") => {
    if (conflicts().length === 0) return;
    pushHistory();
    setText(resolveAllInText(text(), choice));
    setActiveId(null);
  };

  const resetAll = () => {
    if (text() === original) return;
    pushHistory();
    setText(original);
  };

  /** Edição de um trecho normal no modo visual. */
  const updateSegment = (index: number, value: string) => {
    const next = segments().map((segment, position) => (position === index ? value : segmentText(segment))).join("\n");
    applyTyping(next);
  };

  // ---------- salvar ----------
  const handleComplete = async () => {
    if (loading() || saving()) return;
    const content = text();
    if (hasConflictMarkers(content)) {
      notify.error(m().merge_incomplete, `${conflicts().length} ${m().unresolved_conflicts}`);
      const first = conflicts()[0];
      if (first) {
        setMode("visual");
        requestAnimationFrame(() => scrollToConflict(first.id));
      }
      return;
    }

    setSaving(true);
    try {
      // Mantém as quebras de linha originais do arquivo (CRLF no Windows).
      await props.onSave(lineEnding === "\r\n" ? content.replace(/\n/g, "\r\n") : content);
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const typing = (event.target as HTMLElement | null)?.tagName === "TEXTAREA";
    if (event.altKey && event.key === "ArrowDown") { event.preventDefault(); step(1); }
    else if (event.altKey && event.key === "ArrowUp") { event.preventDefault(); step(-1); }
    else if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); void handleComplete(); }
    else if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z" && !typing && history.length > 0) {
      event.preventDefault();
      undo();
    }
  };

  // ---------- carregamento ----------
  onMount(async () => {
    let content = props.diffContent;
    try {
      content = await readWorktreeFile(props.repoPath, props.fileName);
    } catch (error) {
      notify.error(t("error").error, String(error));
    }

    lineEnding = content.includes("\r\n") ? "\r\n" : "\n";
    original = content.replace(/\r\n/g, "\n");
    setText(original);

    const initial = conflicts();
    setTotalConflicts(initial.length);
    setLoading(false);
    if (initial[0]) requestAnimationFrame(() => scrollToConflict(initial[0].id, false));
  });

  return (
    <div class="flex h-full min-h-0 flex-1 flex-col bg-gray-50 dark:bg-gray-900 text-[12px] text-gray-800 dark:text-gray-200"
      onKeyDown={onKeyDown}>
      <header class="flex flex-wrap items-center gap-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-5 py-3">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 text-sm font-semibold">
            <i class="fa-solid fa-code-merge text-blue-500" />
            <span class="truncate" title={props.fileName}>{props.fileName}</span>
          </div>
          <div class="mt-1.5 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span class={conflicts().length === 0 ? "font-medium text-green-600 dark:text-green-400" : "font-medium text-amber-600 dark:text-amber-400"}>
              <Show when={conflicts().length > 0} fallback={<><i class="fa-solid fa-circle-check mr-1" />{m().all_conflicts_resolved}</>}>
                {conflicts().length} {m().unresolved_conflicts}
              </Show>
            </span>
            <div class="h-1.5 w-48 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div class="h-full rounded-full bg-green-500 transition-all duration-300" style={{ width: `${progress()}%` }} />
            </div>
            <span class="tabular-nums">{resolvedCount()}/{totalConflicts()}</span>
          </div>
        </div>

        <div class="flex shrink-0 flex-wrap items-center gap-1">
          <button class={toolbarButton} onClick={() => step(-1)} disabled={conflicts().length === 0} title={`${m().previous_conflict} (Alt+↑)`}>
            <i class="fa-solid fa-arrow-up" />
          </button>
          <button class={toolbarButton} onClick={() => step(1)} disabled={conflicts().length === 0} title={`${m().next_conflict} (Alt+↓)`}>
            <i class="fa-solid fa-arrow-down" />
          </button>
          <span class="mx-1 h-5 w-px bg-gray-200 dark:bg-gray-700" />
          <button class={toolbarButton} onClick={undo} disabled={undoDepth() === 0} title={`${m().undo} (Ctrl+Z)`}>
            <i class="fa-solid fa-rotate-left" /> {m().undo}
          </button>
          <button class={toolbarButton} onClick={resetAll} disabled={loading()}>
            <i class="fa-solid fa-arrows-rotate" /> {m().reset_all}
          </button>
          <button class={toolbarButton} onClick={() => setMode(mode() === "visual" ? "raw" : "visual")}
            classList={{ "bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white": mode() === "raw" }}>
            <i class={mode() === "raw" ? "fa-solid fa-table-columns" : "fa-solid fa-pen"} />
            {mode() === "raw" ? m().visual_mode : m().edit_raw}
          </button>
          <span class="mx-1 h-5 w-px bg-gray-200 dark:bg-gray-700" />
          <button class={toolbarButton} onClick={props.onClose}>{t("common").cancel}</button>
          <button
            class="inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm disabled:opacity-50"
            classList={{
              "bg-green-600 hover:bg-green-500": !loading() && conflicts().length === 0,
              "bg-blue-600 hover:bg-blue-500": loading() || conflicts().length > 0,
            }}
            onClick={() => void handleComplete()}
            disabled={loading() || saving()}
            title="Ctrl+Enter"
          >
            <i class={saving() ? "fa-solid fa-circle-notch fa-spin" : "fa-solid fa-check"} /> {m().complete_merge}
          </button>
        </div>
      </header>

      <div class="flex min-h-0 flex-1">
        {/* ---------- lista de conflitos ---------- */}
        <aside class="flex w-[250px] shrink-0 flex-col border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <div class="flex items-center justify-between px-3 pt-3 pb-2">
            <span class="text-[10px] font-black uppercase tracking-widest text-gray-400">{m().conflicts}</span>
            <span class="rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[10px] tabular-nums text-gray-500">{conflicts().length}</span>
          </div>

          <div class="custom-scrollbar min-h-0 flex-1 overflow-auto px-3 pb-3">
            <Show
              when={conflicts().length > 0}
              fallback={
                <div class="mt-2 flex flex-col items-center gap-2 rounded-xl border border-dashed border-green-300 dark:border-green-800 p-6 text-center text-green-600 dark:text-green-400">
                  <i class="fa-solid fa-circle-check text-2xl" />
                  <span class="text-xs font-medium">{m().all_conflicts_resolved}</span>
                </div>
              }
            >
              <div class="space-y-1.5">
                <For each={conflicts()}>
                  {(conflict) => (
                    <div
                      onClick={() => { setMode("visual"); requestAnimationFrame(() => scrollToConflict(conflict.id)); }}
                      class="cursor-pointer rounded-lg border px-2.5 py-2 transition-colors"
                      classList={{
                        "border-blue-500 bg-blue-50 dark:bg-blue-950/40": activeId() === conflict.id,
                        "border-transparent hover:bg-gray-100 dark:hover:bg-gray-800": activeId() !== conflict.id,
                      }}
                    >
                      <div class="flex items-center gap-2 text-xs">
                        <span class="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                        <span class="font-semibold">{m().conflict} #{conflict.id}</span>
                        <span class="ml-auto text-[10px] text-gray-500 dark:text-gray-400">{m().line} {conflict.startLine}</span>
                      </div>
                      <div class="mt-1 flex gap-2 pl-4 text-[10px] tabular-nums">
                        <span class="text-green-600 dark:text-green-400">{m().current}: {conflict.current.length}</span>
                        <span class="text-blue-600 dark:text-blue-400">{m().incoming}: {conflict.incoming.length}</span>
                      </div>
                      <div class="mt-1.5 flex gap-1 pl-3">
                        <button class={quickButton("current")} onClick={(event) => { event.stopPropagation(); resolveChoice(conflict, "current"); }}>{m().current}</button>
                        <button class={quickButton("incoming")} onClick={(event) => { event.stopPropagation(); resolveChoice(conflict, "incoming"); }}>{m().incoming}</button>
                        <button class={quickButton("both")} onClick={(event) => { event.stopPropagation(); resolveChoice(conflict, "both"); }}>{m().both}</button>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>

          <Show when={conflicts().length > 1}>
            <div class="border-t border-gray-200 dark:border-gray-700 p-3">
              <div class="mb-1.5 text-[10px] font-black uppercase tracking-widest text-gray-400">{m().resolve_all}</div>
              <div class="grid grid-cols-2 gap-1.5">
                <button class="rounded-md bg-green-100 px-2 py-1.5 text-[11px] font-semibold text-green-800 hover:bg-green-200 dark:bg-green-900/40 dark:text-green-200 dark:hover:bg-green-900/70"
                  onClick={() => resolveAll("current")}>{m().use_current}</button>
                <button class="rounded-md bg-blue-100 px-2 py-1.5 text-[11px] font-semibold text-blue-800 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-200 dark:hover:bg-blue-900/70"
                  onClick={() => resolveAll("incoming")}>{m().use_incoming}</button>
              </div>
            </div>
          </Show>
        </aside>

        {/* ---------- documento ---------- */}
        <section class="relative flex min-w-0 flex-1 flex-col bg-white dark:bg-gray-800">
          <div class="flex items-center gap-4 border-b border-gray-200 dark:border-gray-700 px-4 py-2">
            <span class="font-semibold text-gray-600 dark:text-gray-300">{m().merged_version}</span>
            <div class="flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400">
              <span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-sm bg-green-500/70" />{m().current}</span>
              <span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-sm bg-blue-500/70" />{m().incoming}</span>
            </div>
            <span class="ml-auto truncate text-[11px] text-gray-400">
              {mode() === "visual" ? m().click_lines_hint : m().raw_mode_hint}
            </span>
          </div>

          <div class="relative min-h-0 flex-1">
            <Show when={!loading()}>
              <Switch>
                <Match when={mode() === "visual"}>
                  <div ref={scroller} class="merge-doc custom-scrollbar absolute inset-0 overflow-auto pb-24">
                    <Index each={segments()}>
                      {(segment, index) => (
                        <Switch>
                          <Match when={segment().kind === "text" ? (segment() as TextSegment) : undefined}>
                            {(chunk) => (
                              <CodeEditor
                                class="merge-chunk"
                                value={chunk().lines.join("\n")}
                                startLine={chunk().startLine}
                                fileName={props.fileName}
                                onInput={(value) => updateSegment(index, value)}
                              />
                            )}
                          </Match>
                          <Match when={segment().kind === "conflict" ? (segment() as ConflictSegment) : undefined}>
                            {(conflict) => (
                              <ConflictCard
                                conflict={conflict()}
                                active={activeId() === conflict().id}
                                highlight={highlight}
                                onFocus={() => setActiveId(conflict().id)}
                                onResolve={(lines) => resolve(conflict(), lines)}
                              />
                            )}
                          </Match>
                        </Switch>
                      )}
                    </Index>
                  </div>
                </Match>
                <Match when={mode() === "raw"}>
                  <div class="merge-doc absolute inset-0">
                    <CodeEditor
                      fill
                      value={text()}
                      fileName={props.fileName}
                      onInput={applyTyping}
                      lineClass={(index) => {
                        const kind = kinds()[index];
                        return kind ? `merge-line-${kind}` : "";
                      }}
                    />
                  </div>
                </Match>
              </Switch>
            </Show>
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

/* ========================================================================== */

type Side = "current" | "incoming";

function ConflictCard(props: {
  conflict: ConflictSegment;
  active: boolean;
  highlight: (line: string) => string;
  onFocus: () => void;
  onResolve: (lines: string[]) => void;
}) {
  const { t } = useApp();
  const m = () => t("merge");
  const [selected, setSelected] = createSignal<Set<string>>(new Set());
  let lastClicked: { side: Side; index: number } | null = null;

  // Mesmo componente pode receber outro conflito (a lista é renumerada): limpa a seleção.
  createEffect(on(
    () => `${props.conflict.current.join("\n")}\u0001${props.conflict.incoming.join("\n")}`,
    () => { setSelected(new Set<string>()); lastClicked = null; },
    { defer: true },
  ));

  const key = (side: Side, index: number) => `${side}:${index}`;
  const isSelected = (side: Side, index: number) => selected().has(key(side, index));

  const toggleLine = (side: Side, index: number, event: MouseEvent) => {
    props.onFocus();
    const next = new Set(selected());
    if (event.shiftKey && lastClicked && lastClicked.side === side) {
      // Shift+clique seleciona o intervalo inteiro.
      const [from, to] = [Math.min(lastClicked.index, index), Math.max(lastClicked.index, index)];
      for (let i = from; i <= to; i++) next.add(key(side, i));
    } else if (next.has(key(side, index))) {
      next.delete(key(side, index));
    } else {
      next.add(key(side, index));
    }
    lastClicked = { side, index };
    setSelected(next);
  };

  const applySelection = () => {
    const chosen = [
      ...props.conflict.current.filter((_, index) => isSelected("current", index)),
      ...props.conflict.incoming.filter((_, index) => isSelected("incoming", index)),
    ];
    props.onResolve(chosen);
  };

  const columns = () => [
    {
      side: "current" as Side,
      title: m().current,
      branch: props.conflict.currentLabel,
      lines: props.conflict.current,
      action: m().use_current,
      head: "bg-green-500/10 text-green-700 dark:text-green-300",
      dot: "bg-green-500",
      button: "bg-green-600 hover:bg-green-500",
      row: "bg-green-500/[0.06] hover:bg-green-500/15",
      rowSelected: "!bg-green-500/25 border-green-500",
      check: "bg-green-500 border-green-500",
    },
    {
      side: "incoming" as Side,
      title: m().incoming,
      branch: props.conflict.incomingLabel,
      lines: props.conflict.incoming,
      action: m().use_incoming,
      head: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
      dot: "bg-blue-500",
      button: "bg-blue-600 hover:bg-blue-500",
      row: "bg-blue-500/[0.06] hover:bg-blue-500/15",
      rowSelected: "!bg-blue-500/25 border-blue-500",
      check: "bg-blue-500 border-blue-500",
    },
  ];

  return (
    <div data-conflict-id={props.conflict.id} class="flex border-y border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-gray-900/60">
      {/* continua a coluna de numeração do editor */}
      <div class="merge-gutter flex shrink-0 flex-col items-end border-r border-gray-300 bg-gray-50 px-2 pt-3 text-[11px] text-amber-500 dark:border-gray-700 dark:bg-gray-900">
        <span>{props.conflict.startLine}</span>
        <span class="text-gray-400">⋮</span>
        <span>{props.conflict.endLine}</span>
      </div>

      <div class="min-w-0 flex-1 p-3">
        <div
          class="overflow-hidden rounded-xl border bg-white shadow-sm transition-shadow dark:bg-gray-800"
          classList={{
            "border-amber-400 ring-2 ring-amber-400/30 dark:border-amber-500/70": props.active,
            "border-amber-300/70 dark:border-amber-500/30": !props.active,
          }}
          onClick={props.onFocus}
        >
          {/* cabeçalho */}
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-amber-300/50 bg-amber-50 px-3 py-2 dark:border-amber-500/20 dark:bg-amber-500/10">
            <span class="flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-300">
              <i class="fa-solid fa-code-compare" /> {m().conflict} #{props.conflict.id}
            </span>
            <span class="text-[11px] text-gray-500 dark:text-gray-400">{m().line} {props.conflict.startLine}</span>
            <div class="ml-auto flex items-center gap-1.5">
              <button class="rounded-md bg-purple-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-purple-500"
                onClick={(event) => { event.stopPropagation(); props.onResolve(resolutionLines(props.conflict, "both")); }}>
                {m().both}
              </button>
              <button class="rounded-md border border-gray-300 px-2.5 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                onClick={(event) => { event.stopPropagation(); props.onResolve(resolutionLines(props.conflict, "both-incoming-first")); }}>
                {m().both_incoming_first}
              </button>
            </div>
          </div>

          {/* lados */}
          <div class="grid grid-cols-2 divide-x divide-gray-200 dark:divide-gray-700">
            <For each={columns()}>
              {(column) => (
                <div class="flex min-w-0 flex-col">
                  <div class={`flex items-center justify-between gap-2 border-b border-gray-200 px-3 py-1.5 dark:border-gray-700 ${column.head}`}>
                    <div class="flex min-w-0 items-center gap-2 text-[11px] font-bold uppercase tracking-wide">
                      <span class={`h-2 w-2 shrink-0 rounded-full ${column.dot}`} />
                      <span>{column.title}</span>
                      <Show when={column.branch}>
                        <span class="truncate font-mono text-[10px] font-medium normal-case opacity-80" title={column.branch}>{column.branch}</span>
                      </Show>
                      <span class="rounded-full bg-gray-500/15 px-1.5 text-[10px] tabular-nums">{column.lines.length}</span>
                    </div>
                    <button
                      class={`shrink-0 rounded-md px-3 py-1 text-[11px] font-semibold text-white shadow-sm ${column.button}`}
                      onClick={(event) => { event.stopPropagation(); props.onResolve(column.lines); }}
                    >
                      <i class="fa-solid fa-check mr-1" />{column.action}
                    </button>
                  </div>

                  <div class="code-editor flex-1 py-1 font-mono text-sm">
                    <Show when={column.lines.length > 0}
                      fallback={<div class="px-3 py-1.5 font-sans text-[11px] italic text-gray-400">{m().empty_side}</div>}>
                      <For each={column.lines}>
                        {(line, index) => (
                          <div
                            class={`group flex cursor-pointer select-none items-start gap-2 border-l-[3px] border-transparent pl-2 pr-3 transition-colors ${column.row}`}
                            classList={{ [column.rowSelected]: isSelected(column.side, index()) }}
                            onMouseDown={(event) => { if (event.shiftKey) event.preventDefault(); }}
                            onClick={(event) => { event.stopPropagation(); toggleLine(column.side, index(), event); }}
                          >
                            <span
                              class="mt-[5px] flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border border-gray-400/60 text-[9px] text-white opacity-60 group-hover:opacity-100"
                              classList={{ [`${column.check} !opacity-100`]: isSelected(column.side, index()) }}
                            >
                              <Show when={isSelected(column.side, index())}><i class="fa-solid fa-check" /></Show>
                            </span>
                            <span class="code-editor-highlight min-w-0 flex-1 whitespace-pre-wrap break-words leading-6 text-gray-800 dark:text-gray-100"
                              innerHTML={props.highlight(line)} />
                          </div>
                        )}
                      </For>
                    </Show>
                  </div>
                </div>
              )}
            </For>
          </div>

          {/* seleção de linhas */}
          <Show when={selected().size > 0}>
            <div class="flex items-center gap-2 border-t border-gray-200 bg-amber-50/60 px-3 py-2 dark:border-gray-700 dark:bg-amber-500/5">
              <i class="fa-solid fa-list-check text-amber-500" />
              <span class="mr-auto text-[11px] text-gray-600 dark:text-gray-300">
                {selected().size} {m().lines_selected}
              </span>
              <button class="rounded-md border border-gray-300 px-2.5 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                onClick={(event) => { event.stopPropagation(); setSelected(new Set<string>()); }}>
                {m().clear_selection}
              </button>
              <button class="rounded-md bg-amber-500 px-3 py-1 text-[11px] font-semibold text-gray-900 hover:bg-amber-400"
                onClick={(event) => { event.stopPropagation(); applySelection(); }}>
                <i class="fa-solid fa-check mr-1" />{m().apply_selection}
              </button>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}

