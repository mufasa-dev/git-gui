import { invoke } from "@tauri-apps/api/core";
import { ProjectType, TestRunnerOption } from "../models/ProjectType.model";

export async function getProjectType(path: string): Promise<ProjectType> {
  return await invoke("detect_project_type", { projectPath: path });
}

const runnerKind = (runner: TestRunnerOption | string): string =>
  typeof runner === "string" ? runner.toLowerCase() : runner.kind.toLowerCase();

const runnerTarget = (runner: TestRunnerOption | string): string | undefined =>
  typeof runner === "string" ? undefined : runner.targetPath || undefined;

export async function getTestsFiles(
  path: string,
  runner: TestRunnerOption | string,
): Promise<any[]> {
  const kind = runnerKind(runner);
  const targetPath = runnerTarget(runner);

  if (kind === "angular" || kind === "karma/jasmine") {
    return await invoke("get_angular_test_files", { projectPath: path });
  }
  if (kind === "dotnet" || kind === "dotnet test") {
    return await invoke("get_dotnet_test_files", { projectPath: path, targetPath });
  }
  if (kind === "go" || kind === "gotest") {
    return await invoke("get_go_test_files", { projectPath: path });
  }
  if (kind === "java-maven" || kind === "java-gradle" || kind === "java") {
    return await invoke("get_java_test_files", { projectPath: path, targetPath });
  }
  if (kind === "ruby-rspec" || kind === "ruby-minitest") {
    return await invoke("get_ruby_test_files", { projectPath: path, targetPath, runnerKind: kind });
  }
  if (kind === "vitest" || kind === "jest") {
    return await invoke("get_vitest_test_files", { projectPath: path });
  }
  if (kind === "rust" || kind === "cargo") {
    return await invoke("get_rust_test_files", { projectPath: path, targetPath });
  }

  return [];
}

export async function runTestTerminal(
  runner: TestRunnerOption | string,
  path: string,
  filePath: string = "",
  testName: string = "",
  randomize: boolean = false,
): Promise<void> {
  const kind = runnerKind(runner);
  const targetPath = runnerTarget(runner);
  const args: Record<string, unknown> = { projectPath: path };

  if (filePath.length > 0) args.testFile = filePath;
  if (testName.length > 0) args.testName = testName;
  if (targetPath) args.targetPath = targetPath;

  if (kind === "angular" || kind === "karma/jasmine") {
    args.randomize = randomize;
    return await invoke("run_angular_tests", args);
  }
  if (kind === "dotnet" || kind === "dotnet test") {
    return await invoke("run_dotnet_tests", args);
  }
  if (kind === "go" || kind === "gotest") {
    return await invoke("run_go_tests", args);
  }
  if (kind === "java-maven" || kind === "java-gradle" || kind === "java") {
    return await invoke("run_java_tests", args);
  }
  if (kind === "ruby-rspec" || kind === "ruby-minitest") {
    args.runnerKind = kind;
    return await invoke("run_ruby_tests", args);
  }
  if (kind === "vitest" || kind === "jest") {
    args.runnerKind = kind;
    return await invoke("run_vitest_tests", args);
  }
  if (kind === "rust" || kind === "cargo") {
    return await invoke("run_rust_tests", args);
  }
}
