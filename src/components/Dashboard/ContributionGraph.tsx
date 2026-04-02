import { createMemo, createSignal, For, Show } from "solid-js";

export default function ContributionGraph(props: { commits: any[], openCommits: (commits: any[]) => void }) {
  const [yearFilter, setYearFilter] = createSignal("last_year");
  
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const daysOfWeek = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  const handleDayClick = (dateStr: string, count: number) => {
    if (count <= 0) return;

    const dayCommits = props.commits.filter(c => {
      const d = new Date(c.date);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}` === dateStr;
    });

    if (dayCommits.length > 0) {
      props.openCommits(dayCommits);
    }
  };

  // 1. Extrair anos disponíveis dos commits para o Select
  const availableYears = createMemo(() => {
    const years = props.commits.map(c => new Date(c.date).getFullYear());
    const uniqueYears = [...new Set(years)].sort((a, b) => b - a);
    return uniqueYears;
  });

  const calendarData = createMemo(() => {
    const commitMap: Record<string, number> = {};
    
    props.commits.forEach(c => {
      const d = new Date(c.date);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      
      commitMap[dateStr] = (commitMap[dateStr] || 0) + 1;
    });

    const filter = yearFilter();
    let startDate: Date;
    let endDate: Date;
    const today = new Date();
    // Zerar horas para comparações precisas
    today.setHours(0, 0, 0, 0);

    if (filter === "last_year") {
      startDate = new Date(today);
      startDate.setDate(today.getDate() - 364);
    } else {
      const year = parseInt(filter);
      startDate = new Date(year, 0, 1);
      endDate = new Date(year, 11, 31);
    }

    const dayOfWeek = startDate.getDay();
    startDate.setDate(startDate.getDate() - dayOfWeek);

    const weeks = [];
    let currentDate = new Date(startDate);
    const limitDate = filter === "last_year" ? today : endDate!;

    while (currentDate <= limitDate || weeks.length < 53) {
      if (weeks.length >= 54) break; 

      const week = [];
      let weekLabel = null;

      for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
        const year = currentDate.getFullYear();
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const day = String(currentDate.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        const isFuture = currentDate > today;
        const isOutsideYear = filter !== "last_year" && currentDate.getFullYear() !== parseInt(filter);
        
        const count = (isFuture || isOutsideYear) ? -1 : (commitMap[dateStr] || 0);

        // Rótulo do mês apenas se o dia 1 cair nesta semana
        if (currentDate.getDate() === 1) {
          weekLabel = months[currentDate.getMonth()];
        }

        week.push({ date: dateStr, count });
        currentDate.setDate(currentDate.getDate() + 1);
      }
      weeks.push({ days: week, label: weekLabel });
    }
    return weeks;
  });

  const filteredTotal = createMemo(() => {
    const filter = yearFilter();
    
    if (filter === "last_year") {
      const today = new Date();
      const oneYearAgo = new Date();
      oneYearAgo.setDate(today.getDate() - 365);
      
      return props.commits.filter(c => {
        const commitDate = new Date(c.date);
        return commitDate >= oneYearAgo && commitDate <= today;
      }).length;
    } else {
      const targetYear = parseInt(filter);
      return props.commits.filter(c => new Date(c.date).getFullYear() === targetYear).length;
    }
  });

  return (
    <div class="px-2 flex flex-col h-full overflow-hidden">
      
      {/* Cabeçalho com Filtro */}
      <div class="flex items-center justify-between mb-4">
        <span class="text-gray-900 dark:text-gray-200">
          <i class="fa-solid fa-code-commit text-green-500 mr-2"></i>
          {filteredTotal()} contribuições {yearFilter() === "last_year" ? "nos últimos 365 dias" : "em " + yearFilter()}
        </span>
        
        <select 
          value={yearFilter()}
          onInput={(e) => setYearFilter(e.currentTarget.value)}
          class="input-select"
        >
          <option value="last_year">Último ano</option>
          <For each={availableYears()}>
            {(year) => <option value={year}>{year}</option>}
          </For>
        </select>
      </div>

      <div class="flex-1 flex gap-2 min-h-0 min-w-0">
        
        {/* Rótulos Laterais (TODOS os dias da semana) */}
        <div class="grid grid-rows-7 text-[9px] text-gray-500 pr-1 mt-5 select-none">
          <For each={daysOfWeek}>
            {(day) => <div class="flex items-center h-full leading-none h-[1fr]">{day}</div>}
          </For>
        </div>

        {/* Grade do Gráfico */}
        <div class="flex-1 flex flex-col min-h-0">
          
        {/* MESES - Corrigido: Agora eles flutuam sobre a coluna correta sem quebrar o layout */}
        <div class="relative h-4 mb-1 text-[10px] text-gray-500 select-none">
            <For each={calendarData()}>
                {(week, i) => (
                <Show when={week.label}>
                    <div 
                    class="absolute" 
                    style={{ left: `${(i() / 53) * 100}%` }}
                    >
                    {week.label}
                    </div>
                </Show>
                )}
            </For>
        </div>

        {/* GRADE DE QUADRADOS */}
        <div class="flex-1 relative">
            <div 
                class="absolute inset-0 grid grid-rows-7 grid-flow-col gap-[4px] w-full h-full"
                style={{ 
                    "grid-template-columns": "repeat(53, 1fr)",
                }}
            >
                <For each={calendarData()}>
                    {(week) => (
                    <For each={week.days}>
                        {(day) => (
                        <div 
                            onClick={() => handleDayClick(day.date, day.count)}
                            class={`rounded-[2px] transition-colors duration-200 ${getContributionColor(day.count)} ${day.count === -1 ? 'opacity-[0.02]' : 'hover:ring-1 hover:ring-white/30'}`}
                            title={day.count >= 0 ? `${day.count} commits em ${day.date}` : ""}
                        />
                        )}
                    </For>
                    )}
                </For>
            </div>
            </div>
        </div>
       </div>

      {/* Legenda inferior */}
      <div class="flex justify-end items-center gap-2 mt-4 text-[9px] text-gray-500">
        <span>Less</span>
        <div class="flex gap-[3px]">
          {[0, 2, 5, 10, 15].map(v => (
            <div class={`w-2.5 h-2.5 rounded-[1px] ${getContributionColor(v)}`} />
          ))}
        </div>
        <span>More</span>
      </div>
    </div>
  );
}

const getContributionColor = (count: number) => {
  if (count === -1) return "bg-transparent";

  // Nível 0 (Vazio)
  if (count === 0) {
    return "bg-gray-300 dark:bg-[#161b22]"; 
  }
  
  // Nível 1 (Poucas contribuições)
  if (count <= 2) {
    return "bg-[#9be9a8] dark:bg-[#0e4429]";
  }
  
  // Nível 2
  if (count <= 5) {
    return "bg-[#40c463] dark:bg-[#006d32]";
  }
  
  // Nível 3
  if (count <= 10) {
    return "bg-[#30a14e] dark:bg-[#26a641]";
  }
  
  // Nível 4 (Muitas contribuições)
  return "bg-[#216e39] dark:bg-[#39d353]";
};