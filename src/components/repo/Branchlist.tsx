import TreeView, { TreeNodeMap }  from "../ui/TreeView";

type Props = {
  localTree: TreeNodeMap;
  remoteTree: TreeNodeMap;
  activeBranch?: string;
  onSelectBranch?: (branch: string) => void;
};

export default function BranchList(props: Props) {
  return (
    <div class="h-[100px]">
      <b>Branchs</b>
      <TreeView tree={props.localTree} 
        activeBranch={props.activeBranch}
        onSelectBranch={props.onSelectBranch}
      />

      <b>Remotes</b>
      <TreeView tree={props.remoteTree}
        activeBranch={props.activeBranch}
        onSelectBranch={props.onSelectBranch} 
      />
    </div>
  );
}
