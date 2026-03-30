import { createMemo, For } from "solid-js";

const LANGUAGE_GROUPS: Record<string, string> = {
  // TypeScript
  ts: "TypeScript",
  tsx: "TypeScript",
  // JavaScript
  js: "JavaScript",
  jsx: "JavaScript",
  mjs: "JavaScript",
  cjs: "JavaScript",
  ejs: "JavaScript",
  jade: "JavaScript",
  // Rust
  rs: "Rust",
  toml: "Toml",
  go: "Go",
  mod: "Go",
  sum: "Go",
  py: "Python",
  java: "Java",
  jsp: "Java",
  rb: "Ruby",
  gd: "GDScript",
  tscn: "Godot Scene",
  tres: "Godot Resource",
  cs: "C#",
  csproject: "C#",
  cshtml: "C#",
  razor: "C#",
  sln: "C#",
  cpp: "C++",
  hpp: "C++",
  h: "C++",
  asp: "Asp",
  // Frameworks
  svelte: "Svelte",
  vue: "Vue",
  astro: "Astro",
  // Styles
  css: "CSS",
  scss: "CSS",
  less: "CSS",
  // Outros
  html: "HTML",
  php: "PHP",
  makefile: "MakeFile",
  dockerfile: "Dockerfile",
  graphql: "GraphQL",
  graphqls: "GraphQL",
  sql: "SQL",
  bat: "Bat",
  ttf: "Font",
  woff: "Font",
  woff2: "Font",
  otf: "Font",
  eot: "Font"
};

// Cores baseadas no NOME DO GRUPO agora
const GROUP_COLORS: Record<string, string> = {
  "TypeScript": "#3178c6",
  "JavaScript": "#f1e05a",
  "Rust": "#dea584",
  "CSS": "#563d7c",
  "HTML": "#e34c26",
  "PHP": "#4f5d95",
  "Go": "#41acd5",
  "C#": "#178600",
  "C++": "#f34b7d",
  "Asp": "#6a40fd",
  "Aspx": "#6a40fd",
  "Asax": "#6a40fd",
  "Python": "#3572A8",
  "Java": "#b07219",
  "Ruby": "#701516",
  "GDScript": "#355570",
  "Godot Scene": "#eb5555",
  "Godot Resource": "#eb5555",
  "Svelte": "#ff3e00",
  "Vue": "#2c3e50",
  "Astro": "#ff5a03",
  "MakeFile": "#427819",
  "Dockerfile": "#384d54",
  "GraphQL": "#e10098",
  "SQL": "#e38c00",
  "Toml": "#9c4221",
  "Bat": "#1f1f1f",
  "Font": "#f7e03d",
  "Other": "#8b949e"
};

// --- LISTA NEGRA: Extensões que NÃO devem aparecer no gráfico ---
const IGNORED_EXTENSIONS = [
  // Imagens
  'png', 'icns', 'bmp', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'webp',
  // Binários e outros
  'exe', 'dll', 'so', 'lock', 'bin', 'ttf', 'woff', 'woff2', 'mp4', "mp3", 'avi', 'mov', 'zip', 'log', 'map',
  'pdf', 'docx', 'xlsx', 'DS_Store', 'DS_Store', 'json', 'yml', 'yaml', 'env', 'env.local', 'env.development', 'env.production',
  'md', 'markdown', 'txt', 'rtf', 'csv', 'tsv', 'log', 'lock', 'bin', 'iso', 'dmg', 'app', 'apk', 'jar', 'war', 'ear', 'txt', 'log',
  'rar', 'tar', 'gz', '7z', 'wxl', 'xlsx', 'pptx', 'key', 'numbers', 'pages', 'xml',
  // Configurações e Metadados
  'gitignore', 'gitattributes', 'editorconfig', 'eslintignore', 'prettierignore',
  // Outros arquivos de configuração comuns
  'vscode', 'idea', 'sublime-project', 'sublime-workspace', 'sqlproj',
  'suo', 'user', 'userosscache', 'slnvb', 'ps1', 'psd1', 'psm1', 'vsix', 'vsixmanifest', 'appxmanifest', 'appxbundle', 'appxupload',
  'msi', 'exe', 'nsi', 'pfx', 'ocx', 'browserslistrc',
  // Godot
  'import', 'gdc', 'precomp', 'uid', 'pck', 'tmp', 'config', 'conf', 'dll', 'resx'
];

// O seu componente continua recebendo a lista do Rust: { path, size }
export default function LanguageBar(props: { files: { path: string, size: number }[] }) {
  
  // 1. Memo intermediário para filtrar arquivos indesejados
  const codeFiles = createMemo(() => {
    if (!props.files.length) return [];
    
    return props.files.filter(file => {
      const path = file.path;
    
      // Ignorar pastas de cache e build comuns
      if (
        path.includes('.godot/') ||    // Cache da Godot 4
        path.includes('.import/') ||   // Assets importados
        path.includes('node_modules/') || 
        path.includes('/bin/') || 
        path.includes('/obj/') || 
        path.includes('target/')       // Build do Rust
      ) {
        return false;
      }
      const ext = file.path?.split('.')?.pop()?.toLowerCase() || '';
      
      if (!ext || IGNORED_EXTENSIONS.includes(ext)) {
        return false;
      }
      return true;
    });
  });

  // 2. Memo para gerar as estatísticas finais baseadas apenas no código-fonte
  const stats = createMemo(() => {
    const files = codeFiles();
    if (!files.length) return [];

    const sizeByGroup: Record<string, number> = {};
    let totalBytes = 0;

    files.forEach(file => {
      const ext = file.path?.split('.')?.pop()?.toLowerCase() || '';
      
      // 1. Descobre a qual grupo essa extensão pertence
      const groupName = LANGUAGE_GROUPS[ext] || "Other";
      const size = file.size || 0;
      
      // 2. Acumula os bytes no grupo correspondente
      sizeByGroup[groupName] = (sizeByGroup[groupName] || 0) + size;
      totalBytes += size;
    });

    return Object.entries(sizeByGroup)
      .map(([name, bytes]) => ({
        name: name,
        percent: ((bytes / totalBytes) * 100).toFixed(1),
        color: GROUP_COLORS[name] || GROUP_COLORS.Other
      }))
      .filter(lang => parseFloat(lang.percent) > 0.1)
      .sort((a, b) => parseFloat(b.percent) - parseFloat(a.percent))
      .slice(0, 6);
  });

  return (
    <div class="p-2 flex flex-col h-full bg-white dark:bg-gray-800 rounded-lg shadow-sm">
      <div class="flex items-center gap-2 mb-6">
        <i class="fa-solid fa-code text-blue-500 text-lg"></i>
        <h4 class="text-base font-bold text-gray-800 dark:text-gray-100">
          Linguagens mais usadas
        </h4>
      </div>

      {/* Barra de Progresso mais alta */}
      <div class="w-full h-3 flex rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 mb-8">
        <For each={stats()}>
          {(lang) => (
            <div 
              style={{ width: `${lang.percent}%`, "background-color": lang.color }}
              class="h-full border-r border-white/10 last:border-0 transition-all duration-700"
              title={`${lang.name}: ${lang.percent}%`}
            />
          )}
        </For>
      </div>

      {/* Legenda em Grid de 2 Colunas */}
      <div class="grid grid-cols-2 gap-x-8 gap-y-4">
        <For each={stats()}>
          {(lang) => (
            <div class="flex items-center justify-between group">
              <div class="flex items-center gap-3">
                <span 
                  class="w-3.5 h-3.5 rounded-full shadow-sm" 
                  style={{ "background-color": lang.color }}
                />
                <span class="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {lang.name}
                </span>
              </div>
              <span class="text-sm text-gray-500 dark:text-gray-400 font-medium">
                {lang.percent}%
              </span>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}