import { Show, For, createResource } from "solid-js";
import { githubService } from "../../services/github";
import { open } from "@tauri-apps/plugin-shell"; // Importe o open do Tauri para manter consistência
import { useApp } from "../../context/AppContext";

interface UserConnectionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  username: string;
  type: "followers" | "following";
}

export default function UserConnectionsModal(props: UserConnectionsModalProps) {
  const { t } = useApp();
  // O recurso agora precisa lidar com o objeto { users, pageInfo }
  const [data] = createResource(
    () => (props.isOpen ? { username: props.username, type: props.type } : null),
    async ({ username, type }) => {
      return type === "followers" 
        ? await githubService.getFollowers(username) 
        : await githubService.getFollowing(username);
    }
  );

  return (
    <Show when={props.isOpen}>
      {/* Overlay com clique para fechar */}
      <div 
        onClick={(e) => e.target === e.currentTarget && props.onClose()}
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      >
        <div class="bg-white dark:bg-gray-800 w-full max-w-md rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          
          <div class="px-6 py-4 border-b dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50">
            <h3 class="text-sm font-black dark:text-white uppercase tracking-widest">
              {props.type === "followers" ? t('auth').followers : t('auth').following}
            </h3>
            <button onClick={props.onClose} class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <div class="max-h-[450px] overflow-y-auto p-3 custom-scrollbar">
            <Show when={!data.loading} fallback={
              <div class="p-10 space-y-4">
                <div class="h-10 bg-gray-100 dark:bg-gray-700 rounded-xl animate-pulse w-full"></div>
                <div class="h-10 bg-gray-100 dark:bg-gray-700 rounded-xl animate-pulse w-full"></div>
                <div class="h-10 bg-gray-100 dark:bg-gray-700 rounded-xl animate-pulse w-full"></div>
              </div>
            }>
              <div class="grid grid-cols-1 gap-2">
                {/* Note o data()?.users para acessar a lista dentro do objeto GraphQL */}
                <For each={data()?.users} fallback={
                  <div class="py-10 text-center text-gray-400 text-xs italic">Nenhum usuário encontrado.</div>
                }>
                  {(item: any) => (
                    <button 
                      onClick={() => githubService.openInBrowser(item.login)}
                      class="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-all text-left group border border-transparent hover:border-gray-200 dark:hover:border-gray-600"
                    >
                      {/* GraphQL usa avatarUrl (sem underline) */}
                      <img src={item.avatarUrl} class="w-10 h-10 rounded-lg border dark:border-gray-600 shadow-sm" />
                      
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-1">
                           <p class="text-sm font-black dark:text-white truncate">@{item.login}</p>
                        </div>
                        <Show when={item.name}>
                          <p class="text-[10px] text-gray-500 dark:text-gray-400 truncate font-medium">{item.name}</p>
                        </Show>
                      </div>

                      <i class="fa-solid fa-chevron-right text-[10px] text-gray-300 group-hover:text-blue-500 transition-colors"></i>
                    </button>
                  )}
                </For>
              </div>
              
              {/* Espaço para o "Carregar Mais" futuro baseado no data()?.pageInfo.hasNextPage */}
              <Show when={data()?.pageInfo.hasNextPage}>
                 <div class="p-4 text-center">
                    <p class="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Mais usuários disponíveis no GitHub</p>
                 </div>
              </Show>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
}