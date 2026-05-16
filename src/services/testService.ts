import { invoke } from "@tauri-apps/api/core";
import { ProjectType } from "../models/ProjectType.model";

export async function getProjectType(path: string): Promise<ProjectType> {
  return await invoke("detect_project_type", { projectPath: path });
}

export async function getTestsFiles(path: string, projectType: string): Promise<any[]> {
  projectType = projectType.toLowerCase();
  
  if (projectType === "karma/jasmine" || projectType === "angular") {
    return await invoke("get_angular_test_files", { projectPath: path });
  }
  
  return [];
}

export async function runTestTerminal(
  projectType: string, 
  path: string, 
  filePath: string = "", 
  testName: string = "" // <- Novo argumento opcional
): Promise<void> {
  projectType = projectType.toLowerCase();

  // Cria o objeto de argumentos dinamicamente
  let args: any = { projectPath: path };
  if (filePath?.length > 0) args.testFile = filePath;
  if (testName?.length > 0) args.testName = testName;

  if (projectType === "karma/jasmine" || projectType === "angular") {
    return await invoke('run_angular_tests', args);
  }
  if (projectType === "dotnet test") {
    return await invoke('run_dotnet_tests', args);
  }
  if (projectType === "gotest") {
    return await invoke('run_go_tests', args);
  }
}