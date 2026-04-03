export const formatSize = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

export const commitColors: Record<string, string> = {
  feat: "text-green-600 dark:text-green-400 font-bold",
  fix: "text-amber-600 dark:text-amber-400 font-bold",
  assets: "text-orange-500 dark:text-orange-400 font-medium",
  docs: "text-blue-500 dark:text-blue-400",
  style: "text-purple-500 dark:text-purple-400",
  refactor: "text-cyan-600 dark:text-cyan-400",
  perf: "text-rose-500 dark:text-rose-400",
  tests: "text-pink-500 dark:text-pink-400",
  build: "text-emerald-600 dark:text-emerald-500",
  chore: "text-slate-500 dark:text-slate-400",
  ci: "text-indigo-500 dark:text-indigo-400",
  revert: "text-red-600 dark:text-red-500 line-through",
  translate: "text-blue-600 dark:text-blue-400 font-bold",
  error: "text-green-600 dark:text-green-400 font-bold",
  start: "text-green-600 dark:text-green-400 font-bold",
  stop: "text-red-600 dark:text-red-500 font-bold",
  // Game dev
  art: "text-orange-500 dark:text-orange-400 font-medium",
  audio: "text-cyan-500 dark:text-cyan-400 font-medium",
  bal: "text-amber-500 dark:text-amber-400 font-medium",
  shader: "text-violet-500 dark:text-violet-400 font-medium",
  lvl: "text-emerald-500 dark:text-emerald-400 font-medium",
  anim: "text-rose-500 dark:text-rose-400 font-medium"
};

export const tagBaseColors: Record<string, string> = {
  feat: "#16a34a",       // green-600
  fix: "#d97706",        // amber-600
  assets: "#f97316",     // orange-500
  docs: "#3b82f6",       // blue-500
  style: "#a855f7",      // purple-500
  refactor: "#0891b2",   // cyan-600
  perf: "#f43f5e",       // rose-500
  tests: "#ec4899",      // pink-500
  build: "#10b981",      // emerald-500
  chore: "#64748b",      // slate-500
  ci: "#6366f1",         // indigo-500
  merge: "#d946ef",      // fuchsia-500
  revert: "#dc2626",     // red-600
  translate: "#2563eb",  // blue-600
  error: "#16a34a",      // green-600
  start: "#16a34a",      // green-600
  stop: "#dc2626",       // red-600
  other: "#94a3b8",      // gray-400
  // Gamedev
  art: "#f97316",        // orange-500 (Vibrante para arte)
  audio: "#06b6d4",      // cyan-500 (Ondas sonoras)
  bal: "#f59e0b",        // amber-500 (Equilíbrio/Ajuste)
  shader: "#8b5cf6",     // violet-500 (Efeitos visuais)
  lvl: "#10b981",        // emerald-500 (Cenários),
  anim: "#f43f5e"        // rose-500 (Animações)
};

export const LANGUAGE_GROUPS: Record<string, string> = {
  // TypeScript
  ts: "TypeScript",
  tsx: "TypeScript",
  // JavaScript
  js: "JavaScript",
  jsx: "JavaScript",
  mjs: "JavaScript",
  cjs: "JavaScript",
  jade: "JavaScript",
  ejs: "Ejs",
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
  uid: "Godot Resource",
  cfg: "Config",
  cs: "C#",
  csproject: "C#",
  csproj: "C#",
  cshtml: "C#",
  razor: "C#",
  sln: "C#",
  cpp: "C++",
  hpp: "C++",
  h: "C++",
  asp: "Asp",
  aspx : "Aspx",
  vbs: "VBScript",
  oca: "VBScript",
  // Frameworks
  svelte: "Svelte",
  vue: "Vue",
  astro: "Astro",
  // Styles
  css: "CSS",
  sass: "CSS",
  scss: "SCSS",
  less: "CSS",
  // Outros
  html: "HTML",
  htm: "HTML",
  ghtml: "HTML",
  php: "PHP",
  makefile: "MakeFile",
  dockerfile: "Dockerfile",
  graphql: "GraphQL",
  graphqls: "GraphQL",
  sql: "SQL",
  db: "Db",
  bat: "Bat",
  coffee: "Coffee",
  lua: "Lua",
  julia: "Julia",
  ttf: "Font",
  woff: "Font",
  woff2: "Font",
  otf: "Font",
  eot: "Font",
  swf: "Adobe Flash",
  swc: "Adobe Flash",
  json: "Json",
  config: "Config",
  conf: "Config",
  settings: "Config",
  asa: "Config"
};

// Cores baseadas no NOME DO GRUPO agora
export const GROUP_COLORS: Record<string, string> = {
  "TypeScript": "#3178c6",
  "JavaScript": "#f1e05a",
  "Ejs": "#9e2e4f",
  "Rust": "#dea584",
  "CSS": "#563d7c",
  "SCSS" : "#c6538c",
  "HTML": "#e34c26",
  "PHP": "#4f5d95",
  "Go": "#41acd5",
  "C#": "#178600",
  "C++": "#f34b7d",
  "Asp": "#6a40fd",
  "Aspx": "#6a40fd",
  "Asax": "#6a40fd",
  "VBScript": "#145cab",
  "Python": "#3572A8",
  "Java": "#b07219",
  "Ruby": "#701516",
  "Julia": "#f3705a",
  "Lua": "#000080",
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
  "Db": "#e38c00",
  "Toml": "#9c4221",
  "Bat": "#1f1f1f",
  "Font": "#f7e03d",
  "Adobe Flash": "#f7e03d",
  "Json": "#51aff7",
  "Coffee": "#6f4c3e",
  "Config": "#8b949e",
  "Other": "#8b949e"
};

// --- LISTA NEGRA: Extensões que NÃO devem aparecer no gráfico ---
export const IGNORED_EXTENSIONS = [
  // Imagens
  'png', 'icns', 'bmp', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'webp',
  // Binários e outros
  'exe', 'dll', 'so', 'lock', 'bin', 'ttf', 'woff', 'woff2', 'mp4', "mp3", 'avi', 'mov', 'zip', 'log', 'map',
  'pdf', 'docx', 'xlsx', 'DS_Store',  'yml', 'yaml', 'env', 'env.local', 'env.development', 'env.production',
  'md', 'markdown', 'txt', 'rtf', 'csv', 'tsv', 'log', 'lock', 'bin', 'iso', 'dmg', 'app', 'apk', 'jar', 'war', 'ear', 'txt', 'log',
  'rar', 'tar', 'gz', '7z', 'wxl', 'xlsx', 'pptx', 'key', 'numbers', 'pages', 'xml', 'ds_store', 'nfo', 'def',
  // Configurações e Metadados
  'gitignore', 'gitattributes', 'gitkeep', 'editorconfig', 'eslintignore', 'prettierignore', 'cer', 'dep',
  // Outros arquivos de configuração comuns
  'vscode', 'idea', 'sublime-project', 'sublime-workspace', 'sqlproj', 'rxsl', 'xap', 'cab', 'defaults',
  'suo', 'user', 'userosscache', 'slnvb', 'ps1', 'psd1', 'psm1', 'vsix', 'vsixmanifest', 'appxmanifest', 'appxbundle', 'appxupload',
  'msi', 'exe', 'nsi', 'pfx', 'ocx', 'browserslistrc', 'ini', 'old', 'new', 'lic', 'log', 'bak', 'backup', 'temp', 'cache', 'dist', 'out', 'build', 'target', 'obj',
  // Godot
  'import', 'gdc', 'precomp', 'uid', 'pck', 'tmp', 'config', 'dll', 'resx', 'bcmap', 'js_34343', 'diz', '.import'
];