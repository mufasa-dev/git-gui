import { createResource, Show, createSignal } from "solid-js";
import { getProviderFromUrl, GitProvider } from "../utils/gitProvider";
import { getRemoteUrl } from "../services/gitService"; 
import { githubService } from "../services/github";
import { useRepoContext } from "../context/RepoContext";
import GithubProfileCard from "../components/Remote/GithubProfileCard";

export default function ProviderAuthPage(props: { repoPath: string }) {
  const { user, mutateUser, refetchUser } = useRepoContext();
  
  const [remoteUrl] = createResource(() => getRemoteUrl(props.repoPath));
  const provider = () => remoteUrl() ? getProviderFromUrl(remoteUrl()!) : 'unknown';

  return (
    <div class="h-full w-full bg-gray-100 dark:bg-gray-900 overflow-hidden flex flex-col">
      <Show when={!user.loading} fallback={
        <div class="flex h-full w-full items-center justify-center">
           <i class="fa-solid fa-circle-notch animate-spin text-blue-500 text-3xl"></i>
        </div>
      }>
        <Show 
          when={user()} 
          fallback={
            <div class="flex h-full w-full items-center justify-center p-10">
              <div class="bg-white dark:bg-gray-800 p-10 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl max-w-md w-full text-center">
                <div class="mb-6 flex justify-center">
                  <ProviderIcon type={provider()} />
                </div>
                <LoginAction provider={provider()} />
              </div>
            </div>
          }
        >
          {/* Se estiver logado, o GithubProfileCard assume o controle total da tela */}
          <GithubProfileCard />
        </Show>
      </Show>
    </div>
  );
}

function ProviderIcon(props: { type: GitProvider }) {
  const icons = {
    github: "fa-brands fa-github text-white",
    gitlab: "fa-brands fa-gitlab text-orange-500",
    azure: "fa-solid fa-cloud text-blue-400",
    unknown: "fa-solid fa-link text-gray-400"
  };
  return (
    <div class="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl bg-gray-900 shadow-inner">
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
        window.location.reload(); 
      }
    } catch (e) {
      console.error("Falha no login", e);
    } finally {
      setIsLogging(false);
    }
  };

  return (
    <div class="flex flex-col gap-4">
      <h2 class="text-xl font-bold dark:text-white uppercase tracking-tight">Conectar ao {props.provider}</h2>
      <p class="text-sm text-gray-500 dark:text-gray-400">Para visualizar seu perfil e README, você precisa autorizar o Trident.</p>
      <button 
        onClick={handleLogin}
        disabled={isLogging()}
        class="mt-4 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all disabled:opacity-50 active:scale-95 shadow-lg shadow-blue-500/20"
      >
        {isLogging() ? "Aguardando navegador..." : "EFETUAR LOGIN"}
      </button>
    </div>
  );
}