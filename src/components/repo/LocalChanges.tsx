import { createEffect, createMemo, createResource, createSignal, For, on, onCleanup, Show } from "solid-js";
import { Repo } from "../../models/Repo.model";
import { commit, discard_changes, getDiff, getLocalChanges, stageFiles, unstageFiles } from "../../services/gitService";
import { FolderTreeView } from "../ui/FolderTreeview";
import { useRepoContext } from "../../context/RepoContext";
import DiffViewer from "../ui/DiffViewer";
import { LocalChange } from "../../models/LocalChanges.model";
import ContextMenu, { ContextMenuItem } from "../ui/ContextMenu";
import { openVsCodeDiff } from "../../services/openService";
import { Diff } from "../../models/Diff.model";
import { notify } from "../../utils/notifications";
import { useLoading } from "../ui/LoadingContext";

let isRefreshing = false;

export function LocalChanges(props: { repo: Repo; }) {
  const minWidth = 200;
  const maxWidth = 600;

  const [changes, setChanges] = createSignal<LocalChange[]>([]);
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
  const [diff, setDiff] = createSignal<Diff>({diff: ""});
  const [menuVisible, setMenuVisible] = createSignal(false);
  const [menuPos, setMenuPos] = createSignal({ x: 0, y: 0 });
  const { showLoading, hideLoading } = useLoading();
  const [isMerging, setIsMerging] = createSignal(false);
  const [isVisualizingStaged, setIsVisualizingStaged] = createSignal(false);
  const [menuItems, setMenuItems] = createSignal<ContextMenuItem[]>([]);

  const loadChanges = async () => {
    if (!props.repo.path || isMerging() || isRefreshing) return;
    
    isRefreshing = true;
    
    try {
      const res = await getLocalChanges(props.repo.path);
      
      if (JSON.stringify(res) !== JSON.stringify(changes())) {
        setChanges(res);
      }

      const currentPaths = res.map(c => c.path);
      setSelected(prev => prev.filter(p => currentPaths.includes(p)));
      setStagedPreparedSelected(prev => prev.filter(p => currentPaths.includes(p)));

      if (fileSelected()) {
        const fileExists = res.find(c => c.path === fileSelected());
        if (fileExists) {
          const newDiff = await getDiff(props.repo.path, fileSelected(), fileExists.staged);
          if (newDiff.diff !== diff().diff) {
            setDiff(newDiff);
          }
        } else {
          setFileSelected("");
          setDiff({diff: ""});
        }
      }
    } catch (e) {
      console.error("Erro ao carregar mudanças:", e);
    } finally {
      isRefreshing = false;
    }
  };

  createEffect(on(() => props.repo.path, (newPath, oldPath) => {
    if (!newPath) return;
    
    if (newPath !== oldPath) {
      setChanges([]);
      setSelected([]);
      setStagedPreparedSelected([]);
      setFileSelected("");
      setDiff({diff: ""});
    }
    
    loadChanges();
  }));

  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      loadChanges();
    }
  };

  const currentFileChange = createMemo(() => {
    return changes().find(c => c.path === fileSelected() && c.staged === isVisualizingStaged());
  });
  
  document.addEventListener("visibilitychange", handleVisibilityChange);

  const handleFocus = () => {
    if (!isMerging() && !isRefreshing) {
      loadChanges();
    }
  };
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
    if (path === fileSelected()) {
      clearDiff();
      setFileSelected("");
      setIsVisualizingStaged(false);
      setSelected((prev) => prev.filter((p) => p !== path));
    } else {
      setFileSelected(path);
      loadDiff(false);
      setIsVisualizingStaged(false);
      setSelected((prev) => {
        if (select) return [...prev, path];
        else return prev.filter((p) => p !== path);
      });
    }
  };

  const toggleStagedItem = (path: string, select: boolean) => {
    if (path === fileSelected()) {
      clearDiff();
      setFileSelected("");
      setIsVisualizingStaged(false);
      setSelected((prev) => prev.filter((p) => p !== path));
    } else {
      setFileSelected(path);
      loadDiff(true);
      setIsVisualizingStaged(true);
      setStagedPreparedSelected((prev) => {
        if (select) return [...prev, path];
        else return prev.filter((p) => p !== path);
      });
    }
  };

  const showContextMenu = (e: MouseEvent, item: any = null) => {
    e.preventDefault();

    let items = []
    if (item && item.path) {
      if (!item.staged) {
        items.push({ label: "Preparar", action: () => prepare([item.path]) });
      }
      else {
        items.push({ label: "Desfazer", action: () => unstage([item.path]) });
      }

      items.push({
        label: "Abrir diff no VSCode",
        hr: true,
        action: () => openVsCodeDiff(props.repo.path, item.path),
      });
    }
    items.push({ label: "Preparar tudo", action: () => prepareAll() });
    items.push({
      label: "Descartar alterações",
      action: () => discard(selected()),
    });

    setMenuItems(items);
    setMenuPos({ x: e.clientX, y: e.clientY });
    setMenuVisible(true);
  };

  const hideContextMenu = () => setMenuVisible(false);

  document.addEventListener("click", hideContextMenu);
  onCleanup(() => document.removeEventListener("click", hideContextMenu));

  const loadDiff = async (staged: boolean) => {
    console.log("Loading diff for", fileSelected(), "staged:", staged, props.repo.path);
    const result = await getDiff(props.repo.path, fileSelected(), staged);
    console.log("Diff loaded:", result);
    setDiff(result);
  }

  const prepare = async (paths: string[]) => {
    await stageFiles(props.repo.path, paths);
    setSelected([]);
    clearDiff();
    setFileSelected("");
    await loadChanges();
  }

  const prepareAll = async () => {
    const allPaths = changes().map(c => c.path);
    await stageFiles(props.repo.path, allPaths);
    setSelected(allPaths);
    clearDiff();
    setFileSelected("");
    await loadChanges();
  };

  const unstage = async (paths: string[]) => {
    await unstageFiles(props.repo.path, paths);
    setSelected([]);
    clearDiff();
    setFileSelected("");
    await loadChanges();
  }

  const discard = async (paths: string[]) => {
    await discard_changes(props.repo.path, paths);
    setSelected([]);
    clearDiff();
    await loadChanges();
  }

  const handleCommit = async () => {
    if (!commitMessage().trim()) {
      notify.error('Ops!', "Digite uma mensagem de commit!");
      return;
    }
    try {
      showLoading("Realizando commit...");
      const res = await commit(props.repo.path, commitMessage(), commitDescription(), commitAmend());
      setCommitMessage("");
      setCommitDescription("");
      setCommitAmend(false);
      clearDiff();
      await loadChanges();
      await refreshBranches(props.repo.path);
    } catch (err) {
      console.error("Erro no commit:", err);
      notify.error('Erro no Commit', `Erro ao realizar o commit: ${err}`);
    } finally {
      hideLoading();
    }
  };

  const clearDiff = () => setDiff({diff: ""});  

  return (
    <div class="flex h-full w-full select-none pt-2 mx-1"
      onMouseMove={onMouseMove}
      onMouseUp={stopResize}
      onMouseLeave={stopResize}>
      <div class="container-branch-list mb-4 overflow-auto border-r py-3 px-0" style={{ width: `${sidebarWidth()}px` }}>
        <div style={{"height": "40px"}} class="flex flex-col">
          <div class="border-y border-gray-300 bg-gray-200 dark:bg-gray-900 dark:border-gray-950 px-4 py-1 mb-3 flex items-center" onContextMenu={showContextMenu}>
            <b>Alterações</b>
            <button class="ml-auto px-2 py-1 text-sm bg-blue-500 text-white rounded" onClick={() => prepare(selected())}>
              Preparar
            </button>
          </div>
          {unstaged().length === 0 && <div class="px-4 text-center text-gray-400">Nenhuma alteração local</div>}
          <FolderTreeView items={unstaged()} 
            selected={selected()} staged={false} 
            onToggle={toggleItem} onContextMenu={showContextMenu}
            onDbClick={(items: string[]) => prepare(items)}
          />

          <div class="border-y border-gray-300 bg-gray-200 dark:bg-gray-900 dark:border-gray-950 px-4 py-1 flex items-center mt-2 mb-3">
            <b class="mr-1">Preparadas</b>
            <button class="ml-auto px-2 py-1 text-sm bg-green-500 text-white rounded" onclick={() => unstage(stagedPreparedSelected())}>
              Desfazer
            </button>
          </div>
          
          <FolderTreeView items={staged()} 
            selected={stagedPreparedSelected()} staged={true} 
            onToggle={toggleStagedItem} onContextMenu={showContextMenu}
            onDbClick={(items: string[]) => unstage(items)}
          />
        </div>
      </div>

      {/* Barra de resize */}
      <div
        class="w-1 cursor-col-resize bg-gray-200 hover:bg-gray-400 dark:bg-gray-900 dark:hover:bg-gray-700"
        onMouseDown={startResize}
      ></div>

      <div  class="flex-1 flex flex-col h-full overflow-hidden ml-1">
        <div class="flex-1 overflow-auto px-2 container-branch-list">
          <DiffViewer diff={diff()} class="h-full" file={fileSelected()}
            path={props.repo.path} isStaged={isVisualizingStaged()}
            onMergeStatusChange={(open) => setIsMerging(open)}
            onSaveSuccess={(filePath: string) => {
              setIsMerging(false);
              prepare([filePath]);
              loadChanges();
            }} />
        </div>
        <div class="mt-2 container-branch-list mb-4">
          <input type="text" class="w-full input-text" placeholder="Mensagem do commit"
            value={commitMessage()}
            onInput={(e) => setCommitMessage(e.currentTarget.value)} />
          <input type="text" class="w-full mt-2 input-text" placeholder="Descrição"
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
            <button class="pl-2 pr-4 py-1 bg-blue-600 ml-auto text-white rounded-xl" onClick={handleCommit}
              disabled={staged().length === 0 || !commitMessage().trim()}>
              <i class="fa fa-check"></i> Commit
            </button>
          </div>
        </div>
      </div>
      <Show when={menuVisible()}>
        <ContextMenu
          name={''}
          items={menuItems()}
          position={menuPos()}
          onClose={hideContextMenu}
        />
      </Show>
    </div>
  );
}
