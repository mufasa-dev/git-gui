import { createResource, Show, Switch, Match, For, createSignal } from "solid-js";
import { azureService } from "../../services/azure";

export default function TaskRow(props: { id: string, organization: string; repoPath: string; }) {
  const [taskData] = createResource(
    () => props.id,
    async (id) => {
      try {
        // Aproveita o método que você já tem no seu azureService!
        const details = await azureService.getTasksDetails(
          props.organization,
          props.repoPath,
          [id]
        );
        return details?.[0] || { title: `Task #${id}` };
      } catch {
        return { title: `Work Item #${id}` };
      }
    }
  );

  return (
    <div class="flex items-center gap-2 p-2.5 bg-gray-50 dark:bg-gray-900/60 border border-gray-200/80 dark:border-gray-800 rounded-lg text-xs font-medium w-full">
      <i class="fa-solid fa-diagram-project text-purple-500"></i>
      <span class="text-gray-500 font-mono font-semibold">#{props.id}</span>
      
      <Show when={!taskData.loading} fallback={
        <span class="flex-1 text-gray-400 italic animate-pulse">Buscando título no Azure...</span>
      }>
        <span class="flex-1 truncate text-gray-700 dark:text-gray-300 font-medium">
          {taskData()?.title}
        </span>
      </Show>

      <span class="px-1.5 py-0.5 text-[10px] font-bold uppercase rounded bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-900/30 shrink-0">
        Sub-item
      </span>
    </div>
  );
}