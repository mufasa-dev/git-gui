import { createEffect, createResource, createSignal, For, Show } from "solid-js";
import { Repo } from "../../models/Repo.model";
import { getLocalChanges, stageFiles } from "../../services/gitService";
import { FolderTreeView } from "../ui/FolderTreeview";

export function LocalChanges(props: { repo: Repo; branch: string }) {
  const [changes, setChanges] = createSignal<
    { path: string; status: string; staged: boolean }[]
  >([]);
  const [selected, setSelected] = createSignal<string[]>([]);

  const getStatusLetter = (status: string) => {
    return status.charAt(0).toUpperCase();
  }

  const loadChanges = async () => {
    if (!props.repo.path) return;
    const res = await getLocalChanges(props.repo.path);
    setChanges(res);
  };

  createEffect(() => {
    loadChanges();
  });

  const staged = () => changes().filter((c) => c.staged && c.status !== "untracked");
  const unstaged = () => changes().filter((c) => !c.staged || c.status == "untracked");

  const toggleItem = (path: string, select: boolean) => {
    setSelected((prev) => {
      if (select) return [...prev, path];
      else return prev.filter((p) => p !== path);
    });
  };

  const prepare = async () => {
    const paths = selected();
    await stageFiles(props.repo.path, paths);
    setSelected([]);
    await loadChanges();
  }

  const prepareAll = async () => {
    const allPaths = changes().map(c => c.path);
    await stageFiles(props.repo.path, allPaths);
    setSelected(allPaths);
    await loadChanges();
  };

  return (
    <div class="p-4 space-y-4">
      <div class="flex items-center">
        <b>Alterações</b>
        <button class="ml-auto px-2 py-1 text-sm bg-blue-500 text-white rounded" onClick={() => prepare()}>
          Preparar
        </button>
      </div>
      <FolderTreeView items={unstaged()} selected={selected()} onToggle={toggleItem} />

      <div class="flex items-center mt-4">
        <b>Alterações preparadas</b>
        <button class="ml-auto px-2 py-1 text-sm bg-green-500 text-white rounded">
          Desfazer
        </button>
      </div>
      
      <FolderTreeView items={staged()} selected={selected()} onToggle={toggleItem} />
    </div>
  );
}
