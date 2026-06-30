import { createResource, createSignal, For, Show } from "solid-js";
import { GitProvider } from "../../utils/gitProvider";
import { azureService } from "../../services/azure";
import { githubService } from "../../services/github";
import AuthenticatedAvatar from "./AuthenticatedAvatar";

interface ReviewerSearchProps {
  provider: GitProvider;
  org: string;
  repo: string;
  t: any;
  onSelect: (user: { id: string; login: string; avatarUrl?: string }) => void;
}

export function ReviewerSearchSelector(props: ReviewerSearchProps) {
  const [query, setQuery] = createSignal("");
  const [isFocused, setIsFocused] = createSignal(false);

  const [searchResults] = createResource(
    () => ({ text: query(), provider: props.provider, org: props.org, repo: props.repo }),
    async ({ text, provider, org, repo }) => {
      if (text.trim().length < 1) return [];

      if (provider === "azure") {
        let users = await azureService.searchProjectMembers(org, repo, text);
        console.log('user', users);
        return users;
      } else {
        return await githubService.searchCollaborators(org, repo, text);
      }
    }
  );

  return (
    <div class="w-full relative text-xs">
      <div class="flex items-center relative">
        <input
          type="text"
          value={query()}
          placeholder={props.t('pr').search_reviewers}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
          onInput={(e) => setQuery(e.currentTarget.value)}
          class="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg p-1.5 pr-8 text-xs text-gray-800 dark:text-gray-100 outline-none focus:border-blue-500 transition-all shadow-inner font-medium"
        />
        <div class="absolute right-2.5 text-gray-400">
          <Show when={searchResults.loading} fallback={<i class="fa-solid fa-magnifying-glass text-[10px] opacity-60"></i>}>
            <i class="fa-solid fa-spinner fa-spin text-[10px]"></i>
          </Show>
        </div>
      </div>

      {/* Menu suspenso de resultados */}
      <Show when={isFocused() && query().trim().length >= 1 && (searchResults() || []).length > 0}>
        <div class="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg shadow-xl z-50 custom-scrollbar p-1">
          <For each={searchResults()}>
            {(user) => (
              <button
                type="button"
                onClick={() => {
                  props.onSelect(user);
                  setQuery("");
                }}
                class="w-full text-left flex items-center gap-2.5 p-2 hover:bg-gray-50 dark:hover:bg-gray-900 rounded-md transition-colors text-gray-700 dark:text-gray-300 font-medium"
              >
                {/* Exibe o avatar redondo se houver (caso do GitHub), senão usa um placeholder */}
                <Show when={user.avatarUrl} fallback={
                  <div class="w-5 h-5 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center text-[10px] font-bold">
                    {user.login.substring(0, 2).toUpperCase()}
                  </div>
                }>
                  <AuthenticatedAvatar
                    src={user.avatarUrl || ""} 
                    alt={user.login}
                    email={user.login || ""}
                    fallbackName={user.login}
                    class="w-5 h-5 rounded-full border-2 border-gray-300 dark:border-gray-700 mx-3" 
                  />
                </Show>

                <span class="truncate flex-1 font-semibold">{user.login}</span>
                <i class="fa-solid fa-plus text-[10px] opacity-40 group-hover:opacity-100 mr-1"></i>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}