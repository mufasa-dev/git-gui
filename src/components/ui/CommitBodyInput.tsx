import { createMemo, createSignal, JSX, onCleanup, onMount } from "solid-js";
import { analyzeCommitBody } from "../../utils/commitHighlight";

type Props = {
  value: string;
  placeholder?: string;
  disabled?: boolean;
  onInput: (value: string) => void;
  onKeyDown?: JSX.EventHandler<HTMLTextAreaElement, KeyboardEvent>;
};

export default function CommitBodyInput(props: Props) {
  let textarea!: HTMLTextAreaElement;
  const [scrollTop, setScrollTop] = createSignal(0);
  const [scrollbarWidth, setScrollbarWidth] = createSignal(0);

  const html = createMemo(() => analyzeCommitBody(props.value).html);

  const measure = () => {
    if (!textarea) return;
    const style = getComputedStyle(textarea);
    const borders = parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
    setScrollbarWidth(Math.max(0, textarea.offsetWidth - textarea.clientWidth - borders));
    setScrollTop(textarea.scrollTop);
  };

  onMount(() => {
    const observer = new ResizeObserver(measure);
    observer.observe(textarea);
    measure();
    onCleanup(() => observer.disconnect());
  });

  return (
    <div class="relative mt-2">
      <div aria-hidden="true"
        class="commit-body-overlay input-text pointer-events-none absolute inset-0 mt-0 overflow-hidden py-2 font-mono text-[13px] leading-5 !border-transparent !bg-transparent"
        style={{ "padding-right": `calc(0.5rem + ${scrollbarWidth()}px)` }}>
        <div class="whitespace-pre-wrap break-words" style={{ transform: `translateY(-${scrollTop()}px)` }} innerHTML={html()} />
      </div>
      <textarea
        ref={textarea}
        class="commit-highlight-input block w-full input-text mt-0 min-h-[20px] max-h-[200px] resize-y py-2 font-mono text-[13px] leading-5 custom-scrollbar"
        placeholder={props.placeholder}
        value={props.value}
        disabled={props.disabled}
        rows="2"
        spellcheck={false}
        onInput={(e) => {
          props.onInput(e.currentTarget.value);
          queueMicrotask(measure);
        }}
        onScroll={() => setScrollTop(textarea.scrollTop)}
        onKeyDown={props.onKeyDown}
      />
    </div>
  );
}
