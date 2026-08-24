import { createEffect, createSignal } from "solid-js";
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
  pathPrefix?: string;
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
  const pathPrefix = () => props.pathPrefix || "";
  const [open, setOpen] = createSignal<{ [key: string]: boolean }>(
    buildOpenMap(props.tree, pathPrefix()),
  );

  const getNodePath = (node: TreeNode) =>
    pathPrefix() ? `${pathPrefix()}/${node.name}` : node.name;

  const openSelectedAncestors = (
    tree: TreeNodeMap,
    selectedBranch: string,
    prefix: string,
    next: { [key: string]: boolean },
  ) => {
    for (const node of Object.values(tree)) {
      if (!node.children) continue;

      const nodePath = prefix ? `${prefix}/${node.name}` : node.name;
      if (selectedBranch === nodePath || selectedBranch.startsWith(`${nodePath}/`)) {
        next[nodePath] = true;
        openSelectedAncestors(node.children, selectedBranch, nodePath, next);
      }
    }
  };

  createEffect(() => {
    const tree = props.tree;
    const selectedBranch = props.selectedBranch;
    const prefix = pathPrefix();

    setOpen((prev) => {
      const next = { ...prev };
      Object.keys(buildOpenMap(tree, prefix)).forEach((key) => {
        if (!(key in next)) next[key] = true;
      });
      if (selectedBranch) {
        openSelectedAncestors(tree, selectedBranch, prefix, next);
      }
      return next;
    });
  });

  const toggle = (key: string) => {
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleClick = (node: TreeNode) => {
    if (node.children) {
      toggle(getNodePath(node));
    } else {
      props.onSelectBranch?.(node.original);
    }
  };

  return (
    <ul class="ml-4 min-w-0 space-y-1">
      {Object.values(props.tree).map((node) => {
        const isLeaf = !node.children;
        const nodePath = getNodePath(node);
        const isActive = node.original === props.activeBranch;
        const isSelected = node.original === props.selectedBranch;
        const folderVisual = getFolderVisual(node.name, !!open()[nodePath]);
        return (
            <li>
                <div
                  class={`flex min-w-0 cursor-pointer select-none items-center ${isSelected ? "font-bold text-green-600" : ""}`}
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
                  {!isLeaf && <i class="fa-solid" classList={{"fa-caret-down" : open()[nodePath], "fa-caret-right" : !open()[nodePath]}}></i>}
                  {!isLeaf && <i class={`fa-solid mr-1 ${folderVisual.icon} ${folderVisual.color}`}></i>}
                  {isLeaf && <i class="fa-solid" classList={{"fa-code-branch" : !isActive, "fa-check" : isActive}}></i>}
                  <div class="min-w-0 flex-1 truncate ml-1">{ node.name }</div>
                  <div class="ml-auto shrink-0 whitespace-nowrap">
                    {node.ahead > 0 && <span class="text-green-600">↑{node.ahead}</span>}
                    {node.behind > 0 && <span class="text-red-600">↓{node.behind}</span>}
                  </div>
                </div>
                {node.children && open()[nodePath] && (
                    <TreeView
                        tree={node.children || {}}
                        activeBranch={props.activeBranch}
                        selectedBranch={props.selectedBranch}
                        onSelectBranch={props.onSelectBranch}
                        onActivateBranch={props.onActivateBranch}
                        openContextMenu={props.openContextMenu}
                        pathPrefix={nodePath}
                    />
                )}
          </li>
        )}
      )}
    </ul>
  );
}
