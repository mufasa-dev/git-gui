import { Store } from "@tauri-apps/plugin-store";
import type { Repo } from "../models/Repo.model";

const KEY = "repos";

let store: Store;

async function initStore() {
  store = await Store.load(".settings.dat");
}

export async function saveRepos(repos: Repo[]) {
  if (!store) await initStore();
  const uniquePaths = [...new Set(repos.map(r => r.path))];
  await store.set(KEY, uniquePaths);
  await store.save();
}

export async function loadRepos(): Promise<string[]> {
  if (!store) await initStore();
  const repos = await store.get<string[]>(KEY);
  return repos ?? [];
}
