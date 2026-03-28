import { createSignal, createEffect, on, Show, For, onMount, onCleanup } from "solid-js";
import { createCodeMirror } from "solid-codemirror";
import { EditorView, lineNumbers } from "@codemirror/view";
import { EditorState, StateEffect } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript"; // Exemplo, pode ser dinâmico
import { oneDark } from "@codemirror/theme-one-dark";
import { githubLight } from '@uiw/codemirror-theme-github';

import { Repo } from "../models/Repo.model";
import { FolderTreeView } from "../components/ui/FolderTreeview";
import { listBranchFiles, getBranchFileContent, getLastCommitForPath, listDirectory, getPathHistory } from "../services/gitService";
import { useLoading } from "../components/ui/LoadingContext";
import { Commit, FileEntry } from "../models/Commit.model";
import { getGravatarUrl } from "../services/gravatarService";
import { formatRelativeDate } from "../utils/date";
import FileIcon from "../components/ui/FileIcon";
import { Breadcrumb } from "../components/ui/Breadcrumb";
import { formatSize } from "../utils/file";

export default function FileList(props: { repo: Repo }) {
  const [sidebarWidth, setSidebarWidth] = createSignal(300);
  const [isResizing, setIsResizing] = createSignal(false);
  const [selectedBranch, setSelectedBranch] = createSignal(props.repo.activeBranch || "");
  const [branchFiles, setBranchFiles] = createSignal<{path: string, status: string}[]>([]);
  const [selectedFilePath, setSelectedFilePath] = createSignal<string[]>([]);
  const [fileContent, setFileContent] = createSignal<string | null>(null);
  const [isDark, setIsDark] = createSignal(localStorage.getItem("theme") === "dark");
  const [lastCommit, setLastCommit] = createSignal<Commit | null>(null);
  const [directoryContent, setDirectoryContent] = createSignal<FileEntry[] | null>(null);
  const [pathHistory, setPathHistory] = createSignal<Commit[] | null>(null);
  const [isImage, setIsImage] = createSignal(false);
  const [fileMeta, setFileMeta] = createSignal<{size: number, lines: number | null} | null>(null);
  const [lastProcessedBranch, setLastProcessedBranch] = createSignal<string | undefined>(undefined);
  const [lastProcessedRepoPath, setLastProcessedRepoPath] = createSignal<string | undefined>(undefined);

  const { showLoading, hideLoading } = useLoading();

  // --- Configuração CodeMirror ---
  const { ref: codeMirrorRef, editorView } = createCodeMirror({
    value: fileContent() ?? "",
  });


  onMount(() => {
    const handleThemeChange = (e: any) => {
      setIsDark(e.detail.theme === "dark");
    };

    window.addEventListener("theme-changed", handleThemeChange);
    onCleanup(() => window.removeEventListener("theme-changed", handleThemeChange));
  });

  let lastRepoPath = props.repo.path;
  createEffect(() => {
    const currentPath = props.repo.path;
    const activeBranch = props.repo.activeBranch;

    if (currentPath !== lastRepoPath) {
      lastRepoPath = currentPath;
      setSelectedBranch(activeBranch || "");
      setFileContent(null);
      setBranchFiles([]);
    }
  });

  createEffect(() => {
    const view = editorView();
    if (!view) return;
    
    const dark = isDark();

    const extensions = [
      lineNumbers(),
      EditorView.lineWrapping,
      EditorState.readOnly.of(true),
      dark ? oneDark : githubLight,
      javascript() 
    ];

    extensions.push(
      EditorView.theme({
        "&": {
          height: "100%",
          backgroundColor: dark ? "rgb(31 41 55 / 1) !important" : "#ffffff !important",
        },
        ".cm-scroller": { 
          overflow: "auto",
          backgroundColor: dark ? "rgb(31 41 55 / 1) !important" : "#ffffff !important",
        },
        ".cm-gutters": {
          backgroundColor: dark ? "rgb(31 41 55 / 1) !important" : "#f5f5f5",
          border: "none"
        },
        ".cm-content": {
          color: dark ? "#abb2bf" : "#000000",
        }
      }, { dark: dark })
    );

    view.dispatch({
      effects: StateEffect.reconfigure.of(extensions)
    });
  });

  createEffect(() => {
    const view = editorView();
    const content = fileContent();
    if (view && content !== null) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: content }
      });
    }
  });

  // --- Lógica de Busca ---
  createEffect(async () => {
    const branch = selectedBranch();
    const repoPath = props.repo.path;

    if (!branch || !repoPath) return;

    if (branch !== lastProcessedBranch() || repoPath !== lastProcessedRepoPath()) {
      
      setLastProcessedBranch(branch);
      setLastProcessedRepoPath(repoPath);

      showLoading();
      try {
        const files: string[] = await listBranchFiles(repoPath, branch);
        const mappedFiles = files.map(f => ({ path: f, status: "A" })); 
        
        setBranchFiles(mappedFiles);
        
        setFileContent(null); 
        setSelectedFilePath([]);
      } catch (e) {
        console.error("Erro ao listar arquivos:", e);
      } finally {
        hideLoading();
      }
    }
  });

  const handleFileClick = async (path: string, isFile: boolean) => {
    if (isFile) {
      showLoading();
      try {
        // Agora o serviço retorna um objeto { is_image: bool, content: string }
        const data = await getBranchFileContent(props.repo.path, selectedBranch(), path);
        
        setIsImage(data.isImage);
        setFileContent(data.content);
        setFileMeta({size: data.size, lines: data.lineCount})
        setSelectedFilePath([path]);
        setDirectoryContent(null);
      } catch (e) {
        setFileContent("Erro ao carregar arquivo.");
      } finally {
        hideLoading();
      }
    } else {
      setFileContent("");
      setSelectedFilePath([path]);
      getDirectoryContent(path);
    }
    getLastCommit(path);
  };

  const handleGoBack = (currentPath: string) => {
    if (!currentPath || currentPath === "." || currentPath === "") return;

    const parts = currentPath.split('/');
    parts.pop(); 
    const parentPath = parts.join('/');

    handleFileClick(parentPath, false);
  };

  const getLastCommit = async (path: string) => {
    showLoading();
    try {
      const lastCommitForFile = await getLastCommitForPath(props.repo.path, selectedBranch(), path);
      setLastCommit(lastCommitForFile);
    } catch (e) {
      setLastCommit(null);
    } finally {
      hideLoading();
    }
  };

  const getPathHistoryAsync = async (path: string) => {
    showLoading();
    try {
      const content = await getPathHistory(props.repo.path, selectedBranch(), path);
      setPathHistory(content);
    } catch (e) {
      setLastCommit(null);
    } finally {
      hideLoading();
    }
  };

  const getDirectoryContent = async (path: string) => {
    showLoading();
    try {
      const content = await listDirectory(props.repo.path, selectedBranch(), path);
      console.log('content', content);
      setDirectoryContent(content);
    } catch (e) {
      console.log('error', e)
      setLastCommit(null);
    } finally {
      hideLoading();
    }
  };

  const getSelectedFileName = () => {
    console.log('selectedFile', selectedFilePath())
    return selectedFilePath().length > 0 ? selectedFilePath()[0] : "text.png";
  }

  return (
    <div class="flex h-full w-full select-none bg-gray-200 dark:bg-gray-900 text-gray-800 dark:text-gray-200 p-2"
      onMouseMove={(e) => isResizing() && setSidebarWidth(Math.min(600, Math.max(200, e.clientX)))}
      onMouseUp={() => setIsResizing(false)}
    >
      {/* Sidebar */}
      <div class="container-branch-list overflow-auto mb-2" style={{ width: `${sidebarWidth()}px`, height: `calc(100vh - 124px)` }}>
        <div class="p-3 border-b border-gray-300 dark:border-gray-800">
          <select 
            class="w-full input-select"
            value={selectedBranch()} 
            onInput={(e) => {
              // Usamos onInput para uma resposta mais imediata em alguns browsers
              setSelectedBranch(e.currentTarget.value);
            }}
          >
            <optgroup label="Locais">
              <For each={props.repo.branches}>
                {(b) => <option value={b.name}>{b.name}</option>}
              </For>
            </optgroup>
            
            <Show when={props.repo.remoteBranches}>
              <optgroup label="Remotas">
                <For each={props.repo.remoteBranches}>
                  {(rb) => <option value={rb}>{rb}</option>}
                </For>
              </optgroup>
            </Show>
          </select>
        </div>
        <div class="flex-1 overflow-auto">
          <FolderTreeView 
            items={branchFiles()} 
            selected={selectedFilePath()} 
            staged={false} defaultOpen={false}
            showStatus={false} selectMode="single"
            onToggle={(path: string, _selected: boolean, isFile: boolean) => handleFileClick(path, isFile)}
          />        
          </div>
      </div>

      {/* Resize Handle */}
      <div class="resize-bar-vertical" onMouseDown={() => setIsResizing(true)} />

      {/* Viewer */}
      <div class="flex-1 flex flex-col container-branch-list overflow-auto"  style={{ height: `calc(100vh - 124px)` }}>
        <Show when={fileContent() !== null} fallback={<EmptyState branch={selectedBranch()} />}>
          <Show when={selectedFilePath()[0]}>
            <Breadcrumb 
              path={selectedFilePath()[0]} 
              repoName={props.repo.name} 
              onNavigate={(path) => {
                handleFileClick(path, false);
              }} 
            />
          </Show>
          {/* Exibe o último commit relacionado ao arquivo, se disponível */}
          {lastCommit() && (
            <div class="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-xl
                        text-xs font-mono flex items-center gap-2">
              <img
                src={getGravatarUrl(lastCommit()?.email || '', 80)}
                alt={lastCommit()?.author}
                class="w-[18px] h-[18px] rounded shadow-sm"
              /> 
              <b>{lastCommit()?.author}</b> 
              <span class="truncate">{lastCommit()?.message}</span>
              <span class="ml-auto">{lastCommit()?.hash.slice(0, 7)}</span>
              <div class="text-xs w-[220px] text-right truncate">{formatRelativeDate(lastCommit()?.date || '')}</div>
            </div>
          )}
          {/* Folder list */}
          <Show when={directoryContent()}>
            <div class="overflow-auto rounded-lg border border-gray-300 dark:border-gray-700">
              <table class="w-full text-left border-collapse">
                <thead class="sticky top-0 left-0">
                  <tr class="border-b border-gray-300 bg-gray-200 dark:border-gray-700 dark:bg-gray-700">
                    <th class="p-2 font-semibold">Nome</th>
                    <th class="p-2 font-semibold">Último Commit</th>
                    <th class="p-2 font-semibold text-right">Data do Commit</th>
                  </tr>
                </thead>
                <tbody>
                  <Show when={selectedFilePath()[0]}>
                    <tr class="hover:bg-blue-500/10 transition-colors even:bg-gray-200 dark:even:bg-gray-900/30 odd:bg-transparent cursor-pointer"
                      onClick={() => handleGoBack(selectedFilePath()[0])}>
                      <td class="p-2" colspan={3}>
                        <div class="flex items-center gap-2">
                          <i class="fa text-yellow-600 fa-folder"></i>
                          <span class="truncate max-w-[200px]">...</span>
                        </div>
                      </td>
                    </tr>
                  </Show>
                  <For each={directoryContent()}>
                    {(d) => (
                      <tr class="hover:bg-blue-500/10 transition-colors cursor-pointer even:bg-gray-200 
                              dark:hover:bg-blue-500/10 dark:even:bg-gray-900/30 odd:bg-transparent"
                              onClick={() => handleFileClick(d.path, !d.isDir)}>
                        <td class="p-2 flex items-center gap-2">
                          <span>
                            {d.isDir ? <i class="fa text-yellow-600 fa-folder"></i> : <FileIcon fileName={d.name} /> }
                          </span>
                          <span class="truncate max-w-[200px]">{d.name}</span>
                        </td>
                        <td class="p-2 text-gray-400 text-sm italic">
                          {/* Uso do ?. para evitar o erro de undefined */}
                          {d.lastCommit?.message || <span class="text-gray-600">Sem histórico</span>}
                        </td>
                        <td class="p-2 text-gray-500 text-xs text-right">
                          {d.lastCommit?.date ? formatRelativeDate(d.lastCommit.date) : '--'}
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>
          {/* Container do Visualizador */}
          <Show when={fileContent()}>
            <div class={`border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 
                        flex flex-col min-h-[300px] ${isImage() ? "items-center justify-center overflow-auto" : ""}`}>
              <div class={`bg-gray-300 dark:bg-gray-700 p-2 w-full rounded-t-xl flex items-center gap-2 ${isImage() && 'mb-auto'}`}>
                <FileIcon fileName={getSelectedFileName()} /> 
                <Show when={!isImage()}>
                  <b>{(fileMeta()?.lines || 0) + 1} linhas</b>
                  <span>-</span>
                </Show>
                <span>{formatSize(fileMeta()?.size || 0)}</span>
              </div>
              <Show when={isImage()} fallback={
                <div class="w-full overflow-auto rounded-b-xl" ref={codeMirrorRef} />
              }>
                {/* Imagem*/}
                <div class="p-8 flex flex-col items-center gap-4 mb-auto">
                  <div class="bg-checkered p-4 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg shadow-black/20">
                    <img 
                      src={fileContent()!} 
                      alt="Preview" 
                      class="max-w-full max-h-[500px] object-contain" 
                    />
                  </div>
                  <div class="text-[10px] text-gray-500 font-mono dark:text-white bg-gray-100 dark:bg-gray-900 px-2 py-1 rounded-xl">
                      {selectedFilePath()[0]}
                  </div>
                </div>
              </Show>

            </div>
          </Show>
        </Show>
      </div>
    </div>
  );
}

function EmptyState(props: { branch: string }) {
  return (
    <div class="flex-1 flex items-center justify-center opacity-30 italic text-sm">
      Selecione um arquivo na branch {props.branch}
    </div>
  );
}