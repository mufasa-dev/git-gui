import { createEffect, createSignal, For, on, onCleanup, onMount, Show } from "solid-js";
import { Portal } from "solid-js/web";

export type ContextMenuItem = {
  label: string;
  hr?: boolean;
  icon?: string;
  danger?: boolean;
  disabled?: boolean;
  action: () => void;
};

type ContextMenuProps = {
  name: string;
  items: ContextMenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
};

const VIEWPORT_MARGIN = 8;

export default function ContextMenu(props: ContextMenuProps) {
  let menu: HTMLDivElement | undefined;
  const [coords, setCoords] = createSignal<{ x: number; y: number; maxHeight: number } | null>(null);

  const place = () => {
    if (!menu) return;
    const { x, y } = props.position;
    const width = menu.offsetWidth;
    const height = menu.scrollHeight;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const maxHeight = viewportHeight - VIEWPORT_MARGIN * 2;

    let left = x;
    if (left + width > viewportWidth - VIEWPORT_MARGIN) {
      left = x - width >= VIEWPORT_MARGIN ? x - width : viewportWidth - width - VIEWPORT_MARGIN;
    }

    let top = y;
    const visibleHeight = Math.min(height, maxHeight);
    if (top + visibleHeight > viewportHeight - VIEWPORT_MARGIN) {
      top = y - visibleHeight >= VIEWPORT_MARGIN ? y - visibleHeight : viewportHeight - visibleHeight - VIEWPORT_MARGIN;
    }

    setCoords({
      x: Math.max(VIEWPORT_MARGIN, left),
      y: Math.max(VIEWPORT_MARGIN, top),
      maxHeight,
    });
  };

  createEffect(on(() => [props.position.x, props.position.y, props.items.length], () => {
    setCoords(null);
    requestAnimationFrame(place);
  }));

  onMount(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    const onResize = () => props.onClose();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    onCleanup(() => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    });
  });

  return (
    <Portal>
      <div
        ref={menu}
        class="fixed z-[90] min-w-[180px] overflow-y-auto rounded border border-gray-300 bg-white text-gray-800 shadow-lg custom-scrollbar dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
        style={{
          top: `${coords()?.y ?? props.position.y}px`,
          left: `${coords()?.x ?? props.position.x}px`,
          "max-height": coords() ? `${coords()!.maxHeight}px` : undefined,
          visibility: coords() ? "visible" : "hidden",
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <ul class="text-sm">
          <Show when={props.name}>
            <li class="px-4 py-1 text-gray-500 dark:text-gray-400 text-xs font-semibold border-b border-gray-300 dark:border-gray-600">
              {props.name}
            </li>
          </Show>
          <For each={props.items}>
            {(item) => (
              <li>
                <button
                  class="flex w-full items-center whitespace-nowrap text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                  classList={{ "text-red-600 dark:text-red-400": item.danger }}
                  disabled={item.disabled}
                  onClick={() => {
                    if (item.disabled) return;
                    item.action();
                    props.onClose();
                  }}
                >
                  <Show when={item.icon}>
                    <i class={`${item.icon} mr-2.5 w-4 shrink-0 text-center text-[13px] opacity-75`}></i>
                  </Show>
                  {item.label}
                </button>
                {item.hr && <hr class="my-1 border-gray-300 dark:border-gray-600" />}
              </li>
            )}
          </For>
        </ul>
      </div>
    </Portal>
  );
}
