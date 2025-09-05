import { TreeNodeMap } from "../components/ui/TreeView";

export function buildOpenMap(tree: TreeNodeMap): { [key: string]: boolean } {
  const open: { [key: string]: boolean } = {};
  for (const key in tree) {
    open[key] = true;
    if (tree[key].children) {
      Object.assign(open, buildOpenMap(tree[key].children!));
    }
  }
  return open;
}