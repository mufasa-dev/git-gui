import { createResource, Show, createSignal } from "solid-js";
import { getProviderFromUrl, GitProvider } from "../utils/gitProvider";
import { getRemoteUrl } from "../services/gitService"; // Você já tem lógica de remote
import { githubService } from "../services/githubService";
import { useRepoContext } from "../context/RepoContext";
import GithubProfileCard from "../components/Remote/GithubProfileCard";

export default function ProviderAuthPage(props: { repoPath: string }) {
  const { user, mutateUser, refetchUser } = useRepoContext();
  
  // O remoteUrl ainda pode ser local ou vir do contexto também
  const [remoteUrl] = createResource(() => getRemoteUrl(props.repoPath));
  const provider = () => remoteUrl() ? getProviderFromUrl(remoteUrl()!) : 'unknown';

  const handleLogout = async () => {
    if (provider() === 'github') {
      await githubService.logout();
      mutateUser(null); // Limpa GLOBALMENTE. A barra lateral vai esconder os botões na hora!
    }
  };

  const handleLogin = async () => {
     if (provider() === 'github') {
       await githubService.login();
       refetchUser(); // Recarrega GLOBALMENTE. Os botões vão aparecer na hora!
     }
  };

  return (
    <div class="p-6 max-w-5xl mx-auto">
      <h2 class="text-2xl font-bold mb-6 dark:text-white text-gray-900">Conexão com Provedor</h2>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Coluna da Esquerda: Status e Login */}
        <div class="lg:col-span-1 space-y-6">
           {/* Seu Card de Repositório Remoto aqui... */}
           
           <div class="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
              <Show when={!user.loading} fallback={<div class="animate-pulse h-20 bg-gray-100 rounded-lg" />}>
                <Show when={!user()} fallback={
                   <div class="text-center">
                     <p class="text-xs text-green-500 font-bold uppercase mb-4">Autenticado via GitHub</p>
                     <button onClick={handleLogout} class="w-full py-2 bg-red-50 text-red-600 rounded-lg font-bold text-xs hover:bg-red-100 transition-colors">
                        DESCONECTAR CONTA
                     </button>
                   </div>
                }>
                  <LoginAction provider={provider()} />
                </Show>
              </Show>
           </div>
        </div>

        {/* Coluna da Direita: O Perfil Detalhado */}
        <div class="lg:col-span-2">
           <GithubProfileCard />
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