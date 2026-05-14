import { invoke } from "@tauri-apps/api/core";
import { ProjectType } from "../models/ProjectType.model";

export async function getProjectType(path: string): Promise<ProjectType> {
  return await invoke("detect_project_type", { projectPath: path });
}

export async function runTestTerminal(projectType: string, path: string, filePath: string = ""): Promise<void> {
  projectType = projectType.toLocaleLowerCase();
  let data = filePath?.length > 0 ? { projectPath: path, testFile: filePath } : { projectPath: path };

  if (projectType === "karma/jasmine") {
    return await invoke('run_angular_tests', data);
  }
  if (projectType === "dotnet test") {
    return await invoke('run_dotnet_tests', data);
  }
  if (projectType === "gotest") {
    return await invoke('run_go_tests', data);
  }
}