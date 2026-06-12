import { createResource, createSignal, Show, For } from "solid-js";
import { azureService } from "../../services/azure";
import MarkdownViewer from "../ui/MarkdownViewer";

type CardDetailsTabProps = {
  card: any;
  organization: string;
  repoPath: string;
};

export default function CardDetailsTab(props: CardDetailsTabProps) {
  const [showTasks, setShowTasks] = createSignal(false);
  const [showCommits, setShowCommits] = createSignal(false);

  const [tasksDetails] = createResource(
    () => {
      const tasksReferences = props.card?.tasksReferences;
      return showTasks() && tasksReferences && tasksReferences.length > 0 ? tasksReferences : null;
    },
    async (ids) => {
      if (!ids) return [];
      return await azureService.getTasksDetails(props.organization, props.repoPath, ids);
    }
  );

  const [commitsDetails] = createResource(
    () => {
      const commitsReferences = props.card?.commitsReferences;
      return showCommits() && commitsReferences && commitsReferences.length > 0 ? commitsReferences : null;
    },
    async (hashes) => {
      if (!hashes) return [];
      const promises = hashes.map((hash: string) => 
        azureService.getCommitDetails(props.organization, props.repoPath, props.repoPath, hash)
      );
      return await Promise.all(promises);
    }
  );

  return (
    <div class="grid grid-cols-1 lg:grid-cols-4 gap-6 h-full overflow-y-auto pt-4 pr-1">
      {/* COLUNA ESQUERDA: Descrição e Comentários */}
      <div class="lg:col-span-3 flex flex-col gap-6">
        <div class="flex flex-col gap-2">
          <h3 class="text-xs font-bold uppercase tracking-wider text-gray-400">Descrição</h3>
          <div class="p-4 bg-white dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700/80 rounded-xl min-h-[140px] text-gray-800 dark:text-gray-200">
            <Show when={props.card.description && props.card.description.trim()} fallback={<p class="text-sm italic text-gray-400">Nenhuma descrição fornecida.</p>}>
              <MarkdownViewer content={props.card.description} />
            </Show>
          </div>
        </div>

        <div class="flex flex-col gap-3 border-t border-gray-200 dark:border-gray-700/70 pt-4 pb-6">
          <h3 class="text-xs font-bold uppercase tracking-wider text-gray-400">Discussão ({props.card.comments?.length || 0})</h3>
          <div class="flex flex-col gap-3">
            <For each={props.card.comments}>
              {(comment: any) => (
                <div class="flex gap-3 p-3 bg-white/60 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700/50 rounded-xl">
                  <Show when={comment.author.avatarUrl} fallback={<i class="fa-solid fa-circle-user text-xl text-gray-400"></i>}>
                    <img src={comment.author.avatarUrl} class="w-7 h-7 rounded-full" />
                  </Show>
                  <div class="flex flex-col gap-1 w-full">
                    <div class="flex items-center justify-between text-xs">
                      <span class="font-bold text-gray-700 dark:text-gray-300">{comment.author.name}</span>
                      <span class="text-gray-400">{new Date(comment.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div class="text-sm text-gray-600 dark:text-gray-300 mt-0.5">
                      <MarkdownViewer content={comment.text} />
                    </div>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>

      {/* COLUNA DIREITA: Planejamento e Accordions */}
      <div class="lg:col-span-1 flex flex-col gap-5 p-4 border border-gray-200 dark:border-gray-700 rounded-xl bg-white/50 dark:bg-gray-900/30 shadow-sm self-start w-full">
        <div>
          <h4 class="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Criador Original</h4>
          <div class="flex items-center gap-2">
            <Show when={props.card.author?.avatarUrl} fallback={<i class="fa-solid fa-circle-user text-xl text-gray-400"></i>}>
              <img src={props.card.author?.avatarUrl} class="w-6 h-6 rounded-full" />
            </Show>
            <span class="text-xs font-semibold text-gray-600 dark:text-gray-400">{props.card.author?.name}</span>
          </div>
        </div>

        <div class="border-t border-gray-200/80 dark:border-gray-700/60 pt-3 flex flex-col gap-2.5">
          <h5 class="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Planejamento</h5>
          <div class="flex items-center justify-between text-xs">
            <span class="text-gray-400">Priority:</span>
            <span class="font-mono font-bold bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-gray-700 dark:text-gray-300">{props.card.priority ?? "—"}</span>
          </div>
          <div class="flex items-center justify-between text-xs">
            <span class="text-gray-400">Effort / Points:</span>
            <span class="font-semibold text-gray-800 dark:text-gray-200">{props.card.effort || "—"}</span>
          </div>
          <div class="flex flex-col gap-0.5 text-xs">
            <span class="text-gray-400">Area Path:</span>
            <span class="font-medium text-gray-700 dark:text-gray-300 truncate bg-gray-100/50 dark:bg-gray-800/40 p-1 rounded text-[11px]">{props.card.areaPath}</span>
          </div>
          <div class="flex flex-col gap-0.5 text-xs">
            <span class="text-gray-400">Iteration / Sprint:</span>
            <span class="font-medium text-gray-700 dark:text-gray-300 truncate bg-gray-100/50 dark:bg-gray-800/40 p-1 rounded text-[11px]">{props.card.iterationPath}</span>
          </div>
        </div>

        {/* Accordions */}
        <div class="border-t border-gray-200/80 dark:border-gray-700/60 pt-4 flex flex-col gap-2">
          {/* Tasks */}
          <div class="flex flex-col border border-gray-200 dark:border-gray-700/60 rounded-xl bg-white dark:bg-gray-900/40 overflow-hidden">
            <button type="button" onClick={() => setShowTasks(!showTasks())} class="flex items-center justify-between w-full p-3 text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer">
              <div class="flex items-center gap-1.5">
                <i class={`fa-solid fa-chevron-right text-[10px] transition-transform ${showTasks() ? 'rotate-90' : ''}`}></i>
                <span>Tasks ({props.card.tasksReferences?.length || 0})</span>
              </div>
              <i class="fa-solid fa-list-check opacity-60"></i>
            </button>
            <Show when={showTasks()}>
              <div class="p-2 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/20 max-h-42 overflow-y-auto flex flex-col gap-1">
                <Show when={!tasksDetails.loading} fallback={<div class="p-2 text-[11px] text-gray-400"><i class="fa-solid fa-circle-notch animate-spin text-blue-500"></i></div>}>
                  <For each={tasksDetails()}>
                    {(task) => (
                      <div class="p-2 bg-white dark:bg-gray-900 rounded border border-gray-200/60 text-[11px]">
                        <span class="font-mono font-bold text-gray-400">#{task.id}</span>
                        <p class="text-gray-700 dark:text-gray-300 font-medium line-clamp-2 mt-0.5">{task.title}</p>
                      </div>
                    )}
                  </For>
                </Show>
              </div>
            </Show>
          </div>

          {/* Commits */}
          <div class="flex flex-col border border-gray-200 dark:border-gray-700/60 rounded-xl bg-white dark:bg-gray-900/40 overflow-hidden">
            <button type="button" onClick={() => setShowCommits(!showCommits())} class="flex items-center justify-between w-full p-3 text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer">
              <div class="flex items-center gap-1.5">
                <i class={`fa-solid fa-chevron-right text-[10px] transition-transform ${showCommits() ? 'rotate-90' : ''}`}></i>
                <span>Commits ({props.card.commitsReferences?.length || 0})</span>
              </div>
              <i class="fa-solid fa-code-commit rotate-90 opacity-60"></i>
            </button>
            <Show when={showCommits()}>
              <div class="p-2 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/20 max-h-42 overflow-y-auto flex flex-col gap-1">
                <Show when={!commitsDetails.loading} fallback={<div class="p-2 text-[11px] text-gray-400"><i class="fa-solid fa-circle-notch animate-spin text-blue-500"></i></div>}>
                  <For each={commitsDetails()}>
                    {(commit) => (
                      <div class="p-2 bg-white dark:bg-gray-900 rounded border border-gray-200/60 text-[11px]">
                        <span class="font-mono font-bold text-blue-500">{commit.id.substring(0, 7)}</span>
                        <p class="text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-2">{commit.message}</p>
                      </div>
                    )}
                  </For>
                </Show>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
}