import { createEffect, createResource, createSignal, For, Show } from "solid-js";
import { Repo } from "../../models/Repo.model";
import { getLocalChanges } from "../../services/gitService";

export function LocalChanges(props: { repo: Repo; branch: string }) {
  const [changes, setChanges] = createSignal<
    { path: string; status: string; staged: boolean }[]
  >([]);

  const getStatusLetter = (status: string) => {
    return status.charAt(0).toUpperCase();
  }

  createEffect(() => {
    if (!props.repo.path) return;
    getLocalChanges(props.repo.path).then(setChanges);
  });

  const staged = () => changes().filter((c) => c.staged && c.status !== "untracked");
  const unstaged = () => changes().filter((c) => !c.staged || c.status == "untracked");

  return (
    <div class="p-4 space-y-4">
      <div class="flex items-center">
        <b>Alterações não preparadas</b>
        <button class="ml-auto px-2 py-1 text-sm bg-blue-500 text-white rounded">
          Preparar tudo
        </button>
      </div>
      <ul class="ml-4 list-disc text-sm">
        {unstaged().length === 0 && (
          <li class="text-gray-400">Nenhuma alteração</li>
        )}
        {unstaged().map((c) => (
          <li>
            <span class="text-gray-500">[{getStatusLetter(c.status)}]</span> {c.path}
          </li>
        ))}
      </ul>

      <div class="flex items-center mt-4">
        <b>Alterações preparadas</b>
        <button class="ml-auto px-2 py-1 text-sm bg-green-500 text-white rounded">
          Desfazer tudo
        </button>
      </div>
      <ul class="ml-4 list-disc text-sm">
        {staged().length === 0 && (
          <li class="text-gray-400">Nenhuma alteração</li>
        )}
        {staged().map((c) => (
          <li>
            <span class="text-gray-500">[{getStatusLetter(c.status)}]</span> {c.path}
          </li>
        ))}
      </ul>
    </div>
  );
}
