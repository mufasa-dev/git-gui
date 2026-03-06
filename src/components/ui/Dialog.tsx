import { JSX, Show } from "solid-js";

type Props = {
  open: boolean;
  title?: string;
  width?: string | number;
  onClose?: () => void;
  children: JSX.Element;
};

export default function Dialog(props: Props) {
  const width = typeof props.width === "number" ? `${props.width}px` : props.width || "400px";

  return (
    <Show when={props.open}>
      <div
        class="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50"
        onClick={props.onClose}
      >
        <div
          class="bg-white dark:bg-gray-800 rounded shadow-xl relative"
          style={{ width }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div class="flex items-center justify-between bg-gray-600 dark:bg-gray-700 px-4 py-2 rounded-t">
            <span class="text-white font-bold">{props.title}</span>
            <button
              class="text-white hover:text-gray-300"
              onClick={props.onClose}
            >
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          {/* Conteúdo */}
          <div class="p-6">
            {props.children}
          </div>
        </div>
      </div>
    </Show>
  );
}
