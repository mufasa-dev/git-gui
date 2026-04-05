import { createResource, Show, For, createMemo, createSignal } from "solid-js";
import { githubService } from "../../services/githubService";
import { useRepoContext } from "../../context/RepoContext";
// @ts-ignore
import { marked } from "marked";
import MarkdownViewer from "../ui/MarkdownViewer";

export default function GithubProfileCard() {
  const { user, mutateUser } = useRepoContext();
  
  // Estados para o Resize (Consistente com RepoView)
  const minWidth = 250;
  const maxWidth = 500;
  const [sidebarWidth, setSidebarWidth] = createSignal(300);
  const [isResizing, setIsResizing] = createSignal(false);

  const [extraData] = createResource(
    () => user()?.login,
    async (login) => await githubService.getExtraProfileData(login)
  );

  const readmeHtml = createMemo(() => {
    const rawMd = extraData()?.readme;
    if (!rawMd) return "";
    // @ts-ignore
    return marked.parse(rawMd) as string;
  });

  const handleLogout = async () => {
    await githubService.logout();
    mutateUser(null);
  };

  // Funções de Resize
  const startResize = () => setIsResizing(true);
  const stopResize = () => setIsResizing(false);
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
      onMouseUp={stopResize}
      onMouseLeave={stopResize}
    >
      
      {/* PAINEL ESQUERDO (SIDEBAR DE PERFIL) */}
      <div 
        class="container-branch-list p-0 flex flex-col mb-2" 
        style={{ 
          width: `${sidebarWidth()}px`,
          height: "calc(100vh - 124px)" 
        }}
      >
        <div class="pb-6 flex-1 overflow-y-auto custom-scrollbar">
          <div class="relative flex justify-center mb-4 mt-4">
            <img 
              src={user().avatar_url} 
              class="w-32 h-32 rounded-full border-4 border-white dark:border-gray-700 shadow-xl object-cover bg-white" 
            />
          </div>

          <div class="mb-6 px-4">
            <h3 class="text-xl font-bold dark:text-white leading-tight truncate">{user().name || user().login}</h3>
            <p class="text-sm text-gray-500 font-medium tracking-wide">@{user().login}</p>
          </div>

          <div class="grid grid-cols-2 gap-4 py-4 px-2 border-y border-gray-100 dark:border-gray-700/50 mb-6">
            <div class="text-center">
              <span class="block text-lg font-black dark:text-white">{user().followers}</span>
              <span class="text-[10px] uppercase text-gray-400 font-bold tracking-widest">Seguidores</span>
            </div>
            <div class="text-center border-l dark:border-gray-700">
              <span class="block text-lg font-black dark:text-white">{user().following}</span>
              <span class="text-[10px] uppercase text-gray-400 font-bold tracking-widest">Seguindo</span>
            </div>
          </div>

          <Show when={user().bio}>
            <div class="mb-8 px-4">
               <p class="text-[10px] font-black text-gray-400 uppercase mb-2">Bio</p>
               <p class="text-xs text-gray-600 dark:text-gray-400 italic leading-relaxed">"{user().bio}"</p>
            </div>
          </Show>

          <Show when={extraData()?.orgs?.length > 0}>
            <div class="mt-auto pt-6 px-4 border-t dark:border-gray-700">
              <p class="text-[10px] font-black text-gray-400 uppercase mb-4 tracking-widest">Organizations</p>
              <div class="flex gap-3 flex-wrap">
                <For each={extraData()?.orgs}>
                  {(org: any) => (
                    <img 
                      src={org.avatar_url} 
                      title={org.login} 
                      class="w-8 h-8 rounded-lg border border-gray-100 dark:border-gray-700 hover:scale-110 transition-transform cursor-help" 
                    />
                  )}
                </For>
              </div>
            </div>
          </Show>
          
          <div class="px-4 mt-6">
            <button 
              onClick={handleLogout} 
              class="w-full py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl font-bold text-[10px] hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors uppercase tracking-widest"
            >
              Desconectar Conta
            </button>
          </div>
        </div>
      </div>

      {/* BARRA DE RESIZE (Igual ao RepoView) */}
      <div
        class="resize-bar-vertical"
        onMouseDown={startResize}
      ></div>

      {/* CONTEÚDO PRINCIPAL (README) */}
      <div class="flex-1 flex flex-col overflow-hidden">
        <div class="overflow-y-auto custom-scrollbar" style={{ height: "calc(100vh - 124px)" }}>
          <div class="container-branch-list p-6 select-text">
            <Show when={!extraData.loading} fallback={
              <div class="animate-pulse space-y-6">
                <div class="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
                <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
                <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
              </div>
            }>
              <Show 
                when={extraData()?.readme} 
                fallback={<div class="py-20 text-center text-gray-400 italic">O README não foi encontrado para este perfil.</div>}
              >
                <div class="flex items-center gap-2 mb-6 text-gray-400 text-[10px] font-black uppercase tracking-[0.2em]">
                  <i class="fa-solid fa-terminal text-blue-500"></i>
                  <span>{user().login} / PROFILE_README.md</span>
                </div>
                
                <MarkdownViewer content={extraData()?.readme || ""} />
              </Show>
            </Show>
          </div>
          
          <div class="h-20 w-full"></div>
        </div>
      </div>

    </div>
  );
}