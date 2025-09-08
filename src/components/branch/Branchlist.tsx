import { createSignal } from "solid-js";
import TreeView, { TreeNodeMap }  from "../ui/TreeView";

type Props = {
  localTree: TreeNodeMap;
  remoteTree: TreeNodeMap;
  activeBranch?: string;
  selectedBranch?: string;
  onSelectBranch?: (branch: string) => void;
  onActivateBranch?: (branch: string) => void;
};

export default function BranchList(props: Props) {
  const [openBranch, setOpenBranch] = createSignal<boolean>(true);
  const [openRemote, setOpenRemote] = createSignal<boolean>(false);

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
      />}

      <b onClick={() => setOpenRemote(!openRemote())} class="cursor-pointer mt-4 block">
        <i class="fa-solid" classList={{"fa-caret-down" : openRemote(), "fa-caret-right" : !openRemote()}}></i>
        Remotes
      </b>
      {openRemote() && <TreeView tree={props.remoteTree}
        activeBranch={props.activeBranch}
        selectedBranch={props.selectedBranch}
        onSelectBranch={props.onSelectBranch} 
      />}
    </div>
  );
}
