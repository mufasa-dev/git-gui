import { TreeNodeMap } from "../components/ui/TreeView";

export function buildOpenMap(tree: TreeNodeMap, pathPrefix = ""): { [key: string]: boolean } {
  const open: { [key: string]: boolean } = {};
  for (const key in tree) {
    const nodePath = pathPrefix ? `${pathPrefix}/${key}` : key;
    open[nodePath] = true;
    if (tree[key].children) {
      Object.assign(open, buildOpenMap(tree[key].children!, nodePath));
    }
  }
  return open;
}