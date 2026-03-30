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
    <div class="flex flex-col h-full relative"> {/* Adicionado relative aqui */}
      
      {/* Cabeçalho igual */}
      <div class="flex items-center justify-between mb-4">
        <h4 class="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 ml-2">
           <i class="fa-solid fa-chart-line text-green-500"></i>
           Atividade
        </h4>
        <select 
          value={daysToView()} 
          onInput={(e) => setDaysToView(parseInt(e.currentTarget.value))}
          class="input-select"
        >
          <option value={7}>Últimos 7 dias</option>
          <option value={30}>Últimos 30 dias</option>
          <option value={90}>Últimos 90 dias</option>
          <option value={180}>Últimos 6 meses</option>
          <option value={365}>Últimos 12 meses</option>
          <option value={730}>Últimos 2 anos</option>
        </select>
      </div>
      
      <div class="relative flex-1 min-h-[150px]">
        <Show when={props.commits.length > 0} fallback={
          <div class="flex items-center justify-center h-full text-xs opacity-50 italic text-white">Sem atividades</div>
        }>
          
          {/* 1. LEGENDAS DO EIXO Y (HTML Absoluto - Não distorce) */}
          <div class="absolute inset-0 pointer-events-none" style={{ 
            padding: `${chartConfig.paddings.top}px ${chartConfig.paddings.right}px ${chartConfig.paddings.bottom}px ${chartConfig.paddings.left}px` 
          }}>
            <For each={processedData().yTicks}>
              {(tick) => (
                <div 
                  class="absolute left-0 text-[10px] font-mono text-gray-500 flex items-center justify-end w-[35px]"
                  style={{ top: `${(tick.y / chartConfig.svgHeight) * 100}%`, transform: 'translateY(-50%)' }}
                >
                  {tick.value}
                </div>
              )}
            </For>
          </div>

          {/* 2. O GRÁFICO (SVG com preserveAspectRatio="none" - Deforma apenas o desenho) */}
          <svg 
            viewBox={`0 0 ${chartConfig.svgWidth} ${chartConfig.svgHeight}`} 
            preserveAspectRatio="none" 
            class="w-full h-full block"
          >
            <defs>
              <linearGradient id="activityGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color:rgb(34, 197, 94);stop-opacity:0.3" />
                <stop offset="100%" style="stop-color:rgb(34, 197, 94);stop-opacity:0" />
              </linearGradient>
            </defs>

            {/* Linhas de grade (também esticam, o que é ok) */}
            <For each={processedData().yTicks}>
              {(tick) => (
                <line 
                  x1={chartConfig.paddings.left} y1={tick.y} 
                  x2={chartConfig.svgWidth - chartConfig.paddings.right} y2={tick.y} 
                  stroke="currentColor" stroke-width="0.5" stroke-dasharray="2 2" class="text-gray-700"
                />
              )}
            </For>

            <path d={processedData().area} fill="url(#activityGrad)" />
            <path 
              d={processedData().line} fill="none" stroke="#22c55e" stroke-width="2" 
              stroke-linecap="round" stroke-linejoin="round"
              style={{ "vector-effect": "non-scaling-stroke" }} // Mantém a espessura da linha constante
            />
          </svg>

          {/* 3. LEGENDAS DO EIXO X (HTML Absoluto - Não distorce) */}
          <div class="absolute bottom-0 left-0 right-0 h-[30px] pointer-events-none" style={{
            "margin-left": `${chartConfig.paddings.left}px`,
            "margin-right": `${chartConfig.paddings.right}px`
          }}>
             <For each={processedData().xTicks}>
                {(tick, i) => (
                    <div 
                      class="absolute bottom-1 text-[10px] font-medium text-gray-400 whitespace-nowrap"
                      style={{ 
                        left: `${((tick.x - chartConfig.paddings.left) / (chartConfig.svgWidth - chartConfig.paddings.left - chartConfig.paddings.right)) * 100}%`,
                        transform: i() === 0 ? 'none' : i() === processedData().xTicks.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)'
                      }}
                    >
                      {tick.label}
                    </div>
                )}
            </For>
          </div>

        </Show>
      </div>
    </div>
  );
}