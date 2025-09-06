import { invoke } from "@tauri-apps/api/core";

export async function openConsole(path: string): Promise<string> {
  return await invoke("open_console", { path });
}

export async function openFileManager(path: string): Promise<string[]> {
  return await invoke("open_file_manager", { path });
}

export async function openBrowser(url: string): Promise<string[]> {
  return await invoke("open_browser", { url });
}

export async function openVsCode(path: string): Promise<string[]> {
  return await invoke("open_vscode", { path });
}

export async function openBash(path: string): Promise<string[]> {
  return await invoke("open_git_bash", { path });
}
