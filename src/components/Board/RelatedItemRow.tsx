import { createResource, Show } from "solid-js";
import { azureService } from "../../services/azure";

type RelatedItemRowProps = {
  id: string;
  relationType?: "Child" | "Parent" | string;
  organization: string;
  repoPath: string;
  onNavigate: (id: string | number) => void;
};

export default function RelatedItemRow(props: RelatedItemRowProps) {
  const [itemData] = createResource(
    () => props.id,
    async (id) => {
      try {
        const details = await azureService.getTasksDetails(props.organization, props.repoPath, [id]);
        return details?.[0] || { title: `Work Item #${id}` };
      } catch {
        return { title: `Work Item #${id}` };
      }
    }
  );

  const badgeStyle = () => {
    if (props.relationType === "Parent") {
      return "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/30";
    }
    return "bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-900/30";
  };

  return (
    <button
      type="button"
      onClick={() => props.onNavigate(props.id)}
      class="flex items-center gap-2 p-2.5 bg-gray-50 dark:bg-gray-900/60 hover:bg-blue-50/30 dark:hover:bg-blue-950/20 border border-gray-200/80 dark:border-gray-800 hover:border-blue-300 dark:hover:border-blue-900/50 rounded-lg text-xs font-medium w-full text-left transition-all cursor-pointer group"
    >
      <i class="fa-solid fa-diagram-project text-blue-500 group-hover:scale-110 transition-transform"></i>
      <span class="text-gray-500 font-mono font-semibold group-hover:text-blue-600 dark:group-hover:text-blue-400">#{props.id}</span>
      
      <Show when={!itemData.loading} fallback={
        <span class="flex-1 text-gray-400 italic animate-pulse">Buscando título...</span>
      }>
        <span class="flex-1 truncate text-gray-700 dark:text-gray-300 font-medium group-hover:text-gray-900 dark:group-hover:text-white">
          {itemData()?.title}
        </span>
      </Show>

      <span class={`px-1.5 py-0.5 text-[10px] font-bold uppercase rounded ${badgeStyle()} shrink-0`}>
        {props.relationType === "Parent" ? "Item Pai" : "Sub-item"}
      </span>
    </button>
  );
}