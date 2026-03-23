import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { Diff } from "../../models/Diff.model";
import { loadImage } from "../../services/imageService";
import Dialog from "./Dialog";
import MergeResolver from "../repo/MergeResolver";
import { notify } from "../../utils/notifications";
import { saveFile } from "../../services/gitService";
import vsCodeIcon from "../../assets/vscode.png";
import forkIcon from "../../assets/fork.png";
import alertIcon from "../../assets/alert.png";
import { openVsCodeDiff } from "../../services/openService";

type Props = {
  path: string;
  diff: Diff;
  class: string;
  file: string;
  isStaged?: boolean;
  onSaveSuccess?: (file: string) => void;
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
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico'];
    const isImageExtension = imageExtensions.some(ext => props.file.toLowerCase().endsWith(ext));
    
    return (
      d.includes("Binary files") || 
      d.includes("GIT binary patch") || 
      (isImageExtension && d.includes("new file mode"))
    );
  });
  const [oldImg, setOldImg] = createSignal<string>();
  const [newImg, setNewImg] = createSignal<string>();

  createEffect(() => {
    props.onMergeStatusChange?.(showMergeResolver());
  });

  createEffect(async () => {
    if (props.diff.oldFile) {
      try {
        const base64 = await loadImage(props.diff.oldFile);
        setOldImg(base64);
      } catch {
        setOldImg(undefined);
      }
    } else {
      setOldImg(undefined);
    }
    if (props.diff.newFile) {
      try {
        const base64 = await loadImage(props.diff.newFile);
        setNewImg(base64);
      } catch (error) {
        setNewImg(undefined);
      }
    } else {
      setNewImg(undefined);
    }
  });

  const hasConflict = createMemo(() => {
    const diff = props.diff.diff || "";
    return diff.includes("<<<<<<<") && diff.includes("=======") && diff.includes(">>>>>>>");
  });

  const saveFileOnSave = async (resolvedContent: string) => {
    try {
      await saveFile(props.diff.newFile, resolvedContent);
      notify.success("Sucesso", "Conflitos resolvidos e salvos!");
      setShowMergeResolver(false);
      if (props.diff.newFile) {
        props.onSaveSuccess?.(props.diff.newFile);
      }
    } catch (err) {
      notify.error("Erro ao salvar", String(err));
    }
  }
  console.log("hasConflict", props);

  return (
    <>
      <Show when={isBinary() && !hasConflict()}>
        <div class="h-[100%] py-2">
          <div class="flex gap-4 p-4 border border-gray-300 dark:border-gray-900 rounded-md h-[100%] items-center">
            <div class="flex-1 flex flex-col items-center justify-center h-[100%] border-r dark:border-gray-900"> 
              <p class="text-sm text-gray-500 mb-auto">Versão antiga</p>
              <Show when={oldImg()} fallback={<p class="text-gray-400 mb-auto">Não disponível</p>}>
                <img src={oldImg()} alt="Versão antiga" class="max-w-full max-h-96 object-contain mx-auto mb-auto" />
              </Show>
            </div>
            <div class="flex-1 flex flex-col items-center justify-center h-[100%] border-r-1 dark:border-r-gray-500">
              <p class="text-sm text-gray-500 mb-auto">Versão nova</p>
              <Show when={newImg()} fallback={<p class="text-gray-400 mb-auto">Não disponível</p>}>
                <img src={newImg()} alt="Versão nova" class="max-w-full max-h-96 object-contain mx-auto mb-auto" />
              </Show>
            </div>
          </div>
        </div>
      </Show>
      <Show when={!isBinary() && (!hasConflict() || (hasConflict() && props.isStaged))}>
        <div class="h-[100px] py-2">
          <div class="font-mono text-sm border border-gray-300 dark:border-gray-700 rounded-md overflow-hidden">
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
                      <td class="px-2 whitespace-pre-wrap select-text">
                        {line.content}
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </div>
     </Show>
     <Show when={hasConflict() && !props.isStaged}>
        <div class="flex flex-col items-center justify-center h-full w-full h-100 p-8 text-center rounded-lg">
          {/* Ícone Hero Centralizado */}
          <div class="relative flex items-center justify-center w-32 h-32 mb-8 rounded-full bg-gradient-to-br shadow-2xl">
            <img src={forkIcon} class="inline h-100 w-100" />
            {/* Ponto de exclamação de alerta */}
            <div class="absolute -bottom-2 -right-2 p-2">
              <img src={alertIcon} class="h-12 w-12" />
            </div>
          </div>

          {/* Título e Descrição */}
          <h2 class="text-3xl font-bold text-black dark:text-white mb-3">Conflito Detectado em README.md</h2>
          <p class="text-slate-400 text-lg max-w-xl mb-10">
            As alterações na branch atual e na branch remota entram em conflito. Escolha como prosseguir.
          </p>

          {/* Grupo de Botões de Ação */}
          <div class="flex items-center gap-6 mb-8">
            <button
              onClick={() => setShowMergeResolver(true)}
              class="flex items-center gap-3 px-4 py-2 rounded-lg text-lg font-semibold bg-blue-500 hover:bg-blue-400 text-white transition-colors duration-200 shadow-md group"
            >
              Resolver conflito
            </button>

            <button
              class="flex items-center gap-3 px-4 py-2 rounded-lg text-lg font-medium bg-gray-200 hover:bg-gray-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-gray-800 dark:text-slate-200 transition-colors duration-200 shadow group"
              onClick={() => {
                openVsCodeDiff(props.path, props.file);
              }}
            >
              <img src={vsCodeIcon} class="inline h-6" />
              Ver merge no VS Code
            </button>
          </div>
        </div>
      </Show>
      <Dialog open={showMergeResolver()} title="Resolver Conflitos" onClose={() => setShowMergeResolver(false)} width="1200px">
        <MergeResolver diffContent={props.diff.diff} 
          onClose={() => setShowMergeResolver(false)} 
          onSave={(resolvedContent) => saveFileOnSave(resolvedContent)} 
        />
      </Dialog>
    </>
  );
}
