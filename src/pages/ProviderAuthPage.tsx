import { createResource, Show, createSignal, createMemo } from "solid-js";
import { getProviderFromUrl, GitProvider } from "../utils/gitProvider";
import { getRemoteUrl } from "../services/gitService"; 
import { githubService } from "../services/github";
import { useRepoContext } from "../context/RepoContext";
import GithubProfileCard from "../components/Remote/GithubProfileCard";
import { azureService } from "../services/azure";
import AzureProfileCard from "../components/Remote/AzureProfileCard";
import PatHelpModal from "../components/auth/PatHelpModal";
import { useApp } from "../context/AppContext";

export default function ProviderAuthPage(props: { repoPath: string }) {
  const { user } = useRepoContext();
  
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
                <LoginAction provider={provider()} repoPath={props.repoPath} />
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

function LoginAction(props: { provider: GitProvider; repoPath?: string }) {
  const [isLogging, setIsLogging] = createSignal(false);
  const [patToken, setPatToken] = createSignal("");
  const [orgName, setOrgName] = createSignal(""); 
  const [authError, setAuthError] = createSignal<string | null>(null);
  const [showHelp, setShowHelp] = createSignal(false);
  const { t } = useApp();

  const { refetchUser } = useRepoContext();
  const [remoteUrl] = createResource(() => props.repoPath ? getRemoteUrl(props.repoPath) : null);

  createMemo(() => {
    const url = remoteUrl();
    if (props.provider === 'azure' && url) {
      try {
        if (url.includes("dev.azure.com/")) {
          const parts = url.split("dev.azure.com/");
          if (parts[1]) setOrgName(parts[1].split("/")[0]);
        } else if (url.includes(".visualstudio.com")) {
          const parts = url.split(".visualstudio.com");
          const subDomain = parts[0].replace("https://", "").replace("http://", "").split("@").pop();
          if (subDomain) setOrgName(subDomain);
        }
      } catch (e) {
        console.warn("Não foi possível auto-detectar a organização pela URL remota:", e);
      }
    }
  });

  const handleLogin = async (e: Event) => {
    e.preventDefault();
    if (props.provider === 'azure' && (!patToken() || !orgName())) {
      setAuthError(t('provider').please_enter_org_pat);
      return;
    }

    setIsLogging(true);
    setAuthError(null);

    try {
      if (props.provider === 'github') {
        await githubService.login();
        refetchUser(); 
      } 
      
      else if (props.provider === 'azure') {
        const response = await azureService.loginWithPAT(patToken().trim(), orgName().trim());
        
        if (response.success) {
          refetchUser(); 
        } else {
          setAuthError(t('provider').error_token);
          setIsLogging(false);
        }
      }
    } catch (e) {
      console.error(`Falha no login do ${props.provider}`, e);
      setAuthError(t('provider').error_authentication);
      setIsLogging(false);
    }
  };

  return (
    <div class="flex flex-col gap-4">
      <h2 class="text-xl font-bold dark:text-white uppercase tracking-tight">{t('provider').connect_to} {props.provider}</h2>
      <p class="text-sm text-gray-500 dark:text-gray-400">
        {t("provider").title_descri}
      </p>

      <Show when={props.provider === 'azure'} fallback={
        <button 
          onClick={handleLogin}
          disabled={isLogging()}
          class="mt-4 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all disabled:opacity-50 active:scale-95 shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
        >
          <Show when={isLogging()} fallback={<span>{t('provider').do_login}</span>}>
            <i class="fa-solid fa-circle-notch animate-spin text-sm"></i>
            <span>{t('provider').waiting_authentication}</span>
          </Show>
        </button>
      }>
        <form onSubmit={handleLogin} class="mt-2 text-left flex flex-col gap-3">
          
          {/* Campo: Organização */}
          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('provider').organization}</label>
            <input 
              type="text" 
              placeholder="Ex: devbrook"
              value={orgName()}
              onInput={(e) => setOrgName(e.currentTarget.value)}
              disabled={isLogging()}
              class="w-full px-4 py-2.5 rounded-xl border bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all font-sans"
            />
          </div>

          {/* Campo: PAT com o botão de Ajuda integrado */}
          <div class="flex flex-col gap-1.5">
            <div class="flex justify-between items-center">
              <label class="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('provider').personal_access_token}</label>
              <button 
                type="button"
                onClick={() => setShowHelp(true)}
                class="text-xs font-medium text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1 transition-colors outline-none"
              >
                <i class="fa-solid fa-circle-question"></i>
                <span>{t('provider').how_generate}</span>
              </button>
            </div>
            <input 
              type="password" 
              placeholder={t('provider').paste_token_azure_here}
              value={patToken()}
              onInput={(e) => setPatToken(e.currentTarget.value)}
              disabled={isLogging()}
              class="w-full px-4 py-2.5 rounded-xl border bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all font-mono"
            />
          </div>

          <p class="text-xs text-gray-400 leading-relaxed">
            {t('provider').token_needs_to} <span class="text-blue-400 font-medium">Code (Read & Write)</span> e de <span class="text-blue-400 font-medium">Project and Team (Read)</span>.
          </p>

          <Show when={authError()}>
            <span class="text-xs font-medium text-red-500 flex items-center gap-1">
              <i class="fa-solid fa-triangle-exclamation"></i> {authError()}
            </span>
          </Show>

          <button 
            type="submit"
            disabled={isLogging() || !patToken() || !orgName()}
            class="mt-2 w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all disabled:opacity-50 active:scale-95 shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
          >
            <Show when={isLogging()} fallback={<span>{t('provider').connect_with_token}</span>}>
              <i class="fa-solid fa-circle-notch animate-spin text-sm"></i>
              <span>{t('provider').validateting}</span>
            </Show>
          </button>
        </form>
      </Show>

      <PatHelpModal isOpen={showHelp()} onClose={() => setShowHelp(false)} />
    </div>
  );
}