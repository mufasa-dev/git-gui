import TreeView, { buildTree }  from "../ui/TreeView";

type Props = {
  branches: string[];
  remoteBranches?: string[];
};

export default function BranchList(props: Props) {
  const localTree = buildTree(props.branches);
  const remoteTree = props.remoteBranches
    ? buildTree(props.remoteBranches)
    : {};

  return (
    <div>
      <b>Branchs</b>
      <TreeView tree={localTree} />

      <b>Remotes</b>
      <TreeView tree={remoteTree} />
    </div>
  );
}
