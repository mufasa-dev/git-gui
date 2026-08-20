import { createSignal, onMount, Show } from "solid-js";
import { Repo } from "../../models/Repo.model";
import { openBash, openConsole, openFileManager, openRepositoryBrowser, openVsCode } from "../../services/openService";
import Button from "../ui/Button";
import DropdownButton from "../ui/DropdownButton";
import NewBranchModal from "../branch/NewBranchModal";
import BranchSelector from "../branch/BranchSelector"; // 🌟 Import do novo seletor customizado
import { fetchRepo, getRepositorySnapshot, getCurrentBranch, pull, pushRepo, validateRepo, createBranch, configPullMode, listStashes, listTags, applyStash, popStash, clearStashes } from "../../services/gitService";
import { saveRepos } from "../../services/storeService";
import folderIcon from "../../assets/folder_silver.png";
import fetchIcon from "../../assets/reload_silver.png";
import pullIcon from "../../assets/pull_silver.png";
import pushIcon from "../../assets/push_silver.png";
import packageIcon from "../../assets/package.png";
import newWindowIcon from "../../assets/terminal_silver.png";
import branchIcon from "../../assets/branch.png";
import { open } from "@tauri-apps/plugin-dialog";
import { path } from "@tauri-apps/api";
import Dialog from "../ui/Dialog";
import { notify } from "../../utils/notifications";
import vsCodeIcon from "../../assets/vscode.png";
import bashIcon from "../../assets/bash.png";
import openIcon from "../../assets/open_icon.png";
import internetIcon from "../../assets/worldwide.png";
import { useLoading } from "../ui/LoadingContext";
import { useApp } from "../../context/AppContext";
import { githubService } from "../../services/github";
import { azureService } from "../../services/azure";
import { getProviderFromUrl } from "../../utils/gitProvider";
import CreateStashModal from "../repo/CreateStashModal";

type Props = {
    repos: Repo[];
    active: string | null;
    activePage: string | null;
    refreshBranches: (repoPath: string) => Promise<void>;
    remoteUrl?: string;
    setRepoBusy?: (path: string, busy: boolean) => void;
    setActive: (path: string | null) => void;
    setRepos: (repos: Repo[]) => void;
};

export default function Header(props: Props) {
    const [pushing, setPushing] = createSignal(false);
    const [pulling, setPulling] = createSignal(false);
    const [fetching, setFetching] = createSignal(false);
    const { showLoading, hideLoading } = useLoading();
    const [openModalNewBranch, setOpenModalNewBranch] = createSignal(false);
    const { t } = useApp();
    
    const [platform, setPlatform] = createSignal("");
    const [showModalPullOpts, setShowModalPullOpts] = createSignal(false);
    const [showCreateStash, setShowCreateStash] = createSignal(false);
    const [modalInfo, setModalInfo] = createSignal<{
      repoPath: string;
      branch: string;
      message: string;
    } | null>(null);

    // 🌟 Memoizador para obter o repositório ativo completo exigido pelo BranchSelector
    const currentActiveRepo = () => props.repos.find(r => r.path === props.active) || null;

    const provider = () => props.remoteUrl ? getProviderFromUrl(props.remoteUrl) : 'unknown';

    async function openRepo() {
        const selected = await open({ directory: true, multiple: false });

        if (typeof selected === "string") {
            try {
              showLoading("Abrindo repositório...");
              await validateRepo(selected);
              const snapshot = await getRepositorySnapshot(selected);
              const name = await path.basename(selected);
              const [stashes, tags] = await Promise.all([
                listStashes(selected),
                listTags(selected),
              ]);
              const newRepo: Repo = {
                path: selected,
                name,
                branches: snapshot.branches,
                remoteBranches: snapshot.remoteBranches,
                activeBranch: snapshot.activeBranch ?? undefined,
                localChanges: snapshot.localChanges,
                localChangesCount: snapshot.localChangesCount,
                gitRevision: snapshot.gitRevision ?? undefined,
                statusSignature: snapshot.statusSignature,
                stashes,
                tags,
              };

              // Evita duplicar se já estiver aberto
              if (!props.repos.some(r => r.path === selected)) {
              props.setRepos([...props.repos, newRepo]);
              await saveRepos([...props.repos, newRepo]);
              }
              props.setActive(selected);
            } catch (err) {
              notify.error('Erro ao abrir repositório', `Erro ao abrir o repositório: ${err}`);
            } finally {
              hideLoading();
            }
        }
    }

    const doPush = async () => {
      const repoPath = props.active;
      if (!repoPath) return;
      props.setRepoBusy?.(repoPath, true);
      setPushing(true);
      showLoading(t("loading").pushing);
      try {
        const branch = await getCurrentBranch(repoPath);
        
        let tokenToSend = "";
        if (provider() === 'azure') {
          tokenToSend = await azureService.getToken() || "";
        } else if (provider() === 'github') {
          tokenToSend = await githubService.getToken() || "";
        }

        await pushRepo(repoPath, "origin", branch, tokenToSend, provider());
        
        notify.success('Git Push', `Push realizado com sucesso!`);
        await props.refreshBranches(repoPath);
      } catch (err) {
        notify.error('Erro no Push', `${err}`);
      } finally {
        setPushing(false);
        props.setRepoBusy?.(repoPath, false);
        hideLoading();
      }
    };

    const doPull = async () => {
      const repoPath = props.active;
      if (!repoPath) return;
      props.setRepoBusy?.(repoPath, true);
      setPulling(true);
      showLoading("Realizando pull...");
      try {
        let tokenToSend = "";
        if (provider() === 'azure') {
          tokenToSend = await azureService.getToken() || "";
        } else if (provider() === 'github') {
          tokenToSend = await githubService.getToken() || "";
        }

        const branch = await getCurrentBranch(repoPath);
        const result = await pull(repoPath, branch, tokenToSend, provider());

        if (result.needs_resolution) {
          // abre o modal com as informações
          setModalInfo({
            repoPath,
            branch,
            message:
              "O Git detectou branches divergentes.\nEscolha como reconciliar as diferenças:",
          });
          setShowModalPullOpts(true);
          return; // aguarda interação do usuário
        }

        if (result.success) {
          notify.success('Git Pull', `Pull realizado com sucesso!`);
        } else {
          notify.error('Erro no Pull', `Erro ao realizar o pull: ${result.message}`);
        }

        await props.refreshBranches(repoPath);
      } catch (err: any) {
        notify.error('Erro no Pull', `Erro ao realizar o pull: ${err.message}`);
      } finally {
        setPulling(false);
        props.setRepoBusy?.(repoPath, false);
        hideLoading();
      }
    };

    // 🔧 handler do modal
    const handlePullModeChoice = async (mode: "merge" | "rebase" | "ff") => {
      const info = modalInfo();
      if (!info) return;
      props.setRepoBusy?.(info.repoPath, true);

      try {
        await configPullMode(info.repoPath, mode);

        let tokenToSend = "";
        if (provider() === 'azure') {
          tokenToSend = await azureService.getToken() || "";
        } else if (provider() === 'github') {
          tokenToSend = await githubService.getToken() || "";
        }
        const retryResult = await pull(info.repoPath, info.branch, tokenToSend, provider());
        if (retryResult.success) {
          notify.success('Git Pull', `Pull realizado com sucesso após ajuste!`);
        } else {
          notify.error('Erro no Pull', `Erro ao repetir o pull: ${retryResult.message}`);
        }

        await props.refreshBranches(info.repoPath);
      } catch (err: any) {
        notify.error('Erro ao configurar o modo de pull', `Erro ao configurar o modo de pull: ${err.message}`);
      } finally {
        setShowModalPullOpts(false);
        setModalInfo(null);
        setPulling(false);
        props.setRepoBusy?.(info.repoPath, false);
      }
    };

    const doFetch = async () => {
      const repoPath = props.active;
      if (!repoPath) return;
      props.setRepoBusy?.(repoPath, true);
      showLoading("Realizando fetch...");
      setFetching(true);

      try {
        let tokenToSend = "";
        if (provider() === 'azure') {
          tokenToSend = await azureService.getToken() || "";
        } else if (provider() === 'github') {
          tokenToSend = await githubService.getToken() || "";
        }

        await fetchRepo(repoPath, "origin", tokenToSend, provider());
        notify.success('Git Fetch', `Fetch realizado com sucesso!`);
        await props.refreshBranches(repoPath);
      } catch (err) {
        notify.error('Erro no Fetch', `Erro ao realizar o fetch: ${err}`);
      } finally {
        hideLoading();
        setFetching(false);
        props.setRepoBusy?.(repoPath, false);
      }
    };

    const doCreateBranch = async (branchName: string, branchType: string, checkout: boolean, baseBranch: string) => {
      if (!props.active) return;
      try {
        showLoading("Criando branch...");
        await createBranch(branchName, branchType, checkout, baseBranch, props.active!);
        notify.success(t('git').new_branch, `Branch ${branchName} criada com sucesso!`);
        setOpenModalNewBranch(false);
        await props.refreshBranches(props.active!);
      } catch (err) {
        notify.error('Erro ao criar branch', `Erro ao criar branch: ${err}`);
      } finally {
        hideLoading();
      }
    }

    const disabledButton = () => {
      return pushing() || pulling() || fetching();
    }

    const currentStashes = () => currentActiveRepo()?.stashes ?? [];

    const refreshActiveRepo = async () => {
      if (props.active) await props.refreshBranches(props.active);
    };

    const applyLatestStash = async (pop: boolean) => {
      if (!props.active || !currentStashes().length) return;
      try {
        showLoading(t("common").loading);
        const reference = currentStashes()[0].reference;
        if (pop) {
          await popStash(props.active, reference);
        } else {
          await applyStash(props.active, reference);
        }
        notify.success(t("common").success, pop ? t("stash").pop : t("stash").apply);
        await refreshActiveRepo();
      } catch (error) {
        notify.error(t("common").error, String(error));
      } finally {
        hideLoading();
      }
    };

    const clearAllStashes = async () => {
      if (!props.active || !currentStashes().length || !confirm(t("stash").confirm_clear)) return;
      try {
        showLoading(t("common").loading);
        await clearStashes(props.active);
        notify.success(t("common").success, t("stash").clear);
        await refreshActiveRepo();
      } catch (error) {
        notify.error(t("common").error, String(error));
      } finally {
        hideLoading();
      }
    };

    onMount(async () => {
      const plat = platform();
      setPlatform(plat); // "windows", "macos", "linux", etc.
    });
    
    return (
        <div class="p-2 flex items-center px-4 bg-white dark:bg-gray-800 dark:text-white">
          <Button class="top-btn" onClick={openRepo}>
            <img src={folderIcon} class="inline h-6" />
            <small>{t('repository').open_repository}</small>
          </Button>
          <Show when={props.active}>
            <Show when={props.activePage === "commits"}>
              <Button class="top-btn" onClick={async () => { await doFetch()}} disabled={disabledButton()}>
                <img src={fetchIcon} class="inline h-6" />
                <small>{fetching() ? " Atualizando..." : " " + t('git').fetch}</small>
              </Button>
              <Button class="top-btn relative" onClick={async () => { await doPull()}} disabled={disabledButton()}>
                <img src={pullIcon} class="inline h-6" />
                <small>{pulling() ? " Atualizando..." : " " + t('git').pull}</small>
                {props.active && (() => {
                  const repo = props.repos.find(r => r.path === props.active);
                  const branch = repo?.branches.find(b => b.name === repo?.activeBranch);
                  return branch && branch.behind > 0
                    ? <span class="text-red-700 dark:text-red-200 font-bold rounded-full ml-1 absolute px-2 right-0">
                      {branch.behind}
                    </span>
                    : null;
                })()}
              </Button>
              <Button class="top-btn relative" onClick={async () => { await doPush()}} disabled={disabledButton()}>
                <img src={pushIcon} class="inline h-6" />
                <small>{pushing() ? " Enviando..." : " " + t('git').push}</small>
                {props.active && (() => {
                  const repo = props.repos.find(r => r.path === props.active);
                  const branch = repo?.branches.find(b => b.name === repo?.activeBranch);
                  return branch && branch.ahead > 0
                    ? <span class="text-green-700 dark:text-green-200 font-bold rounded-full ml-1 absolute px-2 left-0">
                      {branch.ahead}
                    </span>
                    : null;
                })()}
              </Button>
              <DropdownButton
                label={t("git").stash}
                img={packageIcon}
                class="ml-1"
                options={[
                  { label: t("stash").create, action: () => setShowCreateStash(true) },
                  { label: t("stash").apply, hide: currentStashes().length === 0, action: () => void applyLatestStash(false) },
                  { label: t("stash").pop, hide: currentStashes().length === 0, action: () => void applyLatestStash(true) },
                  { label: t("stash").clear, hide: currentStashes().length === 0, action: () => void clearAllStashes() },
                ]}
              />
              <Button class="top-btn" onClick={() => setOpenModalNewBranch(true)} disabled={disabledButton()}>
                <img src={branchIcon} class="inline h-6" />
                <small>{t('git').new_branch}</small>
              </Button>
            </Show>

            {/* 🌟 O seletor de branch customizado integrado ao ecossistema de proteção contra perda de dados */}
            <Show when={["dashboard", "test", "files"].includes(props.activePage || "")}>
              <BranchSelector 
                activeRepo={currentActiveRepo()} 
                refreshBranches={props.refreshBranches} 
              />
            </Show>

            <DropdownButton
              label={t('common').open}
              class="ml-auto"
              img={openIcon}
              options={[
                {
                  img: newWindowIcon,
                  label: t('repository').open_console,
                  action: () => {
                    try {
                      console.log("Abrindo console...", props);
                      openConsole(props.active!)
                    } catch (error) {
                      const errorMessage = typeof error === 'string' ? error : String(error);
                      notify.error('Erro ao abrir console', errorMessage);
                    }
                  }
                },
                {
                  img: bashIcon,
                  label: "Abrir no Git Bash",
                  hide: platform() != "windows",
                  action: () => openBash(props.active!)
                },
                {
                  img: folderIcon,
                  label: t('repository').manager_files,
                  action: () => openFileManager(props.active!)
                },
                {
                  img: internetIcon,
                  label: t('repository').browser,
                  action: () => openRepositoryBrowser(props.active!)
                },
                {
                  img: vsCodeIcon,
                  label: t('repository').vs_code,
                  action: () => openVsCode(props.active!)
                },
              ]}
            />
          </Show>

          <CreateStashModal
            open={showCreateStash()}
            repoPath={props.active || ""}
            onClose={() => setShowCreateStash(false)}
            onCreated={refreshActiveRepo}
          />

          <NewBranchModal open={openModalNewBranch()} 
            onCancel={() => setOpenModalNewBranch(false)} 
            onCreate={(branchName: string, branchType: string, checkout: boolean, baseBranch: string) => doCreateBranch(branchName, branchType, checkout, baseBranch)}
            repoPath={props.active!} branches={props.active ? props.repos.find(r => r.path === props.active!)?.branches.map(b => b.name) || [] : []}
            refreshBranches={props.refreshBranches} />

            <Dialog
              open={showModalPullOpts()}
              title="Branches divergentes detectadas"
              onClose={() => setShowModalPullOpts(false)}
            >
              <div class="space-y-4 text-gray-700 dark:text-gray-200">
                <p>{modalInfo()?.message}</p>

                <div class="space-y-2 mt-4">
                  <button
                    class="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg transition"
                    onClick={() => handlePullModeChoice("merge")}
                  >
                    🔀 Merge — combina as alterações das duas branches em um commit
                  </button>

                  <button
                    class="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg transition"
                    onClick={() => handlePullModeChoice("rebase")}
                  >
                    ♻️ Rebase — reaplica seus commits sobre a branch remota
                  </button>

                  <button
                    class="w-full bg-yellow-600 hover:bg-yellow-700 text-white py-2 rounded-lg transition"
                    onClick={() => handlePullModeChoice("ff")}
                  >
                    ⚡ Fast-forward — apenas avança se não houver divergência real
                  </button>
                </div>
              </div>
            </Dialog>

        </div>
    )
}