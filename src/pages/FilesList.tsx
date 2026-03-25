import { createSignal, createEffect, on, Show, For } from "solid-js";
import { createCodeMirror } from "solid-codemirror";
import { EditorView, lineNumbers } from "@codemirror/view";
import { EditorState, StateEffect } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript"; // Exemplo, pode ser dinâmico
import { oneDark } from "@codemirror/theme-one-dark";
import { githubLight } from '@uiw/codemirror-theme-github';

import { Repo } from "../models/Repo.model";
import { FolderTreeView } from "../components/ui/FolderTreeview";
import { listBranchFiles, getBranchFileContent } from "../services/gitService";
import { useLoading } from "../components/ui/LoadingContext";

export default function FileList(props: { repo: Repo }) {
  const [sidebarWidth, setSidebarWidth] = createSignal(300);
  const [isResizing, setIsResizing] = createSignal(false);
  const [selectedBranch, setSelectedBranch] = createSignal(props.repo.activeBranch || "");
  const [branchFiles, setBranchFiles] = createSignal<{path: string, status: string}[]>([]);
  const [selectedFilePath, setSelectedFilePath] = createSignal<string[]>([]);
  const [fileContent, setFileContent] = createSignal<string | null>(null);
  const [isDark] = createSignal(localStorage.getItem("theme") === "dark");
  const [lastProcessedBranch, setLastProcessedBranch] = createSignal<string | undefined>(undefined);
  const [lastProcessedRepoPath, setLastProcessedRepoPath] = createSignal<string | undefined>(undefined)

  const { showLoading, hideLoading } = useLoading();

  // --- Configuração CodeMirror ---
  const { ref: codeMirrorRef, editorView } = createCodeMirror({
    value: fileContent() ?? "",
  });

  createEffect(() => {
    const view = editorView();
    if (!view) return;
    const dark = isDark();

    const extensions = [
      lineNumbers(),
      EditorView.lineWrapping,
      EditorState.readOnly.of(true),
      isDark() ? oneDark : githubLight,
      javascript() 
    ];

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

  const handleFileClick = async (path: string) => {
    if (!path.includes('.')) return; // Ignora pastas simplificadamente
    showLoading();
    try {
      const content = await getBranchFileContent(props.repo.path, selectedBranch(), path);
      setFileContent(content);
      setSelectedFilePath([path]);
    } catch (e) {
      setFileContent("Erro ao carregar arquivo.");
    } finally {
      hideLoading();
    }
  };

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
            onChange={(e) => setSelectedBranch(e.currentTarget.value)}
          >
            <optgroup label="Locais">
              {props.repo.branches.map(b => <option value={b.name}>{b.name}</option>)}
            </optgroup>
            <optgroup label="Remotas">
              {props.repo.remoteBranches?.map(rb => <option value={rb}>{rb}</option>)}
            </optgroup>
          </select>
        </div>
        <div class="flex-1 overflow-auto">
          <FolderTreeView 
            items={branchFiles()} 
            selected={selectedFilePath()} 
            staged={false} defaultOpen={false}
            showStatus={false}
            onToggle={(path) => handleFileClick(path)}
          />        
          </div>
      </div>

      {/* Resize Handle */}
      <div class="resize-bar-vertical" onMouseDown={() => setIsResizing(true)} />

      {/* Viewer */}
      <div class="flex-1 flex flex-col container-branch-list overflow-auto"  style={{ height: `calc(100vh - 124px)` }}>
        <Show when={fileContent() !== null} fallback={<EmptyState branch={selectedBranch()} />}>
          <div class="px-4 py-2 border-b border-gray-300 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 text-xs font-mono">
            {selectedFilePath()[0]}
          </div>
          {/* Container do CodeMirror */}
          <div class="flex-1 overflow-hidden" ref={codeMirrorRef} />
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