import { createResource, For, Show, createSignal } from "solid-js";
import { githubService } from "../../services/github";
import Dialog from "../ui/Dialog";
import { GROUP_COLORS } from "../../utils/file";

export default function RemoteRepoModal(props: { 
  isOpen: boolean, 
  providerId: string,
  onClose: () => void, 
  onSelect: (url: string) => void 
}) {
  const [search, setSearch] = createSignal("");

  const [repos] = createResource(
    () => ({ open: props.isOpen, id: props.providerId }), 
    async ({ open, id }) => {
      if (open && id === 'github') {
        const data = await githubService.getUserRepositories();
        console.log("Repos recebidos:", data); // Debug para ver se updated_at existe
        return data;
      }
      return [];
    }
  );

  const filteredRepos = () => {
    const list = repos() || [];
    return list.filter((r: any) => 
      (r.name || r.full_name || "").toLowerCase().includes(search().toLowerCase())
    );
  };

  const getLangColor = (lang: string) => {
    return GROUP_COLORS[lang] || "#8b949e";
  };

  return (
    <Dialog 
      open={props.isOpen} 
      title="Selecionar Repositório Remoto" 
      onClose={props.onClose}
      width="650px"
      height="70vh"
      bodyClass="p-0 flex flex-col h-full !overflow-hidden bg-white dark:bg-gray-800"
    >
      {/* Barra de Filtro - Fixa no topo */}
      <div class="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex-shrink-0">
        <div class="relative">
          <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
          <input 
            type="text" 
            placeholder="Find a repository..."
            class="w-full pl-9 pr-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            onInput={(e) => setSearch(e.currentTarget.value)}
            autofocus
          />
        </div>
      </div>

      {/* Lista de Repos - Única área com scroll */}
      <div class="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
        <Show when={!repos.loading} fallback={
          <div class="flex flex-col items-center justify-center p-20 gap-3 text-gray-500">
            <i class="fa-solid fa-circle-notch animate-spin text-2xl"></i>
            <span class="text-sm font-medium">Buscando no GitHub...</span>
          </div>
        }>
          <For each={filteredRepos()}>
            {(repo) => (
              <button 
                onClick={() => props.onSelect(repo.html_url)}
                class="w-full text-left p-4 border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-blue-900/10 transition-colors group"
              >
                <div class="flex items-start justify-between">
                  <div class="flex-1">
                    <div class="flex items-center gap-2">
                      <span class="text-blue-600 dark:text-blue-400 font-semibold text-base group-hover:underline">
                        {repo.name}
                      </span>
                      <span class="text-[10px] px-2 py-0.5 rounded-full border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 font-bold uppercase">
                        {repo.private ? 'Private' : 'Public'}
                      </span>
                    </div>
                    
                    <p class="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-1">
                      {repo.description || "No description provided."}
                    </p>

                    <div class="flex items-center gap-4 mt-3 text-[11px] text-gray-500 dark:text-gray-400">
                      <Show when={repo.language}>
                        <div class="flex items-center gap-1.5 font-medium">
                          <span class="w-2.5 h-2.5 rounded-full" style={{ "background-color": getLangColor(repo.language) }}></span>
                          {repo.language}
                        </div>
                      </Show>
                      
                      <Show when={repo.stargazers_count > 0}>
                        <div class="flex items-center gap-1">
                          <i class="fa-regular fa-star"></i>
                          {repo.stargazers_count}
                        </div>
                      </Show>

                      <span>Updated {repo.updated_at ? new Date(repo.updated_at).toLocaleDateString() : 'Recently'}</span>
                    </div>
                  </div>
                  
                  <div class="opacity-0 group-hover:opacity-100 transition-opacity self-center">
                     <i class="fa-solid fa-chevron-right text-blue-500"></i>
                  </div>
                </div>
              </button>
            )}
          </For>
        </Show>
      </div>
    </Dialog>
  );
}