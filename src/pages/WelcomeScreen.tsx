import { For, Show, createEffect, createSignal } from "solid-js";
import { githubService } from "../services/github";
import { azureService } from "../services/azure"; 
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
import defaultAvatarImg from "../assets/default_avatar.png";
import { useRepoContext } from "../context/RepoContext";
import { useApp } from "../context/AppContext";
import PatHelpModal from "../components/auth/PatHelpModal";

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
        { id: 'azure', name: 'Azure DevOps', icon: 'fa-solid fa-cloud' },
        //{ id: 'gitlab', name: 'GitLab', icon: 'fa-brands fa-gitlab' },
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
        showLoading(t('loading').cloning);
        try {
            let finalUrl = url;

            if (url.includes("github.com")) {
                const token = await githubService.getToken();
                if (token) {
                    finalUrl = url.replace("https://", `https://${token.trim()}@`);
                }
            } 
            else if (url.includes("dev.azure.com") || url.includes("visualstudio.com")) {
                const token = await azureService.getToken();
                if (token) {
                    finalUrl = url.replace("https://", `https://oauth2:${token.trim()}@`);
                }
            }

            const result = await cloneRepository(finalUrl, targetPath);

            if (String(result) === "EMPTY_REPO") {
                notify.error(t('common').warning, "Repositório clonado, mas está vazio (sem commits).");
                return;
            }

            await processAndOpenRepo(targetPath);
            setIsCloneModalOpen(false);
        } catch (err) {
            notify.error(t('error').clone, String(err));
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
                    <img src={logoImg} alt="Dev Brook Logo" class="relative h-32 w-auto drop-shadow-2xl transform-gpu will-change-transform transition-transform duration-500 group-hover:scale-110" />
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

            <footer class="mt-20 text-gray-400 text-[11px] font-mono opacity-50">v1.0.4-beta | Dev Brook Open Engine</footer>
        </div>
    );
}

function ProviderCard(props: { provider: any, onSelectRepo: (url: string) => void }) {
    const { user, mutateUser, refetchUser } = useRepoContext();
    const [isRemoteModalOpen, setIsRemoteModalOpen] = createSignal(false);
    const [isHelpModalOpen, setIsHelpModalOpen] = createSignal(false);
    const [orgValue, setOrgValue] = createSignal("");
    const { t } = useApp();
    
    const [showPatInput, setShowPatInput] = createSignal(false);
    const [patValue, setPatValue] = createSignal("");
    const [isLogging, setIsLogging] = createSignal(false);

    // === CORREÇÃO 1: ESTADO INDEPENDENTE POR CARD ===
    // Evita que o ciclo de re-render ou refetch de um limpe o estado visual do outro
    const [isLocalConnected, setIsLocalConnected] = createSignal(false);

    // Sincroniza o estado inicial vindo do contexto global
    createEffect(() => {
        const u = user();
        if (!u) {
            setIsLocalConnected(false);
            return;
        }

        if (props.provider.id === 'github') {
            const hasGitHub = u.github !== undefined || u.provider === 'github' || (u.provider === undefined && u.login !== undefined);
            setIsLocalConnected(hasGitHub);
        } 
        else if (props.provider.id === 'azure') {
            const hasAzure = u.azure !== undefined || u.provider === 'azure';
            setIsLocalConnected(hasAzure);
        }
    });

    const isLoggedHere = () => isLocalConnected();

    const handleLoginClick = async () => {
        if (props.provider.id === 'github') {
            setIsLogging(true);
            try {
                await githubService.login();
                // Sinaliza sucesso local instantaneamente para travar a UI logada
                setIsLocalConnected(true);
                refetchUser();
            } catch (err) {
                notify.error("Falha na autenticação", String(err));
            } finally {
                setIsLogging(false);
            }
        } 
        else if (props.provider.id === 'azure') {
            setShowPatInput(!showPatInput());
        }
    };

    const handlePatSubmit = async (e: Event) => {
        e.preventDefault();
        if (!patValue()) return;

        setIsLogging(true);
        try {
            const tokenClean = patValue().trim();
            // Desestrutura a resposta dinâmica da nossa nova função
            const { success, login, display_name } = await azureService.loginWithPAT(tokenClean, orgValue().trim());
            
            if (success) {
                const remoteAvatar = await azureService.getUserAvatar(tokenClean, orgValue().trim());
                const finalAvatar = remoteAvatar || defaultAvatarImg;

                notify.success("Sucesso", "Conta do Azure DevOps conectada!");
                setShowPatInput(false);
                setPatValue("");
                
                setIsLocalConnected(true);

                mutateUser((prev: any) => {
                    const base = prev && typeof prev === 'object' ? prev : {};
                    return {
                        ...base,
                        provider: base.provider || 'azure',
                        avatar_url: base.avatar_url || defaultAvatarImg,
                        azure: {
                            login: login, // Organização real do usuário! (ex: "joaosilva")
                            name: display_name, // Nome real do usuário! (ex: "João Silva")
                            token: tokenClean,
                            avatar_url: finalAvatar
                        }
                    };
                });
            } else {
                notify.error("Erro", "Token inválido ou sem permissões necessárias.");
            }
        } catch (err) {
            notify.error("Falha na autenticação", String(err));
        } finally {
            setIsLogging(false);
        }
    };

    const handleLogout = async () => {
        setIsLocalConnected(false);
        if (props.provider.id === 'github') {
            await githubService.logout();
            mutateUser((prev: any) => {
                if (!prev) return null;
                const updated = { ...prev };
                delete updated.github;
                if (updated.provider === 'github') updated.provider = updated.azure ? 'azure' : undefined;
                return updated;
            });
        } 
        else if (props.provider.id === 'azure') {
            await azureService.logout();
            mutateUser((prev: any) => {
                if (!prev) return null;
                const updated = { ...prev };
                delete updated.azure;
                if (updated.provider === 'azure') updated.provider = updated.github ? 'github' : undefined;
                return updated;
            });
        }
    };

    return (
        <div class={`p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm flex flex-col gap-3 transition-all duration-300 ${user.loading ? 'opacity-50 pointer-events-none' : ''}`}>
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg flex items-center justify-center text-xl bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300">
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
                    <img src={(props.provider.id === 'github' ? user()?.avatar_url : user()?.azure?.avatar_url) || "https://avatar.iran.liara.run/public/60"} class="w-8 h-8 rounded-full border-2 border-blue-500" />
                </Show>
            </div>

            <Show 
                when={isLoggedHere()} 
                fallback={
                    <div class="flex flex-col gap-2 w-full">
                        <Show when={!showPatInput()}>
                            <button 
                                onClick={handleLoginClick} 
                                disabled={isLogging()}
                                class="w-full py-2 text-xs font-bold rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-blue-600 hover:text-white transition-all flex items-center justify-center gap-2"
                            >
                                <Show when={isLogging()} fallback={<span>{t('repository').connect_account}</span>}>
                                    <i class="fa-solid fa-circle-notch animate-spin text-xs"></i>
                                    <span>{t('loading').connecting}</span>
                                </Show>
                            </button>
                        </Show>

                        <Show when={props.provider.id === 'azure' && showPatInput()}>
                            <form onSubmit={handlePatSubmit} class="flex flex-col gap-2 pt-1 border-t border-gray-100 dark:border-gray-700/60 transition-all">
                                
                                {/* NOVO CAMPO: Organização */}
                                <input 
                                    type="text"
                                    placeholder={t('provider').organization + " (Ex: devbrook)..."}
                                    value={orgValue()}
                                    onInput={(e) => setOrgValue(e.currentTarget.value)}
                                    disabled={isLogging()}
                                    class="px-3 py-1.5 text-xs font-sans rounded-lg border bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />

                                <div class="flex items-center gap-2 w-full">
                                    <input 
                                        type="password"
                                        placeholder={t('provider').paste_token_azure_here}
                                        value={patValue()}
                                        onInput={(e) => setPatValue(e.currentTarget.value)}
                                        disabled={isLogging()}
                                        class="flex-1 px-3 py-1.5 text-xs font-mono rounded-lg border bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    />
                                    <button 
                                        type="button"
                                        title="Como pegar este token?"
                                        onClick={() => setIsHelpModalOpen(true)}
                                        class="p-1.5 text-xs rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-blue-400 hover:bg-blue-500 hover:text-white dark:hover:bg-blue-600 transition-colors flex items-center justify-center w-8 h-8 shrink-0"
                                    >
                                        <i class="fa-solid fa-circle-question text-sm"></i>
                                    </button>
                                </div>
                                <div class="flex gap-2">
                                    <button 
                                        type="submit"
                                        disabled={isLogging() || !patValue() || !orgValue()}
                                        class="flex-1 py-1.5 text-xs font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                                    >
                                        <Show when={isLogging()} fallback={<span>{t('common').confirm}</span>}>
                                            <i class="fa-solid fa-circle-notch animate-spin text-[10px]"></i>
                                            <span>{t('loading').validating}</span>
                                        </Show>
                                    </button>
                                    <button 
                                        type="button" 
                                        onClick={() => setShowPatInput(false)}
                                        class="px-2.5 py-1.5 text-xs font-bold rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 hover:bg-red-500 hover:text-white transition-colors"
                                    >
                                        <i class="fa-solid fa-xmark"></i>
                                    </button>
                                </div>
                            </form>
                        </Show>
                    </div>
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

            <PatHelpModal 
                isOpen={isHelpModalOpen()} 
                onClose={() => setIsHelpModalOpen(false)} 
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