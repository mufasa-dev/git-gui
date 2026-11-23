import { invoke } from "@tauri-apps/api/core";

export async function loadImage(path: string) {
  return await invoke<string>("load_image_base64", { path });
}

/** Lê a imagem de uma revisão do git, ex.: "HEAD:src/a.png" ou ":src/a.png" (index). */
export async function loadGitImage(repoPath: string, spec: string) {
  return await invoke<string>("load_git_image_base64", { repoPath, spec });
}
