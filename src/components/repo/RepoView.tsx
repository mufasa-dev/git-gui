import BranchList from "./Branchlist";

type Repo = {
  path: string;
  name: string;
  branches: string[];
};

export default function RepoView(props: { repo: Repo }) {
  return (
    <div>
      <h2 class="text-xl font-bold mb-2">{props.repo.name}</h2>
      <p class="text-gray-600">📂 {props.repo.path}</p>

      <BranchList branches={props.repo.branches} />
    </div>
  );
}
