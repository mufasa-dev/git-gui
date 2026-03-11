import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { Diff } from "../../models/Diff.model";
import { loadImage } from "../../services/imageService";
import Dialog from "./Dialog";
import MergeResolver from "../repo/MergeResolver";
import { notify } from "../../utils/notifications";
import { saveFile } from "../../services/gitService";

type Props = {
  diff: Diff;
  class: string;
  file: string;
  onSaveSuccess?: () => void;
  onMergeStatusChange?: (active: boolean) => void;
};

type DiffLine = {
  type: "add" | "del" | "ctx" | "hunk";
  oldLine?: number;
  newLine?: number;
  content: string;
};

function parseDiff(diff: string): DiffLine[] {
  if (!diff) return [];
  
  const lines = diff.split("\n");
  const result: DiffLine[] = [];

  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    if (line.startsWith("diff --git") || line.startsWith("index ") || line.startsWith("new file mode")) {
      continue; // pula cabeçalhos
    }

    if (line.startsWith("@@")) {
      // hunk header → @@ -1,3 +1,4 @@
      const match = /@@ -(\d+),?\d* \+(\d+),?\d* @@/.exec(line);
      if (match) {
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[2], 10);
      }
      result.push({ type: "hunk", content: line });
      continue;
    }

    if (line.startsWith("+")) {
      result.push({ type: "add", newLine: newLine++, content: line });
    } else if (line.startsWith("-")) {
      result.push({ type: "del", oldLine: oldLine++, content: line });
    } else {
      result.push({ type: "ctx", oldLine: oldLine++, newLine: newLine++, content: line });
    }
  }

  return result;
}

export default function DiffViewer(props: Props) {
  const diffLines = () => parseDiff(props.diff.diff);
  const [showMergeResolver, setShowMergeResolver] = createSignal(false);

  const isBinary = createMemo(() => {
    const d = props.diff.diff || "";
    const lines = d.split("\n");

    return (
      lines.some(
        (line) =>
          line.startsWith("Binary files ") ||
          line.startsWith("GIT binary patch")
      ) && !d.includes("\n+")
    );
  });
  const [oldImg, setOldImg] = createSignal<string>();
  const [newImg, setNewImg] = createSignal<string>();

  createEffect(() => {
    props.onMergeStatusChange?.(showMergeResolver());
  });

  createEffect(async () => {
    if (props.diff.oldFile) {
      const base64 = await loadImage(props.diff.oldFile);
      setOldImg(base64);
    }
    if (props.diff.newFile) {
      const base64 = await loadImage(props.diff.newFile);
      setNewImg(base64);
    }
  });

  const hasConflict = createMemo(() => {
    const diff = props.diff.diff || "";
    return diff.includes("<<<<<<<") && diff.includes("=======") && diff.includes(">>>>>>>");
  });

  const saveFileOnSave = async (resolvedContent: string) => {
    console.log('diff', props.diff);
    console.log('file', props.file);
    debugger;
    try {
      await saveFile(props.diff.newFile, resolvedContent);
      notify.success("Sucesso", "Conflitos resolvidos e salvos!");
      setShowMergeResolver(false);
      props.onSaveSuccess?.(); // Avisa o LocalChanges para recarregar
    } catch (err) {
      notify.error("Erro ao salvar", String(err));
    }
  }
  console.log("hasConflict", props);

  return (
    <>
      <Show when={isBinary() && !hasConflict()}>
        <div class="flex gap-4 p-4 border border-gray-300 dark:border-gray-700 rounded-md my-1">
          <div class="flex-1 text-center"> 
            <p class="text-sm text-gray-500">Versão antiga</p>
            <Show when={oldImg()} fallback={<p class="text-gray-400">Não disponível</p>}>
              <img src={oldImg()} alt="Versão antiga" class="max-w-full max-h-96 object-contain mx-auto border" />
            </Show>
          </div>
          <div class="flex-1 text-center">
            <p class="text-sm text-gray-500">Versão nova</p>
            <Show when={newImg()} fallback={<p class="text-gray-400">Não disponível</p>}>
              <img src={newImg()} alt="Versão nova" class="max-w-full max-h-96 object-contain mx-auto border" />
            </Show>
          </div>
        </div>
      </Show>
      <Show when={!isBinary() && !hasConflict()}>
        <div class="font-mono text-sm border border-gray-300 dark:border-gray-700 rounded-md overflow-hidden my-1">
          <table class="w-full border-collapse">
            <tbody>
              <For each={diffLines()}>
                {(line) => (
                  <tr
                    class={
                      line.type === "add"
                        ? "bg-green-100 dark:bg-green-300 dark:text-black"
                        : line.type === "del"
                        ? "bg-red-100 dark:bg-red-300 dark:text-black"
                        : line.type === "hunk"
                        ? "bg-gray-200 dark:bg-gray-700 font-bold"
                        : ""
                    }
                  >
                    {/* Número linha antiga */}
                    <td class="w-12 text-right px-2 text-gray-500 select-none border-r border-gray-300 dark:border-gray-600">
                      <Show when={line.oldLine !== undefined}>{line.oldLine}</Show>
                    </td>
                    {/* Número linha nova */}
                    <td class="w-12 text-right px-2 text-gray-500 select-none border-r border-gray-300 dark:border-gray-600">
                      <Show when={line.newLine !== undefined}>{line.newLine}</Show>
                    </td>
                    <td class="px-2 whitespace-pre-wrap">
                      {line.content}
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
     </Show>
     <Show when={hasConflict()}>
        <div class="bg-yellow-100 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200 p-4 rounded-md m-2 border border-yellow-400 flex justify-between items-center">
          <div>
            <strong>⚠️ Conflito detectado:</strong> Este arquivo possui partes conflitantes que precisam ser resolvidas manualmente.
          </div>
          <button
            class="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded text-sm"
            onClick={() => setShowMergeResolver(true)}
          >
            Resolver agora
          </button>
        </div>
      </Show>
      <Dialog open={showMergeResolver()} title="Resolver Conflitos" onClose={() => setShowMergeResolver(false)} width="1200px">
        <MergeResolver diffContent={props.diff.diff} onClose={() => setShowMergeResolver(false)} onSave={(resolvedContent) => saveFileOnSave(resolvedContent)} />
      </Dialog>
    </>
  );
}
