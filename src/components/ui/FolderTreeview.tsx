import { createSignal, For, Show } from "solid-js";

type ChangeItem = {
  path: string;
  status: string;
};

export function FolderTreeView(props: { items: ChangeItem[] }) {
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
          <TreeNode node={child} name={name} />
        )}
      </For>
    </ul>
  );
}

function TreeNode(props: { node: any; name: string }) {
  const [open, setOpen] = createSignal(true);

  const entries = () =>
    Object.entries(props.node.__children || {}).concat(
      props.node.__isFile ? [[props.name, props.node]] : []
    );

  return (
    <li>
      <div
        class="cursor-pointer select-none flex items-center"
        onClick={() => !props.node.__isFile && setOpen(!open())}
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
                <i class="fa-solid fa-caret-down" classList={{'fa-caret-right' : !open(), 'fa-caret-down' : open()}}></i>
            </span>
            <span>
              <i class="fa text-yellow-500" classList={{'fa-folder' : !open(), 'fa-folder-open' : open()}}></i> 
              {props.name}
            </span>
          </>
        )}
      </div>

      <Show when={open() && !props.node.__isFile}>
        <ul class="ml-4">
          <For each={Object.entries(props.node.__children)}>
            {([name, child]: any) => (
              <TreeNode node={child} name={name} />
            )}
          </For>
        </ul>
      </Show>
    </li>
  );
}
