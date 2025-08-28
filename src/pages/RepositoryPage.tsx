import { createSignal } from "solid-js";
import { open } from "@tauri-apps/plugin-dialog";
import { validateRepo, getBranches, getRemoteBranches, getBranchStatus, pushRepo, getCurrentBranch, pull, fetchRepo } from "../services/gitService";
import TabBar from "../components/repo/TabBar";
import RepoView from "../components/repo/RepoView";
import Button from "../components/ui/Button";
import { Repo } from "../models/Repo.model";
import RepoContext from "../context/RepoContext";
import folderIcon from "../assets/folder.png";
import fetchIcon from "../assets/fetch.png";
import pullIcon from "../assets/pull.png";
import pushIcon from "../assets/push.png";

export default function RepoTabsPage() {
  const [repos, setRepos] = createSignal<Repo[]>([]);
  const [active, setActive] = createSignal<string | null>(null);
  const [pushing, setPushing] = createSignal(false);
  const [pulling, setPulling] = createSignal(false);
  const [fetching, setFetching] = createSignal(false);

  async function openRepo() {
    const selected = await open({ directory: true, multiple: false });

    if (typeof selected === "string") {
      try {
        await validateRepo(selected);
        const branches = await getBranchStatus(selected);
        const remoteBranches = await getRemoteBranches(selected);
        const name = selected.split("/").pop() ?? selected;
        console.log("Branches:", branches);
        const newRepo: Repo = { path: selected, name, branches, remoteBranches };

        // Evita duplicar se já estiver aberto
        if (!repos().some(r => r.path === selected)) {
          setRepos([...repos(), newRepo]);
        }

        setActive(selected);
      } catch (err) {
        alert("Erro: " + err);
      }
    }
  }

  const doPush = async () => {
    if (!active()) return;
    setPushing(true);
    try {
      const branch = await getCurrentBranch(active()!);
      await pushRepo(active()!, "origin", branch);
      alert("Push realizado com sucesso!");
      await refreshBranches(active()!);
    } catch (err) {
      alert("Erro no push: " + err);
    } finally {
      setPushing(false);
    }
  };

  const doPull = async () => {
    if (!active()) return;
    setPulling(true);
    try {
      const branch = await getCurrentBranch(active()!);
      await pull(active()!, branch);
      alert("Pull realizado com sucesso!");
      await refreshBranches(active()!);
    } catch (err) {
      alert("Erro no pull: " + err);
    } finally {
      setPulling(false);
    }
  }

  const doFetch = async () => {
    if (!active()) return;
    setFetching(true);
    try {
      await fetchRepo(active()!, "origin");
      alert("Fetch realizado com sucesso!");
      await refreshBranches(active()!);
    } catch (err) {
      alert("Erro no fetch: " + err);
    } finally {
      setFetching(false);
    }
  };

  const disabledButton = () => {
    return pushing() || pulling() || fetching();
  }

  async function refreshBranches(repoPath: string) {
    const branches = await getBranchStatus(repoPath);
    const remoteBranches = await getRemoteBranches(repoPath);

    setRepos(prev =>
      prev.map(r =>
        r.path === repoPath ? { ...r, branches, remoteBranches } : r
      )
    );
  }

  return (
     <RepoContext.Provider value={{ repos, active, refreshBranches }}>
      <div class="flex flex-col h-full">
        {/* Topo com botão */}
        <div class="p-2 border-b bg-gray-100 flex items-center px-4">
          <Button class="top-btn" onClick={openRepo}>
            <img src={folderIcon} class="inline h-6 mr-2" />
            <small>Abrir Repositório</small>
          </Button>
          <Button class="top-btn" onClick={async () => { await doFetch()}} disabled={disabledButton()}>
            <img src={fetchIcon} class="inline h-6 mr-2" />
            <small>{fetching() ? " Atualizando..." : " Fetch"}</small>
          </Button>
          <Button class="top-btn" onClick={async () => { await doPull()}} disabled={disabledButton()}>
            <img src={pullIcon} class="inline h-6 mr-2" />
             <small>{pulling() ? " Atualizando..." : " Pull"}</small>
          </Button>
          <Button class="top-btn" onClick={async () => { await doPush()}} disabled={disabledButton()}>
            <img src={pushIcon} class="inline h-6 mr-2" />
            <small>{pushing() ? " Enviando..." : " Push"}</small>
          </Button>
        </div>

        {/* Abas + conteúdo */}
        <div class="flex flex-col flex-1">
          <TabBar repos={repos()} active={active()} onChangeActive={setActive} />

          <div class="flex-1 overflow-auto">
            {active() ? (
              <RepoView repo={repos().find(r => r.path === active())!} />
            ) : (
              <p class="text-gray-500 p-4">Nenhum repositório aberto</p>
            )}
          </div>
        </div>
      </div>
    </RepoContext.Provider>
  );
}
