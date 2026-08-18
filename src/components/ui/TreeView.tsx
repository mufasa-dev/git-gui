import { createSignal } from "solid-js";
import { Branch } from "../../models/Banch.model";
import { buildOpenMap } from "../../utils/tree";

type TreeNode = {
  name: string;      // nome exibido (ex: "main")
  original: string;  // nome original (ex: "origin/main")
  ahead: number;
  behind: number;
  children?: TreeNodeMap;
};

export type TreeNodeMap = { [key: string]: TreeNode };

export type TreeViewProps = {
  tree: TreeNodeMap;
  activeBranch?: string;
  selectedBranch?: string;
  onSelectBranch?: (branch: string) => void;
  onActivateBranch?: (branch: string) => void;
  openContextMenu?: (e: MouseEvent, branch: string) => void;
};

export function buildTree(branches: Branch[]): TreeNodeMap {
  const tree: TreeNodeMap = {};

  branches.forEach((branch) => {
    const clean = branch.name.trim();

    if (clean.startsWith("HEAD ->")) return;

    const parts = clean.split("/"); // exemplo: "origin/main" -> ["origin","main"]
    let current = tree;

    parts.forEach((part, i) => {
      const isLeaf = i === parts.length - 1;

      if (!current[part]) {
        current[part] = {
          name: part,
          ahead: branch.ahead,
          behind: branch.behind,
          original: isLeaf ? clean : "",
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

function getFolderVisual(name: string, isOpen: boolean) {
  const normalized = name.toLowerCase();

  if (["hotfix", "bug", "bugs"].includes(normalized)) {
    return { icon: "fa-bug", color: "text-red-500" };
  }
  if (["feature", "features"].includes(normalized)) {
    return { icon: "fa-lightbulb", color: "text-yellow-400" };
  }
  if (["release", "releases"].includes(normalized)) {
    return { icon: "fa-rocket", color: "text-purple-400" };
  }
  if (normalized === "origin") {
    return { icon: "fa-cloud-arrow-up", color: "text-blue-400" };
  }

  return {
    icon: isOpen ? "fa-folder-open" : "fa-folder",
    color: "text-yellow-600",
  };
}

export default function TreeView(props: TreeViewProps) {
  const [open, setOpen] = createSignal<{ [key: string]: boolean }>(buildOpenMap(props.tree));

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
        const isSelected = node.original === props.selectedBranch;
        const folderVisual = getFolderVisual(node.name, !!open()[node.name]);
        return (
            <li>
                <div
                  class={`cursor-pointer select-none flex items-center ${isSelected ? "font-bold text-green-600" : ""}`}
                  onClick={() => handleClick(node)}
                  onDblClick={() => {
                    if (!node.children) {
                      props.onActivateBranch?.(node.original);
                    }
                  }}
                  onContextMenu={(e: MouseEvent) => {
                    e.stopPropagation();
                    if (!node.children) {
                      props.openContextMenu?.(e, node.original);
                    }
                  }}
                >
                  {!isLeaf && <i class="fa-solid" classList={{"fa-caret-down" : open()[node.name], "fa-caret-right" : !open()[node.name]}}></i>} 
                  {!isLeaf && <i class={`fa-solid mr-1 ${folderVisual.icon} ${folderVisual.color}`}></i>}
                  {isLeaf && <i class="fa-solid" classList={{"fa-code-branch" : !isActive, "fa-check" : isActive}}></i>}
                  <div class="truncate ml-1">{ node.name }</div>
                  <div class="ml-auto">
                    {node.ahead > 0 && <span class="text-green-600">↑{node.ahead}</span>}
                    {node.behind > 0 && <span class="text-red-600">↓{node.behind}</span>}
                  </div>
                </div>
                {node.children && open()[node.name] && (
                    <TreeView
                        tree={node.children || {}}
                        activeBranch={props.activeBranch}
                        selectedBranch={props.selectedBranch}
                        onSelectBranch={props.onSelectBranch}
                        onActivateBranch={props.onActivateBranch}
                        openContextMenu={props.openContextMenu}
                    />
                )}
          </li>
        )}
      )}
    </ul>
  );
}
