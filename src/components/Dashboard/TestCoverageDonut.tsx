import { createResource, createMemo, Show } from "solid-js";
import { getCodeCoverageRatio } from "../../services/gitService";

interface Props {
  path: string;
  branch: string;
}

export default function TestCoverageDonut(props: Props) {
  // O createResource reage automaticamente quando o objeto retornado pela função muda
  const [data] = createResource(
    () => ({ path: props.path, branch: props.branch }),
    async (params) => {
      if (!params.path || !params.branch) return null;
      return await getCodeCoverageRatio(params.path, params.branch);
    }
  );

  const radius = 35;
  const circumference = 2 * Math.PI * radius;
  
  const offset = createMemo(() => {
    const percentage = data()?.percent || 0;
    return circumference - (percentage / 100) * circumference;
  });

  return (
    <div class="p-2 h-full flex flex-col items-center justify-between min-h-[220px]">
      <div class="flex items-center justify-between w-full mb-2">
        <h3 class="font-bold text-gray-500 dark:text-white tracking-widest">
          <i class="fa-solid fa-flask text-purple-500 ml-2"></i> Cobertura de Testes
        </h3>
        <Show when={data.loading}>
          <div class="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </Show>
      </div>

      <div class="relative flex items-center justify-center flex-1">
        <Show when={!data.error} fallback={<span class="text-[10px] text-red-500">Erro ao carregar dados</span>}>
          <svg class="w-32 h-32 transform -rotate-90">
            {/* Fundo (Code/Logic) */}
            <circle
              cx="64" cy="64" r={radius}
              fill="transparent"
              stroke="currentColor"
              stroke-width="7"
              class="text-gray-300 dark:text-gray-900/50"
            />
            {/* Progresso (Tests) */}
            <circle
                cx="64"
                cy="64"
                r={radius}
                fill="transparent"
                stroke="currentColor"
                stroke-width="7"
                // Converta o número para string para satisfazer o TypeScript
                stroke-dasharray={circumference.toString()} 
                style={{ 
                    "stroke-dashoffset": offset().toString(), 
                    "transition": "stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)" 
                }}
                class="text-green-500 shadow-lg"
                stroke-linecap="round"
            />
          </svg>

          <div class="absolute inset-0 flex flex-col items-center justify-center">
            <span class="text-2xl font-mono font-bold text-black dark:text-white leading-none">
              {data() ? data()?.percent.toFixed(1) : "0.0"}%
            </span>
            <span class="text-[8px] text-gray-500 uppercase mt-1 tracking-tighter">
              {props.branch} branch
            </span>
          </div>
        </Show>
      </div>

      <div class="w-full grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-gray-300 dark:border-gray-700/50">
        <div class="flex flex-col items-start">
          <div class="flex items-center gap-1.5">
            <div class="w-1.5 h-1.5 rounded-full bg-green-500"></div>
            <span class="text-[10px] text-gray-900 dark:text-gray-300 font-medium">Testes</span>
          </div>
          <span class="text-[11px] text-gray-500 ml-3">{data()?.testFiles || 0} arquivos</span>
        </div>
        <div class="flex flex-col items-end">
          <div class="flex items-center gap-1.5">
            <span class="text-[10px] text-gray-900 dark:text-gray-300 font-medium">Lógica</span>
            <div class="w-1.5 h-1.5 rounded-full bg-gray-800"></div>
          </div>
          <span class="text-[11px] text-gray-500 mr-3">{data()?.codeFiles || 0} arquivos</span>
        </div>
      </div>
    </div>
  );
}