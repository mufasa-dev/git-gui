import { createMemo, For, Show } from "solid-js";
import { tagBaseColors } from "../../utils/file";

interface Commit {
  message: string;
  [key: string]: any;
}

interface Props {
  commits: Commit[];
}

const CommitTypeDistribution = (props: Props) => {

  const stats = createMemo(() => {
    const counts: Record<string, number> = {};
    let totalProcessed = 0;
    
    const tagRegex = /^(\w+)(?:\(([^)]+)\))?:\s*(.*)$/;

    props.commits.forEach((c) => {
      const msg = c.message || "";
      
      // 1. Verificação de Merge (Mesma lógica do seu CommitMessage)
      if (msg.startsWith("Merge branch") || msg.startsWith("Merge remote-tracking branch") || msg.startsWith("Merge pull request")) {
        counts["merge"] = (counts["merge"] || 0) + 1;
        totalProcessed++;
        return;
      }

      // 2. Verificação de Conventional Tags
      const match = msg.match(tagRegex);
      if (match) {
        const type = match[1].toLowerCase();
        counts[type] = (counts[type] || 0) + 1;
        totalProcessed++;
      }
    });

    if (totalProcessed === 0) return [];

    return Object.entries(counts)
      .map(([name, count]) => ({
        name,
        count,
        percent: (count / totalProcessed) * 100,
        color: tagBaseColors[name] || tagBaseColors.other
      }))
      .sort((a, b) => b.count - a.count);
  });

  return (
    <div class="p-2">
      <div class="flex items-center gap-2 mb-5">
        <i class="fa-solid fa-chart-pie text-blue-400 text-xs"></i>
        <h3 class="text-[11px] font-bold text-gray-900 dark:text-white uppercase tracking-widest">
          Tipos de Commits
        </h3>
      </div>

      <Show 
        when={stats().length > 0} 
        fallback={
          <div class="flex-1 flex items-center justify-center text-gray-500 italic">
            Sem Tags
          </div>
        }
      >
        {/* Barra Segmentada */}
        <div class="w-full h-3 flex rounded-full overflow-hidden bg-gray-900 mb-6 border border-white/5">
          <For each={stats()}>
            {(item) => (
              <div 
                style={{ 
                  width: `${item.percent}%`, 
                  "background-color": item.color 
                }}
                class="h-full border-r border-[#0d1117]/40 last:border-0 transition-all duration-700 ease-out"
                title={`${item.name.toUpperCase()}: ${item.count} commits`}
              />
            )}
          </For>
        </div>

        {/* Legenda em Grid */}
        <div class="flex-1 grid grid-cols-2 gap-x-6 gap-y-3 overflow-y-auto pr-2 custom-scrollbar">
          <For each={stats()}>
            {(item) => (
              <div class="flex items-center justify-between group">
                <div class="flex items-center gap-2.5">
                  <span 
                    class="w-2 h-2 rounded-full" 
                    style={{ "background-color": item.color }} 
                  />
                  <span class={`font-semibold transition-colors capitalize text-gray-900 dark:text-white group-hover:text-white`}>
                    {item.name}
                  </span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-gray-800 dark:text-gray-200 font-mono  px-1 rounded">
                    {item.count}
                  </span>
                  <span class="text-gray-400 font-medium min-w-[35px] text-right">
                    {item.percent.toFixed(0)}%
                  </span>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default CommitTypeDistribution;