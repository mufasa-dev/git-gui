import { createMemo, For, Show } from "solid-js";

export default function HourlyActivityChart(props: { commits: any[] }) {
  // Configurações de layout (seguindo o padrão do seu ActivityChart)
  const chartConfig = {
    svgWidth: 400,
    svgHeight: 150,
    paddings: { top: 20, right: 10, bottom: 25, left: 30 }
  };

  const processedData = createMemo(() => {
    if (!props.commits.length) return { bars: [], maxVal: 0 };

    // 1. Inicializar as 24 horas do dia com zero
    const hourlyCounts = Array(24).fill(0);

    // 2. Contar commits por hora
    props.commits.forEach(c => {
      const date = new Date(c.date);
      const hour = date.getHours();
      hourlyCounts[hour]++;
    });

    const maxVal = Math.max(...hourlyCounts, 5);
    const drawWidth = chartConfig.svgWidth - chartConfig.paddings.left - chartConfig.paddings.right;
    const drawHeight = chartConfig.svgHeight - chartConfig.paddings.top - chartConfig.paddings.bottom;
    
    // 3. Calcular largura de cada barra (com espaçamento)
    const barWidth = (drawWidth / 24) * 0.8; 
    const gap = (drawWidth / 24) * 0.2;

    const bars = hourlyCounts.map((count, i) => {
      const hPercentage = count / maxVal;
      const h = hPercentage * drawHeight;
      return {
        x: chartConfig.paddings.left + i * (barWidth + gap),
        y: chartConfig.paddings.top + drawHeight - h,
        width: barWidth,
        height: h,
        value: count,
        label: `${i}h`
      };
    });

    return { bars, maxVal, drawHeight };
  });

  return (
    <div class="p-2 h-full flex flex-col">
      <div class="flex items-center gap-2 mb-4">
        <i class="fa-regular fa-clock text-blue-400 text-xs"></i>
        <h4 class="font-bold dark:text-gray-200 tracking-widest">
          Atividade por Horário
        </h4>
      </div>

      <div class="relative flex-1 min-h-[120px]">
        <Show when={props.commits.length > 0} fallback={
          <div class="flex items-center justify-center h-full text-[10px] text-gray-500 italic">
            Aguardando dados...
          </div>
        }>
          <svg 
            viewBox={`0 0 ${chartConfig.svgWidth} ${chartConfig.svgHeight}`}
            class="w-full h-full overflow-visible"
          >
            {/* Linhas de Grade Horizontais */}
            <g class="text-gray-800/50">
                <line 
                  x1={chartConfig.paddings.left} y1={chartConfig.paddings.top} 
                  x2={chartConfig.svgWidth} y2={chartConfig.paddings.top} 
                  stroke="currentColor" stroke-dasharray="2 2"
                />
                <line 
                  x1={chartConfig.paddings.left} y1={chartConfig.paddings.top + ((processedData().drawHeight || 0) / 2)} 
                  x2={chartConfig.svgWidth} y2={chartConfig.paddings.top + ((processedData().drawHeight || 0) / 2)} 
                  stroke="currentColor" stroke-dasharray="2 2"
                />
            </g>

            <For each={processedData().bars}>
              {(bar, i) => (
                <g class="group">
                  {/* Barra Interativa */}
                  <rect
                    x={bar.x}
                    y={bar.y}
                    width={bar.width}
                    height={bar.height}
                    rx="2"
                    class="fill-blue-500/40 group-hover:fill-blue-400 transition-all duration-300 cursor-pointer"
                  />
                  
                  {/* Tooltip simples ou indicação de valor no hover */}
                  <text 
                    x={bar.x + bar.width / 2} 
                    y={bar.y - 5} 
                    text-anchor="middle" 
                    class="fill-blue-400 text-[8px] font-mono opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    {bar.value}
                  </text>

                  {/* Labels do Eixo X (Mostrar apenas de 3 em 3 horas para não poluir) */}
                  <Show when={i() % 3 === 0}>
                    <text
                      x={bar.x + bar.width / 2}
                      y={chartConfig.svgHeight - 5}
                      text-anchor="middle"
                      class="fill-gray-900 dark:fill-gray-200 text-[9px] font-medium"
                    >
                      {bar.label}
                    </text>
                  </Show>
                </g>
              )}
            </For>

            {/* Eixo Y simples */}
            <text 
               x={chartConfig.paddings.left - 5} 
               y={chartConfig.paddings.top} 
               text-anchor="end" 
               class="fill-gray-900 dark:fill-gray-200 text-[8px]"
            >
                {processedData().maxVal}
            </text>
            <text 
               x={chartConfig.paddings.left - 5} 
               y={chartConfig.svgHeight - chartConfig.paddings.bottom} 
               text-anchor="end" 
               class="fill-gray-900 dark:fill-gray-200 text-[8px]"
            >
                0
            </text>
          </svg>
        </Show>
      </div>
      
      <div class="mt-2 text-[9px] text-gray-900 dark:text-gray-200  flex justify-between items-center">
        <span>Horário local do sistema</span>
        <span class="text-blue-500/60 font-bold uppercase">Pico: {
            processedData().bars.sort((a,b) => b.value - a.value)[0]?.label
        }</span>
      </div>
    </div>
  );
}