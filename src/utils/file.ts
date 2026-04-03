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