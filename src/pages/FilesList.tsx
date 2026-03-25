import { createSignal, createMemo, createEffect, on, Show } from "solid-js";
import { Repo } from "../models/Repo.model";
import { FolderTreeView } from "../components/ui/FolderTreeview";
import { listBranchFiles, getBranchFileContent } from "../services/gitService";
import { useLoading } from "../components/ui/LoadingContext";

export default function FileList(props: { repo: Repo, refreshBranches: (path: string) => Promise<void> }) {
  const minWidth = 200;
  const maxWidth = 600;

  // Estados principais
  const [sidebarWidth, setSidebarWidth] = createSignal(300);
  const [isResizing, setIsResizing] = createSignal(false);
  const [selectedBranch, setSelectedBranch] = createSignal<string | undefined>(props.repo.activeBranch);
  
  // Estados para os arquivos da branch
  const [branchFiles, setBranchFiles] = createSignal<{path: string, status: string}[]>([]);
  const [selectedFilePath, setSelectedFilePath] = createSignal<string[]>([]); // Para o destaque na árvore
  const [fileContent, setFileContent] = createSignal<string | null>(null);
  
  const { showLoading, hideLoading } = useLoading();

  // Resize logic
  const onMouseMove = (e: MouseEvent) => {
    if (isResizing()) {
      let newWidth = e.clientX;
      if (newWidth < minWidth) newWidth = minWidth;
      if (newWidth > maxWidth) newWidth = maxWidth;
      setSidebarWidth(newWidth);
    }
  };

  // 1. Efeito para buscar arquivos quando a branch no Select mudar
  createEffect(async () => {
    const branch = selectedBranch();
    if (!branch || !props.repo.path) return;

    showLoading();
    try {
      const files: string[] = await listBranchFiles(props.repo.path, branch);
      // Mapeia string[] para o formato ChangeItem do seu TreeView
      const mappedFiles = files.map(f => ({ path: f, status: "A" })); 
      setBranchFiles(mappedFiles);
      setFileContent(null); // Limpa o visualizador ao trocar de branch
    } catch (e) {
      console.error("Erro ao listar arquivos:", e);
    } finally {
      hideLoading();
    }
  });

  // 2. Função para buscar o conteúdo quando clicar no arquivo
  const handleFileClick = async (path: string) => {
    let branch = selectedBranch();
    if (!branch || !props.repo.path) return;
    showLoading();
    try {
      const content = await getBranchFileContent(props.repo.path, branch, path);
      setFileContent(content);
      setSelectedFilePath([path]);
    } catch (e) {
      setFileContent("Erro ao carregar o conteúdo do arquivo.");
    } finally {
      hideLoading();
    }
  };

  return (
    <div class="flex h-full w-full select-none bg-gray-200 dark:bg-gray-900 text-gray-800 dark:text-gray-200 p-2"
      onMouseMove={onMouseMove}
      onMouseUp={() => setIsResizing(false)}
      onMouseLeave={() => setIsResizing(false)}
    >
      {/* Painel esquerdo */}
      <div class="container-branch-list overflow-auto" style={{ width: `${sidebarWidth()}px`, height: `calc(100vh - 124px)` }}>
        
        {/* Select de Branches */}
        <div class="p-2 border-b border-gray-300 dark:border-gray-700">
          <label class="text-xs font-bold uppercase opacity-50 mb-2 block">Visualizar Branch</label>
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

        {/* Lista de arquivos */}
        <div class="flex-1 overflow-auto p-2">
          <FolderTreeView 
            items={branchFiles()} 
            selected={selectedFilePath()} 
            staged={false}
            onToggle={(path) => handleFileClick(path)}
          />
        </div>

      </div>

      {/* Conteúdo principal (Visualizador) */}
      <div class="flex-1 flex flex-col container-branch-list ml-2 overflow-auto" style={{ height: `calc(100vh - 124px)` }}>
        <Show 
          when={fileContent() !== null} 
          fallback={<div class="flex-1 flex items-center justify-center opacity-30 italic">Selecione um arquivo para visualizar o conteúdo na branch {selectedBranch()}</div>}
        >
          <div class="flex-1 overflow-auto p-4 font-mono text-sm whitespace-pre">
            {/* Aqui você pode futuramente colocar um componente de Syntax Highlight como o Prism ou Monaco */}
            <code>{fileContent()}</code>
          </div>
        </Show>
      </div>
    </div>
  );
}