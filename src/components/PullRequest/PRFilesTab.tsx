import { createResource, createSignal, For, Show, createMemo } from "solid-js";
import { githubService } from "../../services/github";
import FileIcon from "../ui/FileIcon";
import DiffViewer from "../ui/DiffViewer";

export default function PRFilesTab(props: { owner: string, repoName: string, prNumber: number }) {
  const [selectedFilePath, setSelectedFilePath] = createSignal<string | null>(null);
  const [searchTerm, setSearchTerm] = createSignal("");

  // 1. Busca a lista estruturada de arquivos (para a sidebar)
  const [files] = createResource(
    () => ({ owner: props.owner, name: props.repoName, number: props.prNumber }),
    async (p) => await githubService.getPRFiles(p.owner, p.name, p.number)
  );

  // 2. Busca o Diff bruto do PR (para o DiffViewer)
  const [rawDiff] = createResource(
    () => ({ owner: props.owner, name: props.repoName, number: props.prNumber }),
    async (p) => await githubService.getPRFileDiff(p.owner, p.name, p.number)
  );

  const getFileName = (path: string) => path.split('/').pop() || "";

  // Filtro de busca na sidebar
  const filteredFiles = createMemo(() => {
    const list = files() || [];
    return list.filter((f: any) => f.path.toLowerCase().includes(searchTerm().toLowerCase()));
  });

  const currentFileDiff = createMemo(() => {
    const fullDiff = rawDiff(); // O texto com todos os arquivos do PR
    const targetPath = selectedFilePath();
    
    if (!fullDiff || !targetPath) return "";

    // 1. Dividimos o diff total em blocos, cada um começando com "diff --git "
    const parts = fullDiff.split(/^diff --git /m);
    
    // 2. Procuramos a parte que menciona o caminho do arquivo selecionado
    // O GitHub usa o formato a/caminho b/caminho
    const targetPart = parts.find(p => p.includes(`a/${targetPath} b/${targetPath}`));

    if (!targetPart) return "";

    // 3. Retornamos o bloco remontado (o split remove o separador, então readicionamos)
    return `diff --git ${targetPart}`;
  });

  return (
    <div class="flex flex-1 bg-white dark:bg-gray-800 rounded-b-xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-2xl">
      
      {/* SIDEBAR DE ARQUIVOS (Estilo Commit Details) */}
      <div class="w-1/3 border-r border-gray-200 dark:border-gray-900 flex flex-col bg-gray-50 dark:bg-gray-900/50">
        <div class="p-3">
           <div class="relative">
             <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-[10px]"></i>
             <input 
              type="text" 
              placeholder="Buscar arquivo..." 
              onInput={(e) => setSearchTerm(e.currentTarget.value)}
              class="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg pl-8 pr-3 py-1.5 text-[11px] outline-none focus:border-blue-500 transition-all dark:text-white"
             />
           </div>
        </div>
        
        <div class="flex-1 overflow-y-auto custom-scrollbar p-2">
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
        </div>
      </div>

      {/* ÁREA DO DIFF (Estilo Commit Details) */}
      <div class="flex-1 bg-white dark:bg-gray-800 overflow-auto custom-scrollbar relative">
        <Show when={selectedFilePath()} fallback={
          <div class="h-full flex flex-col items-center justify-center text-gray-400 opacity-30">
            <i class="fa-solid fa-code-compare text-5xl mb-4"></i>
            <p class="text-[10px] font-black uppercase tracking-[0.3em]">Selecione um arquivo para ver as mudanças</p>
          </div>
        }>
          <div class="sticky top-0 z-10 bg-gray-100 dark:bg-gray-900 px-4 py-2 border-b dark:border-gray-700 flex justify-between items-center">
             <div class="flex items-center gap-2">
                <FileIcon fileName={getFileName(selectedFilePath()!)} />
                <span class="text-[11px] font-mono font-bold dark:text-gray-300">{selectedFilePath()}</span>
             </div>
          </div>

          <div class="p-0">
             <Show when={!rawDiff.loading} fallback={<div class="p-8 animate-pulse space-y-2"><div class="h-4 bg-gray-700 rounded w-full"></div><div class="h-4 bg-gray-700 rounded w-3/4"></div></div>}>
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