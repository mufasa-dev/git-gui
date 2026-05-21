import { createResource, Show, createSignal } from "solid-js";
import { getProviderFromUrl, GitProvider } from "../utils/gitProvider";
import { getRemoteUrl } from "../services/gitService"; 
import { githubService } from "../services/github";
import { useRepoContext } from "../context/RepoContext";
import GithubProfileCard from "../components/Remote/GithubProfileCard";
import { azureService } from "../services/azure";
import AzureProfileCard from "../components/Remote/AzureProfileCard";

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
          <Show when={provider() === 'github'}>
            <GithubProfileCard />
          </Show>
          <Show when={provider() === 'azure'}>
            <AzureProfileCard /> 
          </Show>
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
  
  // Sinais específicos para o Device Flow da Azure
  const [azurePairCode, setAzurePairCode] = createSignal<string | null>(null);
  const [verificationUrl, setVerificationUrl] = createSignal<string>("");

  const handleLogin = async () => {
    setIsLogging(true);
    try {
      if (props.provider === 'github') {
        await githubService.login();
        window.location.reload(); 
      } 
      
      else if (props.provider === 'azure') {
        // 1. Pede o código de pareamento para a Azure
        const deviceCodeData = await azureService.requestDeviceCode();
        
        setAzurePairCode(deviceCodeData.user_code);
        setVerificationUrl(deviceCodeData.verification_uri);

        // 2. Abre o navegador automaticamente na rota de login da MS
        await open(deviceCodeData.verification_uri);

        // 3. Fica escutando (polling) até o usuário validar as credenciais
        await azureService.pollForToken(deviceCodeData.device_code, deviceCodeData.interval);
        
        // 4. Sucesso! Recarrega o estado global
        window.location.reload();
      }
    } catch (e) {
      console.error(`Falha no login do ${props.provider}`, e);
      setIsLogging(false);
      setAzurePairCode(null);
    }
  };

  return (
    <div class="flex flex-col gap-4">
      <h2 class="text-xl font-bold dark:text-white uppercase tracking-tight">Conectar ao {props.provider}</h2>
      <p class="text-sm text-gray-500 dark:text-gray-400">
        Para visualizar seu perfil e gerenciar repositórios, você precisa autorizar sua conta.
      </p>

      {/* Condicional para o Device Code Flow (Azure) */}
      <Show when={props.provider === 'azure' && azurePairCode()}>
        <div class="mt-2 p-4 bg-gray-50 dark:bg-gray-900 border border-dashed border-blue-500/40 rounded-xl flex flex-col items-center gap-2">
          <span class="text-xs font-semibold text-blue-500 uppercase tracking-wider">Código de Ativação</span>
          <div class="text-2xl font-mono font-bold tracking-widest text-gray-800 dark:text-blue-400 select-all selection:bg-blue-500/20 px-4 py-1 bg-white dark:bg-gray-950 rounded-lg shadow-sm">
            {azurePairCode()}
          </div>
          <p class="text-xs text-gray-400 text-center max-w-[280px] mt-1">
            Cole o código acima na janela aberta no seu navegador para liberar o acesso.
          </p>
          <button 
            onClick={() => open(verificationUrl())} 
            class="text-xs text-blue-500 underline hover:text-blue-400 mt-1"
          >
            Não abriu? Clique aqui.
          </button>
        </div>
      </Show>

      <button 
        onClick={handleLogin}
        disabled={isLogging() && props.provider !== 'azure'} // Permite clicar novamente para ver o código se for azure
        class="mt-4 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all disabled:opacity-50 active:scale-95 shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
      >
        <Show when={isLogging() && !azurePairCode()} fallback={
          <span>{azurePairCode() ? "REVERIFICAR CÓDIGO" : "EFETUAR LOGIN"}</span>
        }>
          <i class="fa-solid fa-circle-notch animate-spin text-sm"></i>
          <span>Aguardando autenticação...</span>
        </Show>
      </button>
    </div>
  );
}