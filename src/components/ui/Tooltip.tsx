import { JSX } from "solid-js";

interface TooltipProps {
  children: JSX.Element;
  text: string;
  class?: string;
}

export default function Tooltip(props: TooltipProps) {
  return (
    <div class={`group relative flex items-center ${props.class}`}>
      {/* O Botão/Conteúdo */}
      {props.children}

      {/* O Tooltip */}
      <div class="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity 
                  absolute left-full ml-2 px-2 py-1 bg-black text-white text-xs rounded shadow-lg 
                  whitespace-nowrap z-50 pointer-events-none">
        {props.text}
        
        {/* A Setinha (Triângulo) */}
        <div class="absolute top-1/2 -left-1 -translate-y-1/2 
                    border-y-4 border-y-transparent 
                    border-r-4 border-r-black">
        </div>
      </div>
    </div>
  );
}