import { createMemo } from "solid-js";
// @ts-ignore
import { marked } from "marked";

export default function MarkdownViewer(props: { content: string | undefined, class?: string }) {
  
  const cleanHtml = createMemo(() => {
    let rawMd = props.content;
    if (!rawMd) return "";

    // 1. Remove links de Markdown: [google](www.google.com) -> [google](javascript:void(0))
    // Isso mantém o estilo de link (cor azul), mas mata a ação de navegar
    rawMd = rawMd.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, (match, text, url) => {
      // Se quiser que ainda seja clicável para abrir externo, usamos o onclick aqui
      return `<a href="javascript:void(0)" onclick="window.openExternal('${url}')">${text}</a>`;
    });

    // 2. Trata links que já venham como HTML: <a href="url"> -> <a data-url="url">
    rawMd = rawMd.replace(/<a\s+(?:[^>]*?\s+)?href="([^"]*)"([^>]*)>/gi, (match, href, rest) => {
      if (href.startsWith('http')) {
        return `<a href="javascript:void(0)" onclick="window.openExternal('${href}')" ${rest}>`;
      }
      return match;
    });

    // 3. Se o objetivo for APENAS IMAGEM (bloquear o link das skills)
    // Procuramos o padrão [![alt](img_url)](link_url) e deixamos só a imagem
    rawMd = rawMd.replace(/\[(!\[[^\]]*\]\([^)]+\))\]\([^)]+\)/g, "$1");

    // Agora passamos a string já "limpa" para o marked
    // Como já transformamos links em tags <a> manuais, o marked apenas vai ignorar ou formatar o resto
    return marked.parse(rawMd, { gfm: true, breaks: true }) as string;
  });

  return (
    <article 
      class={`prose dark:prose-invert max-w-none ${props.class || ""}`}
      // @ts-ignore
      innerHTML={cleanHtml()} 
    />
  );
}