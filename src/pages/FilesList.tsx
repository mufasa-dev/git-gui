import { createSignal, createEffect, on, Show, For, onMount, onCleanup, createMemo } from "solid-js";
import { createCodeMirror } from "solid-codemirror";
import { EditorView, lineNumbers } from "@codemirror/view";
import { EditorState, StateEffect } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript"; // Exemplo, pode ser dinâmico
import { oneDark } from "@codemirror/theme-one-dark";
import { githubLight } from '@uiw/codemirror-theme-github';

import { Repo } from "../models/Repo.model";
import { FolderTreeView } from "../components/ui/FolderTreeview";
import { listBranchFiles, getBranchFileContent, getLastCommitForPath, listDirectory, getPathHistory, getCommitDetails } from "../services/gitService";
import { useLoading } from "../components/ui/LoadingContext";
import { Commit, FileEntry } from "../models/Commit.model";
import { getGravatarUrl } from "../services/gravatarService";
import { formatRelativeDate } from "../utils/date";
import FileIcon from "../components/ui/FileIcon";
import { Breadcrumb } from "../components/ui/Breadcrumb";
import { formatSize } from "../utils/file";
import Dialog from "../components/ui/Dialog";
import { CommitDetails } from "../components/commits/CommitDetails";
import CommitMessage from "../components/ui/CommitMessage";
import CodePreviewer from "../components/ui/CodePreviewer";

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
  const [showModalCommitDetails, setModalCommitDetails] = createSignal(false);
  const [selectedCommit, setSelectedCommit] = createSignal<any>(null);
  const [showHistory, setShowHistory] = createSignal(false);
  const [searchTerm, setSearchTerm] = createSignal("");

  const { showLoading, hideLoading } = useLoading();

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

  createEffect(async () => {
    const branch = selectedBranch();
    const repoPath = props.repo.path;

    if (!branch || !repoPath) return;

    if (branch !== lastProcessedBranch() || repoPath !== lastProcessedRepoPath()) {
      setLastProcessedBranch(branch);
      setLastProcessedRepoPath(repoPath);

      showLoading("Carregando arquivos...");
      try {
        const files: string[] = await listBranchFiles(repoPath, branch);
        const mappedFiles = files.map(f => ({ path: f, status: "A" })); 
        
        setBranchFiles(mappedFiles);
        
        const rootPath = ""; 
        setSelectedFilePath([rootPath]);
        setFileContent("");
        setShowHistory(false);
        
        await getDirectoryContent(rootPath);
        await getLastCommit(rootPath);

      } catch (e) {
        console.error("Erro ao listar arquivos:", e);
      } finally {
        hideLoading();
      }
    }
  });

  const handleFileClick = async (path: string, isFile: boolean) => {
    if (isFile) {
      showLoading("Carregando arquivo...");
      try {
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
    if (path == "") setShowHistory(false);
    if (showHistory()) {
       getPathHistoryAsync(path);
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
    showLoading("Carregando último commit...");
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
    showLoading("Carregando histórico de alterações...");
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
    showLoading("Carregando conteúdo do diretório...");
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

  const filteredFiles = createMemo(() => {
    const term = searchTerm().toLowerCase();
    if (!term) return branchFiles();

    return branchFiles().filter((file) => 
      file.path.toLowerCase().includes(term)
    );
  });

  async function selectCommit(hash: string) {
    const details = await getCommitDetails(props.repo.path, hash);
    setSelectedCommit({ ...details, _ts: Date.now() });
    setModalCommitDetails(true);
  }

  const getSelectedFileName = () => {
    return selectedFilePath().length > 0 ? selectedFilePath()[0] : "text.png";
  }

  return (
    <div class="flex h-full w-full select-none bg-gray-200 dark:bg-gray-900 text-gray-800 dark:text-gray-200 p-2"
      onMouseMove={(e) => isResizing() && setSidebarWidth(Math.min(600, Math.max(200, e.clientX)))}
      onMouseUp={() => setIsResizing(false)}
    >
      {/* Sidebar */}
      <div class="container-branch-list p-0 overflow-auto mb-2" style={{ width: `${sidebarWidth()}px`, height: `calc(100vh - 124px)` }}>
        <div class="p-3 border-b border-gray-300 dark:border-gray-700">
          <select 
            class="w-full input-select mb-2"
            value={selectedBranch()} 
            onInput={(e) => {
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

          <div class="relative">
            <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
            <input
              type="text"
              placeholder="Buscar arquivos..."
              class="w-full pl-8 pr-2 py-1 text-sm bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={searchTerm()}
              onInput={(e) => setSearchTerm(e.currentTarget.value)}
            />
            <Show when={searchTerm()}>
              <button 
                class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                onClick={() => setSearchTerm("")}
              >
                <i class="fa-solid fa-xmark"></i>
              </button>
            </Show>
          </div>
        </div>
        <div class="flex-1 overflow-auto">
          <FolderTreeView 
            items={filteredFiles()} 
            selected={selectedFilePath()} 
            staged={false} defaultOpen={searchTerm().length > 1}
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
          <div class="flex items-center pr-2">
            <Show when={selectedFilePath()[0]}>
              <Breadcrumb 
                path={selectedFilePath()[0]} 
                repoName={props.repo.name} 
                onNavigate={(path) => {
                  handleFileClick(path, false);
                }} 
              />
              <Show when={!showHistory()}>
                <button class="bg-transparent border-0 ml-auto flex items-center hover:text-blue-500" 
                  onClick={() => {
                    setShowHistory(!showHistory());
                    getPathHistoryAsync(selectedFilePath()[0]);
                  }}>
                  <i class="fa-solid fa-clock-rotate-left mr-2" /> Histórico
                </button>
              </Show>
              <Show when={showHistory()}>
                <button class="bg-transparent border-0 ml-auto flex items-center hover:text-blue-500" onClick={() => setShowHistory(!showHistory())}>
                  <i class="fa-solid fa-folder mr-2"></i> Arquivos
                </button>
              </Show>
            </Show>
          </div>
          {/* Exibe o último commit relacionado ao arquivo, se disponível */}
          {lastCommit() && !showHistory() && (
            <div class="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-xl
                        text-xs font-mono flex items-center gap-2">
              <img
                src={getGravatarUrl(lastCommit()?.email || '', 80)}
                alt={lastCommit()?.author}
                class="w-[18px] h-[18px] rounded shadow-sm"
              /> 
              <b>{lastCommit()?.author}</b> 
              <span class="truncate clicked_label" onClick={() => selectCommit(lastCommit()?.hash || '')}>
                <CommitMessage message={lastCommit()?.message || ''} />
              </span>
              <span class="ml-auto clicked_label"  onClick={() => selectCommit(lastCommit()?.hash || '')}>
                {lastCommit()?.hash.slice(0, 7)}
              </span>
              <div class="text-xs w-[220px] text-right truncate">{formatRelativeDate(lastCommit()?.date || '')}</div>
            </div>
          )}
          {/* Folder list */}
          <Show when={directoryContent() && !showHistory()}>
            <div class="overflow-auto rounded-lg border border-gray-300 dark:border-gray-700">
              <table class="w-full text-left border-collapse table-striped">
                <thead class="sticky top-0 left-0">
                  <tr class="border-b border-gray-300 bg-gray-200 dark:border-gray-700 dark:bg-gray-700">
                    <th class="p-2 font-semibold">Nome</th>
                    <th class="p-2 font-semibold">Último Commit</th>
                    <th class="p-2 font-semibold text-right">Data do Commit</th>
                  </tr>
                </thead>
                <tbody>
                  <Show when={selectedFilePath()[0]}>
                    <tr onClick={() => handleGoBack(selectedFilePath()[0])}>
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
                      <tr onClick={() => handleFileClick(d.path, !d.isDir)}>
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
          <Show when={fileContent() && !showHistory()}>
            <div class={`border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 
                        flex flex-col min-h-[300px] ${isImage() ? "items-center justify-center overflow-auto" : ""}`}>
              <div class={`bg-gray-300 dark:bg-gray-700 p-2 w-full rounded-t-xl flex items-center gap-2 ${isImage() && 'mb-auto'}`}>
                <FileIcon fileName={getSelectedFileName()} /> 
                <Show when={!isImage()}>
                  <b>{(fileMeta()?.lines || 0)} linhas</b>
                  <span>-</span>
                </Show>
                <span>{formatSize(fileMeta()?.size || 0)}</span>
              </div>
              <Show when={isImage()} fallback={
                <CodePreviewer fileName={getSelectedFileName()} content={fileContent() || ''} />
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
          {/* Histórico de Commits do arquivo */}
          <Show when={showHistory() && pathHistory()}>
            <div class="mt-4 border border-gray-300 dark:border-gray-700 rounded-xl overflow-auto">
              <div class="flex items-center bg-gray-200 dark:bg-gray-700 rounded-t-xl p-2 mb-2">
                <i class="fa-solid fa-clock-rotate-left mr-2" /> Histórico de Commits
              </div>
              <div class="p-2">
                <For each={pathHistory()}>
                  {(c) => (
                    <div
                      class={`cm-commit-item`}
                      onClick={() => selectCommit(c.hash)}
                    >
                      <div class="text-sm font-mono opacity-80">{c.hash.slice(0, 7)}</div>
                      <div class="font-semibold px-2 flex-1 truncate">
                        <CommitMessage message={c.message} />
                      </div>
                      <div class="text-xs ml-auto whitespace-nowrap flex items-center gap-2 w-[200px]">
                        <img
                          src={getGravatarUrl(c.email, 80)}
                          alt={c.author}
                          class="w-[18px] h-[18px] rounded shadow-sm"
                        /> 
                        <span class="opacity-50 truncate">{c.author}</span>
                      </div>
                      <div class="px-2 text-xs w-[182px] text-right truncate">{formatRelativeDate(c.date)}</div>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>
        </Show>
      </div>

      <Dialog open={showModalCommitDetails()}
              title="Detalhes co Commit"
              onClose={() => setModalCommitDetails(false)}
              bodyClass="p-0 h-full"
              width={'calc(100vw - 40px)'}
              height={'calc(100vh - 100px)'}>
        <CommitDetails commit={selectedCommit()} 
            repoPath={props.repo.path} 
            branch={selectedBranch() || ""} 
            openParent={false} 
            selectCommit={selectCommit} 
        />
      </Dialog>
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