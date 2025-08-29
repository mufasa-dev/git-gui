type Repo = {
  path: string;
  name: string;
};

export default function TabBar(props: {
  repos: Repo[];
  active: string | null;
  onChangeActive: (id: string) => void;
}) {
  return (
    <div class="flex border-b bg-gray-200 dark:bg-gray-900 dark:border-gray-900">
      {props.repos.map(repo => (
        <button
          class={`px-4 py-2 ${
            props.active === repo.path
              ? "bg-white border-t border-l border-r -mb-px dark:bg-gray-800 dark:border-gray-900"
              : "bg-gray-200 hover:bg-gray-300 dark:bg-gray-900 dark:hover:bg-gray-800"
          }`}
          onClick={() => props.onChangeActive(repo.path)}
        >
          {repo.name}
        </button>
      ))}
    </div>
  );
}
