import { createSignal, createMemo } from "solid-js";
import { Repo } from "../../models/Repo.model";
import BranchList from "./Branchlist";
import { buildTree } from "../ui/TreeView"; // importe a função buildTree

export default function RepoView(props: { repo: Repo }) {
  const [search, setSearch] = createSignal("");

  // Filtra branches locais e remotas
  const filteredBranches = createMemo(() => {
    const term = search().toLowerCase();
    return props.repo.branches.filter((b) => b.toLowerCase().includes(term));
  });

  const filteredRemoteBranches = createMemo(() => {
    const term = search().toLowerCase();
    return props.repo.remoteBranches?.filter((b) =>
      b.toLowerCase().includes(term)
    );
  });

  // Constrói árvores reativas sempre que os arrays filtrados mudam
  const localTree = createMemo(() => buildTree(filteredBranches()));
  const remoteTree = createMemo(() =>
    filteredRemoteBranches() ? buildTree(filteredRemoteBranches()!) : {}
  );

  return (
    <div>
      <h2 class="text-xl font-bold mb-2">{props.repo.name}</h2>
      <p class="text-gray-600 mb-2">📂 {props.repo.path}</p>

      <div class="relative w-full mb-4">
        <span class="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
          <i class="fas fa-search"></i>
        </span>

        <input
          type="text"
          placeholder="Pesquisar branches..."
          value={search()}
          onInput={(e) => setSearch(e.currentTarget.value)}
          class="w-full pl-10 pr-2 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <BranchList localTree={localTree()} remoteTree={remoteTree()} />
    </div>
  );
}
