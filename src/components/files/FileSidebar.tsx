import { createMemo, Show } from "solid-js";
import { Repo } from "../../models/Repo.model";
import { SearchableSelect, SearchableSelectOption } from "../ui/SearchableSelect";
import { FolderTreeView } from "../ui/FolderTreeview";

interface FileSidebarProps {
  repo: Repo;
  selectedBranch: string;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  filteredFiles: { path: string; status: string }[];
  selectedFilePath: string[];
  onBranchChange: (branch: string) => void;
  onFileClick: (path: string, isFile: boolean) => void;
  sidebarWidth: number;
  isResizing: boolean;
  setIsResizing: (resizing: boolean) => void;
  t: any;
}

export function FileSidebar(props: FileSidebarProps) {
  const allBranchOptions = createMemo(() => {
    const options: SearchableSelectOption[] = [];

    if (props.repo.branches?.length > 0) {
      options.push({ value: 'header-local', label: props.t('git').local, disabled: true });
      props.repo.branches.forEach(b => options.push({ value: b.name, label: b.name }));
    }

    if ((props.repo.remoteBranches?.length ?? 0) > 0) {
      options.push({ value: 'header-remote', label: props.t('git').remote, disabled: true });
      props.repo.remoteBranches?.forEach(rb => options.push({ value: rb, label: rb }));
    }

    return options;
  });

  return (
    <>
      <div 
        class="flex flex-col border-r overflow-auto border-gray-300 pt-2 pb-2 pl-2 dark:border-gray-900 height-container"  
        style={{ width: `${props.sidebarWidth}px` }}
      >
        <div class="container-branch-list p-0 overflow-auto h-full">
          <div class="p-3 border-b border-gray-300 dark:border-gray-700">
            <SearchableSelect 
              options={allBranchOptions()}
              initialValue={props.selectedBranch}
              placeholder="Buscar branch..."
              onSelect={props.onBranchChange}
              class="mb-4 w-full"
            />

            <div class="relative">
              <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
              <input
                type="text"
                placeholder={props.t('file').search_files + '...'}
                class="w-full pl-8 pr-2 py-1 text-sm bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={props.searchTerm}
                onInput={(e) => props.setSearchTerm(e.currentTarget.value)}
              />
              <Show when={props.searchTerm}>
                <button 
                  class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => props.setSearchTerm("")}
                >
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </Show>
            </div>
          </div>
          
          <div class="flex-1 overflow-auto">
            <FolderTreeView 
              items={props.filteredFiles} 
              selected={props.selectedFilePath} 
              staged={false} 
              defaultOpen={props.searchTerm.length > 1}
              showStatus={false} 
              selectMode="single"
              onToggle={(path, _selected, isFile) => props.onFileClick(path, isFile)}
            />        
          </div>
        </div>
      </div>
      <div class="resize-bar-vertical" onMouseDown={() => props.setIsResizing(true)} />
    </>
  );
}