import { For, Show, Switch, Match } from "solid-js";
import AuthenticatedAvatar from "./AuthenticatedAvatar";

interface Reviewer {
  login: string;
  name?: string;
  avatarUrl?: string;
  state: string;
  isRequired?: boolean;
}

interface PRReviewersListProps {
  reviewers: Reviewer[];
  t: any;
}

export function PRReviewersList(props: PRReviewersListProps) {
  return (
    <div>
      <div class="flex justify-between items-center mb-6 text-[10px] font-black uppercase text-gray-400 tracking-widest">
        <span>{props.t('pr').reviewers}</span>
        <i class="fa-solid fa-gear hover:text-blue-500 cursor-pointer transition-colors"></i>
      </div>
      
      <div class="space-y-5">
        <For each={props.reviewers}>
          {(reviewer) => (
            <div class="flex items-center justify-between group">
              <div class="flex items-center gap-3">
                <div class="relative">
                  <AuthenticatedAvatar 
                    src={reviewer.avatarUrl || ""} 
                    alt={reviewer.login}
                    email={reviewer.login || ""}
                    fallbackName={reviewer.name || reviewer.login}
                    class="w-7 h-7 rounded-full border-2 border-gray-200 dark:border-gray-600 
                        hover:scale-110 transition-transform" 
                  />
                </div>
                <div class="flex flex-col">
                  <span class="text-xs font-bold text-gray-700 dark:text-gray-200">
                    {reviewer.name || reviewer.login}
                  </span>
                  <span class="text-[9px] text-gray-500 uppercase font-black tracking-tighter">
                    {reviewer.state.replace('_', ' ')}
                  </span>
                </div>
              </div>

              <Switch>
                <Match when={reviewer.state === 'APPROVED'}>
                  <i class="fa-solid fa-circle-check text-green-500 text-sm shadow-[0_0_8px_rgba(34,197,94,0.4)]"></i>
                </Match>
                <Match when={reviewer.state === 'CHANGES_REQUESTED'}>
                  <i class="fa-solid fa-circle-exclamation text-red-500 text-sm"></i>
                </Match>
                <Match when={reviewer.state === 'PENDING'}>
                  <div class="flex gap-1 items-center">
                    <span class="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse"></span>
                  </div>
                </Match>
                <Match when={reviewer.state === 'COMMENTED'}>
                  <i class="fa-solid fa-comment-dots text-gray-400 text-sm"></i>
                </Match>
              </Switch>
            </div>
          )}
        </For>
        
        <Show when={props.reviewers.length === 0}>
          <div class="text-[10px] text-gray-500 italic">{props.t('pr').no_reviewers}</div>
        </Show>
      </div>
    </div>
  );
}