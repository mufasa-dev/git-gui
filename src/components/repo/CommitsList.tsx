import { createEffect, createSignal } from "solid-js";
import { Repo } from "../../models/Repo.model";
import { getCommitDetails, getCommits } from "../../services/gitService";
import { formatDate } from "../../utils/date";
import { CommitDetails } from "./CommitDetails";

export default function CommitsList(props: { repo: Repo; branch?: string, class?: string }) {

  const [commits, setCommits] = createSignal<
    { hash: string; message: string; author: string; date: string }[]
  >([]);
  const [loading, setLoading] = createSignal(false);
  const [selectedCommit, setSelectedCommit] = createSignal<any>(null);
  const [commitDetailsHeight, setCommitDetailsHeight] = createSignal(200);
  const [resizing, setResizing] = createSignal(false);

  function startResize(e: MouseEvent) {
    setResizing(true);
    e.preventDefault();
  }

  function stopResize() {
    setResizing(false);
  }

  function onMouseMove(e: MouseEvent) {
    if (resizing()) {
      // Calcula nova altura para os detalhes
      const newHeight = window.innerHeight - e.clientY - 20; // 20px margem do padding
      setCommitDetailsHeight(Math.max(200, newHeight)); // limite mínimo 100px
    }
  }

  async function selectCommit(hash: string) {
    const details = await getCommitDetails(props.repo.path, hash);
    setSelectedCommit({...details});
  }

  createEffect(() => {
    if (!props.repo.path || !props.branch) return;

    const branchName = props.branch.replace("* ", "");
    
    setLoading(true);
    getCommits(props.repo.path, branchName)
    .then(setCommits)
    .finally(() => setLoading(false));
  });

  return (
    <div  class="flex-1 flex flex-col h-full overflow-hidden"
      onMouseMove={onMouseMove}
      onMouseUp={stopResize}
      onMouseLeave={stopResize}>
        <div class="flex-1 overflow-auto px-2">
            <div style={{"height": "100px"}}>
            {loading() ? <div>Carregando...</div> : commits().map((c) => (
                <div
                    class={`flex items-center border-b border-gray-200 py-2 cursor-pointer ${
                        selectedCommit()?.hash === c.hash ? "bg-blue-100" : ""
                    }`}
                    onClick={() => selectCommit(c.hash)}
                >
                    <div class="text-sm font-mono text-gray-500">{c.hash.slice(0, 7)}</div>
                    <div class="font-semibold px-1">{c.message}</div>
                    <div class="text-xs text-gray-400 ml-auto">{c.author}</div>
                    <div class="px-1">{formatDate(c.date)}</div>
                </div>
            ))}
            </div>
        </div>

        {/* Barra de resize */}
        <div
            class="h-1 cursor-row-resize bg-gray-200 hover:bg-gray-400"
            onMouseDown={startResize}
        ></div>
        
        <div
            class="overflow-auto"
            style={{ height: `${commitDetailsHeight()}px`, "min-height": "100px", "max-height": "50%" }}
        >
            <CommitDetails commit={selectedCommit()} />
        </div>
    </div>
  );
}
