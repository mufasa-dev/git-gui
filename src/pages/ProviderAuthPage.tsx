import { createResource, Show, createSignal } from "solid-js";
import { getProviderFromUrl, GitProvider } from "../utils/gitProvider";
import { getRemoteUrl } from "../services/gitService"; // Você já tem lógica de remote
import { githubService } from "../services/githubService";

export default function ProviderAuthPage(props: { repoPath: string }) {
  const [remoteUrl] = createResource(() => getRemoteUrl(props.repoPath));
  
  const provider = () => remoteUrl() ? getProviderFromUrl(remoteUrl()!) : 'unknown';

  // Busca dados do usuário se o provider for GitHub e houver token
  const [userData] = createResource(provider, async (p) => {
    if (p === 'github') {
      return await githubService.getCurrentUser();
    }
    return null;
  });

  return (
    <div class="p-6 max-w-4xl mx-auto">
      <h2 class="text-2xl font-bold mb-6 dark:text-white text-gray-900">Conexão com Provedor</h2>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card de Status da Origem */}
        <div class="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <p class="text-xs text-gray-500 uppercase font-bold mb-2">Repositório Remoto</p>
          <div class="flex items-center gap-3">
            <ProviderIcon type={provider()} />
            <div>
              <p class="font-mono text-sm truncate w-64">{remoteUrl() || 'Detectando...'}</p>
              <span class="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full capitalize">
                {provider()}
              </span>
            </div>
          </div>
        </div>

        {/* Card de Perfil do Usuário */}
        <div class="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <Show when={!userData.loading} fallback={<div class="animate-pulse h-20 bg-gray-100 dark:bg-gray-700 rounded-lg" />}>
            <Show 
              when={userData()} 
              fallback={<LoginAction provider={provider()} />}
            >
              <div class="flex items-center gap-4">
                <img src={userData().avatar_url} class="w-12 h-12 rounded-full border-2 border-purple-500" />
                <div>
                  <h4 class="font-bold dark:text-white">{userData().name || userData().login}</h4>
                  <p class="text-xs text-gray-500">{userData().email}</p>
                </div>
                <button class="ml-auto text-red-500 hover:bg-red-50 p-2 rounded-lg">
                  <i class="fa-solid fa-right-from-bracket"></i>
                </button>
              </div>
            </Show>
          </Show>
        </div>
      </div>
    </div>
  );
}

// Sub-componente para exibição de ícones
function ProviderIcon(props: { type: GitProvider }) {
  const icons = {
    github: "fa-brands fa-github text-white",
    gitlab: "fa-brands fa-gitlab text-orange-500",
    azure: "fa-solid fa-cloud text-blue-400",
    unknown: "fa-solid fa-link text-gray-400"
  };
  return (
    <div class={`w-10 h-10 rounded-lg flex items-center justify-center text-xl bg-gray-900`}>
      <i class={icons[props.type]}></i>
    </div>
  );
}

function LoginAction(props: { provider: GitProvider }) {
  const [isLogging, setIsLogging] = createSignal(false);

  const handleLogin = async () => {
    setIsLogging(true);
    try {
      if (props.provider === 'github') {
        await githubService.login();
        // O createResource(userData) no pai vai disparar 
        // automaticamente se você usar uma refetch logic
        window.location.reload(); 
      }
    } catch (e) {
      console.error("Falha no login", e);
    } finally {
      setIsLogging(false);
    }
  };

  return (
    <div class="flex flex-col items-center justify-center h-full gap-2">
      <p class="text-sm text-gray-500">Você não está autenticado no {props.provider}</p>
      <button 
        onClick={handleLogin}
        disabled={isLogging()}
        class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition-all disabled:opacity-50"
      >
        {isLogging() ? "Aguardando navegador..." : "Conectar Conta"}
      </button>
    </div>
  );
}