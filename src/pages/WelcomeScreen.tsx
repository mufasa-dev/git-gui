import { createResource, For, Show, createSignal } from "solid-js";
import { githubService } from "../services/githubService";
import logoImg from "../assets/fork.png";
import CloneRepositoryModal from "../components/repo/CloneRepositoryModal";
import { notify } from "../utils/notifications";
import { cloneRepository, getBranchStatus, getCurrentBranch, getLocalChanges, getRemoteBranches, validateRepo } from "../services/gitService";
import { useLoading } from "../components/ui/LoadingContext";
import { saveRepos } from "../services/storeService";
import { Repo } from "../models/Repo.model";
import { open } from "@tauri-apps/plugin-dialog";
import { path } from "@tauri-apps/api";

type Props = {
    repos: Repo[];
    setActive: (path: string | null) => void;
    setRepos: (repos: Repo[]) => void;
};

export default function WelcomeScreen(props: Props) {

    // Lista de provedores suportados
    const providersList = [
        { id: 'github', name: 'GitHub', icon: 'fa-brands fa-github' },
        { id: 'gitlab', name: 'GitLab', icon: 'fa-brands fa-gitlab' },
        { id: 'azure', name: 'Azure DevOps', icon: 'fa-solid fa-cloud' }
    ];

    return (
        <div class="h-full w-full flex flex-col items-center justify-center p-8 bg-gray-50 dark:bg-gray-900 transition-colors overflow-y-auto">
            
            {/* Logo e Branding (Sempre visível) */}
            <div class="flex items-center gap-8 mb-2 group p-12 isolate transition-all">
            
                {/* Container do Logo */}
                <div class="relative flex-shrink-0">
                    <div class="absolute -inset-4 bg-gradient-to-r from-blue-600 to-cyan-400 rounded-full blur-xl opacity-20 
                        group-hover:opacity-60 group-hover:blur-2xl transition-all duration-500 
                        group-hover:duration-300 will-change-[filter]">
                    </div>
                    <img 
                    src={logoImg} 
                    alt="Git Trident Logo" 
                    class="relative h-32 w-auto drop-shadow-2xl transform-gpu will-change-transform transition-transform duration-500 group-hover:scale-110" 
                    />
                </div>

                {/* Texto da Marca */}
                <div class="flex flex-col justify-center select-none transform-gpu">
                    <h1 class="text-6xl font-black tracking-tighter leading-none select-none">
                        <span class="text-gray-900 dark:text-white">Git</span>
                        <span class="bg-clip-text text-transparent bg-gradient-to-br from-blue-600 to-blue-400 dark:from-blue-400 dark:to-cyan-300 ml-2">
                            Trident
                        </span>
                    </h1>
                    
                    {/* Subtítulo com linha decorativa */}
                    <div class="flex items-center gap-3 mt-2">
                        <div class="h-[1px] w-8 bg-blue-500/50"></div>
                        <p class="text-sm font-medium uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">
                            Visual Terminal
                        </p>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-12 w-full max-w-4xl">
                
                {/* Coluna 1: Ações Locais */}
                <div class="space-y-6">
                    <h2 class="text-sm font-bold text-gray-400 uppercase tracking-widest px-1">Ações Rápidas</h2>
                    <LocalActions repos={props.repos} setActive={props.setActive} setRepos={props.setRepos} />
                </div>

                {/* Coluna 2: Conexões de Nuvem (Lógica Dinâmica) */}
                <div class="space-y-6">
                    <h2 class="text-sm font-bold text-gray-400 uppercase tracking-widest px-1">Conexões de Provedor</h2>
                    <div class="space-y-3">
                        <For each={providersList}>
                        {(provider) => <ProviderCard provider={provider} />}
                        </For>
                    </div>
                    
                    <button class="w-full text-[10px] uppercase font-bold text-gray-400 hover:text-blue-500 transition-colors py-2 border border-dashed border-gray-300 dark:border-gray-700 rounded-xl">
                        + Adicionar Outro Provedor
                    </button>
                </div>
            </div>

            <footer class="mt-20 text-gray-400 text-[11px] font-mono opacity-50">
                v1.0.4-beta | Git Trident Open Engine
            </footer>
        </div>
    );
}

// --- SUB-COMPONENTES ---

function ProviderCard(props: { provider: any }) {
  const [userData, { refetch, mutate }] = createResource(async () => {
    if (props.provider.id === 'github') {
      return await githubService.getCurrentUser();
    }
    return null; 
  });

  const handleLogin = async () => {
    if (props.provider.id === 'github') {
      await githubService.login();
      refetch(); // Atualiza o card sem recarregar a página inteira
    }
  };

  const handleLogout = async () => {
    if (props.provider.id === 'github') {
        await githubService.logout();
        
        mutate(null);
        refetch();
    }
  };

  return (
    <div class={`p-4 rounded-xl border border-gray-200 dark:border-gray-700 
              bg-white dark:bg-gray-800 shadow-sm flex flex-col gap-3
              ${userData.loading ? 'opacity-50 pointer-events-none' : ''}`}>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class={`w-10 h-10 rounded-lg flex items-center justify-center text-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300`}>
            <i class={props.provider.icon}></i>
          </div>
          <div>
            <div class="text-sm font-bold dark:text-white">{props.provider.name}</div>
            <Show when={userData()} fallback={<span class="text-[10px] text-gray-400 font-bold uppercase">Desconectado</span>}>
               <span class="text-[10px] text-green-500 font-bold uppercase">Conectado</span>
            </Show>
          </div>
        </div>

        <Show when={userData()}>
          <img src={userData().avatar_url} class="w-8 h-8 rounded-full border-2 border-blue-500" />
        </Show>
      </div>

      <Show 
        when={userData()} 
        fallback={
          <button 
            onClick={handleLogin}
            class="w-full py-2 text-xs font-bold rounded-lg bg-gray-100 dark:bg-gray-700 
                 text-gray-600 dark:text-gray-300 hover:bg-blue-600 hover:text-white transition-all"
          >
            Conectar Conta
          </button>
        }
      >
        <div class="flex gap-2">
            <button class="flex-1 py-1 text-xs font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                Ver Meus Projetos
            </button>
            <button 
                onClick={handleLogout}
                title="Sair da conta"
                class="px-3 py-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors border border-gray-200 dark:border-gray-800 active:scale-95"
            >
                <i class="fa-solid fa-right-from-bracket text-xs"></i>
            </button>
        </div>
      </Show>
    </div>
  );
}

function LocalActions(props: { setActive: (path: string | null) => void, setRepos: (repos: Repo[]) => void, repos: Repo[] }) {
    const [isCloneModalOpen, setIsCloneModalOpen] = createSignal(false);
    const { showLoading, hideLoading } = useLoading();

    async function handleOpenLocal() {
        const selected = await open({ directory: true, multiple: false });
        if (typeof selected === "string") {
            await processAndOpenRepo(selected);
        }
    }

    // Função centralizada para processar e adicionar o repo à lista
    async function processAndOpenRepo(selected: string) {
        try {
            showLoading("Processando repositório...");
            await validateRepo(selected);
            const branches = await getBranchStatus(selected);
            const remoteBranches = await getRemoteBranches(selected);
            const name = await path.basename(selected);
            const activeBranch = await getCurrentBranch(selected!);
            const localChanges = await getLocalChanges(selected);
            const newRepo: Repo = { path: selected, name, branches, remoteBranches, activeBranch, localChanges };
            
            if (!props.repos.some(r => r.path === selected)) {
                const updatedRepos = [...props.repos, newRepo];
                props.setRepos(updatedRepos);
                await saveRepos(updatedRepos);
            }
            props.setActive(selected);
        } catch (err) {
            notify.error('Erro', `Falha ao processar: ${err}`);
        } finally {
            hideLoading();
        }
    }

    async function handleClone(url: string, path: string) {
        showLoading("Clonando repositório remoto...");
        try {
            let finalUrl = url;
            const token = await githubService.getToken();
            if (token && url.includes("github.com")) {
                finalUrl = url.replace("https://", `https://${token}@`);
            }
            await cloneRepository(finalUrl, path);
            await processAndOpenRepo(path);
        setIsCloneModalOpen(false);
        } catch (err) {
            notify.error('Erro ao Clonar', String(err));
        } finally {
            hideLoading();
        }
    }

    return (
        <div class="space-y-4">
             <button 
                onClick={() => setIsCloneModalOpen(true)}
                class="w-full flex items-center gap-4 p-5 rounded-xl border border-gray-200 dark:border-gray-700 
                    bg-white dark:bg-gray-800 hover:shadow-md transition-all group">
                <i class="fa-solid fa-download text-2xl text-blue-500"></i>
                <div class="text-left">
                    <div class="font-bold dark:text-white group-hover:text-blue-500 transition-colors">Clonar Repositório</div>
                    <p class="text-xs text-gray-500">Baixar de uma URL remota</p>
                </div>
            </button>

            <button 
                onClick={handleOpenLocal}
                class="w-full flex items-center gap-4 p-5 rounded-xl border border-gray-200 dark:border-gray-700 
                    bg-white dark:bg-gray-800 hover:shadow-md transition-all group">
                <i class="fa-solid fa-folder-open text-2xl text-green-500"></i>
                <div class="text-left">
                    <div class="font-bold dark:text-white group-hover:text-green-500 transition-colors">Abrir Repositório Local</div>
                    <p class="text-xs text-gray-500">Selecionar pasta no computador</p>
                </div>
            </button>

            <CloneRepositoryModal 
                isOpen={isCloneModalOpen()} 
                onClose={() => setIsCloneModalOpen(false)}
                onClone={handleClone}
            />
        </div>
    );
}