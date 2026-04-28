import { createSignal, onCleanup, Show } from "solid-js";
import TreeView, { TreeNodeMap }  from "../ui/TreeView";
import ContextMenu, { ContextMenuItem } from "../ui/ContextMenu";
import { checkoutRemoteBranch, deleteBranch, deleteRemoteBranch, mergeBranch, openPullRequestUrl } from "../../services/gitService";
import { notify } from "../../utils/notifications";
import { useLoading } from "../ui/LoadingContext";
import { useApp } from "../../context/AppContext";

type Props = {
  localTree: TreeNodeMap;
  remoteTree: TreeNodeMap;
  activeBranch?: string;
  selectedBranch?: string;
  repoPath: string;
  onSelectBranch?: (branch: string) => void;
  onActivateBranch?: (branch: string) => void;
  refreshBranches: (path: string) => Promise<void>
};

export default function BranchList(props: Props) {
  const [openBranch, setOpenBranch] = createSignal<boolean>(true);
  const [openRemote, setOpenRemote] = createSignal<boolean>(false);
  const [menuVisible, setMenuVisible] = createSignal(false);
  const [menuPos, setMenuPos] = createSignal({ x: 0, y: 0 });
  const [menuItems, setMenuItems] = createSignal<ContextMenuItem[]>([]);
  const [itemName, setItemName] = createSignal<string>("");
  const { showLoading, hideLoading } = useLoading();
  const { t } = useApp();

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
    }

    items.push({ 
      label: "Criar pull request", action: async () => {
        try {
          await openPullRequestUrl(props.repoPath, branch)
        } catch (error: unknown) {
          const errorMessage = typeof error === 'string' ? error : String(error);
          notify.error('Erro ao criar pull request', errorMessage);
        }
      } 
    });

    if (isNotActiveBranch) {
      items.push({ 
        label: "Deletar Branch", 
        action: async () => {
          try {
            showLoading("Deletando branch...");
            await deleteBranch(props.repoPath, branch, false);
            
            notify.success('Git Delete Branch', `Branch ${branch} apagada com sucesso!`);
            await props.refreshBranches(props.repoPath!);
            
          } catch (error: any) {
            hideLoading();
            if (error.includes("not fully merged")) {
              const confirmForce = confirm(
                `A branch '${branch}' não foi mesclada. Deseja forçar a exclusão (perder alterações)?`
              );
              
              if (confirmForce) {
                try {
                  showLoading("Forçando exclusão da branch...");
                  await deleteBranch(props.repoPath, branch, true);
                  notify.success('Git Delete Branch', `Branch ${branch} apagada à força!`);
                  await props.refreshBranches(props.repoPath!);
                } catch (forceError: any) {
                  notify.error('Erro ao deletar', forceError);
                }
              }
            } else {
              notify.error('Erro ao deletar branch', error);
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
        label: "Checkout Branch Remota", 
        action: () => checkoutRemote(branch)
      });
      items.push({ 
        label: "Deletar Branch Remota (Origin)", 
        action: async () => {
          const confirmed = confirm(
            `Tem certeza que deseja apagar a branch '${branch}' no servidor remoto (origin)?\n\nEsta ação não pode ser desfeita.`
          );

          if (!confirmed) return;

          try {
            showLoading("Deletando branch remota...");
            await deleteRemoteBranch(props.repoPath!, branch, "origin");
            
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
    <div class="h-[100px]">
      <b onClick={() => setOpenBranch(!openBranch())} class="collapse-btn">
        <b>
          <i class="fa fa-laptop"></i> {t("git").local}
        </b>
        <i class="fa-solid ml-auto" classList={{"fa-angle-down" : openBranch(), "fa-angle-right" : !openBranch()}}></i>
      </b>
      <div class="pr-2">
        {openBranch() && <TreeView tree={props.localTree} 
          activeBranch={props.activeBranch}
          selectedBranch={props.selectedBranch}
          onSelectBranch={props.onSelectBranch}
          onActivateBranch={props.onActivateBranch}
          openContextMenu={openContextMenu}
        />}
      </div>

      <b onClick={() => setOpenRemote(!openRemote())} class="collapse-btn mt-2">
        <b>
          <i class="fa fa-earth-americas"></i> {t("git").remote}
        </b>
        <i class="fa-solid ml-auto" classList={{"fa-angle-down" : openRemote(), "fa-angle-right" : !openRemote()}}></i>
      </b>
      {openRemote() && <TreeView tree={props.remoteTree}
        activeBranch={props.activeBranch}
        onActivateBranch={checkoutRemote}
        selectedBranch={props.selectedBranch}
        onSelectBranch={props.onSelectBranch} 
        openContextMenu={openRemoteContextMenu}
      />}
      <Show when={menuVisible()}>
        <ContextMenu
          name={itemName()}
          items={menuItems()}
          position={menuPos()}
          onClose={() => setMenuVisible(false)}
        />
      </Show>
    </div>
  );
}
