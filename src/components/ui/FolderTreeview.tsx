import { createSignal, For, Show } from "solid-js";

type ChangeItem = {
  path: string;
  status: string;
};

export function FolderTreeView(props: { 
    items: ChangeItem[],
    selected: string[];
    onToggle: (path: string, selected: boolean) => void;
    onContextMenu?: (e: MouseEvent, item: any) => void;
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

  const tree = () => buildTree(props.items);

  return (
    <ul class="ml-2 space-y-1">
      <For each={Object.entries(tree())}>
        {([name, child]: any) => (
            <TreeNode node={child} name={name} path={name} selected={props.selected} onToggle={props.onToggle} onContextMenu={props.onContextMenu} />
        )}
      </For>
    </ul>
  );
}

function TreeNode(props: { 
    node: any; 
    name: string; 
    path: string; 
    selected: string[]; 
    onToggle: (path: string, selected: boolean) => void;
    onContextMenu?: (e: MouseEvent, item: any) => void }
  ) {
  const [open, setOpen] = createSignal(true);

  const entries = () =>
    Object.entries(props.node.__children || {}).concat(
      props.node.__isFile ? [[props.name, props.node]] : []
    );

  const toggle = () => {
    if (props.node.__isFile) {
      const currentlySelected = props.selected.includes(props.path);
      props.onToggle(props.path, !currentlySelected);
    } else {
      // Se for pasta, toggle todos os arquivos filhos
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
      const allPaths = collectPaths(props.node, props.path);
      const allSelected = allPaths.every((p) => props.selected.includes(p));
      allPaths.forEach((p) => props.onToggle(p, !allSelected));
    }
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
      props.onContextMenu && props.onContextMenu(e, { path: props.path, status: props.node.__status });
    }}>
      <div
        class="cursor-pointer select-none flex items-center"
        classList={{ "text-blue-500": props.selected.includes(props.path) }}
        onClick={toggle}
      >
        {props.node.__isFile ? (
          <span title={props.name} class="pl-4 text-sm truncate">
            <span class={'px-1 rounded text-white ' + getStatusStyle(props.node.__status || '')}>
              {getStatusLetter(props.node.__status)}
            </span>{" "}
            <i class="fa-regular fa-file"></i> {props.name}
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
                onToggle={props.onToggle}
                onContextMenu={props.onContextMenu}
              />
            )}
          </For>
        </ul>
      </Show>
    </li>
  );
}

