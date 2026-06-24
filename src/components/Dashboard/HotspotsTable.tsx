import { createResource, createSignal, For, Show } from "solid-js";
import { getBranchFileContent, getBranchFileMetadata, getMostModifiedFiles, getUserMostModifiedFiles } from "../../services/gitService";
import FileIcon from "../ui/FileIcon";
import { useApp } from "../../context/AppContext";
import Dialog from "../ui/Dialog";
import { FileViewerContainer } from "../files/FileViewerContainer";
import { Repo } from "../../models/Repo.model";
import { useLoading } from "../ui/LoadingContext";
import { UNSUPPORTED_EXTENSIONS } from "../../utils/file";

interface Props {
  path: string;
  repo: Repo;
  branch: string;
  email?: string;
  selectCommit: (hash: string) => void
}

export default function HotspotsTable(props: Props) {
  const [showFileModal, setShowFileModal] = createSignal(false);
  const [selectedFile, setSelectedFile] = createSignal({} as { name: string });
  const [fileContent, setFileContent] = createSignal<string | null>(null);
  const [isImage, setIsImage] = createSignal(false);
  const [isBinary, setIsBinary] = createSignal(false);
  const [selectedFilePath, setSelectedFilePath] = createSignal<string[]>([]);
  const [fileMeta, setFileMeta] = createSignal<{size: number, lines: number | null} | null>(null);
  const { t, locale } = useApp();
  const { showLoading, hideLoading } = useLoading();

  const [hotspots] = createResource(
    () => ({ path: props.path, branch: props.branch }),
    async (params) => {
      if (!params.path || !params.branch) return [];
      if (props.email) {
        return await getUserMostModifiedFiles(params.path, params.branch, props.email);
      }
      return await getMostModifiedFiles(params.path, params.branch);
    }
  );

  const handleFileClick = async (path: string) => {
    const extension = path.substring(path.lastIndexOf('.')).toLowerCase();
    const unsupported = UNSUPPORTED_EXTENSIONS.includes(extension);
    setIsBinary(unsupported);

    if (unsupported) {
      setFileContent("");
      setIsImage(false);
      setSelectedFilePath([path]);
      const data = await getBranchFileMetadata(props.repo.path, props.repo.activeBranch!, path);
      setFileMeta({size: data.size, lines: 0});
      return; 
    }
    
    showLoading(t('loading').loading_file);
    try {
      const data = await getBranchFileContent(props.repo.path, props.repo.activeBranch!, path);
      setIsImage(data.isImage);
      setFileContent(data.content);
      setFileMeta({size: data.size, lines: data.lineCount});
      setSelectedFilePath([path]);
      setSelectedFile({name: path});
      setShowFileModal(true);
    } catch (e) {
      setFileContent(t('error').load_file);
    } finally {
      hideLoading();
    }
  }

  return (
    <div class="p-2 h-full flex flex-col overflow-hidden">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-bold text-black dark:text-white tracking-widest flex items-center gap-2">
          <i class="fa-solid fa-fire text-orange-500"></i>
          {t('dashboard').hotspots}
        </h3>
        <Show when={hotspots.loading}>
          <div class="w-3 h-3 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
        </Show>
      </div>

      <div class="flex-1 overflow-auto custom-scrollbar rounded-lg border border-gray-300 dark:border-gray-700">
        <table class="table-striped">
          <thead>
            <tr>
              <th class="text-[10px]">{t('file').file}</th>
              <th class="text-right text-[10px]">{t('file').updates}</th>
            </tr>
          </thead>
          <tbody>
            <For each={hotspots()} fallback={
              <tr>
                <td colspan="2" class="text-center py-10 text-xs text-gray-500 italic">
                  {t('common').no_data}
                </td>
              </tr>
            }>
              {(file) => (
                <tr class="group" onClick={() => handleFileClick(file.name)}>
                  <td class="max-w-[200px]">
                    <div class="flex flex-col">
                      <span class="truncate text-xs text-gray-900 dark:text-gray-200 font-mono group-hover:text-blue-400 transition-colors flex items-center gap-1">
                        <FileIcon fileName={file.name.split('/').pop()} /> {file.name.split('/').pop()}
                      </span>
                      <span class="text-[9px] text-gray-800 dark:text-gray-400 truncate">
                        {file.name.split('/').slice(0, -1).join('/') || './'}
                      </span>
                    </div>
                  </td>
                  <td class="text-right">
                    <div class="flex items-center justify-end gap-2">
                      <span class="text-xs font-bold text-orange-400 font-mono">
                        {file.count}
                      </span>
                      {/* Pequena barra visual de intensidade */}
                      <div class="w-12 h-1.5 bg-gray-300 dark:bg-gray-900 rounded-full overflow-hidden hidden sm:block">
                        <div 
                          class="h-full bg-orange-500/50" 
                          style={{ 
                            width: `${Math.min((file.count / (hotspots()?.[0]?.count || 1)) * 100, 100)}%` 
                          }}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>

      <div class="mt-3 text-[9px] text-gray-600 dark:text-gray-200 italic">
        * {t('dashboard').basead_activit_branch}
      </div>

      <Show when={showFileModal()}>
        <Dialog
            open={true}
            onClose={() => setShowFileModal(false)}
            title={selectedFile()?.name.split('/').pop()}
            width="calc(100% - 30px)" bodyClass="p-2"
        >
          <FileViewerContainer
            repoName={props.repo.name}
            selectedBranch={props.repo.activeBranch!}
            selectedFilePath={selectedFilePath()}
            fileContent={fileContent()}
            directoryContent={null}
            pathHistory={null}
            lastCommit={null}
            fileMeta={fileMeta()}
            isImage={isImage()}
            isBinary={isBinary()}
            showHistory={false}
            setShowHistory={() => {}}
            onFileClick={() => {}}
            onGoBack={() => {}}
            onSelectCommit={props.selectCommit}
            t={t}
            locale={locale()}
          />
        </Dialog>
      </Show>
    </div>
  );
}