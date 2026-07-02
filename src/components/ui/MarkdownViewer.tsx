import { createMemo, createEffect, onCleanup } from "solid-js";
import { marked, Renderer } from "marked";
import { azureService } from "../../services/azure";

export default function MarkdownViewer(props: { content: string | undefined, class?: string }) {
  const renderer = new Renderer();
  console.log("MarkdownViewer: props.content", props.content);
  // Sobrescreve o método link usando a assinatura antiga (compatível com marked v4)
  // Usamos `as any` para evitar erro de tipo no TypeScript
  (renderer as any).link = function(href: string, title: string, text: string) {
    return `<a href="javascript:void(0)" onclick="window.openExternal('${href}')" title="${title || ''}" class="external-link">${text}</a>`;
  };

  const cleanHtml = createMemo(() => {
    const rawMd = props.content || "";
    // Força o retorno como string (marcação síncrona)
    return marked.parse(rawMd, { gfm: true, breaks: true, renderer }) as string;
  });

  // Função para carregar imagens autenticadas
  const loadAuthenticatedImages = async (container: HTMLElement) => {
    const images = container.querySelectorAll('img[src*="dev.azure.com"]');
    if (images.length === 0) return;

    const token = await azureService.getToken();
    if (!token) return;

    for (const img of images) {
      const originalSrc = img.getAttribute('src');
      if (!originalSrc) continue;

      try {
        const response = await fetch(originalSrc, {
          headers: {
            'Authorization': `Basic ${btoa(`:${token.trim()}`)}`,
          },
        });
        if (!response.ok) throw new Error('Falha ao carregar imagem');
        
        const blob = await response.blob();
        const objectURL = URL.createObjectURL(blob);
        img.setAttribute('src', objectURL);
        // Armazena a URL original para limpeza
        (img as HTMLImageElement).dataset.originalSrc = originalSrc;
      } catch (error) {
        console.error('Erro ao carregar imagem autenticada:', originalSrc, error);
        // Fallback: tenta carregar diretamente (pode não funcionar)
        // img.src = originalSrc;
      }
    }
  };

  let containerRef: HTMLElement | undefined;

  // Quando o HTML for renderizado, carrega as imagens
  createEffect(() => {
    if (cleanHtml() && containerRef) {
      queueMicrotask(() => {
        loadAuthenticatedImages(containerRef!);
      });
    }
  });

  // Limpeza das URLs blob quando o componente desmontar
  onCleanup(() => {
    if (containerRef) {
      const blobs = containerRef.querySelectorAll('img[data-original-src]');
      blobs.forEach(img => {
        const src = img.getAttribute('src');
        if (src && src.startsWith('blob:')) {
          URL.revokeObjectURL(src);
        }
      });
    }
  });

  return (
    <article 
      ref={containerRef}
      class={`prose dark:prose-invert max-w-none ${props.class || ""}`}
      innerHTML={cleanHtml()} 
    />
  );
}