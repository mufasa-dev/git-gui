import { Repo } from "../../models/Repo.model";

export default function TabBar(props: {
  repos: Repo[];
  active: string | null;
  onChangeActive: (id: string) => void;
  onClose: (id: string) => void; 
}) {
  return (
    <div class="flex border-b bg-white dark:bg-gray-800 dark:border-gray-900">
      {props.repos.map(repo => (
        <div
          class={`px-4 py-2 cursor-pointer rounded-t-xl flex items-center truncate ${
            props.active === repo.path
              ? "border dark:border-gray-700 dark:border-b-gray-900 bg-gray-200 dark:bg-gray-900"
              : "bg-white hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-800"
          }`}
          onClick={() => props.onChangeActive(repo.path)}
        >
          {repo.localChanges && repo.localChanges.length > 0 && <i class="fa-solid fa-circle text-red-300 dark:text-red-900 mr-2"></i>}
          <span class="truncate">{repo.name}</span>
          <button
            class="ml-2 text-gray-500 hover:text-red-500"
            onClick={e => {
              e.stopPropagation();
              props.onClose(repo.path);
            }}
          >
            <i class="fa fa-times"></i>
          </button>
        </div>
      ))}
    </div>
  );
}
