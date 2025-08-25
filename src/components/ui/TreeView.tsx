import { createSignal } from "solid-js";

export type Tree = {
  [key: string]: Tree | null;
};

export function buildTree(branches: string[]): Tree {
  const tree: Tree = {};

  branches.forEach((branch) => {
    // remove espaços extras
    const clean = branch.trim();

    // HEAD -> origin/main não é branch real
    if (clean.startsWith("HEAD ->")) return;

    const parts = clean.split("/");

    let current = tree;
    parts.forEach((part, i) => {
      if (!current[part]) {
        current[part] = i === parts.length - 1 ? null : {};
      }
      if (current[part] !== null) {
        current = current[part] as Tree;
      }
    });
  });

  return tree;
}

export default function TreeView(props: { tree: Tree }) {
  const [open, setOpen] = createSignal<{ [key: string]: boolean }>({});

  const toggle = (key: string) => {
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <ul class="ml-4 space-y-1">
      {Object.entries(props.tree).map(([key, value]) => (
        <li>
          {value ? (
            <div>
              <span
                class="cursor-pointer select-none"
                onClick={() => toggle(key)}
              >
                {open()[key] ? <i class="fa-solid fa-caret-down"></i> : <i class="fa-solid fa-caret-right"></i>} {key}
              </span>
              {open()[key] && <TreeView tree={value} />}
            </div>
          ) : (
            <span>{key}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
