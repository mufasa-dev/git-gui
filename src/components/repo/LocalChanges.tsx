import { createEffect, createResource, createSignal, For, onCleanup, Show } from "solid-js";
import { Repo } from "../../models/Repo.model";
import { commit, getDiff, getLocalChanges, stageFiles, unstageFiles } from "../../services/gitService";
import { FolderTreeView } from "../ui/FolderTreeview";
import { useRepoContext } from "../../context/RepoContext";
import DiffViewer from "../ui/DiffViewer";

export function LocalChanges(props: { repo: Repo; branch: string }) {
  const minWidth = 200;
  const maxWidth = 600;

  const [changes, setChanges] = createSignal<
    { path: string; status: string; staged: boolean }[]
  >([]);
  const [selected, setSelected] = createSignal<string[]>([]);
  const [fileSelected, setFileSelected] = createSignal<string>("");
  const [stagedPreparedSelected, setStagedPreparedSelected] = createSignal<string[]>([]);
  const [sidebarWidth, setSidebarWidth] = createSignal(300);
  const [isResizing, setIsResizing] = createSignal(false);
  const [startX, setStartX] = createSignal(0);
  const [startWidth, setStartWidth] = createSignal(0);
  const [commitMessage, setCommitMessage] = createSignal("");
  const [commitDescription, setCommitDescription] = createSignal("");
  const [commitAmend, setCommitAmend] = createSignal(false);
  const { refreshBranches } = useRepoContext();
  const [diff, setDiff] = createSignal<string>("");

  const loadChanges = async () => {
    if (!props.repo.path) return;
    const res = await getLocalChanges(props.repo.path);
    setChanges(res);
  };

  createEffect(() => {
    loadChanges();
  });

  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      loadChanges();
    }
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);

  const handleFocus = () => loadChanges();
  window.addEventListener("focus", handleFocus);

  onCleanup(() => {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("focus", handleFocus);
  });

  const startResize = (e: MouseEvent) => {
    setIsResizing(true);
    setStartX(e.clientX);
    setStartWidth(sidebarWidth());
  };
  const stopResize = () => setIsResizing(false);
  const onMouseMove = (e: MouseEvent) => {
    if (!isResizing()) return;
    const deltaX = e.clientX - startX();
    let newWidth = startWidth() + deltaX;
    if (newWidth < minWidth) newWidth = minWidth;
    if (newWidth > maxWidth) newWidth = maxWidth;
    setSidebarWidth(newWidth);
  };

  const staged = () => changes().filter((c) => c.staged && c.status !== "untracked");
  const unstaged = () => changes().filter((c) => !c.staged || c.status == "untracked");

  const toggleItem = (path: string, select: boolean) => {
    setFileSelected(path);
    loadDiff(false);
    setSelected((prev) => {
      if (select) return [...prev, path];
      else return prev.filter((p) => p !== path);
    });
  };

  const toggleStagedItem = (path: string, select: boolean) => {
    setFileSelected(path);
    loadDiff(true);
    setStagedPreparedSelected((prev) => {
      if (select) return [...prev, path];
      else return prev.filter((p) => p !== path);
    });
  };

  const loadDiff = async (staged: boolean) => {
    console.log("Loading diff for", fileSelected(), "staged:", staged, props.repo.path);
    const result = await getDiff(props.repo.path, fileSelected(), staged);
    console.log("Diff loaded:", result);
    setDiff(result);
  }

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

  const unstage = async () => {
    const paths = stagedPreparedSelected();
    await unstageFiles(props.repo.path, paths);
    setSelected([]);
    await loadChanges();
  }

  const handleCommit = async () => {
    if (!commitMessage().trim()) {
      alert("Digite uma mensagem de commit!");
      return;
    }
    try {
      const res = await commit(props.repo.path, commitMessage(), commitDescription(), commitAmend());
      setCommitMessage("");
      setCommitDescription("");
      setCommitAmend(false);
      await loadChanges();
      await refreshBranches(props.repo.path);
    } catch (err) {
      console.error("Erro no commit:", err);
      alert("Erro no commit: " + err);
    }
  };
  

  return (
    <div class="flex h-full w-full select-none"
      onMouseMove={onMouseMove}
      onMouseUp={stopResize}
      onMouseLeave={stopResize}>
      <div class="flex flex-col border-r border-gray-300 p-4" style={{ width: `${sidebarWidth()}px` }}>
        <div class="flex items-center">
          <b>Alterações</b>
          <button class="ml-auto px-2 py-1 text-sm bg-blue-500 text-white rounded" onClick={() => prepare()}>
            Preparar
          </button>
        </div>
        <FolderTreeView items={unstaged()} selected={selected()} onToggle={toggleItem} />

        <div class="flex items-center mt-4">
          <b class="mr-1">Preparadas</b>
          <button class="ml-auto px-2 py-1 text-sm bg-green-500 text-white rounded" onclick={() => unstage()}>
            Desfazer
          </button>
        </div>
        
        <FolderTreeView items={staged()} selected={stagedPreparedSelected()} onToggle={toggleStagedItem} />
      </div>

      {/* Barra de resize */}
      <div
        class="w-1 cursor-col-resize bg-gray-200 hover:bg-gray-400"
        onMouseDown={startResize}
      ></div>

      <div  class="flex-1 flex flex-col h-full overflow-hidden">
        <div class="flex-1 overflow-auto px-2">
          <div style={{"height": "100px"}}>
            <DiffViewer diff={diff()} class="h-full" />
          </div>
        </div>
        <div class="border-t border-gray-300 p-4">
          <input type="text" class="w-full border rounded border-gray-300 py-1 px-2" placeholder="Mensagem do commit"
            value={commitMessage()}
            onInput={(e) => setCommitMessage(e.currentTarget.value)} />
          <input type="text" class="w-full border rounded border-gray-300 py-1 px-2 mt-2" placeholder="Descrição"
            value={commitDescription()}
            onInput={(e) => setCommitDescription(e.currentTarget.value)} />
          <div class="flex mt-2">
            <div>
              <input
                type="checkbox" id="amend" name="amend"
                checked={commitAmend()} onChange={(e) => setCommitAmend(e.currentTarget.checked)}
              />
              <label for="amend" class="ml-1">Amend</label>
            </div>
            <button class="pl-2 pr-4 py-1 bg-blue-600 ml-auto text-white rounded" onClick={handleCommit}
              disabled={staged().length === 0 || !commitMessage().trim()}>
              <i class="fa fa-check"></i> Commit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
