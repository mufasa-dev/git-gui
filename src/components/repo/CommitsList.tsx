import { createEffect, createSignal } from "solid-js";
import { Repo } from "../../models/Repo.model";
import { getCommits } from "../../services/gitService";
import { formatDate } from "../../utils/date";

export default function CommitsList(props: { repo: Repo; branch?: string }) {
  const [commits, setCommits] = createSignal<
    { hash: string; message: string; author: string; date: string }[]
  >([]);
  const [loading, setLoading] = createSignal(false);

  createEffect(() => {
    if (!props.repo.path || !props.branch) return;

    const branchName = props.branch.replace("* ", "");
    console.log("Loading commits for branch:", branchName);
    console.log("Repo path:", props.repo);
    getCommits(props.repo.path, branchName)
    .then(setCommits)
    .finally(() => setLoading(false));
  });

  return (
    <div class="space-y-2 overflow-auto">
      {loading() ? <div>Carregando...</div> : commits().map((c) => (
        <div class="flex items-center border-b border-gray-200 pb-2">
          <div class="text-sm font-mono text-gray-500">{c.hash.slice(0, 7)}</div>
          <div class="font-semibold px-1">{c.message}</div>
          <div class="text-xs text-gray-400 ml-auto">{c.author}</div>
          <div class="px-1">{formatDate(c.date)}</div>
        </div>
      ))}
    </div>
  );
}
