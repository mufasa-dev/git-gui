import { createMemo, For, Show } from "solid-js";
import { tagBaseColors } from "../../utils/file";

// 1. Dicionário de normalização para corrigir erros de digitação comuns
const TAG_MAPPING: Record<string, string> = {
  // Assets
  assts: "assets",
  asets: "assets",
  asset: "assets",
  static: "assets",
  // Features
  feature: "feat",
  ft: "feat",
  fet: "feat",
  featt: "feat",
  // Fixes
  bug: "fix",
  fixed: "fix",
  hotfix: "fix",
  // Tests
  test: "tests",
  testing: "tests",
  // Docs
  doc: "docs",
  documentation: "docs",
  // Refactor
  refactoring: "refactor",
  ref: "refactor",
  // Chore
  chores: "chore",
  chord: "chore",
  // Outros
  srtle: "other",
  other: "other"
};

// Função auxiliar para normalizar a tag
const normalizeTag = (tag: string): string => {
  const t = tag.toLowerCase();
  return TAG_MAPPING[t] || t;
};

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
      
      // 1. Verificação de Merge
      if (msg.startsWith("Merge branch") || msg.startsWith("Merge remote-tracking branch") || msg.startsWith("Merge pull request")) {
        counts["merge"] = (counts["merge"] || 0) + 1;
        totalProcessed++;
        return;
      }

      // 2. Verificação de Conventional Tags
      const match = msg.match(tagRegex);
      if (match) {
        // AQUI ESTÁ A MUDANÇA: Normalizamos a tag antes de contar
        const rawType = match[1];
        const type = normalizeTag(rawType);
        
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
    <div class="p-2 h-full flex flex-col">
      <div class="flex items-center gap-2 mb-5">
        <i class="fa-solid fa-chart-pie text-blue-400 text-xs"></i>
        <h3 class="text-[11px] font-bold text-gray-900 dark:text-white uppercase tracking-widest">
          Tipos de Commits
        </h3>
      </div>

      <Show 
        when={stats().length > 0} 
        fallback={
          <div class="flex-1 flex items-center justify-center text-gray-500 italic text-xs">
            Sem Tags Identificadas
          </div>
        }
      >
        {/* Barra Segmentada */}
        <div class="w-full h-3 flex rounded-full overflow-hidden bg-gray-200 dark:bg-gray-900 mb-6 border border-black/10 dark:border-white/5">
          <For each={stats()}>
            {(item) => (
              <div 
                style={{ 
                  width: `${item.percent}%`, 
                  "background-color": item.color 
                }}
                class="h-full border-r border-[#0d1117]/20 last:border-0 transition-all duration-700 ease-out"
                title={`${item.name.toUpperCase()}: ${item.count} commits`}
              />
            )}
          </For>
        </div>

        {/* Legenda em Grid */}
        <div class="flex-1 grid grid-cols-2 gap-x-6 gap-y-3 overflow-y-auto pr-2 custom-scrollbar text-[11px]">
          <For each={stats()}>
            {(item) => (
              <div class="flex items-center justify-between group">
                <div class="flex items-center gap-2">
                  <span 
                    class="w-2 h-2 rounded-full shadow-sm" 
                    style={{ "background-color": item.color }} 
                  />
                  <span class={`font-bold transition-colors capitalize text-gray-700 dark:text-gray-300 group-hover:text-blue-500`}>
                    {item.name}
                  </span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-gray-900 dark:text-white font-mono">
                    {item.count}
                  </span>
                  <span class="text-gray-400 font-medium min-w-[30px] text-right">
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