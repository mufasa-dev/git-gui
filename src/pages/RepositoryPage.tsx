import { createSignal } from "solid-js";
import { open } from "@tauri-apps/plugin-dialog";
import { validateRepo, getBranches } from "../services/gitService";
import BranchList from "../components/repo/Branchlist";
import Button from "../components/ui/Button";

export default function RepositoryPage() {
  const [repoPath, setRepoPath] = createSignal<string | null>(null);
  const [branches, setBranches] = createSignal<string[]>([]);

  async function openRepo() {
    const selected = await open({ directory: true, multiple: false });

    if (typeof selected === "string") {
      try {
        await validateRepo(selected);
        setRepoPath(selected);
        const b = await getBranches(selected);
        setBranches(b);
      } catch (err) {
        alert("Erro: " + err);
      }
    }
  }

  return (
    <div class="p-6">
      <Button onClick={openRepo}>Abrir Repositório</Button>

      {repoPath() && (
        <div class="mt-4">
          <h2 class="font-bold text-xl">Repositório: {repoPath()}</h2>
          <BranchList branches={branches()} />
        </div>
      )}
    </div>
  );
}
