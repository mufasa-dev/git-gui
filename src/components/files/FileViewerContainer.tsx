import { Show, For, Switch, Match } from "solid-js";
import { Commit, FileEntry } from "../../models/Commit.model";
import { Breadcrumb } from "../ui/Breadcrumb";
import { getGravatarUrl } from "../../services/gravatarService";
import CommitMessage from "../ui/CommitMessage";
import { formatRelativeDate } from "../../utils/date";
import FileIcon from "../ui/FileIcon";
import { formatSize } from "../../utils/file";
import CodePreviewer from "../ui/CodePreviewer";

interface FileViewerContainerProps {
  repoName: string;
  selectedBranch: string;
  selectedFilePath: string[];
  fileContent: string | null;
  directoryContent: FileEntry[] | null;
  pathHistory: Commit[] | null;
  lastCommit: Commit | null;
  fileMeta: { size: number; lines: number | null } | null;
  isImage: boolean;
  isBinary: boolean;
  showHistory: boolean;
  setShowHistory: (show: boolean) => void;
  onFileClick: (path: string, isFile: boolean) => void;
  onGoBack: (currentPath: string) => void;
  onSelectCommit: (hash: string) => void;
  t: any;
  locale: any;
}

export function FileViewerContainer(props: FileViewerContainerProps) {
  const getSelectedFileName = () => props.selectedFilePath.length > 0 ? props.selectedFilePath[0] : "text.png";

  return (
    <div class="flex-1 flex flex-col overflow-hidden pt-2 pb-2 pr-2 height-container">
      <div class="flex-1 flex flex-col container-branch-list overflow-auto">
        <Show when={props.fileContent !== null} fallback={
          <div class="flex-1 flex items-center justify-center opacity-30 italic text-sm">
            Selecione um arquivo na branch {props.selectedBranch}
          </div>
        }>
          <div class="flex items-center pr-2">
            <Show when={props.selectedFilePath[0]}>
              <Breadcrumb 
                path={props.selectedFilePath[0] || ''} 
                repoName={props.repoName} 
                onNavigate={(path) => props.onFileClick(path, false)} 
              />
              <button 
                class="bg-transparent border-0 ml-auto flex items-center justify-end w-[200px] hover:text-blue-500" 
                onClick={() => props.setShowHistory(!props.showHistory)}
              >
                <Show when={!props.showHistory} fallback={<><i class="fa-solid fa-folder mr-2"></i> {props.t('file').files}</>}>
                  <i class="fa-solid fa-clock-rotate-left mr-2" /> {props.t('file').history}
                </Show>
              </button>
            </Show>
          </div>

          {/* Último Commit */}
          <Show when={props.lastCommit && !props.showHistory}>
            <div class="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-xl text-xs font-mono flex items-center gap-2">
              <img src={getGravatarUrl(props.lastCommit?.email || '', 80)} alt={props.lastCommit?.author} class="w-[18px] h-[18px] rounded-full shadow-sm" />
              <b class="text-sm font-mono">{props.lastCommit?.author}</b>
              <span class="truncate clicked_label" onClick={() => props.onSelectCommit(props.lastCommit?.hash || '')}>
                <CommitMessage message={props.lastCommit?.message || ''} />
              </span>
              <span class="ml-auto clicked_label" onClick={() => props.onSelectCommit(props.lastCommit?.hash || '')}>
                {props.lastCommit?.hash.slice(0, 7)}
              </span>
              <div class="text-xs w-[220px] text-right truncate">{formatRelativeDate(props.lastCommit?.date || '', props.t, props.locale)}</div>
            </div>
          </Show>

          {/* Lista de Diretórios */}
          <Show when={props.directoryContent && !props.showHistory}>
            <div class="overflow-auto rounded-lg border border-gray-300 dark:border-gray-700">
              <table class="w-full text-left border-collapse table-striped">
                <thead class="sticky top-0 left-0">
                  <tr class="border-b border-gray-300 bg-gray-200 dark:border-gray-700 dark:bg-gray-700">
                    <th class="p-2 font-semibold">{props.t('common').name}</th>
                    <th class="p-2 font-semibold">{props.t('commits').last_commit}</th>
                    <th class="p-2 font-semibold text-right">{props.t('commits').commit_date}</th>
                  </tr>
                </thead>
                <tbody>
                  <Show when={props.selectedFilePath[0]}>
                    <tr onClick={() => props.onGoBack(props.selectedFilePath[0])}>
                      <td class="p-2" colspan={3}>
                        <div class="flex items-center gap-2"><i class="fa text-yellow-600 fa-folder"></i><span>...</span></div>
                      </td>
                    </tr>
                  </Show>
                  <For each={props.directoryContent}>
                    {(d) => (
                      <tr onClick={() => props.onFileClick(d.path, !d.isDir)}>
                        <td class="p-2 flex items-center gap-2">
                          {d.isDir ? <i class="fa text-yellow-600 fa-folder"></i> : <FileIcon fileName={d.name} />}
                          <span class="truncate max-w-[200px]">{d.name}</span>
                        </td>
                        <td class="p-2 text-gray-400 text-sm italic"><CommitMessage message={d.lastCommit?.message || ''} /></td>
                        <td class="p-2 text-gray-500 dark:text-gray-400 text-xs text-right">
                          {d.lastCommit?.date ? formatRelativeDate(d.lastCommit.date, props.t, props.locale) : '--'}
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>

          {/* Visualizador de Arquivo */}
          <Show when={props.fileContent !== null && !props.showHistory && !props.directoryContent}>
            <div class={`border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 flex flex-col min-h-[300px] ${(props.isImage || props.isBinary) ? "items-center justify-center overflow-auto" : ""}`}>
              <div class={`bg-gray-300 dark:bg-gray-700 p-2 w-full rounded-t-xl flex items-center gap-2 ${(props.isImage || props.isBinary) && 'mb-auto'}`}>
                <FileIcon fileName={getSelectedFileName()} />
                <Show when={!props.isImage && !props.isBinary}>
                  <b>{(props.fileMeta?.lines || 0)} {props.t('file').lines}</b><span>-</span>
                </Show>
                <span>{formatSize(props.fileMeta?.size || 0)}</span>
              </div>

              <Switch>
                <Match when={props.isBinary}>
                  <div class="p-20 flex flex-col items-center justify-center text-center gap-4 mb-auto">
                    <i class="fa-solid fa-file-zipper text-6xl opacity-20"></i>
                    <div>
                      <p class="text-lg font-semibold">Visualização indisponível</p>
                      <p class="text-sm opacity-60">Arquivos do tipo {props.selectedFilePath[0]?.split('.').pop()?.toUpperCase()} não podem ser exibidos.</p>
                    </div>
                  </div>
                </Match>
                <Match when={props.isImage}>
                  <div class="p-8 flex flex-col items-center gap-4 mb-auto">
                    <div class="bg-checkered p-4 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg shadow-black/20">
                      <img src={props.fileContent!} alt="Preview" class="max-w-full max-h-[500px] object-contain" />
                    </div>
                  </div>
                </Match>
                <Match when={!props.isImage && !props.isBinary}>
                  <CodePreviewer fileName={getSelectedFileName()} content={props.fileContent || ''} />
                </Match>
              </Switch>
            </div>
          </Show>

          {/* Histórico do Arquivo */}
          <Show when={props.showHistory && props.pathHistory}>
            <div class="mt-4 border border-gray-300 dark:border-gray-700 rounded-xl overflow-auto">
              <div class="flex items-center bg-gray-200 dark:bg-gray-700 rounded-t-xl p-2 mb-2">
                <i class="fa-solid fa-clock-rotate-left mr-2" /> {props.t('file').commit_history}
              </div>
              <div class="p-2">
                <For each={props.pathHistory}>
                  {(c) => (
                    <div class="cm-commit-item" onClick={() => props.onSelectCommit(c.hash)}>
                      <div class="text-sm font-mono opacity-80">{c.hash.slice(0, 7)}</div>
                      <div class="font-semibold px-2 flex-1 truncate"><CommitMessage message={c.message} /></div>
                      <div class="text-xs ml-auto whitespace-nowrap flex items-center gap-2 w-[200px]">
                        <img src={getGravatarUrl(c.email, 80)} alt={c.author} class="w-[18px] h-[18px] rounded shadow-sm" />
                        <span class="opacity-50 truncate">{c.author}</span>
                      </div>
                      <div class="px-2 text-xs w-[182px] text-right truncate">{formatRelativeDate(c.date, props.t, props.locale)}</div>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  );
}