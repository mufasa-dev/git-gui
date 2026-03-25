import { createSignal, For, Show } from "solid-js";
import FileIcon from "./FileIcon";
import alertIcon from '../../assets/alert.png';

type ChangeItem = {
  path: string;
  status: string;
};

export function FolderTreeView(props: { 
    items: ChangeItem[],
    selected: string[];
    staged: boolean;
    defaultOpen?: boolean;
    showStatus: boolean;
    onToggle: (path: string, selected: boolean) => void;
    onContextMenu?: (e: MouseEvent, item: any) => void;
    onDbClick?: (items: string[]) => void;
 }) {
  const buildTree = (files: ChangeItem[]) => {
    const root: any = {};
    for (const f of files) {
      const parts = f.path.split("/");
      let current = root;

      parts.forEach((part, idx) => {
        const isFile = idx === parts.length - 1;
        if (!current[part]) {
          current[part] = {
            __children: {},
            __isFile: isFile,
            __status: isFile ? f.status : undefined,
          };
        }
        current = isFile ? current : current[part].__children;
      });
    }
    return root;
  };

  const sortEntries = (entries: [string, any][]) => {
    return [...entries].sort(([nameA, nodeA], [nameB, nodeB]) => {
      // Se um é arquivo e o outro pasta, a pasta (isFile = false) vem primeiro
      if (nodeA.__isFile !== nodeB.__isFile) {
        return nodeA.__isFile ? 1 : -1;
      }
      // Se ambos são do mesmo tipo, ordena por nome
      return nameA.localeCompare(nameB);
    });
  };

  const tree = () => buildTree(props.items);
  const sortedRoot = () => sortEntries(Object.entries(tree()));

  return (
    <ul class="ml-2 space-y-1">
      <For each={sortedRoot()}>
        {([name, child]: any) => (
            <TreeNode 
              node={child} name={name} path={name} 
              selected={props.selected} staged={props.staged} 
              defaultOpen={props.defaultOpen}
              onToggle={props.onToggle} onContextMenu={props.onContextMenu} 
              onDbClick={props.onDbClick}
              showStatus={props.showStatus}
              sortFn={sortEntries}
            />
        )}
      </For>
    </ul>
  );
}

function TreeNode(props: { 
    node: any; 
    name: string; 
    path: string; 
    staged: boolean
    selected: string[];
    defaultOpen?: boolean;
    showStatus: boolean;
    onToggle: (path: string, selected: boolean) => void;
    onContextMenu?: (e: MouseEvent, item: any) => void;
    onDbClick?: (items: string[]) => void;
    sortFn: (entries: [string, any][]) => [string, any][];
  } ) {
  const [open, setOpen] = createSignal(props.defaultOpen ?? true);

  const sortedChildren = () => props.sortFn(Object.entries(props.node.__children || {}));

  const entries = () =>
    Object.entries(props.node.__children || {}).concat(
      props.node.__isFile ? [[props.name, props.node]] : []
    );

  const toggle = () => {
    if (props.node.__isFile) {
      const currentlySelected = props.selected.includes(props.path);
      props.onToggle(props.path, !currentlySelected);
    } else {
      // Se for pasta, seleciona todos os arquivos filhos
      const allPaths = collectPaths(props.node, props.path);
      const allSelected = allPaths.every((p) => props.selected.includes(p));
      allPaths.forEach((p) => props.onToggle(p, !allSelected));
    }
  };

  const collectPaths = (node: any, base: string): string[] => {
    let paths: string[] = [];
    if (node.__isFile) paths.push(base);
    else {
      for (const [childName, childNode] of Object.entries(node.__children)) {
        paths = paths.concat(collectPaths(childNode, base + "/" + childName));
      }
    }
    return paths;
  };

  const getStatusStyle = (status: string) => {
    const letter = getStatusLetter(status);
    switch (letter) {
      case 'A': return 'bg-green-600'; // Added
      case 'M': return 'bg-yellow-400';  // Modified
      case 'D': return 'bg-red-600';   // Deleted
      case 'R': return 'bg-blue-600';  // Renamed
      case 'C': return 'bg-purple-600'; // Copied
      case 'U': return 'bg-orange-600'; // Unmerged
      case '?': return 'bg-gray-600';   // Untracked
      case '!': return 'bg-black';      // Ignored
      default: return 'bg-gray-600';    // Unknown
    }
  }

  const getStatusLetter = (status: string) => {
    return status.charAt(0).toUpperCase();
  }

  return (
    <li oncontextmenu={(e) => { 
      e.preventDefault();
      e.stopPropagation();
      props.onContextMenu && props.onContextMenu(e, props.node.__isFile ? { path: props.path, status: props.node.__status, staged: props.staged } : null);
    }}>
      <div
        class="cursor-pointer select-none flex items-center"
        classList={{ "text-blue-500": props.selected.includes(props.path) }}
        onClick={toggle} onDblClick={() => {
          if (props.node.__isFile && props.onDbClick) {
            props.onDbClick([props.path]);
          }  else if (props.onDbClick) {
            const allPaths = collectPaths(props.node, props.path);
            props.onDbClick(allPaths);
          }
        }}
      >
        {props.node.__isFile ? (
          <span title={props.name} class="pl-4 text-sm truncate flex items-center">
            <Show when={props.showStatus}>
              <span class={'px-1 rounded text-white mr-2 ' + getStatusStyle(props.node.__status || '')}>
                {getStatusLetter(props.node.__status)}
              </span>{" "}
            </Show>
              <FileIcon fileName={props.name} /> 
              <span class="ml-2">{props.name} {props.showStatus}</span>
              <Show when={props.node.__status === "conflicted"}>
                <span title="Este arquivo possui conflitos de merge" class="text-red-500">
                  <img src={alertIcon} alt="Conflito" class="w-6 h-6 inline-block ml-2" />
                </span>
              </Show>
          </span>
        ) : (
          <>
            <span class="mr-1" onClick={() => setOpen(!open())}>
              <i class="fa-solid" classList={{ 'fa-caret-down': open(), 'fa-caret-right': !open() }}></i>
            </span>
            <span title={props.name} class="truncate">
              <i class="fa text-yellow-600" classList={{ 'fa-folder-open': open(), 'fa-folder': !open() }}></i> {props.name}
            </span>
          </>
        )}
      </div>

      <Show when={open() && !props.node.__isFile}>
        <ul class="pl-4">
          <For each={Object.entries(props.node.__children)}>
            {([name, child]: any) => (
              <TreeNode
                node={child}
                name={name}
                path={props.path + "/" + name}
                selected={props.selected}
                staged={props.staged}
                defaultOpen={props.defaultOpen}
                onToggle={props.onToggle}
                onContextMenu={props.onContextMenu}
                onDbClick={props.onDbClick}
                sortFn={props.sortFn}
                showStatus={props.showStatus}
              />
            )}
          </For>
        </ul>
      </Show>
    </li>
  );
}

