import { invoke } from "@tauri-apps/api/core";
import { ProjectType } from "../models/ProjectType.model";

export async function getProjectType(path: string): Promise<ProjectType> {
  return await invoke("detect_project_type", { projectPath: path });
}