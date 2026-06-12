import { createResource, Show } from "solid-js";
import { azureService } from "../../services/azure";

type TaskRowProps = {
  id: string;
  organization: string;
  repoPath: string;
  onNavigate: (id: string | number) => void;
};

export default function TaskRow(props: TaskRowProps) {
  const [taskData] = createResource(
    () => props.id,
    async (id) => {
      try {
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
    <button
      type="button"
      onClick={() => props.onNavigate(props.id)}
      class="flex items-center gap-2 p-2.5 bg-gray-50 dark:bg-gray-900/60 hover:bg-purple-50/30 dark:hover:bg-purple-950/20 border border-gray-200/80 dark:border-gray-800 hover:border-purple-300 dark:hover:border-purple-900/50 rounded-lg text-xs font-medium w-full text-left transition-all cursor-pointer group"
    >
      <i class="fa-solid fa-diagram-project text-purple-500 group-hover:scale-110 transition-transform"></i>
      <span class="text-gray-500 font-mono font-semibold group-hover:text-purple-600 dark:group-hover:text-purple-400">#{props.id}</span>
      
      <Show when={!taskData.loading} fallback={
        <span class="flex-1 text-gray-400 italic animate-pulse">Buscando título no Azure...</span>
      }>
        <span class="flex-1 truncate text-gray-700 dark:text-gray-300 font-medium group-hover:text-gray-900 dark:group-hover:text-white">
          {taskData()?.title}
        </span>
      </Show>

      <span class="px-1.5 py-0.5 text-[10px] font-bold uppercase rounded bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-900/30 shrink-0">
        Sub-item
      </span>
    </button>
  );
}