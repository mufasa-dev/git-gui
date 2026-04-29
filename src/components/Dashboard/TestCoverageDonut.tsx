import { createResource, createMemo, Show } from "solid-js";
import { getCodeCoverageRatio } from "../../services/gitService";
import { useApp } from "../../context/AppContext";

interface Props {
  path: string;
  branch: string;
}

export default function TestCoverageDonut(props: Props) {
  const { t } = useApp();

  const [data] = createResource(
    () => ({ path: props.path, branch: props.branch }),
    async (params) => {
      if (!params.path || !params.branch) return null;
      return await getCodeCoverageRatio(params.path, params.branch);
    }
  );

  const size = 100; 
  const center = size / 2;
  const strokeWidth = 8; 
  const radius = (size / 2) - strokeWidth;
  const circumference = 2 * Math.PI * radius;
  
  const offset = createMemo(() => {
    const percentage = data()?.percent || 0;
    return circumference - (percentage / 100) * circumference;
  });

  return (
    <div class="p-4 h-full flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
      {/* Título - Agora com texto maior para telas grandes */}
      <div class="flex items-center justify-between w-full mb-4">
        <h3 class="font-bold text-sm text-gray-800 dark:text-gray-100 tracking-widest uppercase flex items-center">
          <i class="fa-solid fa-flask text-purple-500 mr-2 text-base"></i> 
          {t('dashboard').test_coverage}
        </h3>
        <Show when={data.loading}>
          <div class="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </Show>
      </div>

      {/* Container Principal: Grid que escala */}
      <div class="grid grid-cols-12 gap-4 flex-1 items-center">
        
        {/* Gráfico (Ocupa 5 de 12 colunas em telas médias+) */}
        <div class="col-span-5 flex justify-center items-center relative">
          <div class="relative w-28 h-28 sm:w-32 sm:h-32 lg:w-36 lg:h-36 flex-shrink-0">
            <Show when={!data.error} fallback={<span class="text-[8px] text-red-500">Erro</span>}>
              <svg viewBox={`0 0 ${size} ${size}`} class="w-full h-full transform -rotate-90">
                <circle
                  cx={center} cy={center} r={radius}
                  fill="transparent"
                  stroke="currentColor"
                  stroke-width={strokeWidth}
                  class="text-gray-100 dark:text-gray-700/30"
                />
                <circle
                  cx={center} cy={center} r={radius}
                  fill="transparent"
                  stroke="currentColor"
                  stroke-width={strokeWidth}
                  stroke-dasharray={circumference.toString()} 
                  style={{ 
                      "stroke-dashoffset": offset().toString(), 
                      "transition": "stroke-dashoffset 1.5s ease-out" 
                  }}
                  class="text-green-500"
                  stroke-linecap="round"
                />
              </svg>

              <div class="absolute inset-0 flex items-center justify-center">
                <span class="text-2xl sm:text-3xl font-mono font-black text-gray-900 dark:text-white leading-none">
                  {data() ? data()?.percent.toFixed(0) : "0"}%
                </span>
              </div>
            </Show>
          </div>
        </div>

        {/* Info lateral (Ocupa as 7 colunas restantes) */}
        <div class="col-span-7 flex flex-col justify-center h-full border-l border-gray-100 dark:border-gray-700/50 pl-6 gap-6">
          <div class="group">
            <div class="flex items-center gap-2 text-gray-400 uppercase text-[10px] font-bold tracking-widest mb-1">
              <div class="w-2 h-2 rounded-full bg-green-500"></div>
              {t('dashboard').test_files}
            </div>
            <div class="flex items-baseline gap-1">
              <span class="text-2xl font-mono font-bold text-gray-800 dark:text-gray-100 group-hover:text-green-500 transition-colors">
                {data() ? data()?.testFiles : 0}
              </span>
              <span class="text-xs text-gray-500 opacity-60">{t('dashboard').unit}</span>
            </div>
          </div>

          <div class="group">
            <div class="flex items-center gap-2 text-gray-400 uppercase text-[10px] font-bold tracking-widest mb-1">
              <div class="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-600"></div>
              {t('dashboard').logic_files}
            </div>
            <div class="flex items-baseline gap-1">
              <span class="text-2xl font-mono font-bold text-gray-800 dark:text-gray-100 group-hover:text-gray-400 transition-colors">
                {data() ? data()?.codeFiles : 0}
              </span>
              <span class="text-xs text-gray-500 opacity-60">{t('dashboard').unit}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}