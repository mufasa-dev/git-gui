import { createSignal, For, JSX, onCleanup, onMount, Show } from "solid-js";

type Mark = { type: string; top: number; height: number };

type Props = {
  class?: string;
  innerClass?: string;
  children: JSX.Element;
};

export default function DiffScrollArea(props: Props) {
  let scroller!: HTMLDivElement;
  let ruler!: HTMLDivElement;
  let frame = 0;

  const [marks, setMarks] = createSignal<Mark[]>([]);
  const [viewport, setViewport] = createSignal({ top: 0, height: 100 });
  const [scrollable, setScrollable] = createSignal(false);
  const [dragging, setDragging] = createSignal(false);

  const updateViewport = () => {
    const total = scroller.scrollHeight;
    if (!total) return;
    setScrollable(total > scroller.clientHeight + 1);
    setViewport({
      top: (scroller.scrollTop / total) * 100,
      height: Math.min(100, (scroller.clientHeight / total) * 100),
    });
  };

  const recompute = () => {
    frame = 0;
    const total = scroller.scrollHeight;
    if (!total) return;

    const base = scroller.getBoundingClientRect().top - scroller.scrollTop;
    const rows = scroller.querySelectorAll<HTMLElement>("[data-diff-line='add'],[data-diff-line='del']");
    const result: Mark[] = [];
    let last: Mark | null = null;

    rows.forEach((row) => {
      const rect = row.getBoundingClientRect();
      if (!rect.height) return;
      const type = row.dataset.diffLine || "";
      const top = rect.top - base;
      if (last && last.type === type && top <= last.top + last.height + 1) {
        last.height = top + rect.height - last.top;
      } else {
        last = { type, top, height: rect.height };
        result.push(last);
      }
    });

    setMarks(result.map((mark) => ({
      type: mark.type,
      top: (mark.top / total) * 100,
      height: (mark.height / total) * 100,
    })));
    updateViewport();
  };

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(recompute);
  };

  const scrollToRatio = (clientY: number) => {
    const rect = ruler.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    scroller.scrollTop = ratio * scroller.scrollHeight - scroller.clientHeight / 2;
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    ruler.setPointerCapture(e.pointerId);
    setDragging(true);
    scrollToRatio(e.clientY);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (dragging()) scrollToRatio(e.clientY);
  };

  const stopDrag = (e: PointerEvent) => {
    if (!dragging()) return;
    setDragging(false);
    if (ruler.hasPointerCapture(e.pointerId)) ruler.releasePointerCapture(e.pointerId);
  };

  onMount(() => {
    const mutation = new MutationObserver(schedule);
    mutation.observe(scroller, { childList: true, subtree: true, characterData: true });
    const resize = new ResizeObserver(schedule);
    resize.observe(scroller);
    if (scroller.firstElementChild) resize.observe(scroller.firstElementChild);
    schedule();

    onCleanup(() => {
      mutation.disconnect();
      resize.disconnect();
      if (frame) cancelAnimationFrame(frame);
    });
  });

  const showRuler = () => marks().length > 0;

  return (
    <div class={`relative min-h-0 ${props.class ?? ""}`}>
      <div
        ref={scroller}
        class={`absolute inset-y-0 left-0 overflow-auto custom-scrollbar ${showRuler() ? "right-[14px] diff-scroll-no-vbar" : "right-0"} ${props.innerClass ?? ""}`}
        onScroll={updateViewport}
      >
        <div class="h-full">{props.children}</div>
      </div>

      <Show when={showRuler()}>
        <div
          ref={ruler}
          class="absolute inset-y-0 right-0 w-[14px] cursor-pointer select-none border-l border-gray-300 bg-gray-100 dark:border-gray-700 dark:bg-gray-900"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
        >
          <For each={marks()}>
            {(mark) => (
              <div
                class="pointer-events-none absolute left-[3px] right-[3px] rounded-[1px]"
                classList={{
                  "bg-green-500/80 dark:bg-green-500/70": mark.type === "add",
                  "bg-red-500/80 dark:bg-red-500/70": mark.type === "del",
                }}
                style={{ top: `${mark.top}%`, height: `max(${mark.height}%, 2px)` }}
              />
            )}
          </For>
          <Show when={scrollable()}>
            <div
              class="pointer-events-none absolute inset-x-0 border-y border-gray-400/40 bg-gray-500/20 transition-colors dark:border-white/20 dark:bg-white/15"
              classList={{ "bg-gray-500/35 dark:bg-white/25": dragging() }}
              style={{ top: `${viewport().top}%`, height: `${viewport().height}%` }}
            />
          </Show>
        </div>
      </Show>
    </div>
  );
}
