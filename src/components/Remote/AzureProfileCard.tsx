import { createResource, Show, For, createSignal, createMemo } from "solid-js";
import { azureService } from "../../services/azure";
import { useRepoContext } from "../../context/RepoContext";
import { useApp } from "../../context/AppContext";

export default function AzureProfileCard() {
  const { user, mutateUser } = useRepoContext();
  const { t } = useApp();

  const azureData = createMemo(() => user()?.azure);
  
  const minWidth = 250;
  const maxWidth = 500;
  const [sidebarWidth, setSidebarWidth] = createSignal(300);
  const [isResizing, setIsResizing] = createSignal(false);

  const [extraData] = createResource(
    () => azureData()?.login,
    async () => {
      return {
        location: "Azure DevOps Workspace",
        organizations: [
          { name: "DefaultCollection", imageUrl: "" }
        ]
      };
    }
  );

  const handleLogout = async () => {
    await azureService.logout();
    mutateUser(null);
  };

  const onMouseMove = (e: MouseEvent) => {
    if (isResizing()) {
      let newWidth = e.clientX;
      if (newWidth < minWidth) newWidth = minWidth;
      if (newWidth > maxWidth) newWidth = maxWidth;
      setSidebarWidth(newWidth);
    }
  };

  return (
    <div 
      class="flex h-full w-full select-none bg-gray-200 dark:bg-gray-900 overflow-hidden p-2"
      onMouseMove={onMouseMove}
      onMouseUp={() => setIsResizing(false)}
      onMouseLeave={() => setIsResizing(false)}
    >
      {/* PAINEL LATERAL (PERFIL) */}
      <div 
        class="container-branch-list p-0 flex flex-col" 
        style={{ width: `${sidebarWidth()}px`}}
      >
        <div class="pb-6 flex-1 overflow-y-auto custom-scrollbar flex flex-col h-full">
          
          <div class="relative flex justify-center mb-4 mt-4">
            <div class="relative">
              <img 
                src={azureData()?.avatar_url} 
                class="w-32 h-32 rounded-full border-4 border-blue-500/30 dark:border-blue-500/20 shadow-xl object-cover bg-gray-800" 
                onError={(e) => {
                  e.currentTarget.src = "https://www.gravatar.com/avatar/?d=mp";
                }}
              />
              <span class="absolute bottom-1 right-2 bg-blue-500 text-white p-1.5 rounded-full shadow-lg flex items-center justify-center border-2 border-white dark:border-gray-800">
                <i class="fa-solid fa-cloud text-[10px]"></i>
              </span>
            </div>
          </div>

          <div class="mb-4 px-4 text-center">
            <h3 class="text-xl font-bold dark:text-white truncate">
                {azureData()?.login || "Usuário Azure"}
            </h3>
            <p class="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">{azureData()?.login}</p>
          </div>

          <div class="border-y border-gray-200 dark:border-gray-700/50 py-3 px-4 mb-6 bg-gray-50/50 dark:bg-gray-800/30">
            <span class="text-[9px] uppercase text-gray-400 font-bold tracking-widest block mb-1">{t('provider').provider_identified}</span>
            <div class="flex items-center gap-2 text-xs font-semibold text-blue-500 dark:text-blue-400">
              <i class="fa-brands fa-microsoft text-sm"></i>
              <span>Microsoft Entra ID</span>
            </div>
          </div>

          <div class="space-y-4 px-4 flex-1">
            <div class="space-y-2">
              <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <i class="fa-solid fa-envelope w-4 text-gray-400"></i>
                <span class="truncate">{azureData()?.login}</span>
              </div>
              <Show when={extraData()?.location}>
                <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <i class="fa-solid fa-briefcase w-4 text-gray-400"></i>
                  <span>{extraData()?.location}</span>
                </div>
              </Show>
            </div>

            {/* SEÇÃO DE ORGANIZAÇÕES / COLLECTIONS DA AZURE */}
            <div class="pt-4">
              <p class="text-[10px] font-black text-gray-400 uppercase mb-3 tracking-widest">{t('provider').activated_colections}</p>
              <div class="space-y-2">
                <For each={extraData()?.organizations || []}>
                  {(org: any) => (
                    <div class="flex items-center gap-2 p-2 bg-white dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700/60 shadow-sm">
                      <div class="w-6 h-6 rounded bg-blue-600/10 text-blue-500 flex items-center justify-center font-bold text-xs">
                        {org.name.charAt(0).toUpperCase()}
                      </div>
                      <span class="text-xs font-semibold dark:text-gray-300 truncate">{org.name}</span>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </div>

          {/* BOTÃO DE LOGOUT */}
          <div class="px-4 mt-auto pt-6">
            <button onClick={handleLogout} class="w-full py-2 bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 
                                                  rounded-xl font-bold text-[10px] hover:bg-red-200 dark:hover:bg-red-900/40 
                                                  transition-colors uppercase tracking-widest">
              {t('auth').disconnect}
            </button>
          </div>
        </div>
      </div>

      {/* BARRA DE REDIMENSIONAMENTO VERTICAL */}
      <div class="resize-bar-vertical" onMouseDown={() => setIsResizing(true)}></div>

      {/* ÁREA PRINCIPAL (DIREITA) */}
      <div class="flex-1 flex flex-col overflow-hidden">
        <div class="overflow-y-auto custom-scrollbar flex flex-col items-center justify-center" style={{ height: "calc(100vh - 124px)" }}>
          <div class="text-center p-8 max-w-sm">
            <div class="w-16 h-16 bg-blue-500/10 text-blue-500 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-4 border border-blue-500/20 shadow-inner">
              <i class="fa-solid fa-folder-tree"></i>
            </div>
            <h4 class="text-md font-bold dark:text-white mb-1">{t('provider').azure_enviremont}</h4>
            <p class="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
              {t('provider').azure_repo_descri}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}