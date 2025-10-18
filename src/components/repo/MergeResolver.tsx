import { createSignal, For, Show } from "solid-js";

type ConflictBlock = {
  local: string[];
  remote: string[];
  merged: string[];
};

type Props = {
  diffContent: string; // Conteúdo completo do arquivo em conflito
  onSave: (resolved: string) => void;
  onClose: () => void;
};

export default function MergeResolver(props: Props) {
  const [blocks, setBlocks] = createSignal<ConflictBlock[]>([]);
  const [selectedBlock, setSelectedBlock] = createSignal<number | null>(null);
  const [resolvedContent, setResolvedContent] = createSignal("");

  // Parse inicial do conteúdo com conflitos
  function parseConflicts() {
    const content = props.diffContent.split("\n");
    const result: ConflictBlock[] = [];

    let currentLocal: string[] = [];
    let currentRemote: string[] = [];
    let inLocal = false;
    let inRemote = false;

    for (const line of content) {
      if (line.startsWith("<<<<<<<")) {
        inLocal = true;
        currentLocal = [];
        currentRemote = [];
      } else if (line.startsWith("=======")) {
        inLocal = false;
        inRemote = true;
      } else if (line.startsWith(">>>>>>>")) {
        inRemote = false;
        result.push({ local: currentLocal, remote: currentRemote, merged: [] });
      } else {
        if (inLocal) currentLocal.push(line);
        else if (inRemote) currentRemote.push(line);
        else if (!inLocal && !inRemote && result.length === 0) {
          // Conteúdo inicial antes de qualquer conflito
          result.push({ local: [line], remote: [line], merged: [line] });
        } else if (!inLocal && !inRemote) {
          // Conteúdo fora de conflitos (adiciona ao último bloco)
          const last = result[result.length - 1];
          last.local.push(line);
          last.remote.push(line);
          last.merged.push(line);
        }
      }
    }

    setBlocks(result);
    setResolvedContent(content.join("\n"));
  }

  parseConflicts();

  // Ações de seleção
  function applySide(blockIndex: number, side: "local" | "remote") {
    const b = [...blocks()];
    b[blockIndex].merged = side === "local" ? [...b[blockIndex].local] : [...b[blockIndex].remote];
    setBlocks(b);

    const final = b.map((x) => x.merged.join("\n")).join("\n");
    setResolvedContent(final);
  }

  return (
    <div class="flex flex-col gap-4">
      {/* Header */}
      <div class="text-gray-600 dark:text-gray-300 mb-2">
        <p>
          Compare as mudanças e clique em qual versão deseja manter. 
          Abaixo, você pode editar o resultado final.
        </p>
      </div>

      {/* Painéis de comparação */}
      <div class="grid grid-cols-2 gap-2 border rounded overflow-hidden">
        <div class="border-r border-gray-300 dark:border-gray-700">
          <div class="bg-gray-200 dark:bg-gray-700 px-3 py-2 font-bold text-gray-800 dark:text-gray-200">
            🧩 Current (Local)
          </div>
          <For each={blocks()}>
            {(block, i) => (
              <div
                class={`p-2 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-800 ${
                  selectedBlock() === i() ? "bg-blue-50 dark:bg-blue-900" : ""
                }`}
                onClick={() => applySide(i(), "local")}
              >
                <pre class="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-100">
                  {block.local.join("\n")}
                </pre>
              </div>
            )}
          </For>
        </div>

        <div>
          <div class="bg-gray-200 dark:bg-gray-700 px-3 py-2 font-bold text-gray-800 dark:text-gray-200">
            🌍 Incoming (Remoto)
          </div>
          <For each={blocks()}>
            {(block, i) => (
              <div
                class={`p-2 cursor-pointer hover:bg-green-100 dark:hover:bg-green-800 ${
                  selectedBlock() === i() ? "bg-green-50 dark:bg-green-900" : ""
                }`}
                onClick={() => applySide(i(), "remote")}
              >
                <pre class="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-100">
                  {block.remote.join("\n")}
                </pre>
              </div>
            )}
          </For>
        </div>
      </div>

      {/* Editor final */}
      <div>
        <div class="bg-gray-200 dark:bg-gray-700 px-3 py-2 font-bold text-gray-800 dark:text-gray-200">
          📝 Resolução final
        </div>
        <textarea
          class="w-full h-64 border border-gray-300 dark:border-gray-700 rounded p-2 font-mono text-sm bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100"
          value={resolvedContent()}
          onInput={(e) => setResolvedContent(e.currentTarget.value)}
        />
      </div>

      {/* Botões */}
      <div class="flex justify-end gap-2">
        <button
          class="px-3 py-1 rounded bg-gray-300 hover:bg-gray-400 text-gray-800"
          onClick={props.onClose}
        >
          Cancelar
        </button>
        <button
          class="px-3 py-1 rounded bg-green-600 hover:bg-green-700 text-white"
          onClick={() => props.onSave(resolvedContent())}
        >
          Salvar resolução
        </button>
      </div>
    </div>
  );
}
