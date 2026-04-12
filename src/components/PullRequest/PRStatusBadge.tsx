import { Show, createMemo } from "solid-js";

type PRStatus = 'OPEN' | 'CLOSED' | 'MERGED' | 'DRAFT' | 'APPROVED' | 'CHANGES_REQUESTED';

type PRStatusBadgeProps = {
  state: PRStatus | string;
  variant?: 'badge' | 'dot'; // 'badge' para o estilo botão, 'dot' para a lista
};

export default function PRStatusBadge(props: PRStatusBadgeProps) {
  const config = createMemo(() => {
    switch (props.state) {
      case 'OPEN':
        return {
          label: 'Aberto',
          classes: 'bg-green-600 text-white border-green-500',
          dotClasses: 'text-green-500',
          dotBg: 'bg-green-500'
        };
      case 'MERGED':
        return {
          label: 'Merged',
          classes: 'bg-purple-600 text-white border-purple-500',
          dotClasses: 'text-purple-400',
          dotBg: 'bg-purple-500'
        };
      case 'CLOSED':
        return {
          label: 'Fechado',
          classes: 'bg-red-600 text-white border-red-500',
          dotClasses: 'text-red-500',
          dotBg: 'bg-red-500'
        };
      case 'DRAFT':
        return {
          label: 'Draft',
          classes: 'bg-gray-500 text-white border-gray-400',
          dotClasses: 'text-gray-400',
          dotBg: 'bg-gray-400'
        };
      case 'APPROVED':
        return {
          label: 'Aprovado',
          classes: 'bg-emerald-500 text-white border-emerald-400',
          dotClasses: 'text-emerald-500',
          dotBg: 'bg-emerald-500'
        };
      default:
        return {
          label: props.state,
          classes: 'bg-gray-600 text-white',
          dotClasses: 'text-gray-400',
          dotBg: 'bg-gray-400'
        };
    }
  });

  return (
    <Show 
      when={props.variant === 'dot'} 
      fallback={
        /* Estilo Badge (Original do PR Details) */
        <span class={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border shadow-sm ${config().classes}`}>
          {config().label}
        </span>
      }
    >
      {/* Estilo Dot (Para a Lista Lateral) */}
      <div class={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-tight ${config().dotClasses}`}>
        <div class={`w-1.5 h-1.5 rounded-full ${config().dotBg} shadow-[0_0_5px_currentColor]`}></div>
        {config().label}
      </div>
    </Show>
  );
}