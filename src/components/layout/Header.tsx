import { createSignal, onMount } from "solid-js";
import { Repo } from "../../models/Repo.model";
import { openBash, openConsole, openFileManager, openRepositoryBrowser, openVsCode } from "../../services/openService";
import Button from "../ui/Button";
import DropdownButton from "../ui/DropdownButton";
import NewBranchModal from "../branch/NewBranchModal";
import { fetchRepo, getBranchStatus, getCurrentBranch, getLocalChanges, getRemoteBranches, pull, pushRepo, validateRepo, createBranch } from "../../services/gitService";
import { saveRepos } from "../../services/storeService";
import folderIcon from "../../assets/folder.png";
import fetchIcon from "../../assets/fetch.png";
import pullIcon from "../../assets/pull.png";
import pushIcon from "../../assets/push.png";
import sunIcon from "../../assets/sun.png";
import moonIcon from "../../assets/moon.png";
import newWindowIcon from "../../assets/new-window.png";
import branchIcon from "../../assets/branch.png";
import { open } from "@tauri-apps/plugin-dialog";
import { path } from "@tauri-apps/api";

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
    const [openModalNewBranch, setOpenModalNewBranch] = createSignal(false);
    const [dark, setDark] = createSignal(localStorage.getItem("theme") == "dark");
    
    const [platform, setPlatform] = createSignal("");

    const toggleDark = () => {
        setDark(!dark());
        if (dark()) {
        document.documentElement.classList.add("dark");
        localStorage.setItem("theme", "dark");
        } else {
        document.documentElement.classList.remove("dark");
        localStorage.setItem("theme", "light");
        }
    };

    async function openRepo() {
        const selected = await open({ directory: true, multiple: false });

        if (typeof selected === "string") {
            try {
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
                alert("Erro: " + err);
            }
        }
    }

    const doPush = async () => {
      if (!props.active) return;
      setPushing(true);
      try {
        const branch = await getCurrentBranch(props.active!);
        await pushRepo(props.active!, "origin", branch);
        alert("Push realizado com sucesso!");
        await props.refreshBranches(props.active!);
      } catch (err) {
        alert("Erro no push: " + err);
      } finally {
        setPushing(false);
        }
    };

    const doPull = async () => {
      if (!props.active) return;
      setPulling(true);
      try {
        const branch = await getCurrentBranch(props.active!);
        await pull(props.active!, branch);
        alert("Pull realizado com sucesso!");
        await props.refreshBranches(props.active!);
      } catch (err) {
        alert("Erro no pull: " + err);
      } finally {
        setPulling(false);
      }
    }

    const doFetch = async () => {
      if (!props.active) return;
        setFetching(true);
      try {
        await fetchRepo(props.active!, "origin");
        alert("Fetch realizado com sucesso!");
        await props.refreshBranches(props.active!);
      } catch (err) {
        alert("Erro no fetch: " + err);
      } finally {
        setFetching(false);
      }
    };

    const doCreateBranch = async (branchName: string, branchType: string, checkout: boolean, baseBranch: string) => {
      if (!props.active) return;
      try {
        await createBranch(branchName, branchType, checkout, baseBranch, props.active!);
        alert(`Branch ${branchName} criada com sucesso!`);
        setOpenModalNewBranch(false);
        await props.refreshBranches(props.active!);
      } catch (err) {
        alert("Erro ao criar branch: " + err);
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
        <div class="p-2 border-b bg-gray-100 flex items-center px-4 dark:bg-gray-800 dark:text-white dark:border-gray-700">
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
                label: "Abrir Console",
                action: () => openConsole(props.active!)
              },
              {
                label: "Abrir no Git Bash",
                hide: platform() != "windows",
                action: () => openBash(props.active!)
              },
              {
                label: "Gerenciador de Arquivos",
                action: () => openFileManager(props.active!)
              },
              {
                label: "Navegador",
                action: () => openRepositoryBrowser(props.active!)
              },
              {
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
        </div>
    )
}