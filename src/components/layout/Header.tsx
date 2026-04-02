import { createSignal, onMount } from "solid-js";
import { Repo } from "../../models/Repo.model";
import { openBash, openConsole, openFileManager, openRepositoryBrowser, openVsCode } from "../../services/openService";
import Button from "../ui/Button";
import DropdownButton from "../ui/DropdownButton";
import NewBranchModal from "../branch/NewBranchModal";
import { fetchRepo, getBranchStatus, getCurrentBranch, getLocalChanges, getRemoteBranches, pull, pushRepo, validateRepo, createBranch, configPullMode } from "../../services/gitService";
import { saveRepos } from "../../services/storeService";
import folderIcon from "../../assets/folder_silver.png";
import fetchIcon from "../../assets/reload_silver.png";
import pullIcon from "../../assets/pull_silver.png";
import pushIcon from "../../assets/push_silver.png";
import sunIcon from "../../assets/sun.png";
import moonIcon from "../../assets/moon_silver.png";
import newWindowIcon from "../../assets/terminal_silver.png";
import branchIcon from "../../assets/branch.png";
import { open } from "@tauri-apps/plugin-dialog";
import { path } from "@tauri-apps/api";
import Dialog from "../ui/Dialog";
import { notify } from "../../utils/notifications";
import vsCodeIcon from "../../assets/vscode.png";
import bashIcon from "../../assets/bash.png";
import commandIcon from "../../assets/command.png";
import internetIcon from "../../assets/worldwide.png";
import { useLoading } from "../ui/LoadingContext";

type Props = {
    repos: Repo[];
    active: string | null;
    refreshBranches: (repoPath: string) => Promise<void>;
    setActive: (path: string | null) => void;
    setRepos: (repos: Repo[]) => void;
};

export default function Header(props: Props) {
    const [pushing, setPushing] = createSignal(false);
    const [pulling, setPulling] = createSignal(false);
    const [fetching, setFetching] = createSignal(false);
    const { showLoading, hideLoading } = useLoading();
    const [openModalNewBranch, setOpenModalNewBranch] = createSignal(false);
    const [dark, setDark] = createSignal(localStorage.getItem("theme") == "dark");
    
    const [platform, setPlatform] = createSignal("");
    const [showModalPullOpts, setShowModalPullOpts] = createSignal(false);
    const [modalInfo, setModalInfo] = createSignal<{
      repoPath: string;
      branch: string;
      message: string;
    } | null>(null);

    const toggleDark = () => {
      const newDark = !dark();
      setDark(newDark);
      
      if (newDark) {
        document.documentElement.classList.add("dark");
        localStorage.setItem("theme", "dark");
      } else {
        document.documentElement.classList.remove("dark");
        localStorage.setItem("theme", "light");
      }

      window.dispatchEvent(new CustomEvent("theme-changed", { detail: { theme: newDark ? "dark" : "light" } }));
    };

    async function openRepo() {
        const selected = await open({ directory: true, multiple: false });

        if (typeof selected === "string") {
            try {
              showLoading("Abrindo repositório...");
              await validateRepo(selected);
              const branches = await getBranchStatus(selected);
              const remoteBranches = await getRemoteBranches(selected);
              const name = await path.basename(selected);
              const activeBranch = await getCurrentBranch(selected!);
              const localChanges = await getLocalChanges(selected);
              const newRepo: Repo = { path: selected, name, branches, remoteBranches, activeBranch, localChanges };

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
      if (!props.active) return;
      setPushing(true);
      showLoading("Realizando push...");
      try {
        const branch = await getCurrentBranch(props.active!);
        await pushRepo(props.active!, "origin", branch);
        notify.success('Git Push', `Push realizado com sucesso!`);
        await props.refreshBranches(props.active!);
      } catch (err) {
        notify.error('Erro no Push', `Erro ao realizar o push: ${err}`);
      } finally {
        setPushing(false);
        hideLoading();
      }
    };

    const doPull = async () => {
      if (!props.active) return;
      setPulling(true);
      showLoading("Realizando pull...");
      try {
        const branch = await getCurrentBranch(props.active!);
        const result = await pull(props.active!, branch);

        if (result.needs_resolution) {
          // abre o modal com as informações
          setModalInfo({
            repoPath: props.active!,
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

        await props.refreshBranches(props.active!);
      } catch (err: any) {
        notify.error('Erro no Pull', `Erro ao realizar o pull: ${err.message}`);
      } finally {
        setPulling(false);
        hideLoading();
      }
    };

    // 🔧 handler do modal
    const handlePullModeChoice = async (mode: "merge" | "rebase" | "ff") => {
      const info = modalInfo();
      if (!info) return;

      try {
        await configPullMode(info.repoPath, mode);

        const retryResult = await pull(info.repoPath, info.branch);
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
      }
    };

    const doFetch = async () => {
      if (!props.active) return;
      showLoading("Realizando fetch...");
      setFetching(true);

      try {
        await fetchRepo(props.active!, "origin");
        notify.success('Git Fetch', `Fetch realizado com sucesso!`);
        await props.refreshBranches(props.active!);
      } catch (err) {
        notify.error('Erro no Fetch', `Erro ao realizar o fetch: ${err}`);
      } finally {
        hideLoading();
        setFetching(false);
      }
    };

    const doCreateBranch = async (branchName: string, branchType: string, checkout: boolean, baseBranch: string) => {
      if (!props.active) return;
      try {
        showLoading("Criando branch...");
        await createBranch(branchName, branchType, checkout, baseBranch, props.active!);
        notify.success('Nova Branch', `Branch ${branchName} criada com sucesso!`);
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

    onMount(async () => {
      const plat = platform();
      setPlatform(plat); // "windows", "macos", "linux", etc.
    });
    
    return (
        <div class="p-2 flex items-center px-4 dark:bg-gray-800 dark:text-white">
          <Button class="top-btn" onClick={openRepo}>
            <img src={folderIcon} class="inline h-6" />
            <small>Abrir Repositório</small>
          </Button>
          <Button class="top-btn" onClick={async () => { await doFetch()}} disabled={disabledButton()}>
            <img src={fetchIcon} class="inline h-6" />
            <small>{fetching() ? " Atualizando..." : " Fetch"}</small>
          </Button>
          <Button class="top-btn relative" onClick={async () => { await doPull()}} disabled={disabledButton()}>
            <img src={pullIcon} class="inline h-6" />
             <small>{pulling() ? " Atualizando..." : " Pull"}</small>
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
            <small>{pushing() ? " Enviando..." : " Push"}</small>
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
          <Button class="top-btn" onClick={() => setOpenModalNewBranch(true)} disabled={disabledButton()}>
            <img src={branchIcon} class="inline h-6" />
            <small>Nova Branch</small>
          </Button>
          <DropdownButton
            label="Abrir"
            class="ml-auto"
            img={newWindowIcon}
            options={[
              {
                img: commandIcon,
                label: "Abrir Console",
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
                label: "Gerenciador de Arquivos",
                action: () => openFileManager(props.active!)
              },
              {
                img: internetIcon,
                label: "Navegador",
                action: () => openRepositoryBrowser(props.active!)
              },
              {
                img: vsCodeIcon,
                label: "Abrir no VSCode",
                action: () => openVsCode(props.active!)
              },
            ]}
          />

          <Button
            class="top-btn ml-2"
            onClick={toggleDark}
          >
            <img src={dark() ? sunIcon : moonIcon} class="inline h-6" />
            <small>{dark() ? "Claro" : "Escuro"}</small>
          </Button>
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