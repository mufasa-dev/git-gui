import { createSignal, createMemo, For, Show, createEffect, on } from "solid-js";
import { createCodeMirror } from "solid-codemirror";
import { EditorView } from "@codemirror/view";
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
  const [resolutions, setResolutions] = createSignal<Record<number, "current" | "incoming" | "both" | "none" | null>>({});
  const [manualResult, setManualResult] = createSignal<string | null>(null);
  const [isDark, setIsDark] = createSignal(localStorage.getItem("theme") === "dark");

  let leftRef: HTMLDivElement | undefined;
  let rightRef: HTMLDivElement | undefined;
  let lastProcessedContent = "";

  // 1. Lógica de cálculo (Memos) - PRECISA VIR ANTES DO HOOK
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
        const choice = res[line.conflictId];
        if (choice === null) {
          final.push(line.content);
        } else {
          if (choice === "current" && line.type === "current") final.push(line.content);
          if (choice === "incoming" && line.type === "incoming") final.push(line.content);
          if (choice === "both" && (line.type === "current" || line.type === "incoming")) final.push(line.content);
        }
      }
    }
    return final.join("\n");
  });

  const displayResult = () => manualResult() ?? autoResult();

  // 2. Configuração do CodeMirror
  const { ref: codeMirrorRef, editorView: view, createExtension } = createCodeMirror({
    value: displayResult()
  });

  createExtension(() => {
    const dark = isDark();

    // 1. Criamos um array de extensões base
    const extensions = [
      javascript(),
      EditorView.lineWrapping,
    ];

    // 2. Só adicionamos o OneDark se for realmente DARK
    if (dark) {
      extensions.push(oneDark);
    } else {
      extensions.push(githubLight);
    }

    // 3. Adicionamos o ajuste de tema POR ÚLTIMO para tentar sobrescrever
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
        // Isso aqui é importante para o modo claro ter letras pretas
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
    const hasUnresolved = conflictIds.some(id => currentResolutions[Number(id)] === null);

    if (hasUnresolved) {
      notify.error("Merge incompleto", "Existem conflitos não resolvidos. O arquivo será salvo com os marcadores originais.");
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

  // 3. Sua lógica original de processamento de Diff (RESTAURADA)
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
              const isSelected = () => resolutions()[line.conflictId!] === 'incoming' || resolutions()[line.conflictId!] === 'both';
              return (
                <div onClick={() => {
                    if (!line.conflictId) return;
                    setResolutions(p => {
                      const res = p[line.conflictId!];
                      let next: any = null;
                      if (res === 'incoming') next = null;
                      else if (res === 'current') next = 'both';
                      else if (res === 'both') next = 'current';
                      else next = 'incoming';
                      return { ...p, [line.conflictId!]: next };
                    });
                  }} class={`flex min-h-[1.5em] w-fit items-center border-l-2 border-transparent 
                    ${line.type === 'incoming' ? (isSelected() ? 'bg-blue-600/30 border-blue-500 py-2' : 'bg-blue-300/30 py-2') : line.type === 'current' ? 'opacity-10 grayscale pointer-events-none' : ''} 
                    ${line.conflictId && 'cursor-pointer w-[100%] text-black dark:text-white'}`}>
                  <span class="w-8 text-right pr-2 text-black dark:text-gray-500 text-[10px]">{line.type === 'incoming' || line.type === 'normal' ? line.lineNumber : ''}</span>
                  <pre class={line.type === 'header' || line.type === 'separator' ? 'hidden' : 'whitespace-pre font-mono'}>
                    {isSelected() && line.type === 'incoming' && <span class="mr-2">✅</span>}
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
              const isSelected = () => resolutions()[line.conflictId!] === 'current' || resolutions()[line.conflictId!] === 'both';
              return (
                <div onClick={() => {
                    if (!line.conflictId) return;
                    setResolutions(p => {
                      const res = p[line.conflictId!];
                      let next: any = null;
                      if (res === 'current') next = null;
                      else if (res === 'incoming') next = 'both';
                      else if (res === 'both') next = 'incoming';
                      else next = 'current';
                      return { ...p, [line.conflictId!]: next };
                    });
                  }} class={`flex min-h-[1.5em] w-fit items-center border-l-2 border-transparent 
                    ${line.type === 'current' ? (isSelected() ? 'bg-green-600/30 border-green-500 py-2' : 'bg-green-300/30 py-2') : line.type === 'incoming' ? 'opacity-10 grayscale pointer-events-none' : ''} 
                    ${line.conflictId && 'cursor-pointer w-[100%] text-black dark:text-white'}`}>
                  <span class="w-8 text-right pr-2 text-gray-500 text-[10px]">{line.type === 'current' || line.type === 'normal' ? line.lineNumber : ''}</span>
                  <pre class={line.type === 'header' || line.type === 'separator' ? 'hidden' : 'whitespace-pre font-mono'}>
                    {isSelected() && line.type === 'current' && <span class="mr-2">✅</span>}
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
        
        {/* O CodeMirror é montado aqui através do ref */}
        <div class="flex-1 overflow-hidden" ref={codeMirrorRef} />
      </div>
    </div>
  );
}