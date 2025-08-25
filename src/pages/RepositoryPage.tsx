import { createSignal } from "solid-js";
import { open } from "@tauri-apps/plugin-dialog";
import { validateRepo, getBranches, getRemoteBranches } from "../services/gitService";
import TabBar from "../components/repo/TabBar";
import RepoView from "../components/repo/RepoView";
import Button from "../components/ui/Button";
import { Repo } from "../models/Repo.model";

export default function RepoTabsPage() {
  const [repos, setRepos] = createSignal<Repo[]>([]);
  const [active, setActive] = createSignal<string | null>(null);

  async function openRepo() {
    const selected = await open({ directory: true, multiple: false });

    if (typeof selected === "string") {
      try {
        await validateRepo(selected);
        const branches = await getBranches(selected);
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

  return (
    <div class="flex flex-col h-full">
      {/* Topo com botão */}
      <div class="p-2 border-b bg-gray-100 flex justify-between items-center">
        <Button onClick={openRepo}>
          <i class="fas fa-folder"></i> Abrir Repositório
        </Button>
      </div>

      {/* Abas + conteúdo */}
      <div class="flex flex-col flex-1">
        <TabBar repos={repos()} active={active()} onChangeActive={setActive} />

        <div class="flex-1 overflow-auto p-4">
          {active() ? (
            <RepoView repo={repos().find(r => r.path === active())!} />
          ) : (
            <p class="text-gray-500">Nenhum repositório aberto</p>
          )}
        </div>
      </div>
    </div>
  );
}
