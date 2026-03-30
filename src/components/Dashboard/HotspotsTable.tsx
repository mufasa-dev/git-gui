import { createResource, For, Show } from "solid-js";
import { getMostModifiedFiles } from "../../services/gitService";
import FileIcon from "../ui/FileIcon";

interface Props {
  path: string;
  branch: string;
}

export default function HotspotsTable(props: Props) {
  const [hotspots] = createResource(
    () => ({ path: props.path, branch: props.branch }),
    async (params) => {
      if (!params.path || !params.branch) return [];
      return await getMostModifiedFiles(params.path, params.branch);
    }
  );

  return (
    <div class="p-2 h-full flex flex-col overflow-hidden">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-bold text-gray-400 dark:text-white tracking-widest flex items-center gap-2">
          <i class="fa-solid fa-fire text-orange-500"></i>
          Arquivos Mais Modificados (Hotspots)
        </h3>
        <Show when={hotspots.loading}>
          <div class="w-3 h-3 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
        </Show>
      </div>

      <div class="flex-1 overflow-auto custom-scrollbar rounded-lg border border-gray-300 dark:border-gray-700">
        <table class="table-striped">
          <thead>
            <tr>
              <th class="text-[10px]">Arquivo</th>
              <th class="text-right text-[10px]">Alterações</th>
            </tr>
          </thead>
          <tbody>
            <For each={hotspots()} fallback={
              <tr>
                <td colspan="2" class="text-center py-10 text-xs text-gray-500 italic">
                  Nenhum dado disponível
                </td>
              </tr>
            }>
              {(file) => (
                <tr class="group">
                  <td class="max-w-[200px]">
                    <div class="flex flex-col">
                      <span class="truncate text-xs text-gray-900 dark:text-gray-200 font-mono group-hover:text-blue-400 transition-colors flex items-center gap-1">
                        <FileIcon fileName={file.name} /> {file.name.split('/').pop()}
                      </span>
                      <span class="text-[9px] text-gray-800 dark:text-gray-400 truncate">
                        {file.name.split('/').slice(0, -1).join('/') || './'}
                      </span>
                    </div>
                  </td>
                  <td class="text-right">
                    <div class="flex items-center justify-end gap-2">
                      <span class="text-xs font-bold text-orange-400 font-mono">
                        {file.count}
                      </span>
                      {/* Pequena barra visual de intensidade */}
                      <div class="w-12 h-1.5 bg-gray-300 dark:bg-gray-900 rounded-full overflow-hidden hidden sm:block">
                        <div 
                          class="h-full bg-orange-500/50" 
                          style={{ 
                            width: `${Math.min((file.count / (hotspots()?.[0]?.count || 1)) * 100, 100)}%` 
                          }}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>

      <div class="mt-3 text-[9px] text-gray-600 dark:text-gray-200 italic">
        * Baseado no histórico total da branch ativa.
      </div>
    </div>
  );
}