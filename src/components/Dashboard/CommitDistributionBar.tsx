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
  fewat: "feat",
  // Fixes
  bug: "fix",
  fixed: "fix",
  hotfix: "fix",
  fixx: "fix",
  // Tests
  test: "tests",
  testing: "tests",
  unit: "tests",
  // Docs
  doc: "docs",
  documentation: "docs",
  readme: "docs",
  // Refactor
  refactoring: "refactor",
  ref: "refactor",
  // Chore
  chores: "chore",
  chord: "chore",
  // Translate
  i18n: "translate",
  // Outros
  srtle: "other",
  other: "other",
  // Audio
  adio: "audio",
  som: "audio",
  music: "audio",
  wav: "audio",
  ogg: "audio",
  mp3: "audio",
  // art
  sfx: "art",
  fbx: "art",
  shaders: "art",
  // lvl
  map: "lvl",
  pref: "lvl",
  tscn: "lvl"
};

const INFERENCE_RULES: Record<string, string[]> = {
  merge: ["merge", "mesclagem"],
  tests: ["test", "spec", "coverage"],
  style: ["debugger", "css", "identa"],
  chore: ["event", "chord", "environ", ".config", "global", "build", "dependen", "depen", "release", "version", "versão"],
  ui: ["layout", "tela", "visual", "css", "color", "ux", "fundo", "font"],
  assets: ["image", "img", "icon", "video", "vídeo", "svg", "font"],
  anim: ["animma", "animação"],
  fix: ["ajuste", "fix", "corrig", "bug", "erro", "consert", "resolv", "patch", "correc", "correç", "att", "remoç", "remov", "hotfix", "update"],
  feat: ["adicao", "adiç", "novo", "new", "add", "cria", "implement", "feat", "improve", "finaliza"],
  docs: ["doc", "readme", "ajuda", "help", "coment", "text", "logs"],
  refactor: ["refactor", "limpeza", "clean", "melhoria", "otimiz"],
  translate: ["traduc", "traduç", "translate", "idioma", "i18n", "pt", "en", "es"],
};

// Função auxiliar para normalizar a tag
const normalizeTag = (tag: string): string => {
  const t = tag.toLowerCase();
  return TAG_MAPPING[t] || t;
};

const inferTagFromMessage = (message: string): string => {
  const msg = message.toLowerCase();
  
  for (const [tag, keywords] of Object.entries(INFERENCE_RULES)) {
    if (keywords.some(kw => msg.includes(kw))) {
      return tag;
    }
  }
  
  return "other";
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
        return;
      }

      // 2. Tenta Conventional Tags ou Inferência
      const match = msg.match(tagRegex);
      let type = match ? normalizeTag(match[1]) : inferTagFromMessage(msg);

      // FILTRO: Só contamos se NÃO for "other"
      if (type !== "other") {
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
        <h3 class="font-bold text-gray-900 dark:text-white tracking-widest">
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
                    class="w-3.5 h-3.5 rounded-full shadow-sm" 
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