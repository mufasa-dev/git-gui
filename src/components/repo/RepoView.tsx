import { createSignal, createMemo, createEffect, on } from "solid-js";
import { Repo } from "../../models/Repo.model";
import { Branch } from "../../models/Banch.model";
import BranchList from "../branch/Branchlist";
import { buildTree } from "../ui/TreeView";
import CommitsList from "../commits/CommitsList";
import { LocalChanges } from "./LocalChanges";
import { checkoutBranch, getLocalChanges, resetHard, stashChanges, stashPop } from "../../services/gitService";
import BranchSwitchModal from "../branch/BranchSwitchModal";
import { notify } from "../../utils/notifications";
import { useLoading } from "../ui/LoadingContext";
import UserConfigModal from "../Config/UserConfig";
import { useApp } from "../../context/AppContext";

export default function RepoView(props: { repo: Repo , refreshBranches: (path: string) => Promise<void> }) {
  const minWidth = 200;
  const maxWidth = 600;

  const [search, setSearch] = createSignal("");
  const [viewMode, setViewMode] = createSignal<"commits" | "changes">("commits");
  const [sidebarWidth, setSidebarWidth] = createSignal(300);
  const [isResizing, setIsResizing] = createSignal(false);
  const [selectedBranch, setSelectedBranch] = createSignal(props.repo.activeBranch);
  const [modalSwtBranchOpen, setModalSwtBranchOpen] = createSignal(false);
  const [targetBranch, setTargetBranch] = createSignal<string | null>(null);
  const { showLoading, hideLoading } = useLoading();
  const [isUserConfigOpen, setIsUserConfigOpen] = createSignal(false);
  const { t } = useApp();

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

  const handleActiveBranch = async (path: string, branch: string) => {
    try {
      if (branch === props.repo.activeBranch) return;
      
      const changes = await getLocalChanges(path);

      if (changes.length > 0) {
        setModalSwtBranchOpen(true);
        setTargetBranch(branch);
      } else {
        showLoading(`Trocando para a branch ${branch}...`);
        await checkoutBranch(path, branch);
        await props.refreshBranches(path);
        notify.success('Git Checkout', `✅ Mudou para a branch: ${branch}`);
      }
    } catch (err) {
      notify.error('Erro', `Erro ao trocar de branch`);
    } finally {
      hideLoading();
    }
  };

  async function doStashAndApply() {
    await stashChanges(props.repo.path);
    await checkoutBranch(props.repo.path, targetBranch()!);
    await stashPop(props.repo.path);
    setModalSwtBranchOpen(false);
  }

  async function doDiscard() {
    await resetHard(props.repo.path);
    await checkoutBranch(props.repo.path, targetBranch()!);
    setModalSwtBranchOpen(false);
  }

  // Constrói árvores reativas sempre que os arrays filtrados mudam
  const localTree = createMemo(() => buildTree(filteredBranches()));
  const remoteTree = createMemo(() =>
    filteredRemoteBranches() ? buildTree(filteredRemoteBranches()!) : {}
  );

  createEffect(on(() => props.repo.path, (newPath) => {
    if (!newPath) return;

    setSelectedBranch(props.repo.activeBranch);
  }));

  return (
    <div class="flex h-full w-full select-none bg-gray-200 dark:bg-gray-900"
      onMouseMove={onMouseMove}
      onMouseUp={stopResize}
      onMouseLeave={stopResize}
    >
      {/* Painel esquerdo */}
      <div class="flex flex-col border-r overflow-auto border-gray-300 pt-2 pb-2 pl-2 dark:border-gray-900 " style={{ width: `${sidebarWidth()}px` }}>
        <div class="container-branch-list mb-2">
          <div class="flex">
            <b title={props.repo.name} class="truncate font-bold mb-2">{props.repo.name}</b>
            <button onClick={() => setIsUserConfigOpen(true)} class="ml-auto text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
              <i class="fa-solid fa-user-gear"></i>
            </button>
          </div>
          <button
            class={`px-2 py-1 flex items-center rounded-xl ${
              viewMode() === "changes" ? "bg-blue-600 text-white" : "bg-gray-200 dark:bg-gray-700"
            }`}
            onClick={() => setViewMode("changes")}
          >
            <i class="fa fa-copy"></i> {t('file').updates}
            {props.repo.localChanges && props.repo.localChanges.length > 0 && (
              <span class="ml-auto bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {props.repo.localChanges.length}
              </span>
            )}
          </button>
          <button
            class={`px-2 py-1 text-left rounded-xl ${
              viewMode() === "commits" ? "bg-blue-600 text-white" : "bg-gray-200 dark:bg-gray-700"
            }`}
            onClick={() => setViewMode("commits")}
          >
            <i class="fa fa-code-branch"></i> {t('commits').commits}
          </button>
        </div>

        <div class="container-branch-list px-0 overflow-auto h-[100%]">
          <div class="relative w-full mb-2 px-2">
            <span class="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400 dark:text-white">
              <i class="fas fa-search"></i>
            </span>
  
            <input
              type="text"
              placeholder={t('repository').search_branch + '...'}
              value={search()}
              onInput={(e) => setSearch(e.currentTarget.value)}
              class="w-full pl-10 pr-2 py-1 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-900"
            />
          </div>

          <BranchList 
            localTree={localTree()} 
            remoteTree={remoteTree()} 
            activeBranch={props.repo.activeBranch}
            repoPath={props.repo.path}
            selectedBranch={selectedBranch()}
            onSelectBranch={selectBranch}
            refreshBranches={props.refreshBranches}
            onActivateBranch={(branch: string) => handleActiveBranch(props.repo.path, branch)}  
            />
        </div>
      </div>

      {/* Barra de resize */}
      <div
        class="resize-bar-vertical"
        onMouseDown={startResize}
      ></div>

      {/* Painel direito */}
      {viewMode() === "commits" && (
        <CommitsList 
          repo={props.repo} 
          branch={selectedBranch() && props.repo.branches.some(b => b.name === selectedBranch()) 
            ? selectedBranch() 
            : props.repo.activeBranch} 
        />
      )}
      {viewMode() === "changes" && <LocalChanges repo={props.repo}/>}

      <BranchSwitchModal
        open={modalSwtBranchOpen()}
        branch={targetBranch() ?? ""}
        onCancel={() => setModalSwtBranchOpen(false)}
        onDiscard={doDiscard}
        onStashAndApply={doStashAndApply}
      />

      <UserConfigModal 
        repoPath={props.repo.path} 
        isOpen={isUserConfigOpen()} 
        onClose={() => setIsUserConfigOpen(false)} 
      />
    </div>
  );
}
