import { For, Show } from "solid-js";
import { Repo } from "../../models/Repo.model";

export default function TabBar(props: {
  repos: Repo[];
  active: string | null;
  onChangeActive: (id: string | null) => void;
  onClose: (id: string) => void; 
}) {
  return (
    <div class="flex border-b bg-white dark:bg-gray-800 dark:border-gray-900 overflow-x-auto">
      <For each={props.repos}>
        {(repo) => (
          <div
            class={`px-4 py-2 cursor-pointer rounded-t-xl flex items-center transition-colors border-b-0 ${
              props.active === repo.path
                ? "border border-gray-200 dark:border-gray-700 bg-gray-200 dark:bg-gray-900 dark:text-white"
                : "bg-white hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-400"
            }`}
            onClick={() => props.onChangeActive(repo.path)}
          >
            {repo.localChanges && repo.localChanges.length > 0 && (
              <i class="fa-solid fa-circle text-orange-500 text-[8px] mr-2"></i>
            )}
            <span class="truncate max-w-[150px] text-sm font-medium">{repo.name}</span>
            <button
              class="ml-3 text-gray-400 hover:text-red-500 transition-colors"
              onClick={e => {
                e.stopPropagation();
                props.onClose(repo.path);
              }}
            >
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        )}
      </For>
      <Show when={props.repos.length > 0}>
        <button
          onClick={() => props.onChangeActive(null)}
          title="Abrir Tela Inicial"
          class={`p-3 h-full flex items-center justify-center transition-colors ${
              props.active === null 
              ? "bg-gray-200 dark:bg-gray-900 rounded-t-xl text-white shadow-inner" 
              : "text-gray-400"
          }`}
        >
          <i class="fa-solid fa-plus"></i>
        </button>
      </Show>
    </div>
  );
}