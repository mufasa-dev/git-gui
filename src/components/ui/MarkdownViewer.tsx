import { createMemo } from "solid-js";
// @ts-ignore
import { marked } from "marked";

interface MarkdownViewerProps {
  content: string | undefined;
  class?: string;
}

export default function MarkdownViewer(props: MarkdownViewerProps) {
  const html = createMemo(() => {
    const rawMd = props.content;
    if (!rawMd) return "";

    // @ts-ignore
    marked.setOptions({
      gfm: true,        // Mantém suporte a tabelas e listas do GitHub
      breaks: true,     // Respeita as quebras de linha (importante para badges)
      // Removidos: headerIds e mangle (não existem mais na v5+)
    });

    // @ts-ignore
    return marked.parse(rawMd) as string;
  });

  return (
    <article 
      class={`prose dark:prose-invert max-w-none 
             prose-headings:font-bold prose-headings:tracking-tight
             prose-a:text-blue-500 prose-img:rounded-xl 
             prose-img:inline prose-img:m-0 ${props.class || ""}`}
      innerHTML={html()} 
    />
  );
}