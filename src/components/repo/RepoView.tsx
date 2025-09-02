import { createSignal, createMemo } from "solid-js";
import { Repo } from "../../models/Repo.model";
import { Branch } from "../../models/Banch.model";
import BranchList from "./Branchlist";
import { buildTree } from "../ui/TreeView";
import CommitsList from "./CommitsList";
import { LocalChanges } from "./LocalChanges";

export default function RepoView(props: { repo: Repo }) {
  const minWidth = 200;
  const maxWidth = 600;

  const [search, setSearch] = createSignal("");
  const [viewMode, setViewMode] = createSignal<"commits" | "changes">("commits");
  const [sidebarWidth, setSidebarWidth] = createSignal(300);
  const [isResizing, setIsResizing] = createSignal(false);
  const [selectedBranch, setSelectedBranch] = createSignal(props.repo.branches[0].name);
  const [activeBranch, setActiveBranch] = createSignal(props.repo.branches[0].name);

  const startResize = () => setIsResizing(true);
  const stopResize = () => setIsResizing(false);
  const onMouseMove = (e: MouseEvent) => {
    if (isResizing()) {
      let newWidth = e.clientX;
      if (newWidth < minWidth) newWidth = minWidth;
      if (newWidth > maxWidth) newWidth = maxWidth;
      setSidebarWidth(newWidth);
    }
  };

  const selectBranch = (branch: string) => {
    setSelectedBranch(branch);
    setViewMode("commits");
  }

  // Filtra branches locais e remotas
  const filteredBranches = createMemo(() => {
    const term = search().toLowerCase();
    return props.repo.branches.filter((b) => b.name.toLowerCase().includes(term));
  });

  const filteredRemoteBranches = createMemo(() => {
    const term = search().toLowerCase();
    return props.repo.remoteBranches?.filter((b) =>
      b.toLowerCase().includes(term)
    ).map((name) => {
      let branch: Branch = { name, ahead: 0, behind: 0 };
      return branch;
    });
  });

  // Constrói árvores reativas sempre que os arrays filtrados mudam
  const localTree = createMemo(() => buildTree(filteredBranches()));
  const remoteTree = createMemo(() =>
    filteredRemoteBranches() ? buildTree(filteredRemoteBranches()!) : {}
  );

  return (
    <div class="flex h-full w-full select-none"
      onMouseMove={onMouseMove}
      onMouseUp={stopResize}
      onMouseLeave={stopResize}
    >
      {/* Painel esquerdo */}
      <div class="flex flex-col border-r overflow-auto border-gray-300 p-4 dark:border-gray-900 " style={{ width: `${sidebarWidth()}px` }}>
        <b title={props.repo.name} class="truncate font-bold mb-2">{props.repo.name}</b>

        <div class="mb-4 flex flex-col space-y-2">
          <button
            class={`px-2 py-1 rounded text-left ${
              viewMode() === "changes" ? "bg-blue-600 text-white" : "bg-gray-200 dark:bg-gray-700"
            }`}
            onClick={() => setViewMode("changes")}
          >
            <i class="fa fa-copy"></i> Alterações
          </button>
          <button
            class={`px-2 py-1 rounded text-left ${
              viewMode() === "commits" ? "bg-blue-600 text-white" : "bg-gray-200 dark:bg-gray-700"
            }`}
            onClick={() => setViewMode("commits")}
          >
            <i class="fa fa-code-branch"></i> Commits
          </button>
        </div>

        <div class="relative w-full mb-4">
          <span class="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400 dark:text-white">
            <i class="fas fa-search"></i>
          </span>
 
          <input
            type="text"
            placeholder="Pesquisar branches..."
            value={search()}
            onInput={(e) => setSearch(e.currentTarget.value)}
            class="w-full pl-10 pr-2 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-900"
          />
        </div>

        <BranchList 
          localTree={localTree()} 
          remoteTree={remoteTree()} 
          activeBranch={props.repo.activeBranch}
          selectedBranch={selectedBranch()}
          onSelectBranch={selectBranch}
          />
      </div>

      {/* Barra de resize */}
      <div
        class="w-1 cursor-col-resize bg-gray-200 hover:bg-gray-400 dark:bg-gray-900 dark:hover:bg-gray-700"
        onMouseDown={startResize}
      ></div>

      {/* Painel direito */}
      {viewMode() === "commits" && (
        <CommitsList repo={props.repo} branch={selectedBranch()} />
      )}
      {viewMode() === "changes" && <LocalChanges repo={props.repo}/>}
    </div>
  );
}
