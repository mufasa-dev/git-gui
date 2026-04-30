import { For, Show, createSignal } from "solid-js";
import { githubService } from "../services/github";
import logoImg from "../assets/fork.png";
import CloneRepositoryModal from "../components/repo/CloneRepositoryModal";
import { notify } from "../utils/notifications";
import { cloneRepository, getBranchStatus, getCurrentBranch, getLocalChanges, getRemoteBranches, validateRepo } from "../services/gitService";
import { useLoading } from "../components/ui/LoadingContext";
import { saveRepos } from "../services/storeService";
import { Repo } from "../models/Repo.model";
import { open } from "@tauri-apps/plugin-dialog";
import { path } from "@tauri-apps/api";
import RemoteRepoModal from "../components/Remote/RemoteRepoModal";
import { useRepoContext } from "../context/RepoContext";
import { useApp } from "../context/AppContext";

type Props = {
    repos: Repo[];
    setActive: (path: string | null) => void;
    setRepos: (repos: Repo[]) => void;
};

export default function WelcomeScreen(props: Props) {
    const { showLoading, hideLoading } = useLoading();
    const [isCloneModalOpen, setIsCloneModalOpen] = createSignal(false);
    const [presetUrl, setPresetUrl] = createSignal("");
    const { t } = useApp();

    const providersList = [
        { id: 'github', name: 'GitHub', icon: 'fa-brands fa-github' },
        { id: 'gitlab', name: 'GitLab', icon: 'fa-brands fa-gitlab' },
        { id: 'azure', name: 'Azure DevOps', icon: 'fa-solid fa-cloud' }
    ];

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

    async function handleClone(url: string, targetPath: string) {
        showLoading("Clonando repositório remoto...");
        try {
            const token = await githubService.getToken();
            let finalUrl = url;
            if (token && url.includes("github.com")) {
                finalUrl = url.replace("https://", `https://${token.trim()}@`);
            }

            const result = await cloneRepository(finalUrl, targetPath);

            if (String(result) === "EMPTY_REPO") {
                notify.error("Aviso", "Repositório clonado, mas está vazio (sem commits).");
                // Aqui você pode abrir o repo, mas com uma UI limitada
                return;
            }

            await processAndOpenRepo(targetPath);
            setIsCloneModalOpen(false);
        } catch (err) {
            notify.error('Erro ao Clonar', String(err));
        } finally {
            hideLoading();
        }
    }

    const openCloneWithUrl = (url: string) => {
        setPresetUrl(url);
        setIsCloneModalOpen(true);
    };

    return (
        <div class="h-full w-full flex flex-col items-center justify-center p-8 bg-gray-50 dark:bg-gray-900 transition-colors overflow-y-auto">
            <div class="flex items-center gap-8 mb-2 group p-12 isolate transition-all">
                <div class="relative flex-shrink-0">
                    <div class="absolute -inset-4 bg-gradient-to-r from-blue-600 to-cyan-400 rounded-full blur-xl opacity-20 group-hover:opacity-60 group-hover:blur-2xl transition-all duration-500 group-hover:duration-300 will-change-[filter]"></div>
                    <img src={logoImg} alt="Git Trident Logo" class="relative h-32 w-auto drop-shadow-2xl transform-gpu will-change-transform transition-transform duration-500 group-hover:scale-110" />
                </div>

                <div class="flex flex-col justify-center select-none transform-gpu">
                    <h1 class="text-6xl font-black tracking-tighter leading-none select-none">
                        <span class="text-gray-900 dark:text-white">Dev</span>
                        <span class="bg-clip-text text-transparent bg-gradient-to-br from-blue-600 to-blue-400 dark:from-blue-400 dark:to-cyan-300 ml-2">Brook</span>
                    </h1>
                    <div class="flex items-center gap-3 mt-2">
                        <div class="h-[1px] w-8 bg-blue-500/50"></div>
                        <p class="text-sm font-medium uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">Visual Terminal</p>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-12 w-full max-w-4xl">
                <div class="space-y-6">
                    <h2 class="text-sm font-bold text-gray-400 uppercase tracking-widest px-1">{t('repository').actions}</h2>
                    <LocalActions 
                        onOpenClone={() => { setPresetUrl(""); setIsCloneModalOpen(true); }} 
                        onOpenLocal={async () => {
                            const selected = await open({ directory: true, multiple: false });
                            if (typeof selected === "string") await processAndOpenRepo(selected);
                        }} 
                    />
                </div>

                <div class="space-y-6">
                    <h2 class="text-sm font-bold text-gray-400 uppercase tracking-widest px-1">{t('repository').provider_connections}</h2>
                    <div class="space-y-3">
                        <For each={providersList}>
                            {(provider) => <ProviderCard provider={provider} onSelectRepo={openCloneWithUrl} />}
                        </For>
                    </div>
                </div>
            </div>

            <CloneRepositoryModal 
                isOpen={isCloneModalOpen()} 
                initialUrl={presetUrl()}
                onClose={() => { setIsCloneModalOpen(false); }}
                onClone={handleClone}
            />

            <footer class="mt-20 text-gray-400 text-[11px] font-mono opacity-50">v1.0.4-beta | Git Trident Open Engine</footer>
        </div>
    );
}

function ProviderCard(props: { provider: any, onSelectRepo: (url: string) => void }) {
    const { user, mutateUser, refetchUser } = useRepoContext();
    const [isRemoteModalOpen, setIsRemoteModalOpen] = createSignal(false);
    const { t } = useApp();

    // Valida se o usuário logado no contexto pertence a este provedor específico
    const isLoggedHere = () => {
        const u = user();
        if (!u) return false;
        
        // Se o provedor do card é github e o objeto tem campos típicos do github (como login ou avatar_url)
        if (props.provider.id === 'github') {
            return u.provider === 'github' || u.login !== undefined; 
        }
        
        // Para os outros, por enquanto, retorna falso até você implementar os serviços
        return u.provider === props.provider.id;
    };

    const handleLogin = async () => {
        if (props.provider.id === 'github') {
            await githubService.login();
            refetchUser();
        }
        // Implementar outros conforme necessário
    };

    const handleLogout = async () => {
        if (props.provider.id === 'github') {
            await githubService.logout();
            mutateUser(null);
        }
    };

    return (
        <div class={`p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm flex flex-col gap-3 ${user.loading ? 'opacity-50 pointer-events-none' : ''}`}>
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg flex items-center justify-center text-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                        <i class={props.provider.icon}></i>
                    </div>
                    <div>
                        <div class="text-sm font-bold dark:text-white">{props.provider.name}</div>
                        <Show when={isLoggedHere()} fallback={<span class="text-[10px] text-gray-400 font-bold uppercase">{t('common').disconected}</span>}>
                            <span class="text-[10px] text-green-500 font-bold uppercase">{t('common').connect}</span>
                        </Show>
                    </div>
                </div>
                <Show when={isLoggedHere()}>
                    <img src={user().avatar_url} class="w-8 h-8 rounded-full border-2 border-blue-500" />
                </Show>
            </div>

            <Show 
                when={isLoggedHere()} 
                fallback={
                    <button onClick={handleLogin} class="w-full py-2 text-xs font-bold rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-blue-600 hover:text-white transition-all">
                        {t('repository').connect_account}
                    </button>
                }
            >
                <div class="flex gap-2">
                    <button onClick={() => setIsRemoteModalOpen(true)} class="flex-1 py-1 text-xs font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                        {t('repository').see_projects}
                    </button>
                    <button onClick={handleLogout} title="Sair da conta" class="px-3 py-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors border border-gray-200 dark:border-gray-800 active:scale-95">
                        <i class="fa-solid fa-right-from-bracket text-xs"></i>
                    </button>
                </div>
            </Show>

            <RemoteRepoModal 
                isOpen={isRemoteModalOpen()} 
                providerId={props.provider.id}
                onClose={() => setIsRemoteModalOpen(false)}
                onSelect={(url) => {
                    setIsRemoteModalOpen(false);
                    props.onSelectRepo(url);
                }}
            />
        </div>
    );
}

function LocalActions(props: { onOpenClone: () => void, onOpenLocal: () => void }) {
    const { t } = useApp();

    return (
        <div class="space-y-4">
            <button onClick={props.onOpenClone} class="w-full flex items-center gap-4 p-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:shadow-md transition-all group">
                <i class="fa-solid fa-download text-2xl text-blue-500"></i>
                <div class="text-left">
                    <div class="font-bold dark:text-white group-hover:text-blue-500 transition-colors">{t('repository').clone_repository}</div>
                    <p class="text-xs text-gray-500">{t('repository').clone_from_url}</p>
                </div>
            </button>
            <button onClick={props.onOpenLocal} class="w-full flex items-center gap-4 p-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:shadow-md transition-all group">
                <i class="fa-solid fa-folder-open text-2xl text-green-500"></i>
                <div class="text-left">
                    <div class="font-bold dark:text-white group-hover:text-green-500 transition-colors">{t('repository').open_local_repository}</div>
                    <p class="text-xs text-gray-500">{t('repository').select_pc_folder}</p>
                </div>
            </button>
        </div>
    );
}