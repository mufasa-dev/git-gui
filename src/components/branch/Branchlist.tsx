import { createSignal, onCleanup, Show } from "solid-js";
import TreeView, { TreeNodeMap }  from "../ui/TreeView";
import ContextMenu, { ContextMenuItem } from "../ui/ContextMenu";
import { openPullRequestUrl } from "../../services/gitService";

type Props = {
  localTree: TreeNodeMap;
  remoteTree: TreeNodeMap;
  activeBranch?: string;
  selectedBranch?: string;
  repoPath: string;
  onSelectBranch?: (branch: string) => void;
  onActivateBranch?: (branch: string) => void;
};

export default function BranchList(props: Props) {
  const [openBranch, setOpenBranch] = createSignal<boolean>(true);
  const [openRemote, setOpenRemote] = createSignal<boolean>(false);
  const [menuVisible, setMenuVisible] = createSignal(false);
  const [menuPos, setMenuPos] = createSignal({ x: 0, y: 0 });
  const [menuItems, setMenuItems] = createSignal<ContextMenuItem[]>([]);

  const openContextMenu = (e: MouseEvent,branch: string) => {
    e.preventDefault();
    
    let items = [];

    items.push({ label: "Criar pull request", action: () => openPullRequestUrl(props.repoPath, branch) });

    setMenuItems(items);
    setMenuPos({ x: e.clientX, y: e.clientY });
    setMenuVisible(true);
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
        selectedBranch={props.selectedBranch}
        onSelectBranch={props.onSelectBranch} 
        openContextMenu={openContextMenu}
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
