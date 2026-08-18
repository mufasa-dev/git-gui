import { For } from "solid-js";
import FileIcon from "./FileIcon";

type ChangeItem = {
  path: string;
  status: string;
};

type Props = {
  items: ChangeItem[];
  selected: string[];
  staged: boolean;
  onToggle: (path: string, selected: boolean, isFile: boolean) => void;
  onContextMenu?: (event: MouseEvent, item: ChangeItem & { staged: boolean }) => void;
  onDbClick?: (items: string[]) => void;
};

const statusStyles: Record<string, string> = {
  A: "bg-green-600",
  M: "bg-yellow-400",
  D: "bg-red-600",
  R: "bg-blue-600",
  C: "bg-purple-600",
  U: "bg-orange-600",
  "?": "bg-gray-600",
};

export function ChangeListView(props: Props) {
  const statusLetter = (status: string) => status.charAt(0).toUpperCase();
  const statusStyle = (status: string) => statusStyles[statusLetter(status)] || "bg-gray-600";

  return (
    <ul class="space-y-1 px-2">
      <For each={props.items}>
        {(item) => {
          const isSelected = () => props.selected.includes(item.path);
          return (
            <li
              class="cursor-pointer select-none flex items-center gap-2 rounded px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800"
              classList={{ "text-blue-500 bg-blue-100 dark:bg-blue-900/30": isSelected() }}
              onClick={() => props.onToggle(item.path, !isSelected(), true)}
              onDblClick={() => props.onDbClick?.([item.path])}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                props.onContextMenu?.(event, { ...item, staged: props.staged });
              }}
            >
              <span class={`px-1 rounded text-white text-[12px] ${statusStyle(item.status)}`}>
                {statusLetter(item.status)}
              </span>
              <FileIcon fileName={item.path} />
              <span class="truncate text-sm" title={item.path}>{item.path}</span>
            </li>
          );
        }}
      </For>
    </ul>
  );
}
