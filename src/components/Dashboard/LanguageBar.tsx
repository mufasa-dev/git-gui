import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import { GROUP_COLORS, IGNORED_EXTENSIONS, LANGUAGE_GROUPS } from "../../utils/file";
import Dialog from "../ui/Dialog";
import { useApp } from "../../context/AppContext";

// O seu componente continua recebendo a lista do Rust: { path, size }
export default function LanguageBar(props: { files: { path: string, size: number }[] }) {

  const [isModalOpen, setIsModalOpen] = createSignal(false);
  const [hiddenLanguages, setHiddenLanguages] = createSignal<string[]>([]);
  const { t } = useApp();

  onMount(() => {
    const saved = localStorage.getItem("git-trident-hidden-langs");
    if (saved) setHiddenLanguages(JSON.parse(saved));
  });

  const toggleLanguage = (name: string) => {
    const current = hiddenLanguages();
    const next = current.includes(name) 
      ? current.filter(l => l !== name) 
      : [...current, name];
    
    setHiddenLanguages(next);
    localStorage.setItem("git-trident-hidden-langs", JSON.stringify(next));
  };
  
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
    const hidden = hiddenLanguages(); // Pega o sinal aqui

    files.forEach(file => {
      const fileName = file.path.split('/').pop()?.toLowerCase() || '';
      const ext = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() : '';
      const groupName = LANGUAGE_GROUPS[fileName] || LANGUAGE_GROUPS[ext || ''] || "Other";
      
      // FILTRO: Se o grupo estiver na lista de ocultos, ignoramos no cálculo
      if (hidden.includes(groupName)) return;

      const size = file.size || 0;
      sizeByGroup[groupName] = (sizeByGroup[groupName] || 0) + size;
      totalBytes += size;
    });

    if (totalBytes === 0) return [];

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

  // Memo extra para saber todas as linguagens possíveis (para o modal)
  const allAvailableLangs = createMemo(() => {
     const files = codeFiles();
     const names = new Set<string>();
     files.forEach(file => {
        const fileName = file.path.split('/').pop()?.toLowerCase() || '';
        const ext = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() : '';
        names.add(LANGUAGE_GROUPS[fileName] || LANGUAGE_GROUPS[ext || ''] || "Other");
     });
     return Array.from(names).sort();
  });

  return (
    <div class="p-1 flex flex-col h-full bg-white dark:bg-gray-800 rounded-lg shadow-sm relative">
      <div class="flex items-center justify-between mb-5">
        <div class="flex items-center gap-2">
          <i class="fa-solid fa-code text-blue-500 text-xs"></i>
          <h4 class="font-bold text-gray-900 dark:text-white tracking-widest">{t('dashboard').languages}</h4>
        </div>
        
        <button 
          onClick={() => setIsModalOpen(true)}
          class="p-1.5 text-gray-400 hover:text-blue-500 transition-colors"
        >
          <i class="fa-solid fa-gear"></i>
        </button>
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

      {/* MODAL DE CONFIGURAÇÃO */}
      <Dialog 
        open={isModalOpen()} 
        title={t('dashboard').hide_languages}
        onClose={() => setIsModalOpen(false)}
        width="400px"
      >
        <div class="space-y-4">
          <p class="text-xs text-gray-400">{t('dashboard').hide_lanmguages_descri}</p>
          <div class="flex flex-wrap gap-2 max-h-[300px] overflow-y-auto p-1">
            <For each={allAvailableLangs()}>
              {(langName) => (
                <button
                  onClick={() => toggleLanguage(langName)}
                  class={`px-3 py-1.5 text-xs rounded-full border transition-all flex items-center gap-2 ${
                    !hiddenLanguages().includes(langName)
                      ? "bg-blue-500/10 border-blue-500 text-blue-500"
                      : "bg-gray-700 border-gray-600 text-gray-400 opacity-60"
                  }`}
                >
                  <Show when={!hiddenLanguages().includes(langName)} fallback={<i class="fa-solid fa-eye-slash"></i>}>
                    <i class="fa-solid fa-eye"></i>
                  </Show>
                  {langName}
                </button>
              )}
            </For>
          </div>
          <div class="pt-4 border-t border-gray-700 flex justify-end">
             <button onClick={() => setIsModalOpen(false)} class="btn-primary py-2 px-4 text-sm font-bold bg-blue-600 text-white rounded">
               {t('common').save}
             </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}