import { createSignal, Show, JSX } from "solid-js";
import MarkdownViewer from "./MarkdownViewer";

type MarkdownEditorProps = {
  value?: string;
  onInput?: (val: string) => void;
  children?: JSX.Element; // Aqui entram os botões customizados
  placeholder?: string;
};

export default function MarkdownEditor(props: MarkdownEditorProps) {
  const [text, setText] = createSignal(props.value || "");
  const [mode, setMode] = createSignal<"write" | "preview">("write");
  let textAreaRef: HTMLTextAreaElement | undefined;

  const handleInput = (val: string) => {
    setText(val);
    props.onInput?.(val);
  };

  const insertTag = (before: string, after: string = "", placeholder: string = "") => {
    if (!textAreaRef) return;
    const start = textAreaRef.selectionStart;
    const end = textAreaRef.selectionEnd;
    const currentText = text();
    const selection = currentText.substring(start, end) || placeholder;
    const newText = currentText.substring(0, start) + before + selection + after + currentText.substring(end);

    handleInput(newText);
    textAreaRef.focus();
    const newCursorPos = start + before.length + selection.length + after.length;
    setTimeout(() => textAreaRef?.setSelectionRange(newCursorPos, newCursorPos), 0);
  };

  return (
    <div class="flex flex-col w-full border border-gray-300 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-800 shadow-sm">
      
      {/* HEADER / TABS */}
      <div class="flex items-center justify-between px-3 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
        <div class="flex gap-1">
          {["write", "preview"].map((m) => (
            <button 
              onClick={() => setMode(m as any)}
              class={`px-4 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors dark:border-gray-700 ${mode() === m ? 'bg-white dark:bg-gray-800 border-x text-blue-500' : 'text-gray-500 hover:text-gray-700 dark:hover:text-white'}`}
            >
              {m}
            </button>
          ))}
        </div>

        <Show when={mode() === "write"}>
          <div class="flex items-center gap-2 px-2 text-gray-500">
            <button onClick={() => insertTag("### ")} class="p-1 hover:text-blue-500"><i class="fa-solid fa-heading"></i></button>
            <button onClick={() => insertTag("**", "**", "texto")} class="p-1 hover:text-blue-500"><i class="fa-solid fa-bold"></i></button>
            <button onClick={() => insertTag("`", "`", "code")} class="p-1 hover:text-blue-500"><i class="fa-solid fa-code"></i></button>
            <button onClick={() => insertTag("[", "](url)", "link")} class="p-1 hover:text-blue-500"><i class="fa-solid fa-link"></i></button>
          </div>
        </Show>
      </div>

      {/* CONTENT AREA */}
      <div class="p-4 min-h-[150px]">
        <Show when={mode() === "write"} fallback={<div class="min-h-[150px]"><MarkdownViewer content={text() || "_Nada para visualizar_"} /></div>}>
          <textarea
            ref={textAreaRef}
            value={text()}
            onInput={(e) => handleInput(e.currentTarget.value)}
            placeholder={props.placeholder || "Escreva algo..."}
            class="w-full min-h-[150px] bg-transparent outline-none text-sm text-gray-700 dark:text-gray-300 resize-none font-mono"
          />
        </Show>
      </div>

      {/* FOOTER - DINÂMICO */}
      <div class="px-4 py-2 border-t dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/30">
        <span class="text-[10px] text-gray-500 font-bold flex items-center gap-2">
           <i class="fa-brands fa-markdown text-base"></i> Markdown
        </span>
        <div class="flex gap-2">
            {props.children}
        </div>
      </div>
    </div>
  );
}