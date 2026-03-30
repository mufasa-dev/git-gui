import { For, Show, createSignal } from "solid-js";
import Tooltip from "./Tooltip";

interface BreadcrumbProps {
  path: string;
  repoName: string;
  onNavigate: (path: string) => void;
}

export function Breadcrumb(props: BreadcrumbProps) {
  const [copied, setCopied] = createSignal(false);

  // Divide o caminho e remove entradas vazias
  const pathParts = () => {
    if (!props.path) return [];
    return props.path.split("/").filter(Boolean);  
  }

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(props.path);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000); // Reseta o ícone após 2s
    } catch (err) {
      console.error("Falha ao copiar:", err);
    }
  };

  return (
    <div class="flex items-center w-full px-4 py-2 group">
      <div class="flex items-center flex-wrap gap-1 text-sm font-sans italic">
        
        {/* Raiz do Repositório */}
        <button
          onClick={() => props.onNavigate("")}
          class="text-blue-600 dark:text-blue-400 hover:underline font-bold"
        >
          {props.repoName}
        </button>

        <For each={pathParts()}>
          {(part, index) => {
            // Reconstroi o path até este nível
            const fullPathUntilNow = () => 
              pathParts().slice(0, index() + 1).join("/");
            
            const isLast = () => index() === pathParts().length - 1;

            return (
              <div class="flex items-center gap-1">
                <span class="text-gray-400 dark:text-gray-600 mx-1">/</span>
                <button
                  disabled={isLast()}
                  onClick={() => props.onNavigate(fullPathUntilNow())}
                  class="px-1 rounded transition-colors"
                  classList={{
                    "text-blue-600 dark:text-blue-400 hover:underline hover:bg-blue-500/10": !isLast(),
                    "text-gray-800 dark:text-gray-200 font-bold cursor-default": isLast(),
                  }}
                >
                  {part}
                </button>
              </div>
            );
          }}
        </For>
      </div>

      {/* Botão de Copiar com Feedback Visual */}
      <button
          title="Copiar caminho relativo"
          onClick={copyToClipboard}
          class="flex items-center gap-2 p-1.5 rounded transition-all active:scale-95 ml-1"
          classList={{
          "text-green-500": copied(),
          "text-gray-400 hover:text-blue-500": !copied()
          }}
      >
          <Show when={copied()} fallback={<i class="fa-regular fa-copy"></i>}>
          <i class="fa-solid fa-check text-xs"></i>
          <span class="text-[10px] font-bold uppercase">Copiado!</span>
          </Show>
      </button>
    </div>
  );
}