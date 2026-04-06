import { createResource, Show, For, createMemo, createSignal } from "solid-js";
import { githubService } from "../../services/github";
import { useRepoContext } from "../../context/RepoContext";
// @ts-ignore
import { marked } from "marked";
import MarkdownViewer from "../ui/MarkdownViewer";
import UserConnectionsModal from "./UserConnectionsModal";
import ContributionGraph from "./GithubContributionGraph";

export default function GithubProfileCard() {
  const { user, mutateUser } = useRepoContext();
  const [modalType, setModalType] = createSignal<"followers" | "following" | null>(null);

  const minWidth = 250;
  const maxWidth = 500;
  const [sidebarWidth, setSidebarWidth] = createSignal(300);
  const [isResizing, setIsResizing] = createSignal(false);

  // O recurso agora busca o pacote completo (GQL + README + ORGS)
  const [extraData] = createResource(
    () => user()?.login,
    async (login) => await githubService.getFullUserData(login)
  );

  const handleLogout = async () => {
    await githubService.logout();
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
      <div 
        class="container-branch-list p-0 flex flex-col mb-2" 
        style={{ width: `${sidebarWidth()}px`, height: "calc(100vh - 124px)" }}
      >
        <div class="pb-6 flex-1 overflow-y-auto custom-scrollbar">
          <div class="relative flex justify-center mb-4 mt-4">
            <img 
              src={user()?.avatar_url} 
              class="w-32 h-32 rounded-full border-4 border-white dark:border-gray-700 shadow-xl object-cover bg-white" 
            />
          </div>

          <div class="mb-2 px-4 text-center sm:text-left">
            <h3 class="text-xl font-bold dark:text-white truncate">
                {extraData()?.name || user()?.login}
            </h3>
            <p class="text-sm text-gray-500">@{user()?.login}</p>
          </div>

          <Show when={extraData()?.bio}>
              <div class="pb-4 px-4">
                  <p class="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{extraData()?.bio}</p>
              </div>
          </Show>

          <div class="grid grid-cols-2 border-y border-gray-200 dark:border-gray-700/50 mb-6">
            <button onClick={() => setModalType("followers")} class="text-center hover:bg-gray-200 dark:hover:bg-gray-700 p-2 transition-colors">
              <span class="block text-lg font-black dark:text-white">{extraData()?.followers ?? '...'}</span>
              <span class="text-[10px] uppercase text-gray-400 font-bold tracking-widest">Seguidores</span>
            </button>
            <button onClick={() => setModalType("following")} class="text-center border-l dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 p-2 transition-colors">
              <span class="block text-lg font-black dark:text-white">{extraData()?.following ?? '...'}</span>
              <span class="text-[10px] uppercase text-gray-400 font-bold tracking-widest">Seguindo</span>
            </button>
          </div>

          <div class="space-y-6 px-4">
            <div class="space-y-2">
              <Show when={extraData()?.location}>
                <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <i class="fa-solid fa-location-dot w-4"></i>
                  <span>{extraData()?.location}</span>
                </div>
              </Show>
              <Show when={extraData()?.company}>
                <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <i class="fa-solid fa-building w-4"></i>
                  <span>{extraData()?.company}</span>
                </div>
              </Show>
            </div>

            <Show when={extraData()?.orgs && (extraData()?.orgs?.length ?? 0) > 0}>
              <div class="mt-8">
                <p class="text-[10px] font-black text-gray-400 uppercase mb-3 tracking-widest">Organizations</p>
                <div class="flex gap-2 flex-wrap">
                  <For each={extraData()?.orgs || []}>
                    {(org: any) => (
                      <img src={org.avatar_url} title={org.login} class="w-7 h-7 rounded border dark:border-gray-700" />
                    )}
                  </For>
                </div>
              </div>
            </Show>
          </div>

          <div class="px-4 mt-auto pt-6">
            <button onClick={handleLogout} class="w-full py-2 bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 
                                                  rounded-xl font-bold text-[10px] hover:bg-red-200 dark:hover:bg-red-900/40 
                                                  transition-colors uppercase tracking-widest">
              Desconectar
            </button>
          </div>
        </div>
      </div>

      <div class="resize-bar-vertical" onMouseDown={() => setIsResizing(true)}></div>

      <div class="flex-1 flex flex-col overflow-hidden">
        <div class="overflow-y-auto custom-scrollbar" style={{ height: "calc(100vh - 124px)" }}>
          <div class="container-branch-list p-6 select-text mb-2">
            <Show when={!extraData.loading} fallback={<div class="animate-pulse p-4">Carregando Perfil...</div>}>
              <Show when={extraData()?.readme} fallback={<div class="py-20 text-center text-gray-400 italic">README não encontrado.</div>}>
                <div class="flex items-center gap-2 mb-6 text-gray-400 text-[10px] font-black uppercase tracking-[0.2em]">
                  <i class="fa-solid fa-terminal text-blue-500"></i>
                  <span>{user()?.login} / README.md</span>
                </div>
                <MarkdownViewer content={extraData()?.readme || ""} />
              </Show>
            </Show>
          </div>

          <Show when={!extraData.loading && extraData()?.calendar}>
            <ContributionGraph calendar={extraData()?.calendar} />
          </Show>
        </div>
      </div>

      <UserConnectionsModal 
        isOpen={modalType() !== null} 
        onClose={() => setModalType(null)} 
        username={user()?.login} 
        type={modalType() as any} 
      />
    </div>
  );
}