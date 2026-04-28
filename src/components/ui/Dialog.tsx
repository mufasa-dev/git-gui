import { JSX, Show } from "solid-js";

type Props = {
  open: boolean;
  title?: string;
  width?: string | number;
  height?: string | number;
  bodyClass?: string;
  onClose?: () => void;
  children: JSX.Element;
};

export default function Dialog(props: Props) {
  const width = typeof props.width === "number" ? `${props.width}` : props.width || "400px";
  const height = typeof props.height === "number" ? `${props.height}` : props.height || "auto";

  return (
    <Show when={props.open}>
      <div
        class="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50"
        onClick={props.onClose}
      >
        <div
          class="bg-white dark:bg-gray-800 rounded-xl shadow-xl relative"
          style={{ width, height }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div class="flex items-center justify-between border-b border-gray-600 dark:border-gray-700 p-4 rounded-t-xl">
            <span class="text-gray-500 dark:text-white font-bold">{props.title}</span>
            <button
              class="text-gray-500 dark:text-white hover:text-red-500 transition-colors"
              onClick={props.onClose}
            >
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          {/* Conteúdo */}
          <div class={`${props.bodyClass ?? 'p-6'}`}>
            {props.children}
          </div>
        </div>
      </div>
    </Show>
  );
}
