import { createResource, For, Show, createSignal, createEffect } from "solid-js";
import { githubService } from "../../services/github";
import Dialog from "../ui/Dialog";
import { GROUP_COLORS } from "../../utils/file";
import { azureService } from "../../services/azure";
import { useApp } from "../../context/AppContext";

export default function RemoteRepoModal(props: { 
  isOpen: boolean, 
  providerId: string, 
  onClose: () => void, 
  onSelect: (url: string) => void 
}) {
  const [search, setSearch] = createSignal("");
  const [selectedProject, setSelectedProject] = createSignal<string | null>(null);
  const { t } = useApp();

  // Toda vez que fechar ou mudar de provedor, limpa o projeto selecionado
  createEffect(() => {
    if (!props.isOpen || props.providerId) {
      setSelectedProject(null);
      setSearch("");
    }
  });

  const [items, { refetch }] = createResource(
    () => ({ open: props.isOpen, id: props.providerId, project: selectedProject() }), 
    async ({ open, id, project }) => {
      if (!open) return [];
      
      if (id === 'github') {
        return await githubService.getUserRepositories();
      } 
      
      if (id === 'azure') {
        // Se não escolheu o projeto, lista os PROJETOS primeiro
        if (!project) {
          return await azureService.getUserProjects();
        } else {
          // Se escolheu, lista os REPOSITÓRIOS daquele projeto
          return await azureService.getProjectRepositories(project);
        }
      }
      
      return [];
    }
  );

  const filteredItems = () => {
    const list = items() || [];
    return list.filter((item: any) => 
      (item.name || "").toLowerCase().includes(search().toLowerCase())
    );
  };

  const getLangColor = (lang: string) => {
    if (lang === 'Azure Git') return "#0078d4";
    return GROUP_COLORS[lang] || "#8b949e";
  };

  const handleItemClick = (item: any) => {
    if (item.isProject) {
      // Avança para o nível dos repositórios
      setSearch("");
      setSelectedProject(item.name);
    } else {
      // Seleciona a URL limpa para clonar
      props.onSelect(item.html_url);
    }
  };

  return (
    <Dialog 
      open={props.isOpen} 
      title={
        props.providerId === 'github' 
          ? t('repository').select_repository + ' (GitHub)' 
          : `Azure DevOps ${selectedProject() ? `> ${selectedProject()}` : '> ' + t('provider').projects}`
      } 
      onClose={props.onClose}
      width="650px"
      height="70vh"
      bodyClass="p-0 flex flex-col h-full !overflow-hidden bg-white dark:bg-gray-800"
    >
      {/* Barra de Filtro e Controle */}
      <div class="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex-shrink-0 flex items-center gap-3">
        
        {/* Botão Voltar (Apenas visível se estiver dentro de um projeto do Azure) */}
        <Show when={props.providerId === 'azure' && selectedProject()}>
          <button 
            onClick={() => setSelectedProject(null)}
            class="px-3 py-1.5 text-xs font-bold rounded-md bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-blue-500 hover:text-white dark:hover:bg-blue-600 transition-all flex items-center gap-1.5 shrink-0"
          >
            <i class="fa-solid fa-arrow-left"></i>
            <span>{t('provider').projects}</span>
          </button>
        </Show>

        <div class="relative flex-1">
          <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
          <input 
            type="text" 
            placeholder={
              props.providerId === 'github' 
                ? "Find a GitHub repository..." 
                : (selectedProject() ? "Buscar repositório neste projeto..." : "Filtrar projetos do Azure...")
            }
            value={search()}
            class="w-full pl-9 pr-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            onInput={(e) => setSearch(e.currentTarget.value)}
            autofocus
          />
        </div>
      </div>

      {/* Lista Principal */}
      <div class="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
        <Show when={!items.loading} fallback={
          <div class="flex flex-col items-center justify-center p-20 gap-3 text-gray-500">
            <i class="fa-solid fa-circle-notch animate-spin text-2xl"></i>
            <span class="text-sm font-medium">{t('loading').data}</span>
          </div>
        }>
          <For each={filteredItems()}>
            {(item) => (
              <button 
                onClick={() => handleItemClick(item)}
                class="w-full text-left p-4 border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-blue-900/10 transition-colors group"
              >
                <div class="flex items-start justify-between">
                  <div class="flex-1">
                    <div class="flex items-center gap-2">
                      {/* Ícone customizado baseado se é uma pasta de projeto ou um repositório Git */}
                      <i class={item.isProject ? "fa-solid fa-folder text-amber-500 text-sm" : "fa-solid fa-code-branch text-blue-500 text-sm"}></i>
                      
                      <span class="text-blue-600 dark:text-blue-400 font-semibold text-base group-hover:underline">
                        {item.name}
                      </span>
                      
                      <Show when={!item.isProject}>
                        <span class="text-[10px] px-2 py-0.5 rounded-full border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 font-bold uppercase">
                          Private
                        </span>
                      </Show>
                    </div>
                    
                    <p class="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-1 pl-5">
                      {item.description}
                    </p>

                    <Show when={!item.isProject}>
                      <div class="flex items-center gap-4 mt-3 text-[11px] text-gray-500 dark:text-gray-400 pl-5">
                        <div class="flex items-center gap-1.5 font-medium">
                          <span class="w-2.5 h-2.5 rounded-full" style={{ "background-color": getLangColor(item.language) }}></span>
                          {item.language}
                        </div>
                      </div>
                    </Show>
                  </div>
                  
                  <div class="opacity-0 group-hover:opacity-100 transition-opacity self-center">
                     <i class={item.isProject ? "fa-solid fa-folder-open text-blue-500" : "fa-solid fa-chevron-right text-blue-500"}></i>
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