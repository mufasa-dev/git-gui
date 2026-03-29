import { createSignal, createResource, Show, For } from "solid-js";
import { getGravatarProfile, getGravatarUrl } from "../../services/gravatarService";
import FileIcon from "../ui/FileIcon"; // Usando o FileIcon para ícones genéricos
import Dialog from "../ui/Dialog";


interface UserProfileDialogProps {
  email: string;
  fallbackName: string;
  repoPath: string;
  open: boolean;
  onClose: () => void;
}

export function UserProfileDialog(props: UserProfileDialogProps) {
  // Usamos createResource para buscar os dados de forma reativa quando o e-mail mudar
  const [profile] = createResource(() => props.email, getGravatarProfile);

  // Função auxiliar para ícones de contas verificadas
  const getAccountIcon = (shortname: string) => {
    switch (shortname) {
      case 'github': return 'fab fa-github';
      case 'twitter': return 'fab fa-twitter';
      case 'linkedin': return 'fab fa-linkedin';
      case 'facebook': return 'fab fa-facebook';
      case 'pinterest': return 'fab fa-pinterest';
      case 'youtube': return 'fab fa-youtube';
      default: return 'fa fa-globe';
    }
  };

  return (
    <Dialog open={props.open} onClose={props.onClose} title="Perfil do Usuário" width={"calc(100vw - 40px)"}>
      <div class="flex flex-col md:flex-row gap-6">
        {/* Coluna da Esquerda: Foto e Info Básica */}
        <div class="container-branch-list items-center text-center">
          <img
            src={getGravatarUrl(props.email, 160)}
            alt={props.fallbackName}
            class="w-32 h-32 md:w-40 md:h-40 rounded-full shadow-lg border-4 border-white dark:border-gray-700"
          />
          <h3 class="mt-4 text-2xl font-bold text-gray-900 dark:text-gray-100">
            {profile()?.displayName || props.fallbackName}
          </h3>
          <p class="text-gray-500 dark:text-gray-400 text-sm break-all">{props.email}</p>
          
          <Show when={profile()?.currentLocation}>
            <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
              <i class="fa fa-map-marker-alt mr-1 text-red-500"></i>
              {profile()?.currentLocation}
            </p>
          </Show>
        </div>

        {/* Coluna da Direita: Detalhes, Bio, Contas */}
        <div class="flex-1 space-y-6">
          <Show when={profile.loading}>
            <div class="flex items-center justify-center h-full text-gray-500">
              <i class="fa fa-spinner fa-spin mr-2"></i> Carregando perfil estendido...
            </div>
          </Show>

          <Show when={profile.error}>
            <div class="p-4 bg-red-100 text-red-800 rounded-lg text-sm">
              <i class="fa fa-exclamation-triangle mr-2"></i>
              Não foi possível carregar os dados públicos do Gravatar para este usuário.
            </div>
          </Show>

          <Show when={profile() && !profile.loading}>
            {/* Sobre Mim */}
            <Show when={profile()?.aboutMe}>
              <section>
                <h4 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Sobre Mim</h4>
                <div class="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl text-gray-800 dark:text-gray-200 text-sm whitespace-pre-wrap leading-relaxed">
                  {profile()?.aboutMe}
                </div>
              </section>
            </Show>

            {/* Contas Verificadas (Redes Sociais) */}
            <Show when={profile()?.accounts && profile()!.accounts.length > 0}>
              <section>
                <h4 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Contas Verificadas</h4>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <For each={profile()?.accounts}>
                    {(account) => (
                      <a 
                        href={account.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        class="flex items-center gap-3 p-3 bg-white dark:bg-gray-700/50 border dark:border-gray-700 rounded-xl hover:bg-blue-50 dark:hover:bg-gray-700 transition"
                      >
                        <i class={`${getAccountIcon(account.shortname)} text-2xl text-blue-600 dark:text-blue-400`}></i>
                        <div>
                          <div class="font-medium text-gray-900 dark:text-gray-100 text-sm">{account.display}</div>
                          <div class="text-xs text-gray-500 dark:text-gray-400 capitalize">{account.shortname}</div>
                        </div>
                      </a>
                    )}
                  </For>
                </div>
              </section>
            </Show>

            {/* Links Pessoais */}
            <Show when={profile()?.urls && profile()!.urls.length > 0}>
              <section>
                <h4 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Links</h4>
                <div class="space-y-2">
                  <For each={profile()?.urls}>
                    {(url) => (
                      <a 
                        href={url.value} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        class="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        <i class="fa fa-link text-xs text-gray-400"></i>
                        {url.title || url.value}
                      </a>
                    )}
                  </For>
                </div>
              </section>
            </Show>
          </Show>

          {/* Contexto do Repositório (Dados que você já tinha) */}
          <section class="pt-4 border-t dark:border-gray-700">
            <h4 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Contexto da GUI</h4>
            <div class="text-xs text-gray-600 dark:text-gray-400 font-mono bg-gray-100 dark:bg-gray-900 p-2 rounded">
              <i class="fa fa-folder mr-1"></i> {props.repoPath}
            </div>
          </section>
        </div>
      </div>
    </Dialog>
  );
}