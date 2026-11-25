import { createSignal, For, onCleanup, Show } from "solid-js";
import { Repo } from "../../models/Repo.model";

const MAX_TAB_NAME_LENGTH = 24;
const REPO_ROLE_LABELS: Record<string, string> = {
  ui: "UI",
  dashboard: "Dashboard",
  bim: "BIM",
  main: "Main",
  api: "API",
  backend: "Backend",
  frontend: "Frontend",
  server: "Server",
};

const formatRepoPart = (part: string) => {
  if (/^[A-Z0-9]+$/.test(part)) return part;
  return part.charAt(0).toUpperCase() + part.slice(1);
};

export function getRepoTabLabel(name: string): string {
  if (name.length <= MAX_TAB_NAME_LENGTH) return name;

  const parts = name.split(/[.\\/_-]+/).filter(Boolean);
  const lastPart = parts[parts.length - 1] || name;
  const roleLabel = REPO_ROLE_LABELS[lastPart.toLowerCase()];
  if (roleLabel) return roleLabel;

  const managerPart = [...parts].reverse().find((part) => /construmanager/i.test(part));
  if (managerPart) return formatRepoPart(managerPart);

  return formatRepoPart(lastPart);
}

const DRAG_THRESHOLD = 5;

type DragState = {
  path: string;
  pointerId: number;
  startX: number;
  dragging: boolean;
};

export default function TabBar(props: {
  repos: Repo[];
  active: string | null;
  onChangeActive: (id: string | null) => void;
  onClose: (id: string) => void;
  /** Move a aba `path` para a posição `toIndex` (contada sem a própria aba). */
  onReorder?: (path: string, toIndex: number) => void;
}) {
  let container: HTMLDivElement | undefined;
  let drag: DragState | null = null;
  let suppressClick = false;

  const [draggingPath, setDraggingPath] = createSignal<string | null>(null);
  const [offsetX, setOffsetX] = createSignal(0);
  /** Aba antes da qual a arrastada será solta (`null` = no final). */
  const [dropBefore, setDropBefore] = createSignal<string | null | undefined>(undefined);

  const otherTabs = (path: string) =>
    Array.from(container?.querySelectorAll<HTMLElement>("[data-tab-path]") ?? [])
      .filter((element) => element.dataset.tabPath !== path);

  /** Posição de destino entre as outras abas, pelo centro de cada uma. */
  const dropIndexAt = (clientX: number, path: string) => {
    const others = otherTabs(path);
    const index = others.findIndex((element) => {
      const rect = element.getBoundingClientRect();
      return clientX < rect.left + rect.width / 2;
    });
    return { index: index === -1 ? others.length : index, others };
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const deltaX = event.clientX - drag.startX;

    if (!drag.dragging) {
      if (Math.abs(deltaX) < DRAG_THRESHOLD) return;
      drag.dragging = true;
      setDraggingPath(drag.path);
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
    }

    setOffsetX(deltaX);
    const { index, others } = dropIndexAt(event.clientX, drag.path);
    setDropBefore(others[index]?.dataset.tabPath ?? null);

    // Rola a barra quando a aba chega perto das bordas.
    if (container) {
      const rect = container.getBoundingClientRect();
      if (event.clientX < rect.left + 30) container.scrollLeft -= 12;
      else if (event.clientX > rect.right - 30) container.scrollLeft += 12;
    }
  };

  const finishDrag = (event: PointerEvent, cancelled = false) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const current = drag;
    drag = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerCancel);

    if (current.dragging) {
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
      if (!cancelled) {
        const { index } = dropIndexAt(event.clientX, current.path);
        props.onReorder?.(current.path, index);
      }
    }

    setDraggingPath(null);
    setOffsetX(0);
    setDropBefore(undefined);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };

  const onPointerUp = (event: PointerEvent) => finishDrag(event);
  const onPointerCancel = (event: PointerEvent) => finishDrag(event, true);

  const startDrag = (event: PointerEvent, path: string) => {
    if (!props.onReorder || event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return; // botão de fechar
    drag = { path, pointerId: event.pointerId, startX: event.clientX, dragging: false };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
  };

  onCleanup(() => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerCancel);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  });

  const lastOtherPath = () => {
    const path = draggingPath();
    const others = props.repos.filter((repo) => repo.path !== path);
    return others[others.length - 1]?.path;
  };

  return (
    <div ref={container} class="flex border-b bg-gray-200 dark:bg-gray-900 dark:border-gray-800 overflow-x-auto pl-2">
      <For each={props.repos}>
        {(repo) => (
          <div
            data-tab-path={repo.path}
            class={`relative px-4 py-2 cursor-pointer rounded-t-xl flex shrink-0 items-center transition-colors border-b-0 ${
              props.active === repo.path
                ? "border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 dark:text-white"
                : "bg-gray-200 hover:bg-gray-100 dark:bg-gray-900 dark:text-gray-400"
            }`}
            classList={{
              "z-20 opacity-90 shadow-lg ring-1 ring-blue-400/60 !transition-none": draggingPath() === repo.path,
              "shadow-[inset_3px_0_0_0_#3b82f6]": draggingPath() !== null && draggingPath() !== repo.path && dropBefore() === repo.path,
              "shadow-[inset_-3px_0_0_0_#3b82f6]": draggingPath() !== null && dropBefore() === null && lastOtherPath() === repo.path,
            }}
            style={draggingPath() === repo.path ? { transform: `translateX(${offsetX()}px)` } : undefined}
            onPointerDown={(event) => startDrag(event, repo.path)}
            onClick={() => {
              if (suppressClick) return;
              props.onChangeActive(repo.path);
            }}
            title={repo.name}
          >
            {(repo.localChangesCount ?? repo.localChanges?.length ?? 0) > 0 && (
              <i class="fa-solid fa-circle text-orange-500 text-[8px] mr-2"></i>
            )}
            <span class="truncate max-w-[150px] text-sm font-medium">{getRepoTabLabel(repo.name)}</span>
            <button
              class="ml-3 text-gray-400 hover:text-red-500 transition-colors"
              onClick={e => {
                e.stopPropagation();
                props.onClose(repo.path);
              }}
            >
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        )}
      </For>
      <Show when={props.repos.length > 0}>
        <button
          onClick={() => props.onChangeActive(null)}
          title="Abrir Tela Inicial"
          class={`p-3 h-full flex items-center justify-center transition-colors ${
              props.active === null 
              ? "bg-white dark:bg-gray-800 rounded-t-xl text-gray-400 shadow-inner" 
              : "text-gray-400"
          }`}
        >
          <i class="fa-solid fa-plus"></i>
        </button>
      </Show>
    </div>
  );
}
