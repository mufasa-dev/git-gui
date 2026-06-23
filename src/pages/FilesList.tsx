import { createSignal, createEffect, createMemo } from "solid-js";
import { Repo } from "../models/Repo.model";
import { Commit, FileEntry } from "../models/Commit.model";
import { useLoading } from "../components/ui/LoadingContext";
import { useApp } from "../context/AppContext";
import Dialog from "../components/ui/Dialog";
import { CommitDetails } from "../components/commits/CommitDetails";
import { 
  listBranchFiles, getBranchFileContent, getLastCommitForPath, 
  listDirectory, getPathHistory, getCommitDetails, getBranchFileMetadata 
} from "../services/gitService";
import { FileSidebar } from "../components/files/FileSidebar";
import { FileViewerContainer } from "../components/files/FileViewerContainer";

export default function FileList(props: { repo: Repo }) {
  const [sidebarWidth, setSidebarWidth] = createSignal(300);
  const [isResizing, setIsResizing] = createSignal(false);
  const [selectedBranch, setSelectedBranch] = createSignal(props.repo.activeBranch || "");
  const [branchFiles, setBranchFiles] = createSignal<{path: string, status: string}[]>([]);
  const [selectedFilePath, setSelectedFilePath] = createSignal<string[]>([]);
  const [fileContent, setFileContent] = createSignal<string | null>(null);
  const [lastCommit, setLastCommit] = createSignal<Commit | null>(null);
  const [directoryContent, setDirectoryContent] = createSignal<FileEntry[] | null>(null);
  const [pathHistory, setPathHistory] = createSignal<Commit[] | null>(null);
  const [isImage, setIsImage] = createSignal(false);
  const [fileMeta, setFileMeta] = createSignal<{size: number, lines: number | null} | null>(null);
  const [showModalCommitDetails, setModalCommitDetails] = createSignal(false);
  const [selectedCommit, setSelectedCommit] = createSignal<any>(null);
  const [showHistory, setShowHistory] = createSignal(false);
  const [searchTerm, setSearchTerm] = createSignal("");
  const [isBinary, setIsBinary] = createSignal(false);
  
  const { t, locale } = useApp();
  const { showLoading, hideLoading } = useLoading();

  const UNSUPPORTED_EXTENSIONS = ['.zip', '.rar', '.7z', '.tar', '.gz', '.exe', '.bin', '.mp4', '.mkv', '.mov', '.mp3', '.ogg', '.avi', '.ds_store', '.ifc', '.bim'];

  // Limpa estados ao trocar de Repositório
  createEffect(() => {
    props.repo.path;
    setSelectedBranch(props.repo.activeBranch || "");
    setFileContent(null);
    setBranchFiles([]);
  });

  createEffect(() => {
    const active = showHistory();
    const actualPath = selectedFilePath()[0];
    
    // Se o histórico foi aberto e temos um arquivo selecionado, busca os dados
    if (active && actualPath !== undefined) {
      getPathHistoryAsync(actualPath);
    }
  });

  // Busca inicial de arquivos na branch
  createEffect(async () => {
    const branch = selectedBranch();
    const repoPath = props.repo.path;
    if (!branch || !repoPath) return;

    showLoading(t('loading').loading_file);
    try {
      const files: string[] = await listBranchFiles(repoPath, branch);
      setBranchFiles(files.map(f => ({ path: f, status: "A" })));
      setSelectedFilePath([""]);
      setFileContent("");
      setShowHistory(false);
      await getDirectoryContent("");
      await getLastCommit("");
    } catch (e) {
      console.error(e);
    } finally {
      hideLoading();
    }
  });

  const handleFileClick = async (path: string, isFile: boolean) => {
    if (isFile) {
      const extension = path.substring(path.lastIndexOf('.')).toLowerCase();
      const unsupported = UNSUPPORTED_EXTENSIONS.includes(extension);
      setIsBinary(unsupported);

      if (unsupported) {
        setFileContent("");
        setIsImage(false);
        setSelectedFilePath([path]);
        setDirectoryContent(null);
        const data = await getBranchFileMetadata(props.repo.path, selectedBranch(), path);
        setFileMeta({size: data.size, lines: 0});
        return; 
      }
      
      showLoading(t('loading').loading_file);
      try {
        const data = await getBranchFileContent(props.repo.path, selectedBranch(), path);
        setIsImage(data.isImage);
        setFileContent(data.content);
        setFileMeta({size: data.size, lines: data.lineCount});
        setSelectedFilePath([path]);
        setDirectoryContent(null);
      } catch (e) {
        setFileContent(t('error').load_file);
      } finally {
        hideLoading();
      }
    } else {
      setFileContent("");
      setSelectedFilePath([path]);
      getDirectoryContent(path);
    }

    if (path === "") setShowHistory(false);

    getLastCommit(path);
  };

  const handleGoBack = (currentPath: string) => {
    if (!currentPath || currentPath === "." || currentPath === "") return;
    const parts = currentPath.split('/');
    parts.pop();
    handleFileClick(parts.join('/'), false);
  };

  const getLastCommit = async (path: string) => {
    try {
      const lastCommitForFile = await getLastCommitForPath(props.repo.path, selectedBranch(), path);
      setLastCommit(lastCommitForFile);
    } catch {
      setLastCommit(null);
    }
  };

  const getPathHistoryAsync = async (path: string) => {
    try {
      const content = await getPathHistory(props.repo.path, selectedBranch(), path);
      setPathHistory(content);
    } catch {
      setPathHistory(null);
    }
  };

  const getDirectoryContent = async (path: string) => {
    try {
      const content = await listDirectory(props.repo.path, selectedBranch(), path);
      setDirectoryContent(content);
    } catch {
      setDirectoryContent(null);
    }
  };

  const filteredFiles = createMemo(() => {
    const term = searchTerm().toLowerCase();
    if (!term) return branchFiles();
    return branchFiles().filter((file) => file.path.toLowerCase().includes(term));
  });

  async function selectCommit(hash: string) {
    const details = await getCommitDetails(props.repo.path, hash);
    setSelectedCommit({ ...details, _ts: Date.now() });
    setModalCommitDetails(true);
  }

  return (
    <div class="flex h-full w-full select-none bg-gray-200 dark:bg-gray-900 text-gray-800 dark:text-gray-200"
      onMouseMove={(e) => isResizing() && setSidebarWidth(Math.min(600, Math.max(200, e.clientX)))}
      onMouseUp={() => setIsResizing(false)}
    >
      <FileSidebar 
        repo={props.repo}
        selectedBranch={selectedBranch()}
        searchTerm={searchTerm()}
        setSearchTerm={setSearchTerm}
        filteredFiles={filteredFiles()}
        selectedFilePath={selectedFilePath()}
        onBranchChange={(b) => { setSelectedBranch(b); setFileContent(null); setDirectoryContent(null); }}
        onFileClick={handleFileClick}
        sidebarWidth={sidebarWidth()}
        isResizing={isResizing()}
        setIsResizing={setIsResizing}
        t={t}
      />

      <FileViewerContainer 
        repoName={props.repo.name}
        selectedBranch={selectedBranch()}
        selectedFilePath={selectedFilePath()}
        fileContent={fileContent()}
        directoryContent={directoryContent()}
        pathHistory={pathHistory()}
        lastCommit={lastCommit()}
        fileMeta={fileMeta()}
        isImage={isImage()}
        isBinary={isBinary()}
        showHistory={showHistory()}
        setShowHistory={setShowHistory}
        onFileClick={handleFileClick}
        onGoBack={handleGoBack}
        onSelectCommit={selectCommit}
        t={t}
        locale={locale()}
      />

      <Dialog open={showModalCommitDetails()} title={t('commits').details} onClose={() => setModalCommitDetails(false)} bodyClass="p-0 h-full" width={'calc(100vw - 40px)'} height={'calc(100vh - 100px)'}>
        <CommitDetails commit={selectedCommit()} repoPath={props.repo.path} branch={selectedBranch() || ""} openParent={false} openProfile={true} selectCommit={selectCommit} />
      </Dialog>
    </div>
  );
}