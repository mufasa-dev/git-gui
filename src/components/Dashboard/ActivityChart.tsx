import { createMemo, createSignal, For, Show, onMount } from "solid-js";
import Dialog from "../ui/Dialog";

const formatDateAxis = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

// Dias da semana para o seletor
const WEEKDAYS = [
  { id: 0, label: "Dom" },
  { id: 1, label: "Seg" },
  { id: 2, label: "Ter" },
  { id: 3, label: "Qua" },
  { id: 4, label: "Qui" },
  { id: 5, label: "Sex" },
  { id: 6, label: "Sáb" },
];

export default function ActivityChart(props: { commits: any[] }) {
  const [daysToView, setDaysToView] = createSignal(30);
  const [isModalOpen, setIsModalOpen] = createSignal(false);
  const [hoveredPoint, setHoveredPoint] = createSignal<{x: number, y: number, value: number, date: string} | null>(null);
  
  // Estado para os dias ocultos (0 = Domingo, 6 = Sábado)
  const [hiddenDays, setHiddenDays] = createSignal<number[]>([]);

  // Carregar do localStorage ao iniciar
  onMount(() => {
    const saved = localStorage.getItem("git-trident-hidden-days");
    if (saved) setHiddenDays(JSON.parse(saved));
  });

  const toggleDay = (dayId: number) => {
    const current = hiddenDays();
    const next = current.includes(dayId) 
      ? current.filter(id => id !== dayId) 
      : [...current, dayId];
    
    setHiddenDays(next);
    localStorage.setItem("git-trident-hidden-days", JSON.stringify(next));
  };

  const chartConfig = {
    svgWidth: 500,
    svgHeight: 180,
    paddings: { top: 10, right: 10, bottom: 30, left: 40 }
  };

  const processedData = createMemo(() => {
    // 0. Verificação de segurança
    if (!props.commits || props.commits.length === 0) {
      return { points: [], yTicks: [], xTicks: [], area: "", line: "", drawHeight: 0, drawWidth: 0 };
    }

    const days = daysToView();
    const hiddenConfigs = hiddenDays(); // Ex: [0, 6] vindo do seu sinal/localStorage

    // 1. Mapear contagem de commits por data (Y-axis data)
    const commitCounts = props.commits.reduce((acc, c) => {
      const day = new Date(c.date).toISOString().split('T')[0];
      acc[day] = (acc[day] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // 2. Gerar o intervalo de datas com FILTRAGEM CONDICIONAL
    const dateRange = Array.from({ length: days }, (_, i) => {
      const d = new Date();
      d.setHours(0, 0, 0, 0); // Normaliza para evitar problemas de fuso
      d.setDate(d.getDate() - i);
      return d;
    })
    .filter(d => {
      const dateStr = d.toISOString().split('T')[0];
      const dayOfWeek = d.getDay();
      const count = commitCounts[dateStr] || 0;

      // Lógica: Se o dia for um dos "ocultáveis" E não tiver atividade, removemos.
      // Caso contrário (tem atividade ou não está na lista de ocultar), mantemos.
      if (hiddenConfigs.includes(dayOfWeek) && count === 0) {
        return false;
      }
      return true;
    })
    .map(d => d.toISOString().split('T')[0])
    .reverse(); // Coloca em ordem cronológica (passado -> presente)

    // 3. Se o filtro remover tudo (caso raro), evita quebra do SVG
    if (dateRange.length < 2) {
      return { points: [], yTicks: [], xTicks: [], area: "", line: "", drawHeight: 0, drawWidth: 0 };
    }

    // 4. Preparar dados para o desenho
    const data = dateRange.map(day => ({ 
      date: day, 
      value: commitCounts[day] || 0 
    }));

    const maxVal = Math.max(...data.map(d => d.value), 5);

    const drawWidth = chartConfig.svgWidth - chartConfig.paddings.left - chartConfig.paddings.right;
    const drawHeight = chartConfig.svgHeight - chartConfig.paddings.top - chartConfig.paddings.bottom;

    // 5. Calcular coordenadas exatas dos pontos no SVG
    const points = data.map((d, i) => ({
      x: chartConfig.paddings.left + (i / (data.length - 1)) * drawWidth,
      y: chartConfig.paddings.top + drawHeight - (d.value / maxVal) * drawHeight,
      value: d.value,
      date: d.date
    }));

    // 6. Gerar caminhos (Paths) do SVG
    const lineData = `M ${points[0].x} ${points[0].y} ` + 
                    points.slice(1).map(p => `L ${p.x} ${p.y}`).join(" ");
                    
    const areaData = `${lineData} L ${points[points.length - 1].x} ${chartConfig.paddings.top + drawHeight} L ${chartConfig.paddings.left} ${chartConfig.paddings.top + drawHeight} Z`;

    // 7. Gerar Ticks do Eixo Y
    const yTicks = [0, Math.round(maxVal / 2), maxVal].map(val => ({
      value: val,
      y: chartConfig.paddings.top + drawHeight - (val / maxVal) * drawHeight
    }));

    // 8. Gerar Ticks do Eixo X (Início, Meio e Fim do período visível)
    const xTicksIndices = [0, Math.round((dateRange.length - 1) / 2), dateRange.length - 1];
    const xTicks = xTicksIndices.map(idx => ({
      label: formatDateAxis(data[idx].date),
      x: points[idx].x
    }));

    return { 
      points, 
      yTicks, 
      xTicks, 
      area: areaData, 
      line: lineData, 
      drawHeight, 
      drawWidth 
    };
  });

  return (
    <div class="flex flex-col h-full relative">
      <div class="flex items-center justify-between mb-4">
        <h4 class="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 ml-2">
           <i class="fa-solid fa-chart-line text-green-500"></i>
           Atividade
        </h4>
        
        <div class="flex items-center gap-2">
          <select 
            value={daysToView()} 
            onInput={(e) => setDaysToView(parseInt(e.currentTarget.value))}
            class="input-select"
          >
            <option value={7}>7 dias</option>
            <option value={30}>30 dias</option>
            <option value={90}>90 dias</option>
          </select>
          
          <button 
            onClick={() => setIsModalOpen(true)}
            class="p-2 text-gray-400 hover:text-white transition-colors"
          >
            <i class="fa-solid fa-cog"></i>
          </button>
        </div>
      </div>

      {/* MODAL DE CONFIGURAÇÃO */}
      <Dialog 
        open={isModalOpen()} 
        title="Configurar Gráfico" 
        onClose={() => setIsModalOpen(false)}
        width="350px"
      >
        <div class="space-y-4">
          <p class="text-sm text-gray-400">Selecione os dias que deseja <b>ocultar</b> no gráfico caso não haja atividade:</p>
          <div class="grid grid-cols-4 gap-2">
            <For each={WEEKDAYS}>
              {(day) => (
                <button
                  onClick={() => toggleDay(day.id)}
                  class={`px-2 py-1 text-xs rounded border transition-all ${
                    hiddenDays().includes(day.id)
                      ? "bg-red-500/20 border-red-500 text-red-500"
                      : "bg-gray-700 border-gray-600 text-gray-300 hover:border-green-500"
                  }`}
                >
                  {day.label}
                </button>
              )}
            </For>
          </div>
          <div class="pt-4 border-t border-gray-700 flex justify-end">
             <button 
               onClick={() => setIsModalOpen(false)}
               class="px-4 py-2 bg-green-600 text-white rounded text-sm font-bold"
             >
               Pronto
             </button>
          </div>
        </div>
      </Dialog>
      
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

            <Show when={hoveredPoint()}>
              <circle 
                cx={hoveredPoint()!.x} 
                cy={hoveredPoint()!.y} 
                r="4" 
                fill="#22c55e" 
                stroke="white" 
                stroke-width="2" 
              />
              {/* Linha vertical indicadora */}
              <line 
                x1={hoveredPoint()!.x} y1={chartConfig.paddings.top} 
                x2={hoveredPoint()!.x} y2={chartConfig.svgHeight - chartConfig.paddings.bottom} 
                stroke="#22c55e" stroke-width="1" stroke-dasharray="4" opacity="0.5"
              />
            </Show>

            <rect
              width={chartConfig.svgWidth}
              height={chartConfig.svgHeight}
              fill="transparent"
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                // Calcula o X relativo dentro do SVG (0 a 500)
                const x = ((e.clientX - rect.left) / rect.width) * chartConfig.svgWidth;
                
                // Encontra o ponto mais próximo no array processado
                const pts = processedData().points;
                if (!pts.length) return;

                const closest = pts.reduce((prev, curr) => 
                  Math.abs(curr.x - x) < Math.abs(prev.x - x) ? curr : prev
                );

                setHoveredPoint(closest);
              }}
              onMouseLeave={() => setHoveredPoint(null)}
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

        {/* Tooltip Flutuante */}
        <Show when={hoveredPoint()}>
          <div 
            class="absolute z-10 pointer-events-none bg-gray-900 border border-gray-700 p-2 rounded shadow-lg text-[10px] text-white"
            style={{
              left: `${(hoveredPoint()!.x / chartConfig.svgWidth) * 100}%`,
              top: `${(hoveredPoint()!.y / chartConfig.svgHeight) * 100}%`,
              transform: 'translate(-50%, -120%)' // Centraliza sobre o ponto
            }}
          >
            <div class="font-bold border-b border-gray-700 pb-1 mb-1">
              {formatDateAxis(hoveredPoint()!.date)}
            </div>
            <div class="flex items-center gap-1">
              <span class="w-2 h-2 rounded-full bg-green-500"></span>
              {hoveredPoint()!.value} commits
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
}