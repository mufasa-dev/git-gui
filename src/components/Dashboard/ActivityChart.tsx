import { createMemo, createSignal, For, Show } from "solid-js";

// Utilitário simples para formatar a data no eixo X
const formatDateAxis = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export default function ActivityChart(props: { commits: any[] }) {
  // 1. Estado para o filtro de dias (padrão 30)
  const [daysToView, setDaysToView] = createSignal(30);

  // Configurações de layout do gráfico (para cálculo dos eixos)
  const chartConfig = {
    svgWidth: 500,  // Largura base do SVG
    svgHeight: 180, // Altura base do SVG
    paddings: { top: 10, right: 10, bottom: 30, left: 40 } // Espaço para eixos
  };

  // 2. Memo para processar e filtrar dados
  const processedData = createMemo(() => {
    if (!props.commits.length) return { points: [], yTicks: [], xTicks: [], area: "", line: "" };

    const days = daysToView();
    
    // Gerar lista de datas vazias para o período
    const dateRange = Array.from({ length: days }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toISOString().split('T')[0];
    }).reverse();

    // Contar commits por dia
    const counts = props.commits.reduce((acc, c) => {
      const day = new Date(c.date).toISOString().split('T')[0];
      acc[day] = (acc[day] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Criar array final de dados e achar o máximo
    const data = dateRange.map(day => ({ date: day, value: counts[day] || 0 }));
    const maxVal = Math.max(...data.map(d => d.value), 5); // Mínimo de 5 para o eixo Y ficar bonito

    // Área útil do gráfico (descontando paddings)
    const drawWidth = chartConfig.svgWidth - chartConfig.paddings.left - chartConfig.paddings.right;
    const drawHeight = chartConfig.svgHeight - chartConfig.paddings.top - chartConfig.paddings.bottom;

    // 3. Calcular coordenadas SVG (x, y)
    const points = data.map((d, i) => ({
      x: chartConfig.paddings.left + (i / (data.length - 1)) * drawWidth,
      y: chartConfig.paddings.top + drawHeight - (d.value / maxVal) * drawHeight,
      value: d.value,
      date: d.date
    }));

    // 4. Gerar strings de desenho SVG
    const lineData = `M ${points[0].x} ${points[0].y} ` + points.map(p => `L ${p.x} ${p.y}`).join(" ");
    const areaData = `${lineData} L ${points[points.length - 1].x} ${chartConfig.paddings.top + drawHeight} L ${chartConfig.paddings.left} ${chartConfig.paddings.top + drawHeight} Z`;

    // 5. Gerar Legendas (Ticks)
    // Eixo Y (fixo em 4 níveis)
    const yTicks = [0, Math.round(maxVal / 2), maxVal].map(val => ({
      value: val,
      y: chartConfig.paddings.top + drawHeight - (val / maxVal) * drawHeight
    }));

    // Eixo X (Início, Meio, Fim)
    const xTicksIndices = [0, Math.round((days - 1) / 2), days - 1];
    const xTicks = xTicksIndices.map(idx => ({
      label: formatDateAxis(data[idx].date),
      x: points[idx].x
    }));

    return { points, yTicks, xTicks, area: areaData, line: lineData, drawHeight, drawWidth };
  });

  return (
    <div class="flex flex-col h-full bg-white dark:bg-gray-800 rounded-lg shadow-sm">
      
      {/* Cabeçalho com Título e FILTRO */}
      <div class="flex items-center justify-between mb-4">
        <h4 class="text-sm font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2 ml-2">
           <i class="fa-solid fa-chart-line text-green-500"></i>
           Atividade
        </h4>
        
        {/* Dropdown de Filtro */}
        <select 
          value={daysToView()} 
          onInput={(e) => setDaysToView(parseInt(e.currentTarget.value))}
          class="input-select"
        >
          <option value={7}>Útimos 7 dias</option>
          <option value={30}>Útimos 30 dias</option>
          <option value={90}>Útimos 90 dias</option>
          <option value={180}>Útimos 6 meses</option>
        </select>
      </div>
      
      {/* Container do Gráfico */}
      <div class="relative flex-1 min-h-[100px]">
        <Show when={props.commits.length > 0} fallback={
          <div class="flex items-center justify-center h-full text-xs opacity-50 italic">Sem atividades encontradas</div>
        }>
          <svg 
            viewBox={`0 0 ${chartConfig.svgWidth} ${chartConfig.svgHeight}`} 
            preserveAspectRatio="none" 
            class="w-full h-full overflow-visible"
          >
            {/* Definições (Gradiente) */}
            <defs>
              <linearGradient id="activityGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color:rgb(34, 197, 94);stop-opacity:0.3" />
                <stop offset="100%" style="stop-color:rgb(34, 197, 94);stop-opacity:0" />
              </linearGradient>
            </defs>

            {/* --- EIXO Y (Linhas de grade e legendas) --- */}
            <For each={processedData().yTicks}>
              {(tick) => (
                <g class="text-gray-400 dark:text-gray-500">
                  {/* Linha de grade */}
                  <line 
                    x1={chartConfig.paddings.left} 
                    y1={tick.y} 
                    x2={chartConfig.svgWidth - chartConfig.paddings.right} 
                    y2={tick.y} 
                    stroke="currentColor" 
                    stroke-width="0.5" 
                    stroke-dasharray="2 2"
                    class="opacity-50"
                  />
                  {/* Texto da legenda Y */}
                  <text 
                    x={chartConfig.paddings.left - 8} 
                    y={tick.y} 
                    text-anchor="end" 
                    alignment-baseline="middle" 
                    class="fill-current text-[10px] font-mono"
                  >
                    {tick.value}
                  </text>
                </g>
              )}
            </For>

            {/* --- EIXO X (Legendas inferiores) --- */}
            <For each={processedData().xTicks}>
                {(tick, i) => (
                    <text 
                    x={tick.x} 
                    y={chartConfig.svgHeight - 10} 
                    text-anchor={
                        i() === 0 ? "start" : 
                        i() === processedData().xTicks.length - 1 ? "end" : "middle"
                    }
                    class="fill-current text-gray-500 dark:text-gray-400 text-[10px] font-medium"
                    >
                    {tick.label}
                    </text>
                )}
            </For>

            {/* --- O GRÁFICO (Área e Linha) --- */}
            
            {/* Área preenchida com gradiente */}
            <path d={processedData().area} fill="url(#activityGrad)" class="transition-all duration-500" />

            {/* Linha principal verde */}
            <path 
              d={processedData().line} 
              fill="none" 
              stroke="#22c55e" 
              stroke-width="2" 
              stroke-linecap="round" 
              stroke-linejoin="round"
              class="transition-all duration-500"
            />
          </svg>
        </Show>
      </div>
    </div>
  );
}