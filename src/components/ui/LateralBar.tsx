import { Repo } from "../../models/Repo.model";
import Button from "./Button";
import branchIcon from "../../assets/commit_silver.png";
import fileIcon from "../../assets/file_silver.png";
import dashboardIcon from "../../assets/dashboard_silver.png";
import prIcon from "../../assets/pr_silver.png";
import rocketIcon from "../../assets/rocket_silver.png";
import tableIcon from "../../assets/table_silver.png";
import profileIcon from "../../assets/profile_silver.png";
import configIcon from "../../assets/config_silver.png";
import logo from "../../assets/fork.png";
import Tooltip from "./Tooltip";
import { Show } from "solid-js";

export default function LateralBar(props: {
  repos: Repo[];
  active: string | null;
  isLogged: boolean;
  onChangeActive: (id: string) => void;
}) {
  return (
    <div class="flex flex-col border rounded-r-xl mt-2 mb-4 bg-white dark:bg-gray-800 dark:border-gray-700" style={{"width": "56px"}}>
      <img src={logo} class="px-2 h-10 mt-2 mb-4" />
      <Tooltip text="Commits" class="mb-2">
        <Button class={`left-btn w-full ${props.active === "commits" ? "selected" : ""}`} onClick={() => props.onChangeActive("commits")}>
          <img src={branchIcon} class="h-10" />
        </Button>
      </Tooltip>
      <Tooltip text="Arquivos" class="mb-2">
        <Button class={`left-btn w-full ${props.active === "files" ? "selected" : ""}`} onClick={() => props.onChangeActive("files")}>
          <img src={fileIcon} class="h-10" />
        </Button>
      </Tooltip>
      <Tooltip text="Dashboard" class="mb-2">
        <Button class={`left-btn w-full ${props.active === "dashboard" ? "selected" : ""}`} onClick={() => props.onChangeActive("dashboard")}>
          <img src={dashboardIcon} class="h-10" />
        </Button>
      </Tooltip>
      <Show when={props.isLogged}>
        <Tooltip text="Pull Requests" class="mb-2">
          <Button class={`left-btn w-full ${props.active === "pull-requests" ? "selected" : ""}`} onClick={() => props.onChangeActive("pull-requests")}>
            <img src={prIcon} class="h-10" />
          </Button>
        </Tooltip>
        <Tooltip text="Pipeline" class="mb-2">
          <Button class={`left-btn w-full ${props.active === "rocket" ? "selected" : ""}`} onClick={() => props.onChangeActive("rocket")}>
            <img src={rocketIcon} class="h-10" />
          </Button>
        </Tooltip>
        <Tooltip text="Board" class="mb-2">
          <Button class={`left-btn w-full ${props.active === "table" ? "selected" : ""}`} onClick={() => props.onChangeActive("table")}>
            <img src={tableIcon} class="h-10" />
          </Button>
        </Tooltip>
      </Show>
      <Tooltip text="Perfil" class="mb-2 mt-auto">
        <Button class={`left-btn w-full ${props.active === "profile" ? "selected" : ""}`} onClick={() => props.onChangeActive("profile")}>
          <img src={profileIcon} class="h-10" />
        </Button>
      </Tooltip>
      <Tooltip text="Configurações" class={"mb-2"}>
        <Button class={`left-btn w-full ${props.active === "config" ? "selected" : ""}`} onClick={() => props.onChangeActive("config")}>
          <img src={configIcon} class="h-10" />
        </Button>
      </Tooltip>
    </div> 
  );
}
