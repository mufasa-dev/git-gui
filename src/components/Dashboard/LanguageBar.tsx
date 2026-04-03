import { createMemo, For } from "solid-js";
import { GROUP_COLORS, IGNORED_EXTENSIONS, LANGUAGE_GROUPS } from "../../utils/file";

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
      const fileName = path.split('/').pop() || ''; 
      const ext = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() : '';
      
      if (LANGUAGE_GROUPS[fileName.toLowerCase()]) {
        return true;
      }
      
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
      const fileName = file.path.split('/').pop()?.toLowerCase() || '';
      const ext = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() : '';
      
      const groupName = LANGUAGE_GROUPS[fileName] || LANGUAGE_GROUPS[ext || ''] || "Other";
      
      const size = file.size || 0;
      sizeByGroup[groupName] = (sizeByGroup[groupName] || 0) + size;
      totalBytes += size;
    });

    return Object.entries(sizeByGroup)
      .map(([name, bytes]) => ({
        name: name,
        percent: ((bytes / totalBytes) * 100).toFixed(1),
        color: GROUP_COLORS[name] || GROUP_COLORS.Other
      }))
      .filter(lang => parseFloat(lang.percent) > 0.0)
      .sort((a, b) => parseFloat(b.percent) - parseFloat(a.percent))
      .slice(0, 14);
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

      {/* Legenda: 1 Coluna em telas pequenas (default), 2 colunas em telas 'sm' ou maiores */}
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 overflow-y-auto pr-2">
        <For each={stats()}>
          {(lang) => (
            <div class="flex items-center justify-between group min-w-0">
              <div class="flex items-center gap-3 min-w-0">
                <span 
                  class="w-3.5 h-3.5 rounded-full shadow-sm shrink-0" 
                  style={{ "background-color": lang.color }}
                />
                <span class="text-sm font-semibold text-gray-700 dark:text-gray-300 truncate">
                  {lang.name}
                </span>
              </div>
              <span class="text-xs text-gray-500 dark:text-gray-400 font-medium ml-2 shrink-0">
                {lang.percent}%
              </span>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}