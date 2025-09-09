import { invoke } from "@tauri-apps/api/core";

export async function loadImage(path: string) {
  return await invoke<string>("load_image_base64", { path });
}