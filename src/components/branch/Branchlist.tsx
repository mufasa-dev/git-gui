import { createSignal, onCleanup, Show } from "solid-js";
import TreeView, { TreeNodeMap }  from "../ui/TreeView";
import ContextMenu, { ContextMenuItem } from "../ui/ContextMenu";
import { checkoutRemoteBranch, deleteBranch, deleteRemoteBranch, mergeBranch, openPullRequestUrl } from "../../services/gitService";
import { notify } from "../../utils/notifications";

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

  const openContextMenu = (e: MouseEvent, branch: string) => {
    e.preventDefault();
    
    let items = [];
    let isNotActiveBranch = branch != props.activeBranch;

    if (isNotActiveBranch) {
      items.push({ label: "Merge em " + props.activeBranch, action: () => mergeBranch(props.repoPath, branch, props.activeBranch!) });
    }

    items.push({ label: "Criar pull request", action: () => openPullRequestUrl(props.repoPath, branch) });

    if (isNotActiveBranch) {
      items.push({ 
      label: "Deletar Branch", 
      action: async () => {
        try {
          await deleteBranch(props.repoPath, branch, false);
          
          notify.success('Git Delete Branch', `Branch ${branch} apagada com sucesso!`);
          await props.refreshBranches(props.repoPath!);
          
        } catch (error: any) {
          if (error.includes("not fully merged")) {
            const confirmForce = confirm(
              `A branch '${branch}' não foi mesclada. Deseja forçar a exclusão (perder alterações)?`
            );
            
            if (confirmForce) {
              try {
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
        }
      } 
    });
    }

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
            await deleteRemoteBranch(props.repoPath!, branch, "origin");
            
            notify.success('Git Remote', `Branch '${branch}' removida do servidor com sucesso!`);
            
            await props.refreshBranches(props.repoPath!);
            
          } catch (err: unknown) {
            const errorMessage = typeof err === 'string' ? err : String(err);
            
            // Erros comuns aqui: Falha de autenticação ou branch protegida (main/master)
            notify.error('Erro ao deletar remota', errorMessage);
            console.error("Erro Git Remote:", errorMessage);
          }
        } 
      });
    }

    setMenuItems(items);
    setMenuPos({ x: e.clientX, y: e.clientY });
    setMenuVisible(true);
  }

  const checkoutRemote = async (branch: string) => {
    try {
      await checkoutRemoteBranch(props.repoPath, branch);
      notify.success('Git Remote', `Mudou para Branch '${branch}'`);
      props.refreshBranches(props.repoPath!);
    } catch (err: unknown) {
      const errorMessage = typeof err === 'string' ? err : String(err);
      notify.error('Erro ao mudar para branch remota', errorMessage);
      console.error("Erro Git Remote:", errorMessage);
    }
  }

  const hideContextMenu = () => setMenuVisible(false);
  
  document.addEventListener("click", hideContextMenu);
  onCleanup(() => document.removeEventListener("click", hideContextMenu));

  return (
    <div class="h-[100px]">
      <b onClick={() => setOpenBranch(!openBranch())} class="cursor-pointer">
        <i class="fa-solid" classList={{"fa-caret-down" : openBranch(), "fa-caret-right" : !openBranch()}}></i>
         Branchs
      </b>
      {openBranch() && <TreeView tree={props.localTree} 
        activeBranch={props.activeBranch}
        selectedBranch={props.selectedBranch}
        onSelectBranch={props.onSelectBranch}
        onActivateBranch={props.onActivateBranch}
        openContextMenu={openContextMenu}
      />}

      <b onClick={() => setOpenRemote(!openRemote())} class="cursor-pointer mt-4 block">
        <i class="fa-solid" classList={{"fa-caret-down" : openRemote(), "fa-caret-right" : !openRemote()}}></i>
        Remotes
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
          items={menuItems()}
          position={menuPos()}
          onClose={() => setMenuVisible(false)}
        />
      </Show>
    </div>
  );
}
