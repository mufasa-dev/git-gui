import { Repo } from "../../models/Repo.model";
import BranchList from "./Branchlist";

export default function RepoView(props: { repo: Repo }) {
  return (
    <div>
      <h2 class="text-xl font-bold mb-2">{props.repo.name}</h2>
      <p class="text-gray-600">📂 {props.repo.path}</p>

      <BranchList branches={props.repo.branches} remoteBranches={props.repo.remoteBranches} />
    </div>
  );
}
