import { createSignal, Show, For, createEffect } from "solid-js";
import { getGravatarUrl } from "../../services/gravatarService";
import { formatDate } from "../../utils/date";
import { getCommitFileDiff } from "../../services/gitService";
import DiffViewer from "../ui/DiffViewer";
import { notify } from "../../utils/notifications";
import FileIcon from "../ui/FileIcon";

export function CommitDetails(props: { commit: any; repoPath: string, selectCommit: (hash: string) => void }) {
  const [activeTab, setActiveTab] = createSignal<"geral" | "arquivos">("geral");
  const [selectedFile, setSelectedFile] = createSignal<any>(null);
  const [fileDiff, setFileDiff] = createSignal<any>(null);
  const [loadingDiff, setLoadingDiff] = createSignal(false);

  const fetchFileDiff = async (file: any) => {
    setSelectedFile(file);
    setLoadingDiff(true);
    try {
      const res = await getCommitFileDiff(props.repoPath, props.commit.hash, file.file);
      console.log("Diff recebido:", res);
      setFileDiff(res);
    } catch (e) {
      console.error(e);
      notify.error("Erro ao carregar diff", String(e));
    } finally {
      setLoadingDiff(false);
    }
  };

  const getFileNameFromPath = (path: string): string => {
    if (!path) {
      return "";
    }
    const parts = path.split(/[\\/]/);
    return parts[parts.length - 1];
  }

  createEffect(() => {
    const files = props.commit?.files;
    if (files && files.length > 0) {
      fetchFileDiff(files[0]);
    } else {
      setSelectedFile(null);
      setFileDiff(null);
    }
  });

  return (
    <div class="flex flex-col h-full bg-white dark:bg-gray-800">
      <Show when={!props.commit} fallback={
        <>
          {/* Navegação de Abas */}
          <div class="flex border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 px-4">
            <button
              onClick={() => setActiveTab("geral")}
              class={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab() === "geral" 
                ? "border-blue-500 text-blue-600 dark:text-blue-500" 
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 hover:dark:text-gray-300"
              }`}
            >
              Geral
            </button>
            <button
              onClick={() => setActiveTab("arquivos")}
              class={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab() === "arquivos" 
                ? "border-blue-500 text-blue-600 dark:text-blue-500" 
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 hover:dark:text-gray-300"
              }`}
            >
              Arquivos ({props.commit?.files?.length || 0})
            </button>
          </div>

          <div class="flex-1 overflow-auto">
            {/* CONTEÚDO: ABA GERAL */}
            <Show when={activeTab() === "geral"}>
              <div class="space-y-4 p-4">
                <div class="flex items-start">
                  <img
                    src={getGravatarUrl(props.commit.authorEmail, 80)}
                    alt={props.commit.authorName}
                    class="w-[60px] h-[60px] rounded shadow-sm"
                  />
                  <div class="ml-4 select-text">
                    <div class="font-bold text-gray-900 dark:text-gray-100">{props.commit.authorName}</div>
                    <div class="text-gray-500 dark:text-gray-200 text-sm">{props.commit.authorEmail}</div>
                    <div class="text-gray-500 dark:text-gray-400 text-sm">{formatDate(props.commit.authorDate)}</div>
                  </div>
                </div>

                <div class="flex text-sm items-center select-text">
                  <b class="w-[60px] text-right">SHA:</b>
                  <span class="font-mono text-sm text-gray-600 dark:text-gray-200 ml-4">
                    {props.commit.hash}
                  </span>
                </div>

                <Show when={props.commit?.parents?.length > 0}>
                  <div class="flex text-sm items-start select-text mb-2">
                    <b class="w-[60px] text-right mt-1">Parents:</b>
                    <div class="flex flex-wrap gap-2 ml-4">
                      <For each={props.commit.parents}>
                        {(parentHash) => (
                          <span 
                            onClick={() => props.selectCommit(parentHash)}
                            class="font-mono text-xs bg-gray-100 dark:bg-gray-800 hover:bg-blue-100 dark:hover:bg-gray-900 
                                  text-blue-600 dark:text-white px-2 py-1 rounded cursor-pointer transition-colors border border-gray-300 dark:border-gray-600"
                            title={parentHash}
                          >
                            {parentHash.substring(0, 8)}
                          </span>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>

                <hr />

                 <div class="flex mt-0 select-text">
                  <div class="w-[60px] text-right">{props.commit.hash.slice(0, 7)}:</div>
                  <div class="ml-4">
                    <b>{props.commit.subject}</b> <br />
                    <p class="whitespace-pre-wrap mt-2 text-sm text-gray-500 dark:text-gray-400">{props.commit.body}</p>
                  </div>
                </div>

                <hr />

              </div>
            </Show>

            {/* CONTEÚDO: ABA ARQUIVOS */}
            <Show when={activeTab() === "arquivos"}>
            <div class="flex h-full">
              {/* Sidebar de arquivos */}
              <div class="w-1/3 border-r dark:border-gray-900 overflow-y-auto">
                <For each={props.commit.files}>
                  {(f) => (
                    <div 
                      onClick={() => fetchFileDiff(f)}
                      class={`flex items-center p-2 text-xs cursor-pointer border-b dark:border-gray-900 hover:bg-blue-500/10 ${selectedFile()?.file === f.file ? 'bg-blue-500/20' : ''}`}
                    >
                      <FileIcon fileName={getFileNameFromPath(f.file)} /> <span class="ml-2">{getFileNameFromPath(f.file)}</span>
                    </div>
                  )}
                </For>
              </div>

              {/* Área do Diff */}
              <div class="w-2/3 overflow-y-auto bg-white dark:bg-gray-800">
                <Show when={selectedFile()} fallback={<div class="p-10 text-center text-gray-500 text-sm">Selecione um arquivo para ver o diff</div>}>
                  <Show when={!loadingDiff()}>
                    <DiffViewer 
                      path={props.repoPath}
                      file={selectedFile().file}
                      diff={fileDiff()}
                      class="text-xs"
                      isStaged={true}
                    />
                  </Show>
                </Show>
              </div>
            </div>
          </Show>
          </div>
        </>
      }>
        <div class="h-full flex items-center justify-center text-gray-400 italic">
          Selecione um commit para ver os detalhes
        </div>
      </Show>
    </div>
  );
}