import { For, JSX } from "solid-js";

export type ContextMenuItem = {
  label: string;
  hr?: boolean;
  action: () => void;
};

type ContextMenuProps = {
  items: ContextMenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
};

export default function ContextMenu(props: ContextMenuProps) {
  return (
    <div
      class="absolute bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded shadow-md z-50"
      style={{ top: `${props.position.y}px`, left: `${props.position.x}px` }}
    >
      <ul class="py-1 text-sm">
        <For each={props.items}>
          {(item) => (
            <li>
              <button
                class="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600"
                onClick={() => {
                  item.action();
                  props.onClose();
                }}
              >
                {item.label}
              </button>
              {item.hr && <hr class="my-1 border-gray-300 dark:border-gray-600" />}
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}
