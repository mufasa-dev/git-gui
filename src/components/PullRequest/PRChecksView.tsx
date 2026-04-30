import { createResource, For, Show } from "solid-js";
import { githubService } from "../../services/github";
import { open } from "@tauri-apps/plugin-shell";
import { useApp } from "../../context/AppContext";

export default function PRChecksView(props: { owner: string, repoName: string, prNumber: number }) {
  const { t } = useApp();

  const [checks] = createResource(
    () => ({ owner: props.owner, name: props.repoName, number: props.prNumber }),
    async (params) => await githubService.getPRChecks(params.owner, params.name, params.number)
  );

  const getStatusIcon = (item: any) => {
    const state = item.conclusion || item.state;
    switch (state) {
      case 'SUCCESS': return <i class="fa-solid fa-circle-check text-green-500"></i>;
      case 'FAILURE': return <i class="fa-solid fa-circle-xmark text-red-500"></i>;
      case 'PENDING':
      case 'IN_PROGRESS': return <i class="fa-solid fa-circle-notch fa-spin text-yellow-500"></i>;
      default: return <i class="fa-solid fa-circle-question text-gray-500"></i>;
    }
  };

  return (
    <div class="flex flex-col h-full bg-white dark:bg-gray-800 rounded-b-xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-2xl">
      <header class="p-4 border-b border-gray-300 dark:border-gray-700 flex items-center justify-between">
        <h3 class="text-sm font-bold text-gray-900 dark:text-gray-200 uppercase">{t('pr').checks_ci}</h3>
        <Show when={checks()?.state}>
           <span class={`text-[10px] font-black px-2 py-1 rounded border ${
             checks()?.state === 'SUCCESS' ? 'bg-green-500/10 border-green-500/30 text-green-500' : 'bg-red-500/10 border-red-500/30 text-red-500'
           }`}>
             {checks()?.state}
           </span>
        </Show>
      </header>

      <div class="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
        <Show when={!checks.loading} fallback={<div class="p-10 text-center animate-pulse text-gray-500">{t('pr').validing_builds}</div>}>
          <For each={checks()?.contexts}>
            {(item) => (
              <div 
                class="flex items-center gap-4 p-3 bg-gray-800/20 border border-gray-800 rounded-lg hover:border-gray-700 transition-all cursor-pointer group"
                onClick={() => open(item.detailsUrl || item.targetUrl || item.url)}
              >
                <div class="text-lg">{getStatusIcon(item)}</div>
                
                <div class="flex-1 min-w-0">
                  <div class="flex items-center justify-between">
                    <span class="text-xs font-bold text-gray-200 truncate">{item.name || item.context}</span>
                    <i class="fa-solid fa-arrow-up-right-from-square text-[10px] text-gray-600 group-hover:text-blue-500 transition-colors"></i>
                  </div>
                  <p class="text-[10px] text-gray-500 truncate">
                    {item.description || `Status: ${item.conclusion || item.status || item.state}`}
                  </p>
                </div>
              </div>
            )}
          </For>
          
          <Show when={checks()?.contexts.length === 0}>
            <div class="flex flex-col items-center justify-center h-40 text-gray-600 dark:text-white italic text-xs">
              <i class="fa-solid fa-shield-halved text-2xl mb-2"></i>
              {t('pr').no_check_repo}
            </div>
          </Show>
        </Show>
      </div>
    </div>
  );
}