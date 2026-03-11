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

  // Lógica de Parsing: Só roda se o conteúdo bruto do arquivo mudar (props.diffContent)
  createEffect(on(() => props.diffContent, (newContent) => {
    if (newContent === lastProcessedContent) return;
    const rawLines = newContent.split("\n");
    const processed: Line[] = [];
    const initialResolutions: Record<number, null> = {};
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
      lastProcessedContent = newContent;
    });

    setLines(processed);
    setResolutions(initialResolutions);
    setManualResult(null); // Reseta a edição manual apenas se o arquivo mudar
  }));

  // Calcula o resultado mesclado baseado nas escolhas do usuário
  const autoResult = createMemo(() => {
    const res = resolutions();
    const final: string[] = [];
    let skipUntilNextNormal = false;

    lines().forEach((line) => {
      if (line.type === "normal") {
        final.push(line.content);
        skipUntilNextNormal = false;
      } else if (line.conflictId && !skipUntilNextNormal) {
        const choice = res[line.conflictId];
        if (choice === "current" && line.type === "current") final.push(line.content);
        if (choice === "incoming" && line.type === "incoming") final.push(line.content);
        if (choice === "both" && (line.type === "current" || line.type === "incoming")) final.push(line.content);
        if (line.content.startsWith(">>>>>>>")) skipUntilNextNormal = true;
      }
    });
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
                  <button onClick={() => setResolutions(p => ({...p, [line.conflictId!]: 'incoming'}))} 
                          class="text-blue-400 hover:bg-blue-400/20 px-1 rounded block border border-blue-400/50 mb-1">
                    Accept Incoming
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
                  <button onClick={() => setResolutions(p => ({...p, [line.conflictId!]: 'current'}))}
                          class="text-green-400 hover:bg-green-400/20 px-1 rounded block border border-green-400/50 mb-1 ml-auto">
                    Accept Current
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