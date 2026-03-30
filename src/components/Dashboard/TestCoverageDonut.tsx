import { createResource, createMemo, Show } from "solid-js";
import { getCodeCoverageRatio } from "../../services/gitService";

interface Props {
  path: string;
  branch: string;
}

export default function TestCoverageDonut(props: Props) {
  const [data] = createResource(
    () => ({ path: props.path, branch: props.branch }),
    async (params) => {
      if (!params.path || !params.branch) return null;
      return await getCodeCoverageRatio(params.path, params.branch);
    }
  );

  // --- AJUSTES DE DIMENSÃO ---
  const size = 100; 
  const center = size / 2;
  const strokeWidth = 6; // Diminuído de 8 para 6 para ficar mais fino/elegante
  const padding = 10;    // Adicionado um respiro interno no SVG
  const radius = (size / 2) - strokeWidth - padding; // Raio menor para não "gritar" na tela
  const circumference = 2 * Math.PI * radius;
  
  const offset = createMemo(() => {
    const percentage = data()?.percent || 0;
    return circumference - (percentage / 100) * circumference;
  });

  return (
    <div class="p-2 h-full flex flex-col items-center justify-between min-h-[220px]">
      {/* Título */}
      <div class="flex items-center justify-between w-full mb-1">
        <h3 class="font-bold text-gray-800 dark:text-gray-100 tracking-widest">
          <i class="fa-solid fa-flask text-purple-500 mr-2"></i> Cobertura de Testes
        </h3>
        <Show when={data.loading}>
          <div class="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </Show>
      </div>

      {/* Gráfico */}
      <div class="relative flex-1 w-full max-h-[150px] aspect-square flex items-center justify-center">
        <Show when={!data.error} fallback={<span class="text-[10px] text-red-500">Erro ao carregar dados</span>}>
          <svg 
            viewBox={`0 0 ${size} ${size}`} 
            class="w-full h-full transform -rotate-90"
          >
            {/* Círculo de Fundo */}
            <circle
              cx={center} cy={center} r={radius}
              fill="transparent"
              stroke="currentColor"
              stroke-width={strokeWidth}
              class="text-gray-200 dark:text-gray-900/30"
            />
            {/* Círculo de Progresso */}
            <circle
              cx={center} cy={center} r={radius}
              fill="transparent"
              stroke="currentColor"
              stroke-width={strokeWidth}
              stroke-dasharray={circumference.toString()} 
              style={{ 
                  "stroke-dashoffset": offset().toString(), 
                  "transition": "stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)" 
              }}
              class="text-green-500"
              stroke-linecap="round"
            />
          </svg>

          {/* Info Central */}
          <div class="absolute inset-0 flex flex-col items-center justify-center">
            <span class="text-2xl font-mono font-black text-gray-900 dark:text-white leading-none">
              {data() ? data()?.percent.toFixed(1) : "0.0"}%
            </span>
            <span class="text-[8px] text-gray-500 uppercase mt-1 font-bold tracking-widest opacity-60">
               {props.branch}
            </span>
          </div>
        </Show>
      </div>

      {/* Footer */}
      <div class="w-full grid grid-cols-2 gap-2 pt-1">
        <div class="flex flex-col items-start">
          <div class="flex items-center gap-1.5 text-gray-500 uppercase text-[9px] font-bold">
            <div class="w-1.5 h-1.5 rounded-full bg-green-500"></div>
            Testes
          </div>
          <span class="text-[11px] text-gray-800 dark:text-gray-200 font-mono mt-0.5 ml-3">
            {data() ? data()?.testFiles : 0} arq.
          </span>
        </div>
        <div class="flex flex-col items-end">
          <div class="flex items-center gap-1.5 text-gray-500 uppercase text-[9px] font-bold">
            Lógica
            <div class="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-700"></div>
          </div>
          <span class="text-[11px] text-gray-800 dark:text-gray-200 font-mono mt-0.5 mr-3">
            {data() ? data()?.codeFiles : 0} arq.
          </span>
        </div>
      </div>
    </div>
  );
}