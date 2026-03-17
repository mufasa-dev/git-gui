import { createSignal, createMemo, For, Show, createEffect, on } from "solid-js";

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

  // Refs para sincronização de scroll
  let leftRef: HTMLDivElement | undefined;
  let rightRef: HTMLDivElement | undefined;
  let lastProcessedContent = "";

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
        const isCurrent = currentType === "current";
        const isIncoming = currentType === "incoming";

        processed.push({ 
          content: lineContent, 
          type: currentType, 
          conflictId: !isNormal ? conflictCounter : undefined,
          lineNumber: isNormal ? countCurrent : (isCurrent ? countCurrent : countIncoming)
        });

        if (isNormal) {
          countCurrent++;
          countIncoming++;
        } else if (isCurrent) {
          countCurrent++;
        } else if (isIncoming) {
          countIncoming++;
        }
      }
    });

    lastProcessedContent = newContent;
    setLines(processed);
    setResolutions(initialResolutions);
    setManualResult(null); 
  }));

  // Calcula o resultado mesclado baseado nas escolhas do usuário
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

        // Se não houver escolha (null), mantém o conteúdo original (incluindo headers/separators)
        if (choice === null) {
          final.push(line.content);
        } 
        // Se houver escolha, filtra apenas o que foi selecionado
        else {
          if (choice === "current" && line.type === "current") final.push(line.content);
          if (choice === "incoming" && line.type === "incoming") final.push(line.content);
          if (choice === "both" && (line.type === "current" || line.type === "incoming")) final.push(line.content);
          // Note: Headers (<<<<) e Separators (====) são ignorados quando há uma escolha feita
        }
      }
    }
    return final.join("\n");
  });

  // Determina o que exibir no editor de baixo (auto ou manual)
  const displayResult = () => manualResult() ?? autoResult();

  const handleScroll = (e: Event) => {
    const target = e.currentTarget as HTMLDivElement;
    [leftRef, rightRef].forEach(ref => {
      if (ref && ref !== target) ref.scrollTop = target.scrollTop;
    });
  };

  return (
    <div class="flex flex-col h-[calc(100vh-100px)] font-mono text-[12px]">
      {/* PAINÉIS SUPERIORES */}
      <div class="flex flex-[1.2] min-h-0">
        
        {/* Lado Esquerdo: Incoming */}
        <div class="flex-1 flex flex-col border border-gray-300 dark:border-gray-600 w-1/2">
          <div class="bg-gray-200 dark:bg-gray-700 px-4 py-1 text-[11px] uppercase flex justify-between">
            <span class="text-blue-400">← Incoming (Remote)</span>
          </div>
          <div ref={leftRef} onScroll={handleScroll} class="overflow-auto flex-1 p-2">
            <For each={lines()}>{(line) => {
              const isSelected = () => resolutions()[line.conflictId!] === 'incoming' || resolutions()[line.conflictId!] === 'both';

              return (
                <div 
                  onClick={() => {
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
                  }}
                  class={`flex min-h-[1.5em] items-center border-l-4 border-transparent ${
                    line.type === 'incoming' 
                      ? isSelected() ? 'bg-blue-600/40 border-blue-700 py-1' : 'bg-blue-400/20 opacity-60  py-1'
                      : line.type === 'current' ? 'opacity-10 grayscale pointer-events-none' : ''
                  } ${line.conflictId && 'cursor-pointer transition-colors'}`}
                >
                  <span class="w-10 text-right pr-2 text-gray-500 select-none border-r border-gray-300/20 mr-2 flex-shrink-0">
                    {line.type === 'incoming' || line.type === 'normal' ? line.lineNumber : ''}
                  </span>
                  
                  <pre class={line.type === 'header' || line.type === 'separator' ? 'hidden' : 'whitespace-pre'}>
                    {line.content}
                  </pre>
                </div>
              )
            }}</For>
          </div>
        </div>

        {/* Lado Direito: Current */}
        <div class="flex-1 flex flex-col w-1/2 border border-gray-300 dark:border-gray-600">
          <div class="bg-gray-200 dark:bg-gray-700 px-4 py-1 text-[11px] uppercase flex justify-between">
            <span class="text-green-400 font-bold">Current (Local) →</span>
          </div>
          <div ref={rightRef} onScroll={handleScroll} class="overflow-auto flex-1 p-2">
            <For each={lines()}>{(line, index) => {
              const isSelected = () => resolutions()[line.conflictId!] === 'current' || resolutions()[line.conflictId!] === 'both';

              return (
                <div 
                  onClick={() => {
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
                  }}
                  class={`flex min-h-[1.5em] items-center border-l-4 border-transparent ${
                    line.type === 'current' 
                      ? isSelected() ? 'bg-green-600/40 border-green-700 py-1' : 'bg-green-400/20 opacity-60 py-1'
                      : line.type === 'incoming' ? 'opacity-10 grayscale pointer-events-none' : ''
                  } ${line.conflictId && 'cursor-pointer transition-colors '}`}
                >
                  <span class="w-10 text-right pr-2 text-gray-500 select-none border-r border-gray-300/20 mr-2 flex-shrink-0">
                    {line.type === 'current' || line.type === 'normal' ? line.lineNumber : ''}
                  </span>

                  <pre class={line.type === 'header' || line.type === 'separator' ? 'hidden' : 'whitespace-pre'}>
                    {line.content}
                  </pre>
                </div>
              )
            }}</For>
          </div>
        </div>
      </div>

      {/* PAINEL INFERIOR (Resultado) */}
      <div class="flex-1 flex flex-col border border-gray-300 dark:border-gray-600">
        <div class="bg-gray-200 dark:bg-gray-700 px-4 py-2 flex justify-between items-center">
          <span class="text-[11px] font-bold uppercase text-orange-400">Result (Merged)</span>
          <div class="flex gap-2 text-[11px]">
             <Show when={manualResult() !== null}>
                <button onClick={() => setManualResult(null)} class="text-gray-500 hover:text-white mr-2 italic">Resetar para Auto</button>
             </Show>
            <button onClick={props.onClose} class="px-4 py-1 hover:bg-[#333] rounded">Cancelar</button>
            <button onClick={() => props.onSave(displayResult())} class="px-4 py-1 bg-[#0e639c] text-white rounded font-bold hover:bg-[#1177bb]">Complete Merge</button>
          </div>
        </div>
        <textarea 
          class="flex-1 bg-transparent p-4 outline-none resize-none bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100 custom-scrollbar focus:bg-white/5 transition-colors"
          value={displayResult()}
          spellcheck={false}
          onInput={(e) => setManualResult(e.currentTarget.value)}
        />
      </div>
    </div>
  );
}