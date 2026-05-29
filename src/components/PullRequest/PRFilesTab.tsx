import { createResource, createSignal, For, Show, createMemo } from "solid-js";
import { githubService } from "../../services/github";
import FileIcon from "../ui/FileIcon";
import DiffViewer from "../ui/DiffViewer";
import { useApp } from "../../context/AppContext";
import { GitProvider } from "../../utils/gitProvider";
import { azureService } from "../../services/azure";

export default function PRFilesTab(props: { 
  owner: string, 
  repoName: string, 
  prNumber: number, 
  provider: GitProvider
}) {
  const [selectedFilePath, setSelectedFilePath] = createSignal<string | null>(null);
  const [searchTerm, setSearchTerm] = createSignal("");
  const { t } = useApp();

  // 1. Busca a lista estruturada de arquivos de forma unificada
  const [files] = createResource(
    () => ({ owner: props.owner, name: props.repoName, number: props.prNumber, provider: props.provider }),
    async (p) => {
      if (p.provider === 'azure') {
        // Mapeia os dados da Azure DevOps para o padrão comum { path, additions, deletions }
        return await azureService.getPRChanges(p.owner, p.name, p.number);
      }
      return await githubService.getPRFiles(p.owner, p.name, p.number);
    }
  );

  // 2. Busca o Diff com comportamento bifurcado baseado no provedor
  const [rawDiff] = createResource(
    () => ({ owner: props.owner, name: props.repoName, number: props.prNumber, targetPath: selectedFilePath(), provider: props.provider }),
    async (p) => {
      if (!p.targetPath) return "";

      if (p.provider === 'azure') {
        // Puxa o diff cirúrgico do arquivo específico na Azure
        return await azureService.getPRFileDiffText(p.owner, p.name, p.number, p.targetPath);
      }

      // No GitHub, continuamos buscando o blocão bruto e cacheando na memória se preferir
      return await githubService.getPRFileDiff(p.owner, p.name, p.number);
    }
  );

  const getFileName = (path: string) => path.split('/').pop() || "";

  // Filtro de busca na sidebar
  const filteredFiles = createMemo(() => {
    const list = files() || [];
    return list.filter((f: any) => f.path.toLowerCase().includes(searchTerm().toLowerCase()));
  });

  // Memoizador inteligente de extração do bloco de Diff
  const currentFileDiff = createMemo(() => {
    const targetPath = selectedFilePath();
    if (!targetPath) return "";

    // Se for Azure, o recurso rawDiff já devolve o pedaço formatado sob demanda
    if (props.provider === 'azure') {
      return rawDiff() || "";
    }

    // Se for GitHub, mantém a lógica de partição por regex baseada no arquivo selecionado
    const fullDiff = rawDiff();
    if (!fullDiff) return "";

    const parts = fullDiff.split(/^diff --git /m);
    const targetPart = parts.find(p => p.includes(`a/${targetPath} b/${targetPath}`));

    if (!targetPart) return "";
    return `diff --git ${targetPart}`;
  });

  return (
    <div class="flex flex-1 bg-white dark:bg-gray-800 rounded-b-xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-2xl">
      
      {/* SIDEBAR DE ARQUIVOS */}
      <div class="w-1/3 border-r border-gray-200 dark:border-gray-900 flex flex-col bg-gray-50 dark:bg-gray-900/50">
        <div class="p-3">
           <div class="relative">
             <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-[10px]"></i>
             <input 
              type="text" 
              placeholder={t('file').search_files + '...'}
              onInput={(e) => setSearchTerm(e.currentTarget.value)}
              class="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg pl-8 pr-3 py-1.5 text-[11px] outline-none focus:border-blue-500 transition-all dark:text-white"
             />
           </div>
        </div>
        
        <div class="flex-1 overflow-y-auto custom-scrollbar p-2">
          <Show when={!files.loading} fallback={
            <div class="p-4 space-y-3">
              <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-3/4"></div>
              <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-5/6"></div>
            </div>
          }>
            <For each={filteredFiles()}>
              {(file) => (
                <div 
                  onClick={() => setSelectedFilePath(file.path)}
                  class={`flex items-center justify-between p-2 mb-1 rounded-xl cursor-pointer transition-all border ${
                    selectedFilePath() === file.path 
                    ? 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400' 
                    : 'bg-transparent border-transparent hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-500'
                  }`}
                >
                  <div class="flex items-center gap-2 truncate">
                    <FileIcon fileName={getFileName(file.path)} />
                    <span class="text-[11px] font-bold truncate">{getFileName(file.path)}</span>
                  </div>
                  <div class="flex gap-2 text-[9px] font-mono font-bold">
                    <span class="text-green-500">+{file.additions}</span>
                    <span class="text-red-500">-{file.deletions}</span>
                  </div>
                </div>
              )}
            </For>
          </Show>
        </div>
      </div>

      {/* ÁREA DO DIFF */}
      <div class="flex-1 bg-white dark:bg-gray-800 overflow-auto custom-scrollbar relative">
        <Show when={selectedFilePath()} fallback={
          <div class="h-full flex flex-col items-center justify-center text-gray-400 opacity-30">
            <i class="fa-solid fa-code-compare text-5xl mb-4"></i>
            <p class="text-[10px] font-black uppercase tracking-[0.3em]">{t('pr').select_file_see_changes}</p>
          </div>
        }>
          <div class="sticky top-0 z-10 bg-gray-100 dark:bg-gray-900 px-4 py-2 border-b dark:border-gray-700 flex justify-between items-center">
             <div class="flex items-center gap-2">
                <FileIcon fileName={getFileName(selectedFilePath()!)} />
                <span class="text-[11px] font-mono font-bold dark:text-gray-300">{selectedFilePath()}</span>
             </div>
          </div>

          <div class="p-0">
             <Show when={!rawDiff.loading} fallback={
               <div class="p-8 space-y-3 animate-pulse">
                 <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
                 <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
                 <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
               </div>
             }>
                <DiffViewer 
                  key={selectedFilePath()}
                  path="" 
                  file={selectedFilePath()!}
                  diff={{diff: currentFileDiff() || ""}}
                  class="text-[11px]"
                  isStaged={true} 
                />
             </Show>
          </div>
        </Show>
      </div>
    </div>
  );
}