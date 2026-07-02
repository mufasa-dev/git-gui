import { createSignal, createMemo, For, Show, createEffect, on, onCleanup } from "solid-js";
import { createCodeMirror } from "solid-codemirror";
import { EditorView, lineNumbers } from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import { githubLight } from '@uiw/codemirror-theme-github';
import { Transaction, Annotation } from "@codemirror/state";
import { notify } from "../../utils/notifications";
import { conflictHighlightPlugin } from "../../utils/conflictHighlight";
import { useApp } from "../../context/AppContext";
import { highlightCode } from "../../utils/highlight";

// Helper para identificar mudanças programáticas vs manuais
const ExternalChange = Annotation.define<boolean>();

interface Line {
  lineNumber?: number;
  content: string;
  type: "normal" | "current" | "incoming" | "separator" | "header";
  conflictId?: number;
}

type Props = {
  diffContent: string;
  fileName: string;
  onSave: (resolved: string) => void;
  onClose: () => void;
};

export default function MergeResolver(props: Props) {
  const [lines, setLines] = createSignal<Line[]>([]);
  const [resolutions, setResolutions] = createSignal<Record<number, ("current" | "incoming")[]>>({});
  const [manualResult, setManualResult] = createSignal<string | null>(null);
  const [isDark, setIsDark] = createSignal(localStorage.getItem("theme") === "dark");
  const [activeConflictId, setActiveConflictId] = createSignal<number | null>(null);
  const { t } = useApp();

  let leftRef: HTMLDivElement | undefined;
  let rightRef: HTMLDivElement | undefined;
  let cmScroller: HTMLElement | null = null;
  let isSyncing = false;
  let lastProcessedContent = "";

  const conflictIds = createMemo(() => {
    const ids: number[] = [];
    const seen = new Set<number>();
    lines().forEach(line => {
      if (line.conflictId !== undefined && !seen.has(line.conflictId)) {
        seen.add(line.conflictId);
        ids.push(line.conflictId);
      }
    });
    return ids;
  });

  // ---- Total de conflitos e resolvidos ----
  const conflictStats = createMemo(() => {
    const ids = conflictIds();
    const total = ids.length;
    let resolved = 0;
    const res = resolutions();
    ids.forEach(id => {
      if (res[id] && res[id].length > 0) resolved++;
    });
    return { total, resolved };
  });

  const goToConflict = (id: number) => {
    setActiveConflictId(id);
    // Rola para o elemento em ambos os painéis
    const scrollToElement = (ref: HTMLDivElement | undefined) => {
      if (!ref) return;
      const el = ref.querySelector(`[data-conflict-id="${id}"]`) as HTMLElement;
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    };
    scrollToElement(leftRef);
    scrollToElement(rightRef);
    // Também sincroniza o CodeMirror (opcional) - não temos acesso direto à linha, mas o scroll sincronizado já mantém
  };

  const goToNextConflict = () => {
    const ids = conflictIds();
    if (ids.length === 0) return;
    const current = activeConflictId();
    let index = ids.findIndex(id => id === current);
    if (index === -1) index = -1;
    const nextIndex = (index + 1) % ids.length;
    goToConflict(ids[nextIndex]);
  };

  const goToPrevConflict = () => {
    const ids = conflictIds();
    if (ids.length === 0) return;
    const current = activeConflictId();
    let index = ids.findIndex(id => id === current);
    if (index === -1) index = 0;
    const prevIndex = (index - 1 + ids.length) % ids.length;
    goToConflict(ids[prevIndex]);
  };

  const synchronizeScrolls = (source: HTMLElement, targets: (HTMLElement | null | undefined)[]) => {
    const scrollTop = source.scrollTop;
    const scrollLeft = source.scrollLeft;
    targets.forEach(el => {
      if (el && el !== source) {
        if (el.scrollTop !== scrollTop) el.scrollTop = scrollTop;
        if (el.scrollLeft !== scrollLeft) el.scrollLeft = scrollLeft;
      }
    });
  };

  const autoResult = createMemo(() => {
    const res = resolutions();
    const final: string[] = [];
    const linesArr = lines();

    for (let i = 0; i < linesArr.length; i++) {
      const line = linesArr[i];

      if (line.type === "normal") {
        final.push(line.content);
        continue;
      }

      if (line.conflictId) {
        const id = line.conflictId;
        const choices = res[id] || [];

        if (choices.length === 0) {
          final.push(line.content);
        } else {
          const conflictLines = linesArr.filter(l => l.conflictId === id);
          
          choices.forEach(side => {
            conflictLines
              .filter(l => l.type === side)
              .forEach(l => final.push(l.content));
          });

          while (i + 1 < linesArr.length && linesArr[i + 1].conflictId === id) {
            i++;
          }
        }
      }
    }
    return final.join("\n");
  });

  const displayResult = () => manualResult() ?? autoResult();

  // Configuração do CodeMirror
  const { ref: codeMirrorRef, editorView: view, createExtension } = createCodeMirror({
    value: displayResult()
  });

  createExtension(() => {
    const dark = isDark();

    const extensions = [
      javascript(),
      lineNumbers(),
      EditorView.lineWrapping,
      conflictHighlightPlugin
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
          border: "none"
        },
        ".cm-content": {
          color: dark ? "#abb2bf" : "#000000",
        }
      }, { dark: dark })
    );

    extensions.push(
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !update.transactions.some(tr => tr.annotation(ExternalChange))) {
          const newValue = update.state.doc.toString();
          setManualResult(newValue);
        }
      })
    );

    return extensions;
  });

  createEffect(() => {
    const v = view();
    if (!v) return;
    const scroller = v.scrollDOM;
    if (!scroller) return;
    cmScroller = scroller;

    const onScroll = () => {
      if (!isSyncing && cmScroller) {
        isSyncing = true;
        const targets = [leftRef, rightRef];
        synchronizeScrolls(cmScroller, targets);
        queueMicrotask(() => { isSyncing = false; });
      }
    };

    scroller.addEventListener('scroll', onScroll);
    onCleanup(() => scroller.removeEventListener('scroll', onScroll));
  });

  const handleCompleteMerge = () => {
    const v = view();
    const finalContent = v ? v.state.doc.toString() : displayResult();
    
    const hasMarkers = finalContent.includes("<<<<<<<") || finalContent.includes(">>>>>>>");

    if (hasMarkers) {
      notify.error("Merge incompleto", "Ainda existem marcadores de conflito no texto.");
      return;
    }

    props.onSave(finalContent);
  };

  createEffect(() => {
    const v = view();
    if (!v) return;

    const target = manualResult() ?? autoResult();
    const currentDoc = v.state.doc.toString();

    if (currentDoc !== target) {
      v.dispatch({
        changes: { from: 0, to: v.state.doc.length, insert: target },
        annotations: ExternalChange.of(true)
      });
    }
  });

  createEffect(on(() => props.diffContent, (newContent) => {
    if (newContent === lastProcessedContent && lines().length > 0) return;
    const rawLines = (newContent || "").split("\n");
    const processed: Line[] = [];
    const initialResolutions: Record<number, any> = {};
    let conflictCounter = 0;
    let currentType: Line["type"] = "normal";
    let countIncoming = 1;
    let countCurrent = 1;

    rawLines.forEach((lineContent) => {
      if (lineContent.startsWith("<<<<<<<")) {
        conflictCounter++;
        currentType = "current";
        initialResolutions[conflictCounter] = null;
        processed.push({ content: lineContent, type: "header", conflictId: conflictCounter });
      } else if (lineContent.startsWith("=======")) {
        currentType = "incoming";
        processed.push({ content: lineContent, type: "separator", conflictId: conflictCounter });
      } else if (lineContent.startsWith(">>>>>>>")) {
        currentType = "normal";
        processed.push({ content: lineContent, type: "header", conflictId: conflictCounter });
      } else {
        const isNormal = currentType === "normal";
        processed.push({ 
          content: lineContent, 
          type: currentType, 
          conflictId: !isNormal ? conflictCounter : undefined,
          lineNumber: isNormal ? countCurrent : (currentType === "current" ? countCurrent : countIncoming)
        });
        if (isNormal) { countCurrent++; countIncoming++; }
        else if (currentType === "current") countCurrent++;
        else if (currentType === "incoming") countIncoming++;
      }
    });

    lastProcessedContent = newContent;
    setLines(processed);
    setResolutions(initialResolutions);
    setManualResult(null); 
  }));

  const toggleResolution = (id: number, side: "current" | "incoming") => {
    setResolutions(p => {
      const currentList = p[id] || [];
      const isAlreadySelected = currentList.includes(side);
      
      let newList;
      if (isAlreadySelected) {
        newList = currentList.filter(s => s !== side);
      } else {
        newList = [...currentList, side];
      }
      
      return { ...p, [id]: newList };
    });
  };

  const handleScroll = (e: Event) => {
    const target = e.currentTarget as HTMLDivElement;
    if (!isSyncing) {
      isSyncing = true;
      const targets = [leftRef, rightRef, cmScroller];
      synchronizeScrolls(target, targets);
      queueMicrotask(() => { isSyncing = false; });
    }
  };

  return (
    <div class="flex flex-col h-[calc(100vh-120px)] font-sans text-[12px] border border-gray-200 dark:border-gray-900 bg-gray-300 dark:bg-gray-800 text-gray-800 dark:text-gray-200">
      
      {/* CABEÇALHO DE CONFLITOS E NAVEGAÇÃO */}
      <div class="flex items-center justify-between px-4 py-2 bg-gray-200 dark:bg-gray-900 border-b border-gray-300 dark:border-gray-700">
        <div class="flex items-center gap-4">
          <span class="text-sm font-semibold">
            Conflitos: <span class="text-green-500">{conflictStats().resolved}</span> / {conflictStats().total} resolvidos
          </span>
        </div>
        <div class="flex items-center gap-2">
          <button
            onClick={goToPrevConflict}
            disabled={conflictIds().length === 0}
            class="p-1 rounded hover:bg-gray-300 dark:hover:bg-gray-700 disabled:opacity-30"
            title="Conflito anterior"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <button
            onClick={goToNextConflict}
            disabled={conflictIds().length === 0}
            class="p-1 rounded hover:bg-gray-300 dark:hover:bg-gray-700 disabled:opacity-30"
            title="Próximo conflito"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* PAINÉIS SUPERIORES (Incoming / Current) */}
      <div class="flex flex-[1.2] min-h-0 border-b border-white/10">
        {/* Lado Esquerdo - Incoming */}
        <div class="flex-1 flex flex-col border-r border-white/10 w-1/2">
          <div class="bg-blue-300 dark:bg-blue-900 px-4 py-1 text-[11px] uppercase text-blue-700 dark:text-blue-400 font-bold border-b border-blue-500/30">← Incoming</div>
          <div ref={leftRef} onScroll={handleScroll} class="overflow-auto flex-1 p-2 custom-scrollbar">
            <For each={lines()}>{(line) => {
              const isSelected = () => resolutions()[line.conflictId!]?.includes('incoming');
              const isActive = () => line.conflictId === activeConflictId();
              if (!line.lineNumber || line.type === 'current') return null;
              return (
                <div 
                  onClick={() => {
                    if (line.conflictId) {
                      toggleResolution(line.conflictId, 'incoming');
                      setActiveConflictId(line.conflictId);
                    }
                  }}
                  data-conflict-id={line.conflictId}
                  class={`flex min-h-[1.5em] items-center border-l-4 border-transparent w-fit min-w-full
                    ${line.type === 'incoming' ? (isSelected() ? 'bg-blue-600/30 !border-blue-500 py-2' : 'bg-blue-300/30 py-2') : ''}
                    ${isActive() ? 'border-yellow-400 !border-l-4' : ''}
                    ${line.conflictId ? 'cursor-pointer text-black dark:text-white' : 'w-fit'}`}
                >
                  <span class="w-8 text-right pr-2 text-black dark:text-gray-400 text-[10px]">
                    {line.type === 'normal' ? line.lineNumber : ''}
                    {isSelected() && line.type === 'incoming' && <span>✅</span>}
                  </span>
                  <pre class={line.type === 'header' || line.type === 'separator' ? 'hidden' : 'whitespace-pre font-mono select-text'}>
                    <div innerHTML={highlightCode(line.content, props.fileName)} />
                  </pre>
                </div>
              );
            }}</For>
          </div>
        </div>

        {/* Lado Direito - Current */}
        <div class="flex-1 flex flex-col w-1/2">
          <div class="bg-green-300 dark:bg-green-900 px-4 py-1 text-[11px] uppercase text-green-700 dark:text-green-400 font-bold border-b border-green-500/30">Current →</div>
          <div ref={rightRef} onScroll={handleScroll} class="overflow-auto flex-1 p-2 custom-scrollbar">
            <For each={lines()}>{(line) => {
              const isSelected = () => resolutions()[line.conflictId!]?.includes('current');
              const isActive = () => line.conflictId === activeConflictId();
              if (!line.lineNumber || line.type === 'incoming') return null;
              return (
                <div 
                  onClick={() => {
                    if (line.conflictId) {
                      toggleResolution(line.conflictId, 'current');
                      setActiveConflictId(line.conflictId);
                    }
                  }}
                  data-conflict-id={line.conflictId}
                  class={`flex min-h-[1.5em] items-center border-l-4 border-transparent w-fit min-w-full
                    ${line.type === 'current' ? (isSelected() ? 'bg-green-600/30 border-l-2 !border-green-500 py-2' : 'bg-green-300/30 py-2') : ''}
                    ${isActive() ? 'border-yellow-400 !border-l-4' : ''}
                    ${line.conflictId ? 'cursor-pointer text-black dark:text-white' : 'w-fit'}`}
                >
                  <span class="w-8 text-right pr-2 text-gray-500 dark:text-gray-400 mr-2 text-[10px]">
                    {line.type === 'normal' ? line.lineNumber : ''}
                    {isSelected() && line.type === 'current' && <span>✅</span>}
                  </span>
                  <pre class={line.type === 'header' || line.type === 'separator' ? 'hidden' : 'whitespace-pre font-mono select-text'}>
                    <div innerHTML={highlightCode(line.content, props.fileName)} />
                  </pre>
                </div>
              );
            }}</For>
          </div>
        </div>
      </div>

      {/* PAINEL INFERIOR (Resultado) */}
      <div class="flex-1 flex flex-col min-h-0">
        <div class="bg-gray-200 dark:bg-gray-900 px-4 py-2 flex justify-between items-center border-b border-white/5">
          <span class="text-[11px] font-bold uppercase text-orange-400">Resultado (Merged)</span>
          <div class="flex gap-3 text-[11px]">
            <Show when={manualResult() !== null}>
              <button onClick={() => setManualResult(null)} class="text-gray-400 hover:text-white underline italic">Reset to Auto</button>
            </Show>
            <button onClick={props.onClose} class="hover:text-white text-gray-400">{t('common').cancel}</button>
            <button onClick={handleCompleteMerge} class="px-3 py-1 bg-blue-600 text-white rounded-xl font-bold">Completar Merge</button>
          </div>
        </div>
        {/* CodeMirror */}
        <div class="flex-1 overflow-hidden" ref={codeMirrorRef} />
      </div>
    </div>
  );
}