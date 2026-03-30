import { createSignal, Show, For, createEffect } from "solid-js";
import { getGravatarUrl } from "../../services/gravatarService";
import { formatDate } from "../../utils/date";
import { getCommitFileDiff } from "../../services/gitService";
import DiffViewer from "../ui/DiffViewer";
import { notify } from "../../utils/notifications";
import FileIcon from "../ui/FileIcon";
import CommitMessage from "../ui/CommitMessage";
import { UserProfileDialog } from "../Config/UserProfile";

export function CommitDetails(props: { commit: any; repoPath: string, branch: string, selectCommit: (hash: string) => void }) {
  const [activeTab, setActiveTab] = createSignal<"geral" | "arquivos">("geral");
  const [selectedFile, setSelectedFile] = createSignal<any>(null);
  const [fileDiff, setFileDiff] = createSignal<any>(null);
  const [lastProcessedHash, setLastProcessedHash] = createSignal<string | null>(null);
  const [loadingDiff, setLoadingDiff] = createSignal(false);
  const [modalUserProfileOpen, setModalUserProfileOpen] = createSignal(false);

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
    const currentCommit = props.commit;
    
    if (!currentCommit) {
      setSelectedFile(null);
      setFileDiff(null);
      setLastProcessedHash(null);
      return;
    }

    const currentHash = currentCommit.hash;

    if (currentHash !== lastProcessedHash()) {
      setLastProcessedHash(currentHash);
      
      const files = currentCommit.files;
      if (files && files.length > 0) {
        fetchFileDiff(files[0]);
      } else {
        setSelectedFile(null);
        setFileDiff(null);
      }
    }
  });

  return (
    <div class="flex flex-col h-full bg-white dark:bg-gray-800">
      <Show when={!props.commit} fallback={
        <>
          {/* Navegação de Abas */}
          <div class="flex border-b border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-900 px-4">
            <button
              onClick={() => setActiveTab("geral")}
              class={`px-4 py-2 text-sm font-medium transition-colors rounded-t-xl ${
                activeTab() === "geral" 
                ? "bg-white dark:bg-gray-800" 
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 hover:dark:text-gray-300"
              }`}
            >
              <i class="fa fa-code-commit"></i> Geral
            </button>
            <button
              onClick={() => setActiveTab("arquivos")}
              class={`px-4 py-2 text-sm font-medium transition-colors rounded-t-xl ${
                activeTab() === "arquivos" 
                ? "bg-white dark:bg-gray-800" 
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 hover:dark:text-gray-300"
              }`}
            >
              <i class="fa fa-copy"></i> Arquivos ({props.commit?.files?.length || 0})
            </button>
          </div>

          <div class="flex-1 overflow-auto">
            {/* CONTEÚDO: ABA GERAL */}
            <Show when={activeTab() === "geral"}>
              <div class="space-y-4 p-4">
                <div class="container-branch-list flex flex-row items-center">
                  <img
                    src={getGravatarUrl(props.commit.authorEmail, 80)}
                    alt={props.commit.authorName}
                    onClick={() => setModalUserProfileOpen(true)}
                    class="w-[60px] h-[60px] rounded-full shadow-sm CURSOR-POINTER"
                  />
                  <div class="ml-4 !mt-0 select-text">
                    <div class="font-bold text-gray-900 dark:text-gray-100 clicked_label" onClick={() => setModalUserProfileOpen(true)}>
                      {props.commit.authorName}
                    </div>
                    <div class="text-gray-500 dark:text-gray-200 text-sm">{props.commit.authorEmail}</div>
                    <div class="text-gray-500 dark:text-gray-400 text-sm">{formatDate(props.commit.authorDate)}</div>
                  </div>
                </div>

                <div class="flex">
                  <div class="container-branch-list flex-1 mr-2">
                    <div class="flex mt-0 select-text">
                      <div>
                        <b class="text-2x1"><CommitMessage message={props.commit.subject} /></b> <br />
                        <p class="whitespace-pre-wrap mt-2 text-sm text-gray-500 dark:text-gray-400">{props.commit.body}</p>
                      </div>
                    </div>
                  </div>

                  <div class="container-branch-list ml-auto">
                    <div class="text-smselect-text">
                      <b class="w-[60px] text-right">SHA:</b> <br />
                      <span class="font-mono text-sm text-gray-600 dark:text-gray-200 select-text">
                        {props.commit.hash}
                      </span>
                    </div>

                    <Show when={props.commit?.parents?.length > 0}>
                      <div class="text-sm select-text mb-2">
                        <b class="w-[60px] text-right mt-1">Parents:</b> <br />
                        <div class="flex flex-wrap gap-2">
                          <For each={props.commit.parents}>
                            {(parentHash) => (
                              <span 
                                onClick={() => props.selectCommit(parentHash)}
                                class="font-mono text-xs bg-gray-100 dark:bg-gray-800 hover:bg-blue-100 dark:hover:bg-gray-900 rounded-xl
                                      text-blue-600 dark:text-white px-2 py-1 cursor-pointer transition-colors border border-gray-300 dark:border-gray-600"
                                title={parentHash}
                              >
                                {parentHash.substring(0, 8)}
                              </span>
                            )}
                          </For>
                        </div>
                      </div>
                    </Show>
                  </div>
                </div>
              </div>
            </Show>

            {/* CONTEÚDO: ABA ARQUIVOS */}
            <Show when={activeTab() === "arquivos"}>
            <div class="flex h-full">
              {/* Sidebar de arquivos */}
              <div class="w-1/3 overflow-y-auto p-1">
                <For each={props.commit.files}>
                  {(f) => (
                    <div 
                      onClick={() => fetchFileDiff(f)}
                      class={`flex items-center p-2 text-xs cursor-pointer border-b dark:border-gray-900 
                        rounded-xl my-1 hover:bg-blue-500/10 
                        ${selectedFile()?.file === f.file ? 'bg-blue-500/20 dark:bg-blue-400/30' : 'bg-gray-100 dark:bg-gray-700'}`}
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
      <Show when={modalUserProfileOpen()}>
        <UserProfileDialog 
          repoPath={props.repoPath} 
          branch={props.branch || ""}
          email={props.commit?.authorEmail}
          fallbackName={props.commit?.authorName} 
          open={modalUserProfileOpen()}
          onClose={() => setModalUserProfileOpen(false)}
        />
      </Show>
    </div>
  );
}