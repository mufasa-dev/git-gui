import { Store } from "@tauri-apps/plugin-store";
import type { Repo } from "../models/Repo.model";

const store = await Store.load(".settings.dat");

const KEY = "repos";

export async function saveRepos(repos: Repo[]) {
  const uniquePaths = [...new Set(repos.map(r => r.path))];
  await store.set(KEY, uniquePaths);
  await store.save();
}

export async function loadRepos(): Promise<string[]> {
  const repos = await store.get<string[]>(KEY);
  return repos ?? [];
}
