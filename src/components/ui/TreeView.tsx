import { createSignal } from "solid-js";

type TreeNode = {
  name: string;      // nome exibido (ex: "main")
  original: string;  // nome original (ex: "origin/main")
  children?: TreeNodeMap;
};

export type TreeNodeMap = { [key: string]: TreeNode };

export type TreeViewProps = {
  tree: TreeNodeMap;
  activeBranch?: string;
  onSelectBranch?: (branch: string) => void;
};

export function buildTree(branches: string[]): TreeNodeMap {
  const tree: TreeNodeMap = {};

  branches.forEach((branch) => {
    const clean = branch.trim();

    if (clean.startsWith("HEAD ->")) return;

    const parts = clean.split("/"); // exemplo: "origin/main" -> ["origin","main"]
    let current = tree;

    parts.forEach((part, i) => {
      const isLeaf = i === parts.length - 1;

      if (!current[part]) {
        current[part] = {
          name: part,      // nome exibido
          original: isLeaf ? clean : "", // somente nó final mantém o original
          children: isLeaf ? undefined : {},
        };
      }

      if (!isLeaf) {
        current = current[part].children!;
      }
    });
  });

  return tree;
}

export default function TreeView(props: TreeViewProps) {
  const [open, setOpen] = createSignal<{ [key: string]: boolean }>({});

  const toggle = (key: string) => {
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleClick = (node: TreeNode) => {
    if (node.children) {
      toggle(node.name);
    } else {
      props.onSelectBranch?.(node.original);
    }
  };

  return (
    <ul class="ml-4 space-y-1">
      {Object.values(props.tree).map((node) => {
        const isLeaf = !node.children;
        const isActive = node.original === props.activeBranch;
        return (
            <li>
                <div
                class={`cursor-pointer select-none ${isActive ? "font-bold text-green-600" : ""}`}
                onClick={() => handleClick(node)}
                >
                {isLeaf ? "" : open()[node.name] ? <i class="fa-solid fa-caret-down"></i>  : <i class="fa-solid fa-caret-right"></i> } { node.name }
                </div>
                {node.children && open()[node.name] && (
                    <TreeView
                        tree={node.children || {}}
                        activeBranch={props.activeBranch}
                        onSelectBranch={props.onSelectBranch}
                    />
                )}
          </li>
        )}
      )}
    </ul>
  );
}
