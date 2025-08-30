type Repo = {
  path: string;
  name: string;
};

export default function TabBar(props: {
  repos: Repo[];
  active: string | null;
  onChangeActive: (id: string) => void;
  onClose: (id: string) => void; 
}) {
  return (
    <div class="flex border-b bg-gray-200 dark:bg-gray-900 dark:border-gray-900">
      {props.repos.map(repo => (
        <div
          class={`px-4 py-2 cursor-pointer ${
            props.active === repo.path
              ? "bg-white border-t border-l border-r -mb-px dark:bg-gray-800 dark:border-gray-900"
              : "bg-gray-200 hover:bg-gray-300 dark:bg-gray-900 dark:hover:bg-gray-800"
          }`}
          onClick={() => props.onChangeActive(repo.path)}
        >
          <span>{repo.name}</span>
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
