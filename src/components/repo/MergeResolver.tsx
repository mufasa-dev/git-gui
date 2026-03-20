import { createSignal, createMemo, For, Show, createEffect, on } from "solid-js";
import { createCodeMirror } from "solid-codemirror";
import { EditorView, lineNumbers } from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import { githubLight } from '@uiw/codemirror-theme-github';
import { Transaction, Annotation } from "@codemirror/state";
import { notify } from "../../utils/notifications";

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
  onSave: (resolved: string) => void;
  onClose: () => void;
};

export default function VSMergeEditor(props: Props) {
  const [lines, setLines] = createSignal<Line[]>([]);
  const [resolutions, setResolutions] = createSignal<Record<number, ("current" | "incoming")[]>>({});
  const [manualResult, setManualResult] = createSignal<string | null>(null);
  const [isDark, setIsDark] = createSignal(localStorage.getItem("theme") === "dark");

  let leftRef: HTMLDivElement | undefined;
  let rightRef: HTMLDivElement | undefined;
  let lastProcessedContent = "";

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

    return extensions;
  });

  const handleCompleteMerge = () => {
    const currentResolutions = resolutions();
    const conflictIds = Object.keys(currentResolutions);
    const hasUnresolved = conflictIds.some(id => currentResolutions[Number(id)].length === 0);

    if (hasUnresolved) {
      notify.error("Merge incompleto", "Existem conflitos não resolvidos.");
    } else {
      props.onSave(displayResult());
    }
  };

  // Sincroniza o editor quando o autoResult muda (clique nos painéis)
  createEffect(() => {
    const v = view();
    if (!v) return;
    const target = displayResult();
    if (v.state.doc.toString() !== target) {
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
    [leftRef, rightRef].forEach(ref => {
      if (ref && ref !== target) ref.scrollTop = target.scrollTop;
    });
  };

  return (
    <div class="flex flex-col h-[calc(100vh-100px)] font-sans text-[12px] border border-gray-200 dark:border-gray-900 bg-gray-300 dark:bg-gray-800 text-gray-800 dark:text-gray-200">
      <div class="flex flex-[1.2] min-h-0 border-b border-white/10">
        {/* Lado Esquerdo */}
        <div class="flex-1 flex flex-col border-r border-white/10 w-1/2">
          <div class="bg-blue-300 dark:bg-blue-900 px-4 py-1 text-[11px] uppercase text-blue-700 dark:text-blue-400 font-bold border-b border-blue-500/30">← Incoming</div>
          <div ref={leftRef} onScroll={handleScroll} class="overflow-auto flex-1 p-2 custom-scrollbar">
            <For each={lines()}>{(line) => {
              const isSelected = () => resolutions()[line.conflictId!]?.includes('incoming');
              return (
                <div onClick={() => toggleResolution(line.conflictId!, 'incoming')} 
                  class={`flex min-h-[1.5em] items-center border-l-2 border-transparent 
                    ${line.type === 'incoming' ? (isSelected() ? 'bg-blue-600/30 border-blue-500 py-2' : 'bg-blue-300/30 py-2') : line.type === 'current' ? 'opacity-30 grayscale pointer-events-none' : ''} 
                    ${line.conflictId ? 'cursor-pointer text-black dark:text-white' : 'w-fit '}`}>
                  <span class="w-8 text-right pr-2 text-black dark:text-gray-400 text-[10px]">
                    {line.type === 'current' || line.type === 'normal' ? line.lineNumber : ''}
                    {isSelected() && line.type === 'incoming' && <span>✅</span>}
                  </span>
                  <pre class={line.type === 'header' || line.type === 'separator' ? 'hidden' : 'whitespace-pre font-mono select-text'}>
                    {line.content}
                  </pre>
                </div>
              )}}
            </For>
          </div>
        </div>

        {/* Lado Direito */}
        <div class="flex-1 flex flex-col w-1/2">
          <div class="bg-green-300 dark:bg-green-900 px-4 py-1 text-[11px] uppercase text-green-700 dark:text-green-400 font-bold border-b border-green-500/30">Current →</div>
          <div ref={rightRef} onScroll={handleScroll} class="overflow-auto flex-1 p-2 custom-scrollbar">
            <For each={lines()}>{(line) => {
              const isSelected = () => resolutions()[line.conflictId!]?.includes('current');
              return (
                <div onClick={() => toggleResolution(line.conflictId!, 'current')} 
                  class={`flex min-h-[1.5em] items-center border-l-2 border-transparent 
                    ${line.type === 'current' ? (isSelected() ? 'bg-green-600/30 border-green-500 py-2' : 'bg-green-300/30 py-2') : line.type === 'incoming' ? 'opacity-30 grayscale pointer-events-none' : ''} 
                    ${line.conflictId ? 'cursor-pointer text-black dark:text-white' : 'w-fit'}`}>
                  <span class="w-8 text-right pr-2 text-gray-500 dark:text-gray-400 mr-2 text-[10px]">
                    {line.type === 'incoming' || line.type === 'normal' ? line.lineNumber : ''}
                    {isSelected() && line.type === 'current' && <span>✅</span>}
                  </span>
                  <pre class={line.type === 'header' || line.type === 'separator' ? 'hidden' : 'whitespace-pre font-mono select-text'}>
                    {line.content}
                  </pre>
                </div>
              )}}
            </For>
          </div>
        </div>
      </div>

      {/* PAINEL INFERIOR */}
      <div class="flex-1 flex flex-col min-h-0">
        <div class="bg-gray-200 dark:bg-gray-900 px-4 py-2 flex justify-between items-center border-b border-white/5">
          <span class="text-[11px] font-bold uppercase text-orange-400">Resultado (Merged)</span>
          <div class="flex gap-3 text-[11px]">
            <Show when={manualResult() !== null}>
              <button onClick={() => setManualResult(null)} class="text-gray-400 hover:text-white underline italic">Reset to Auto</button>
            </Show>
            <button onClick={props.onClose} class="hover:text-white text-gray-400">Cancelar</button>
            <button onClick={handleCompleteMerge} class="px-3 py-1 bg-blue-600 text-white rounded font-bold">Completar Merge</button>
          </div>
        </div>
        
        {/* CodeMirror */}
        <div class="flex-1 overflow-hidden" ref={codeMirrorRef} />
      </div>
    </div>
  );
}