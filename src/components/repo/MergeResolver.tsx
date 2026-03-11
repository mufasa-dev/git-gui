import { createSignal, createMemo, For, Show, createEffect, on } from "solid-js";

interface Line {
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

  createEffect(on(() => props.diffContent, (newContent, prevContent) => {
    // 1. Verificação de segurança para não resetar se o conteúdo for idêntico
    if (newContent === lastProcessedContent && lines().length > 0) return;

    const rawLines = (newContent || "").split("\n");
    const processed: Line[] = [];
    const initialResolutions: Record<number, any> = {};
    let conflictCounter = 0;
    let currentType: Line["type"] = "normal";

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
        processed.push({ content: lineContent, type: "header", conflictId: conflictCounter });
        currentType = "normal";
      } else {
        processed.push({ 
          content: lineContent, 
          type: currentType, 
          conflictId: currentType !== "normal" ? conflictCounter : undefined 
        });
      }
    });

    lastProcessedContent = newContent; // Atualiza a ref
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
            <For each={lines()}>{(line) => (
              <div class={`min-h-[1.5em] ${line.type === 'current' ? 'opacity-20 grayscale' : ''} ${line.type === 'incoming' ? 'bg-blue-900/30' : ''}`}>
                <Show when={line.content.startsWith("<<<<<<<")}>
                  <button 
                    onClick={() => {
                      setResolutions(p => ({
                        ...p, 
                        [line.conflictId!]: p[line.conflictId!] === 'incoming' ? null : 'incoming'
                      }));
                    }} 
                    class={`text-blue-400 hover:bg-blue-400/20 px-1 rounded block border border-blue-400/50 mb-1 ${
                      resolutions()[line.conflictId!] === 'incoming' ? 'bg-blue-400/30' : ''
                    }`}
                  >
                    {resolutions()[line.conflictId!] === 'incoming' ? '✓ Incoming Accepted' : 'Accept Incoming'}
                  </button>
                </Show>
                <pre class={line.type === 'header' || line.type === 'separator' ? 'hidden' : ''}>{line.content}</pre>
              </div>
            )}</For>
          </div>
        </div>

        {/* Lado Direito: Current */}
        <div class="flex-1 flex flex-col w-1/2 border border-gray-300 dark:border-gray-600">
          <div class="bg-gray-200 dark:bg-gray-700 px-4 py-1 text-[11px] uppercase flex justify-between">
            <span class="text-green-400 font-bold">Current (Local) →</span>
          </div>
          <div ref={rightRef} onScroll={handleScroll} class="overflow-auto flex-1 p-2">
            <For each={lines()}>{(line) => (
              <div class={`min-h-[1.5em] ${line.type === 'incoming' ? 'opacity-20 grayscale' : ''} ${line.type === 'current' ? 'bg-green-900/30' : ''}`}>
                <Show when={line.content.startsWith("<<<<<<<")}>
                  <button 
                    onClick={() => {
                      setResolutions(p => ({
                        ...p, 
                        [line.conflictId!]: p[line.conflictId!] === 'current' ? null : 'current'
                      }));
                    }}
                    class={`text-green-400 hover:bg-green-400/20 px-1 rounded block border border-green-400/50 mb-1 ml-auto ${
                      resolutions()[line.conflictId!] === 'current' ? 'bg-green-400/30' : ''
                    }`}
                  >
                    {resolutions()[line.conflictId!] === 'current' ? '✓ Current Accepted' : 'Accept Current'}
                  </button>
                </Show>
                <pre class={line.type === 'header' || line.type === 'separator' ? 'hidden' : ''}>{line.content}</pre>
              </div>
            )}</For>
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