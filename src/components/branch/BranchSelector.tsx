import { createSignal, Show, For, onCleanup } from "solid-js";
import { Repo } from "../../models/Repo.model";
import { checkoutBranch, getLocalChanges, resetHard, stashChanges, stashPop } from "../../services/gitService";
import { notify } from "../../utils/notifications";
import { useLoading } from "../ui/LoadingContext";
import { useApp } from "../../context/AppContext";
import BranchSwitchModal from "./BranchSwitchModal";

type BranchSelectorProps = {
  activeRepo: Repo | null;
  refreshBranches: (repoPath: string) => Promise<void>;
};

export default function BranchSelector(props: BranchSelectorProps) {
  const [isOpen, setIsOpen] = createSignal(false);
  const [modalSwtBranchOpen, setModalSwtBranchOpen] = createSignal(false);
  const [targetBranch, setTargetBranch] = createSignal<string | null>(null);
  
  const { showLoading, hideLoading } = useLoading();
  const { t } = useApp();
  let dropdownRef: HTMLDivElement | undefined;

  const handleClickOutside = (e: MouseEvent) => {
    if (dropdownRef && !dropdownRef.contains(e.target as Node)) {
      setIsOpen(false);
    }
  };

  window.addEventListener("click", handleClickOutside);
  onCleanup(() => window.removeEventListener("click", handleClickOutside));

  const currentBranchInfo = () => {
    if (!props.activeRepo) return null;
    return props.activeRepo.branches.find(b => b.name === props.activeRepo?.activeBranch);
  };

  const handleActiveBranch = async (branchName: string) => {
    if (!props.activeRepo) return;
    if (branchName === props.activeRepo.activeBranch) {
      setIsOpen(false);
      return;
    }
    setIsOpen(false);

    try {
      const changes = await getLocalChanges(props.activeRepo.path);
      if (changes.length > 0) {
        setTargetBranch(branchName);
        setModalSwtBranchOpen(true);
      } else {
        showLoading(t('branch').changing_branch.replace('{{branch}}', branchName));
        await checkoutBranch(props.activeRepo.path, branchName);
        await props.refreshBranches(props.activeRepo.path);
        notify.success(t('git').git_checkout, `✅ ${t('branch').changed_to_branch.replace('{{branch}}', branchName)}`);
      }
    } catch (err) {
      notify.error('Erro', t('branch').error_changing_branch);
    } finally {
      hideLoading();
    }
  };

  async function doStashAndApply() {
    if (!props.activeRepo || !targetBranch()) return;
    try {
      showLoading("Salvando alterações locais no Stash...");
      await stashChanges(props.activeRepo.path);
      await checkoutBranch(props.activeRepo.path, targetBranch()!);
      await stashPop(props.activeRepo.path);
      await props.refreshBranches(props.activeRepo.path);
    } catch (err) {
      notify.error('Erro', t('branch').error_changing_branch);
    } finally {
      setModalSwtBranchOpen(false);
      hideLoading();
    }
  }

  async function doDiscard() {
    if (!props.activeRepo || !targetBranch()) return;
    try {
      showLoading("Descartando alterações locais...");
      await resetHard(props.activeRepo.path);
      await checkoutBranch(props.activeRepo.path, targetBranch()!);
      await props.refreshBranches(props.activeRepo.path);
    } catch (err) {
      notify.error('Erro', t('branch').error_changing_branch);
    } finally {
      setModalSwtBranchOpen(false);
      hideLoading();
    }
  }

  return (
    <Show when={props.activeRepo}>
      <div ref={dropdownRef} class="relative self-stretch flex items-center ml-4">
        
        {/* CARD SELETOR - Cores dinâmicas baseadas na sua UI (Light / Dark Mode) */}
        <div
          onClick={() => setIsOpen(!isOpen())}
          class="flex items-center h-[54px] min-w-[220px] max-w-[280px] bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700/40 border border-gray-300 dark:border-gray-700 rounded-xl p-2.5 transition-all cursor-pointer select-none group shadow-sm"
        >
          {/* Badge Lateral do Ícone */}
          <div class="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-600/10 text-blue-600 dark:text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-all mr-3 shrink-0">
            <i class="fa fa-code-branch text-base"></i>
          </div>

          {/* Textos de Identificação */}
          <div class="flex flex-col flex-1 min-w-0 justify-center">
            <span class="text-[10px] font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider leading-none mb-1">{t("branch").current_branch}</span>
            <span class="text-sm font-bold text-gray-900 dark:text-white truncate leading-none">
              {props.activeRepo!.activeBranch}
            </span>
          </div>

          {/* Indicadores de Ahead/Behind */}
          <div class="flex flex-col items-end justify-center ml-2 text-xs font-mono shrink-0 pr-1">
            <Show when={currentBranchInfo()?.ahead! > 0}>
              <span class="text-green-600 dark:text-green-400 font-bold">↑{currentBranchInfo()?.ahead}</span>
            </Show>
            <Show when={currentBranchInfo()?.behind! > 0}>
              <span class="text-red-600 dark:text-red-400 font-bold">↓{currentBranchInfo()?.behind}</span>
            </Show>
            <Show when={!currentBranchInfo()?.ahead && !currentBranchInfo()?.behind}>
              <i class="fa-solid fa-angle-down text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-transform duration-200" classList={{"rotate-180": isOpen()}}></i>
            </Show>
          </div>
        </div>

        {/* PAINEL DROP-DOWN - Acompanha bg-white no light e bg-gray-800 no dark mode */}
        <Show when={isOpen()}>
          <div class="absolute top-[60px] left-0 w-80 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-900 rounded-2xl shadow-2xl z-50 overflow-hidden border-t-4 border-t-blue-600 animate-in fade-in slide-in-from-top-2 duration-150">
            
            {/* Header Interno do Popover */}
            <div class="p-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-900 flex items-center justify-between">
              <span class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <i class="fa fa-laptop mr-1.5 text-blue-500 dark:text-blue-400"></i> Alternar Branch Local
              </span>
              <span class="text-[10px] bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded-full font-mono">
                {props.activeRepo!.branches.length}
              </span>
            </div>
            
            {/* Listagem de Branches */}
            <div class="py-1.5 max-h-72 overflow-y-auto">
              <For each={props.activeRepo!.branches}>
                {(branch) => {
                  const isCurrent = branch.name === props.activeRepo!.activeBranch;
                  return (
                    <button
                      onClick={() => handleActiveBranch(branch.name)}
                      class={`w-full text-left px-4 py-3 text-sm flex items-center justify-between transition-all ${
                        isCurrent 
                          ? "text-white font-bold bg-blue-600 shadow-md" 
                          : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/60 border-b border-gray-100 dark:border-gray-700/30"
                      }`}
                    >
                      <div class="flex items-center gap-3 truncate">
                        <i class={`fa-solid fa-code-branch text-xs ${isCurrent ? 'text-white' : 'text-gray-400 dark:text-gray-500'}`}></i>
                        <span class="truncate">{branch.name}</span>
                      </div>
                      
                      <div class="flex items-center gap-2 shrink-0 font-mono text-xs">
                        <Show when={isCurrent}>
                          <span class="bg-white/20 text-white text-[10px] uppercase px-1.5 py-0.5 rounded font-bold tracking-wider">Atual</span>
                        </Show>
                        <Show when={!isCurrent && branch.ahead > 0}>
                          <span class="text-green-600 dark:text-green-400 bg-green-500/10 px-1 rounded">↑{branch.ahead}</span>
                        </Show>
                        <Show when={!isCurrent && branch.behind > 0}>
                          <span class="text-red-600 dark:text-red-400 bg-red-500/10 px-1 rounded">↓{branch.behind}</span>
                        </Show>
                      </div>
                    </button>
                  );
                }}
              </For>
            </div>
          </div>
        </Show>

        <BranchSwitchModal
          open={modalSwtBranchOpen()}
          branch={targetBranch() ?? ""}
          onCancel={() => setModalSwtBranchOpen(false)}
          onDiscard={doDiscard}
          onStashAndApply={doStashAndApply}
        />
      </div>
    </Show>
  );
}