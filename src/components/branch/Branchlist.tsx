import { createSignal, onCleanup, Show } from "solid-js";
import TreeView, { TreeNodeMap }  from "../ui/TreeView";
import ContextMenu, { ContextMenuItem } from "../ui/ContextMenu";
import { notify } from "../../utils/notifications";
import { useLoading } from "../ui/LoadingContext";
import { useApp } from "../../context/AppContext";
import ConfirmModal from "../ui/ConfirmModal";
import { checkoutRemoteBranch, deleteBranch, deleteRemoteBranch, getRemoteUrl, mergeBranch, pullBranchWithoutCheckout } from "../../services/gitService";
import { githubService } from "../../services/github";
import { azureService } from "../../services/azure";
import { getProviderFromUrl } from "../../utils/gitProvider";
import MergeBranchModal from "./MergeBranchModal";

type Props = {
  localTree: TreeNodeMap;
  remoteTree: TreeNodeMap;
  localBranchCount: number;
  remoteBranchCount: number;
  activeBranch?: string;
  selectedBranch?: string;
  repoPath: string;
  onSelectBranch?: (branch: string) => void;
  onActivateBranch?: (branch: string) => void;
  onCreatePR?: (branch: string) => void;
  refreshBranches: (path: string) => Promise<void>;
};

export default function BranchList(props: Props) {
  const [openBranch, setOpenBranch] = createSignal<boolean>(true);
  const [openRemote, setOpenRemote] = createSignal<boolean>(false);
  const [menuVisible, setMenuVisible] = createSignal(false);
  const [menuPos, setMenuPos] = createSignal({ x: 0, y: 0 });
  const [menuItems, setMenuItems] = createSignal<ContextMenuItem[]>([]);
  const [itemName, setItemName] = createSignal<string>("");
  const [draggedBranch, setDraggedBranch] = createSignal<string | null>(null);
  const [dropTargetBranch, setDropTargetBranch] = createSignal<string | null>(null);
  const [pointerBranch, setPointerBranch] = createSignal<string | null>(null);
  const [pointerDragging, setPointerDragging] = createSignal(false);
  const [mergeSource, setMergeSource] = createSignal<string | null>(null);
  const [mergeTarget, setMergeTarget] = createSignal<string | null>(null);
  const { showLoading, hideLoading } = useLoading();
  const [openModalConfirm, setModalConfirmOpen] = createSignal<{ id: string } | null>(null);
  const [modalConfirmTitle, setModalConfirmTitle] = createSignal<string>("");
  const [modalConfirmMessage, setModalConfirmMessage] = createSignal<string>("");
  const [modalConfirmOnExecute, setModalConfirmOnExecute] = createSignal<() => void>(() => {});
  const [modalConfirmOnCancel, setModalConfirmOnCancel] = createSignal<() => void>(() => {});
  const { t } = useApp();

  const clearDragState = () => {
    setDraggedBranch(null);
    setDropTargetBranch(null);
    setPointerBranch(null);
    setPointerDragging(false);
  };

  const handleBranchDragStart = (e: DragEvent, branch: string) => {
    setPointerBranch(null);
    setPointerDragging(false);
    setDraggedBranch(branch);
    setDropTargetBranch(null);
    e.dataTransfer?.setData("text/plain", branch);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
  };

  const handleBranchDragOver = (e: DragEvent, branch: string) => {
    const source = draggedBranch();
    if (!source || source === branch) {
      setDropTargetBranch(null);
      return;
    }

    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    setDropTargetBranch(branch);
  };

  const handleBranchDrop = (e: DragEvent, targetBranch: string) => {
    e.preventDefault();
    const sourceBranch = draggedBranch() || e.dataTransfer?.getData("text/plain");
    clearDragState();

    if (!sourceBranch || sourceBranch === targetBranch) return;

    setMergeSource(sourceBranch);
    setMergeTarget(targetBranch);
  };

  const handleBranchPointerDown = (_e: PointerEvent, branch: string) => {
    setPointerBranch(branch);
    setPointerDragging(false);
  };

  const handleBranchPointerMove = (_e: PointerEvent, targetBranch: string | null) => {
    const sourceBranch = pointerBranch();
    if (!sourceBranch) return;

    setPointerDragging(true);
    setDraggedBranch(sourceBranch);
    setDropTargetBranch(targetBranch && targetBranch !== sourceBranch ? targetBranch : null);
  };

  const handleBranchPointerUp = (_e: PointerEvent, targetBranch: string | null) => {
    const sourceBranch = pointerBranch();
    const wasDragging = pointerDragging();
    clearDragState();

    if (!wasDragging || !sourceBranch || !targetBranch || sourceBranch === targetBranch) return;

    setMergeSource(sourceBranch);
    setMergeTarget(targetBranch);
  };

  const confirmMerge = async () => {
    const sourceBranch = mergeSource();
    const targetBranch = mergeTarget();
    if (!sourceBranch || !targetBranch) return;

    setMergeSource(null);
    setMergeTarget(null);

    try {
      showLoading(`Mesclando ${sourceBranch} em ${targetBranch}...`);
      await mergeBranch(props.repoPath, sourceBranch, targetBranch);
      notify.success("Git Merge", `Branch '${sourceBranch}' mesclada com sucesso em '${targetBranch}'!`);
      await props.refreshBranches(props.repoPath);
    } catch (err: unknown) {
      const errorMessage = typeof err === "string" ? err : String(err);
      notify.error("Erro ao mesclar branches", errorMessage);
      console.error("Erro Git Merge:", errorMessage);
    } finally {
      hideLoading();
    }
  };

  const openContextMenu = (e: MouseEvent, branch: string) => {
    e.preventDefault();
    
    let items = [];
    let isNotActiveBranch = branch != props.activeBranch;

    if (isNotActiveBranch) {
      items.push({ 
        label: "Merge em " + props.activeBranch, 
        action: async () => {
          try {
            showLoading(`Mesclando ${branch} em ${props.activeBranch}...`);
            await mergeBranch(props.repoPath, branch, props.activeBranch!);
            notify.success('Git Merge', `Branch '${branch}' mesclada com sucesso em '${props.activeBranch}'!`);
            await props.refreshBranches(props.repoPath!);
          } catch (err: unknown) {
            const errorMessage = typeof err === 'string' ? err : String(err);
            notify.error('Erro ao mesclar branches', errorMessage);
            console.error("Erro Git Merge:", errorMessage);
          } finally {
            hideLoading();
          }
        }
      });
      items.push({
        label: t("git").pull,
        action: async () => {
          try {
            showLoading(`Atualizando ${branch}...`);
            const { provider, token } = await getRemoteAuth();
            await pullBranchWithoutCheckout(props.repoPath, branch, token, provider);
            notify.success("Git Pull", `Branch '${branch}' atualizada com sucesso!`);
            await props.refreshBranches(props.repoPath);
          } catch (error: unknown) {
            notify.error("Erro no Pull", typeof error === "string" ? error : String(error));
          } finally {
            hideLoading();
          }
        },
      });
    }

    items.push({ 
      label: t('pr').create_pull_request, action: async () => {
        if (props.onCreatePR) {
          props.onCreatePR(branch);
        }
      } 
    });

    if (isNotActiveBranch) {
      items.push({ 
        label: t('git').delete_branch, 
        action: async () => {
          try {
            showLoading("Deletando branch...");
            await deleteBranch(props.repoPath, branch, false);
            
            notify.success('Git Delete Branch', `Branch ${branch} apagada com sucesso!`);
            await props.refreshBranches(props.repoPath!);
            
          } catch (error: any) {
            hideLoading();
            if (error.includes("not fully merged")) {
              setModalConfirmTitle(t('common').confirm_remove);
              setModalConfirmMessage(
                `A branch '${branch}' não foi mesclada. Deseja forçar a exclusão (perder alterações)?`
              );
              setModalConfirmOnExecute(() => async () => {
                try {
                  showLoading("Forçando exclusão da branch...");
                  await deleteBranch(props.repoPath, branch, true);
                  notify.success('Git Delete Branch', `Branch ${branch} apagada à força!`);
                  await props.refreshBranches(props.repoPath!);
                } catch (forceError: any) {
                  notify.error('Erro ao deletar', forceError);
                }
              });
              setModalConfirmOnCancel(() => () => {
                setModalConfirmOpen(null);
                notify.error('Erro ao deletar branch', error);
              });
              setModalConfirmOpen({ id: branch });
            } else {
              
            }
          } finally {
            hideLoading();
          }
        } 
      });
    }

    setItemName(getBranchName(branch));
    setMenuItems(items);
    setMenuPos({ x: e.clientX, y: e.clientY });
    setMenuVisible(true);
  }

  const openRemoteContextMenu = (e: MouseEvent, branch: string) => {
    e.preventDefault();
    
    let items = [];
    let isNotActiveBranch = branch != props.activeBranch;

    if (isNotActiveBranch) {
      items.push({ 
        label: t("branch").checkout_remote_branch, 
        action: () => checkoutRemote(branch)
      });
      items.push({ 
        label: t("branch").delete_remote_branch +  " (Origin)", 
        action: async () => {
          setModalConfirmTitle(t('common').confirm_remove);
          setModalConfirmMessage(
            `Tem certeza que deseja apagar a branch '${branch}' no servidor remoto (origin)?\n\nEsta ação não pode ser desfeita.`
          );

          setModalConfirmOnExecute(() => async () => {
            try {
              showLoading("Deletando branch remota...");
              await deleteRemoteBranch(props.repoPath!, branch, "origin");
              
              hideLoading();
              notify.success('Git Remote', `Branch '${branch}' removida do servidor com sucesso!`);
              
              await props.refreshBranches(props.repoPath!);
              
            } catch (err: unknown) {
              const errorMessage = typeof err === 'string' ? err : String(err);
              
              notify.error('Erro ao deletar remota', errorMessage);
              console.error("Erro Git Remote:", errorMessage);
            } finally {
              hideLoading();
            }
          });

          try {
            showLoading("Deletando branch remota...");
            const { provider, token } = await getRemoteAuth();
            await deleteRemoteBranch(props.repoPath!, branch, "origin", token, provider);
            
            hideLoading();
            notify.success('Git Remote', `Branch '${branch}' removida do servidor com sucesso!`);
            
            await props.refreshBranches(props.repoPath!);
            
          } catch (err: unknown) {
            const errorMessage = typeof err === 'string' ? err : String(err);
            
            // Erros comuns aqui: Falha de autenticação ou branch protegida (main/master)
            notify.error('Erro ao deletar remota', errorMessage);
            console.error("Erro Git Remote:", errorMessage);
          } finally {
            hideLoading();
          }
        } 
      });
    }

    setItemName(getBranchName(branch));
    setMenuItems(items);
    setMenuPos({ x: e.clientX, y: e.clientY });
    setMenuVisible(true);
  }

  function getBranchName(fullBranchPath: string): string {
    return fullBranchPath.split('/').pop() || '';
  }

  const getRemoteAuth = async () => {
    const remoteUrl = await getRemoteUrl(props.repoPath);
    const provider = remoteUrl ? getProviderFromUrl(remoteUrl) : "unknown";
    const token = provider === "azure"
      ? await azureService.getToken() || ""
      : provider === "github"
        ? await githubService.getToken() || ""
        : "";
    return { provider, token };
  };

  const checkoutRemote = async (branch: string) => {
    try {
      showLoading("Checkout branch remota...");
      await checkoutRemoteBranch(props.repoPath, branch);
      notify.success('Git Remote', `Mudou para Branch '${branch}'`);
      props.refreshBranches(props.repoPath!);
    } catch (err: unknown) {
      const errorMessage = typeof err === 'string' ? err : String(err);
      notify.error('Erro ao mudar para branch remota', errorMessage);
      console.error("Erro Git Remote:", errorMessage);
    } finally {
      hideLoading();
    }
  }

  const hideContextMenu = () => setMenuVisible(false);

  document.addEventListener("click", hideContextMenu);
  onCleanup(() => document.removeEventListener("click", hideContextMenu));

  return (
    <div class="space-y-3">
      <div class="border-t border-gray-300 dark:border-gray-700">
        <button
          class="flex items-center w-full px-2 py-2 cursor-pointer text-left bg-transparent border-b border-gray-300 dark:border-gray-700 shadow-none"
          onClick={() => setOpenBranch(!openBranch())}
        >
          <i class="fa fa-laptop text-blue-500 mr-2"></i>
          <b class="text-sm">{t("git").local}</b>
          <span class="ml-2 text-[10px] rounded-full px-1.5 py-0.5 bg-blue-500/20 text-blue-600 dark:text-blue-300">{props.localBranchCount}</span>
          <i class={`fa-solid ml-auto text-xs ${openBranch() ? "fa-angle-down" : "fa-angle-right"}`}></i>
        </button>
        <Show when={openBranch()}>
          <div class="pr-2 mt-1">
            <TreeView
              tree={props.localTree}
              activeBranch={props.activeBranch}
              selectedBranch={props.selectedBranch}
              onSelectBranch={props.onSelectBranch}
              onActivateBranch={props.onActivateBranch}
              openContextMenu={openContextMenu}
              enableBranchDrag={true}
              draggedBranch={draggedBranch()}
              dropTargetBranch={dropTargetBranch()}
              onBranchDragStart={handleBranchDragStart}
              onBranchDragOver={handleBranchDragOver}
              onBranchDrop={handleBranchDrop}
              onBranchDragEnd={clearDragState}
              onBranchPointerDown={handleBranchPointerDown}
              onBranchPointerMove={handleBranchPointerMove}
              onBranchPointerUp={handleBranchPointerUp}
              onBranchPointerCancel={clearDragState}
            />
          </div>
        </Show>
      </div>

      <div class="border-t border-gray-300 dark:border-gray-700">
        <button
          class="flex items-center w-full px-2 py-2 cursor-pointer text-left bg-transparent border-b border-gray-300 dark:border-gray-700 shadow-none"
          onClick={() => setOpenRemote(!openRemote())}
        >
          <i class="fa fa-earth-americas text-purple-500 mr-2"></i>
          <b class="text-sm">{t("git").remote}</b>
            <span class="ml-2 text-[10px] rounded-full px-1.5 py-0.5 bg-purple-500/20 text-purple-600 dark:text-purple-300">{props.remoteBranchCount}</span>
          <i class={`fa-solid ml-auto text-xs ${openRemote() ? "fa-angle-down" : "fa-angle-right"}`}></i>
        </button>
        <Show when={openRemote()}>
          <div class="mt-1">
            <TreeView
              tree={props.remoteTree}
              activeBranch={props.activeBranch}
              onActivateBranch={checkoutRemote}
              selectedBranch={props.selectedBranch}
              onSelectBranch={props.onSelectBranch}
              openContextMenu={openRemoteContextMenu}
            />
          </div>
        </Show>
      </div>

      <Show when={menuVisible()}>
        <ContextMenu
          name={itemName()}
          items={menuItems()}
          position={menuPos()}
          onClose={() => setMenuVisible(false)}
        />
      </Show>
      <Show when={openModalConfirm()}>
          <ConfirmModal 
              isOpen={openModalConfirm() !== null}
              title={modalConfirmTitle()}
              message={modalConfirmMessage()}
              confirmText={t('common').delete}
              isDanger={true}
              onConfirm={() => modalConfirmOnExecute()()}
              onCancel={() => modalConfirmOnCancel()()}
          />
      </Show>

      <MergeBranchModal
        open={mergeSource() !== null && mergeTarget() !== null}
        sourceBranch={mergeSource() ?? ""}
        targetBranch={mergeTarget() ?? ""}
        onCancel={() => {
          setMergeSource(null);
          setMergeTarget(null);
        }}
        onConfirm={confirmMerge}
      />
    </div>
  );
}
