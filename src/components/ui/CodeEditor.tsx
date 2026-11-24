import { createMemo, JSX } from "solid-js";
import { highlightCode } from "../../utils/highlight";

type Props = {
  value: string;
  fileName: string;
  onInput: (value: string) => void;
  onKeyDown?: JSX.EventHandler<HTMLTextAreaElement, KeyboardEvent>;
  /** Número da primeira linha exibida no gutter (trechos do diff começam no meio do arquivo). */
  startLine?: number;
  /** Ocupa toda a altura disponível e rola internamente (modo "código completo"). */
  fill?: boolean;
  class?: string;
  ref?: (el: HTMLTextAreaElement) => void;
};

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Editor de código com syntax highlight: um <textarea> com o texto transparente
 * por cima de uma camada colorida (mesmo highlighter do DiffViewer). Os dois
 * ficam na mesma célula de grid, então têm sempre o mesmo tamanho e rolam juntos.
 */
export default function CodeEditor(props: Props) {
  // Cache por linha: ao digitar, só a linha alterada é recolorida.
  const cache = new Map<string, string>();
  let cacheFile = "";

  const lines = createMemo(() => props.value.split("\n"));

  const highlighted = createMemo(() => {
    if (cacheFile !== props.fileName) {
      cache.clear();
      cacheFile = props.fileName;
    }
    if (cache.size > 20000) cache.clear();

    return lines().map(line => {
      let html = cache.get(line);
      if (html === undefined) {
        try {
          html = highlightCode(line, props.fileName);
        } catch {
          html = escapeHtml(line);
        }
        cache.set(line, html);
      }
      // Linha vazia precisa de conteúdo para manter a altura.
      return `<div class="code-editor-line">${html || "​"}</div>`;
    }).join("");
  });

  const gutter = createMemo(() => {
    const start = Math.max(props.startLine ?? 1, 1);
    return lines().map((_, i) => start + i).join("\n");
  });

  return (
    <div class={`code-editor font-mono text-sm ${props.fill ? "h-full overflow-auto custom-scrollbar" : "overflow-x-auto custom-scrollbar"} ${props.class ?? ""}`}>
      <div class="flex min-h-full min-w-max">
        <pre class="code-editor-gutter sticky left-0 z-10 m-0 shrink-0 select-none border-r border-gray-300 bg-gray-50 px-2 text-right text-[11px] text-gray-400 dark:border-gray-700 dark:bg-gray-900">
          {gutter()}
        </pre>
        <div class="code-editor-stack grid flex-1">
          <div class="code-editor-layer code-editor-highlight pointer-events-none text-gray-800 dark:text-gray-100"
            aria-hidden="true" innerHTML={highlighted()} />
          <textarea
            ref={props.ref}
            class="code-editor-layer code-editor-input select-text resize-none overflow-hidden bg-transparent text-transparent caret-gray-900 outline-none selection:bg-blue-500/30 dark:caret-white"
            wrap="off"
            spellcheck={false}
            autocomplete="off"
            autocapitalize="off"
            rows={1}
            value={props.value}
            onInput={(e) => props.onInput(e.currentTarget.value)}
            onKeyDown={props.onKeyDown}
          />
        </div>
      </div>
    </div>
  );
}
