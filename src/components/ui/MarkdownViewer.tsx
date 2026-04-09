import { createMemo, onMount, onCleanup } from "solid-js";
// @ts-ignore
import { marked, Renderer } from "marked";
import { openUrl } from "@tauri-apps/plugin-opener";

// helper global para abrir links externos (mantenha se ainda for usar para outros links)
(window as any).openExternal = async (url: string) => {
  try {
    await openUrl(url);
  } catch (e) {
    console.error("Erro ao abrir:", e);
  }
};

export default function MarkdownViewer(props: { content: string | undefined, class?: string }) {
  let containerRef: HTMLDivElement | undefined;

  const html = createMemo(() => {
    if (!props.content) return "";

    // @ts-ignore
    const markedInstance = new marked.Marked();
    const renderer = new marked.Renderer();

    // 1. Mantenha o Renderer de Link para outros links do PR (se desejar abrir externo)
    // Se quiser bloquear TODOS os links do markdown, remova este bloco.
    renderer.link = ({ href, title, text }: any) => {
      const isExternal = href.startsWith('http');
      if (isExternal) {
        return `<a href="javascript:void(0)" onclick="window.openExternal('${href}')" class="external-link font-bold text-blue-500 hover:underline cursor-pointer" ${title ? `title="${title}"` : ""}>${text}</a>`;
      }
      return `<a href="${href}">${text}</a>`;
    };

    // 2. Sobrescreva o Renderer de Imagem para Bloquear Links
    // Esta é a solução para o seu problema das skill icons.
    renderer.image = ({ href, title, text }: any) => {
      // Retorna apenas a tag <img> pura. O Marked não a envolverá em um <a>.
      const titleAttr = title ? `title="${title}"` : "";
      const altAttr = text ? `alt="${text}"` : "";
      
      // Adicione classes CSS aqui se quiser estilizar a imagem (ex: prose-img:m-0)
      return `<img src="${href}" ${titleAttr} ${altAttr} class="skill-icon prose-img:m-0" />`;
    };

    // Aplica o renderer customizado na instância
    markedInstance.use({ renderer });

    // Renderiza o markdown preservando o estilo do seu Dashboard
    return markedInstance.parse(props.content, { gfm: true, breaks: true }) as string;
  });

  return (
    <div 
      ref={containerRef}
      class={`prose dark:prose-invert max-w-none relative z-[1000] pointer-events-auto ${props.class || ""}`}
      // @ts-ignore
      innerHTML={html()} 
    />
  );
}