import { createSignal, For, Show } from "solid-js";

type ChangeItem = {
  path: string;
  status: string;
};

export function FolderTreeView(props: { 
    items: ChangeItem[],
    selected: string[];
    onToggle: (path: string, selected: boolean) => void;
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
    console.log("tree", Object.entries(root));
    console.log("tree.name", root.name);
    console.log("tree.child", root.children);
    return root;
  };

  const tree = () => buildTree(props.items);

  return (
    <ul class="ml-2 space-y-1">
      <For each={Object.entries(tree())}>
        {([name, child]: any) => (
            <TreeNode node={child} name={name} path={name} selected={props.selected} onToggle={props.onToggle} />
        )}
      </For>
    </ul>
  );
}

function TreeNode(props: { node: any; name: string; path: string; selected: string[]; onToggle: (path: string, selected: boolean) => void }) {
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

  return (
    <li>
      <div
        class="cursor-pointer select-none flex items-center"
        classList={{ "bg-blue-100": props.selected.includes(props.path) }}
        onClick={toggle}
      >
        {props.node.__isFile ? (
          <span class="ml-4 text-sm">
            <span class="text-gray-500">
              [{props.node.__status?.charAt(0).toUpperCase()}]
            </span>{" "}
            <i class="fa fa-file"></i> {props.name}
          </span>
        ) : (
          <>
            <span class="mr-1">
              <i class="fa-solid" classList={{ 'fa-caret-down': open(), 'fa-caret-right': !open() }}></i>
            </span>
            <span>
              <i class="fa text-yellow-600" classList={{ 'fa-folder-open': open(), 'fa-folder': !open() }}></i> {props.name}
            </span>
          </>
        )}
      </div>

      <Show when={open() && !props.node.__isFile}>
        <ul class="ml-4">
          <For each={Object.entries(props.node.__children)}>
            {([name, child]: any) => (
              <TreeNode
                node={child}
                name={name}
                path={props.path + "/" + name} // aqui passamos o path completo
                selected={props.selected}
                onToggle={props.onToggle}
              />
            )}
          </For>
        </ul>
      </Show>
    </li>
  );
}

