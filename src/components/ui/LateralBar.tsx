import { Repo } from "../../models/Repo.model";
import Button from "./Button";
import branchIcon from "../../assets/branch.png";
import fileIcon from "../../assets/file.png";
import logo from "../../assets/fork.png";

export default function LateralBar(props: {
  repos: Repo[];
  active: string | null;
  onChangeActive: (id: string) => void;
}) {
  return (
    <div class="flex flex-col border rounded-r-xl px-1 mt-2 mb-4 bg-white dark:bg-gray-800 dark:border-gray-700" style={{"width": "56px"}}>
      <img src={logo} class="px-1 h-10 mt-2 mb-4" />
      <Button class={`left-btn ${props.active === "commits" ? "selected" : ""}`} onClick={() => props.onChangeActive("commits")}>
        <img src={branchIcon} class="h-10" />
      </Button>
      <Button class={`left-btn ${props.active === "files" ? "selected" : ""}`} onClick={() => props.onChangeActive("files")}>
        <img src={fileIcon} class="h-10" />
      </Button>
    </div> 
  );
}
