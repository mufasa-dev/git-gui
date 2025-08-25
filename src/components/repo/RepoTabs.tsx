import TabBar from "./TabBar";
import RepoView from "./RepoView";

type Repo = {
  path: string;
  name: string;
};

export default function RepoTabs(props: {
  repos: Repo[];
  active: string | null;
  onChangeActive: (id: string) => void;
}) {
  return (
    <div class="flex flex-col flex-1">
      <TabBar
        repos={props.repos}
        active={props.active}
        onChangeActive={props.onChangeActive}
      />

      <div class="flex-1 overflow-auto p-4">
        {props.active ? (
          <RepoView repo={props.repos.find(r => r.path === props.active)!} />
        ) : (
          <p class="text-gray-500">Nenhum repositório aberto</p>
        )}
      </div>
    </div>
  );
}
