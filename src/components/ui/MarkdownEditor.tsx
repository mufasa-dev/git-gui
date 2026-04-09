import { createSignal, Show } from "solid-js";
import MarkdownViewer from "./MarkdownViewer";

export default function MarkdownEditor(props: { onSave?: (val: string) => void }) {
  const [text, setText] = createSignal("");
  const [mode, setMode] = createSignal<"write" | "preview">("write");
  let textAreaRef: HTMLTextAreaElement | undefined;

  // Função mestre para inserir Markdown
  const insertTag = (before: string, after: string = "", placeholder: string = "") => {
    if (!textAreaRef) return;

    const start = textAreaRef.selectionStart;
    const end = textAreaRef.selectionEnd;
    const currentText = text();
    const selection = currentText.substring(start, end) || placeholder;

    const newText = 
      currentText.substring(0, start) + 
      before + selection + after + 
      currentText.substring(end);

    setText(newText);
    
    // Devolve o foco e posiciona o cursor
    textAreaRef.focus();
    const newCursorPos = start + before.length + selection.length + after.length;
    setTimeout(() => textAreaRef?.setSelectionRange(newCursorPos, newCursorPos), 0);
  };

  return (
    <div class="flex flex-col w-full border border-gray-300 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-800 shadow-sm">
      
      {/* HEADER / TABS */}
      <div class="flex items-center justify-between px-3 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
        <div class="flex gap-1">
          <button 
            onClick={() => setMode("write")}
            class={`px-4 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors dark:border-gray-700 ${mode() === 'write' ? 'bg-white dark:bg-gray-800 border-x text-blue-500' : 'text-gray-500 hover:text-gray-700 dark:hover:text-white border-x-0'}`}
          >
            Write
          </button>
          <button 
            onClick={() => setMode("preview")}
            class={`px-4 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors dark:border-gray-700 ${mode() === 'preview' ? 'bg-white dark:bg-gray-800 border-x  text-blue-500' : 'text-gray-500 hover:text-gray-700 dark:hover:text-white border-x-0'}`}
          >
            Preview
          </button>
        </div>

        {/* TOOLBAR (Apenas no modo Write) */}
        <Show when={mode() === "write"}>
          <div class="flex items-center gap-2 px-2 text-gray-500">
            <button onClick={() => insertTag("### ")} title="Título" class="p-1 hover:text-blue-500"><i class="fa-solid fa-heading"></i></button>
            <button onClick={() => insertTag("**", "**", "texto")} title="Negrito" class="p-1 hover:text-blue-500"><i class="fa-solid fa-bold"></i></button>
            <button onClick={() => insertTag("_", "_", "texto")} title="Itálico" class="p-1 hover:text-blue-500"><i class="fa-solid fa-italic"></i></button>
            <div class="w-px h-4 bg-gray-700 mx-1"></div>
            <button onClick={() => insertTag("- ")} title="Lista" class="p-1 hover:text-blue-500"><i class="fa-solid fa-list-ul"></i></button>
            <button onClick={() => insertTag("1. ")} title="Lista Numerada" class="p-1 hover:text-blue-500"><i class="fa-solid fa-list-ol"></i></button>
            <button onClick={() => insertTag("`", "`", "code")} title="Code" class="p-1 hover:text-blue-500"><i class="fa-solid fa-code"></i></button>
            <button onClick={() => insertTag("[", "](url)", "link")} title="Link" class="p-1 hover:text-blue-500"><i class="fa-solid fa-link"></i></button>
          </div>
        </Show>
      </div>

      {/* CONTENT AREA */}
      <div class="p-4 min-h-[150px]">
        <Show when={mode() === "write"} fallback={
          <div class="min-h-[150px] overflow-y-auto">
             <MarkdownViewer content={text() || "_Nada para visualizar_"} />
          </div>
        }>
          <textarea
            ref={textAreaRef}
            value={text()}
            onInput={(e) => setText(e.currentTarget.value)}
            placeholder="Deixe um comentário..."
            class="w-full h-full min-h-[150px] bg-transparent outline-none text-sm text-gray-700 dark:text-gray-300 resize-none font-mono"
          />
        </Show>
      </div>

      {/* FOOTER */}
      <div class="px-4 py-2 border-t dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/30">
        <span class="text-[10px] text-gray-500 font-bold flex items-center gap-2">
           <i class="fa-brands fa-markdown text-base"></i> Markdown is supported
        </span>
        <button 
          onClick={() => props.onSave?.(text())}
          disabled={!text()}
          class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 text-white px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all active:scale-95"
        >
          Comment
        </button>
      </div>
    </div>
  );
}