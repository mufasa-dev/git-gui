import { createResource, createSignal, For, Show } from "solid-js";
import { GitProvider } from "../../utils/gitProvider";
import { githubService } from "../../services/github";
import { azureService } from "../../services/azure";

interface SearchSelectorProps {
  provider: GitProvider;
  org: string;
  repo: string;
  t: any;
  onSelect: (item: { id: string; title: string; state?: string }) => void;
}

export function WorkItemSearchSelector(props: SearchSelectorProps) {
  const [query, setQuery] = createSignal("");
  const [isFocused, setIsFocused] = createSignal(false);

  const [searchResults] = createResource(
    () => ({ text: query(), provider: props.provider, org: props.org, repo: props.repo }),
    async ({ text, provider, org, repo }) => {
      if (text.trim().length < 2) return [];

      if (provider === "azure") {
        return await azureService.searchWorkItems(org, repo, text);
      } else {
        return await githubService.searchIssues(org, repo, text);
      }
    }
  );

  return (
    <div class="w-full relative">
      <div class="flex items-center relative">
        <input
          type="text"
          value={query()}
          placeholder={props.t('pr').search_workitems_id}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)} // Delay para registrar o clique na lista
          onInput={(e) => setQuery(e.currentTarget.value)}
          class="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg p-2 pr-8 text-xs text-gray-800 dark:text-gray-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all shadow-inner font-medium"
        />
        <div class="absolute right-2.5 text-gray-400">
          <Show when={searchResults.loading} fallback={<i class="fa-solid fa-chevron-down text-[10px]"></i>}>
            <i class="fa-solid fa-spinner fa-spin text-[10px]"></i>
          </Show>
        </div>
      </div>

      {/* Dropdown de Opções */}
      <Show when={isFocused() && query().trim().length >= 2 && (searchResults() || []).length > 0}>
        <div class="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg shadow-xl z-50 custom-scrollbar p-1 text-xs">
          <For each={searchResults()}>
            {(item) => (
              <button
                type="button"
                onClick={() => {
                  props.onSelect(item);
                  setQuery("");
                }}
                class="w-full text-left flex items-center gap-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-900 rounded-md transition-colors text-gray-700 dark:text-gray-300 font-medium"
              >
                <i class="fa-regular fa-square text-gray-400 text-[11px]"></i>
                <span class="text-blue-500 font-mono">#{item.id}</span>
                <span class="truncate flex-1">{item.title}</span>
                <Show when={item.state}>
                  <span class="text-[9px] px-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-500">{item.state}</span>
                </Show>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}