import { createEffect, createResource, createSignal, For, Show } from "solid-js";
import { Repo } from "../../models/Repo.model";
import { getLocalChanges } from "../../services/gitService";
import { FolderTreeView } from "../ui/FolderTreeview";

export function LocalChanges(props: { repo: Repo; branch: string }) {
  const [changes, setChanges] = createSignal<
    { path: string; status: string; staged: boolean }[]
  >([]);

  const getStatusLetter = (status: string) => {
    return status.charAt(0).toUpperCase();
  }

  createEffect(() => {
    if (!props.repo.path) return;
    getLocalChanges(props.repo.path).then((res) => {
      console.log("local changes", res);
      setChanges(res);
    });
  });

  const staged = () => changes().filter((c) => c.staged && c.status !== "untracked");
  const unstaged = () => changes().filter((c) => !c.staged || c.status == "untracked");
  console.log("unstaged", unstaged());
  console.log("staged", staged());

  return (
    <div class="p-4 space-y-4">
      <div class="flex items-center">
        <b>Alterações não preparadas</b>
        <button class="ml-auto px-2 py-1 text-sm bg-blue-500 text-white rounded">
          Preparar tudo
        </button>
      </div>
      <FolderTreeView items={unstaged()} />

      <div class="flex items-center mt-4">
        <b>Alterações preparadas</b>
        <button class="ml-auto px-2 py-1 text-sm bg-green-500 text-white rounded">
          Desfazer tudo
        </button>
      </div>
      
      <FolderTreeView items={staged()} />
    </div>
  );
}
