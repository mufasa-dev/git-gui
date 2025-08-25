import { createSignal, createMemo } from "solid-js";
import { Repo } from "../../models/Repo.model";
import BranchList from "./Branchlist";
import { buildTree } from "../ui/TreeView"; // importe a função buildTree
import CommitsList from "./CommitsList";

export default function RepoView(props: { repo: Repo }) {
  const [search, setSearch] = createSignal("");
  const [viewMode, setViewMode] = createSignal<"commits" | "changes">("commits");

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
    <div class="flex h-full w-full">
      {/* Painel esquerdo */}
      <div class="w-1/3 border-r border-gray-300 p-4 flex flex-col">
        <h2 class="text-xl font-bold mb-2">{props.repo.name}</h2>

        <div class="mb-4 flex flex-col space-y-2">
          <button
            class={`px-2 py-1 rounded text-left ${
              viewMode() === "changes" ? "bg-blue-600 text-white" : "bg-gray-200"
            }`}
            onClick={() => setViewMode("changes")}
          >
            <i class="fa fa-copy"></i> Alterações
          </button>
          <button
            class={`px-2 py-1 rounded text-left ${
              viewMode() === "commits" ? "bg-blue-600 text-white" : "bg-gray-200"
            }`}
            onClick={() => setViewMode("commits")}
          >
            <i class="fa fa-code-branch"></i> Commits
          </button>
        </div>

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

      {/* Painel direito */}
      <div class="flex-1 p-4 overflow-auto">
        {viewMode() === "commits" && <CommitsList repo={props.repo} />}
        {viewMode() === "changes" && <div>Alterações locais aqui</div>}
      </div>
    </div>
  );
}
