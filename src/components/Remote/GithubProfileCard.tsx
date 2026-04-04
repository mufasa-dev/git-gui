import { createResource, Show, For } from "solid-js";
import { githubService } from "../../services/githubService";
import { useRepoContext } from "../../context/RepoContext";

export default function GithubProfileCard() {
  const { user } = useRepoContext();

  // Busca dados extras apenas se o usuário estiver logado
  const [extraData] = createResource(
    () => user()?.login,
    async (login) => await githubService.getExtraProfileData(login)
  );

  return (
    <Show when={user()}>
      <div class="flex flex-col gap-6 animate-in fade-in duration-500">
        
        {/* Header do Perfil Estilo GitHub */}
        <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
          <div class="h-24 bg-gradient-to-r from-blue-600 to-purple-600"></div>
          
          <div class="px-6 pb-6">
            <div class="relative flex justify-between items-end -mt-12 mb-4">
              <img 
                src={user().avatar_url} 
                class="w-24 h-24 rounded-full border-4 border-white dark:border-gray-800 shadow-md" 
              />
              <div class="flex gap-4 mb-2">
                <div class="text-center">
                  <span class="block font-bold dark:text-white">{user().followers}</span>
                  <span class="text-[10px] uppercase text-gray-500 font-bold">Seguidores</span>
                </div>
                <div class="text-center border-l dark:border-gray-700 pl-4">
                  <span class="block font-bold dark:text-white">{user().following}</span>
                  <span class="text-[10px] uppercase text-gray-500 font-bold">Seguindo</span>
                </div>
              </div>
            </div>

            <div>
              <h3 class="text-xl font-bold dark:text-white">{user().name || user().login}</h3>
              <p class="text-gray-500 text-sm">@{user().login}</p>
              <p class="mt-3 text-sm dark:text-gray-300 italic">{user().bio}</p>
            </div>

            {/* Organizations */}
            <Show when={extraData()?.orgs?.length > 0}>
              <div class="mt-6">
                <p class="text-[10px] font-bold text-gray-400 uppercase mb-2">Organizações</p>
                <div class="flex gap-2 flex-wrap">
                  <For each={extraData()?.orgs || []}>
                    {(org) => (
                      <img 
                        src={org.avatar_url} 
                        title={org.login}
                        class="w-8 h-8 rounded-md border border-gray-200 dark:border-gray-700" 
                      />
                    )}
                  </For>
                </div>
              </div>
            </Show>
          </div>
        </div>

        {/* Seção do README.md */}
        <Show when={extraData()?.readme}>
          <div class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
            <div class="flex items-center gap-2 mb-4 text-gray-400 text-xs font-bold uppercase">
              <i class="fa-solid fa-book-open"></i>
              <span>{user().login} / README.md</span>
            </div>
            {/* Aqui você usaria uma lib de markdown ou renderizaria o texto puro em uma div mono */}
            <div class="prose dark:prose-invert max-w-none text-sm font-mono whitespace-pre-wrap opacity-80 line-clamp-[15]">
              {extraData()?.readme}
            </div>
          </div>
        </Show>

      </div>
    </Show>
  );
}