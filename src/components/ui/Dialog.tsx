import { JSX, Show } from "solid-js";

type Props = {
  open: boolean;
  title?: string;
  icon?: string;
  iconColor?: string;
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
          <div class="flex items-center justify-between border-b border-gray-200 bg-gray-50 p-4 rounded-t-xl dark:border-gray-700 dark:bg-gray-800">
            <div class="flex min-w-0 items-center gap-3">
              <Show when={props.icon}>
                <span class={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/40 ${props.iconColor || "text-blue-600 dark:text-blue-300"}`}>
                  <i class={props.icon}></i>
                </span>
              </Show>
              <span class="truncate text-gray-800 dark:text-white font-bold">{props.title}</span>
            </div>
            <button
              class="ml-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-red-500/10 hover:text-red-500 dark:text-gray-300 dark:hover:bg-red-500/20 dark:hover:text-red-400"
              aria-label="Fechar"
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
