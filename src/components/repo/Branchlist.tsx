import TreeView, { Tree }  from "../ui/TreeView";

type Props = {
  localTree: Tree;
  remoteTree: Tree;
};

export default function BranchList(props: Props) {
  return (
    <div>
      <b>Branchs</b>
      <TreeView tree={props.localTree} />

      <b>Remotes</b>
      <TreeView tree={props.remoteTree} />
    </div>
  );
}
