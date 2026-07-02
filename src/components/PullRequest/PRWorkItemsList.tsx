import { For, Show, createSignal } from "solid-js";
import { WorkItemSearchSelector } from "../board/WorkItemSearchSelector";
import { GitProvider } from "../../utils/gitProvider";
import ConfirmModal from "../ui/ConfirmModal";
import { notify } from "../../utils/notifications";
import { azureService } from "../../services/azure";

interface WorkItem {
  id: number;
  url: string;
  title?: string;
  state?: string;
  updatedDate?: string;
  workItemType?: string;
  assignedTo?: string;
}

interface PRWorkItemsListProps {
  workItems: WorkItem[];
  projectId?: string;
  repositoryId?: string;
  owner: string;
  repoName: string;
  prNumber: number;
  provider: GitProvider;
  t: any;
  onWorkItemAdded: () => void;
  onWorkItemRemoved: () => void;
}

export function PRWorkItemsList(props: PRWorkItemsListProps) {
  const [openModalConfirm, setModalConfirmOpen] = createSignal<{ id: string } | null>(null);
  const [modalConfirmTitle, setModalConfirmTitle] = createSignal<string>("");
  const [modalConfirmMessage, setModalConfirmMessage] = createSignal<string>("");
  const [modalConfirmOnExecute, setModalConfirmOnExecute] = createSignal<() => void>(() => {});

  const handleRemove = (wi: WorkItem) => {
    setModalConfirmOpen({ id: String(wi.id) });
    setModalConfirmTitle("Remover Work Item");
    setModalConfirmMessage(`Deseja realmente remover o work item #${wi.id} deste Pull Request?`);
    setModalConfirmOnExecute(() => async () => {
      setModalConfirmOpen(null);
      try {
        if (props.provider === 'azure') {
          const projectId = props.projectId;
          const repositoryId = props.repositoryId;
          if (!projectId || !repositoryId) {
            alert('IDs do projeto/repositório não disponíveis.');
            return;
          }
          const success = await azureService.removeWorkItemFromPR(
            props.owner,
            projectId,
            repositoryId,
            props.prNumber,
            wi.id
          );
          if (success) {
            notify.success('Sucesso', 'Work item removido com sucesso.');
            props.onWorkItemRemoved();
          } else {
            notify.error('Erro', 'Erro ao remover work item.');
          }
        }
      } catch (e) {
        console.error(e);
        notify.error('Erro', 'Erro ao remover work item.');
      }
    });
  };

  return (
    <div>
      <div class="flex justify-between items-center mb-2 text-[10px] font-black uppercase text-gray-400 tracking-widest">
        <span>Work Items</span>
        <span class="text-[9px] font-normal text-gray-500">
          {props.workItems?.length || 0}
        </span>
      </div>

      <div class="relative w-full max-w-md">
        <WorkItemSearchSelector 
          provider={props.provider}
          org={props.owner}
          repo={props.repoName}
          t={props.t}
          onSelect={async (item) => {
            if (props.provider === 'azure') {
              const projectId = props.projectId;
              const repositoryId = props.repositoryId;
              if (!projectId || !repositoryId) {
                alert('IDs do projeto/repositório não disponíveis.');
                return;
              }
              const success = await azureService.addWorkItemToPR(
                props.owner,
                projectId,
                repositoryId,
                props.prNumber,
                item.id
              );
              if (success) {
                props.onWorkItemAdded();
              } else {
                notify.error('Erro', 'Erro ao adicionar work item.');
              }
            }
          }}
        />
      </div>

      <div class="space-y-3 mt-3">
        <Show when={props.workItems && props.workItems.length > 0}>
          <For each={props.workItems}>
            {(wi) => {
              const [isRemoving, setIsRemoving] = createSignal(false);
              return (
                <div class="flex items-center justify-between group p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
                  <div class="flex-1 min-w-0">
                    <a 
                      href={wi.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      class="flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate"
                    >
                      <i class={`fa-regular ${wi.workItemType === 'Issue' ? 'fa-circle' : wi.workItemType === 'Task' ? 'fa-check-square' : 'fa-rectangle-list'} text-gray-400 text-xs`}></i>
                      <span class="truncate">#{wi.id} - {wi.title}</span>
                    </a>
                    <div class="flex items-center gap-3 mt-1 text-[10px] text-gray-500">
                      <span class="flex items-center gap-1">
                        <span class={`inline-block w-1.5 h-1.5 rounded-full ${
                          wi.state === 'Doing' ? 'bg-blue-500' :
                          wi.state === 'Done' ? 'bg-green-500' :
                          wi.state === 'To Do' ? 'bg-gray-400' :
                          'bg-yellow-500'
                        }`}></span>
                        {wi.state}
                      </span>
                      <span class="flex items-center gap-1">
                        <i class="fa-regular fa-clock text-[8px]"></i>
                        {wi.updatedDate ? new Date(wi.updatedDate).toLocaleDateString('pt-BR', { 
                          day: '2-digit', 
                          month: 'short', 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        }) : ''}
                      </span>
                      {wi.assignedTo && (
                        <span class="flex items-center gap-1">
                          <i class="fa-regular fa-user text-[8px]"></i>
                          {wi.assignedTo}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemove(wi)}
                    disabled={isRemoving()}
                    class="ml-2 text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Remover work item do PR"
                  >
                    <Show when={!isRemoving()} fallback={<i class="fa-solid fa-spinner fa-spin"></i>}>
                      <i class="fa-regular fa-circle-xmark text-base"></i>
                    </Show>
                  </button>
                </div>
              );
            }}
          </For>
        </Show>
        <Show when={!props.workItems || props.workItems.length === 0}>
          <div class="text-[10px] text-gray-500 italic">Nenhum work item vinculado</div>
        </Show>
      </div>

      <Show when={openModalConfirm()}>
        <ConfirmModal
          isOpen={openModalConfirm() !== null}
          title={modalConfirmTitle()}
          message={modalConfirmMessage()}
          confirmText={props.t('common').delete}
          isDanger={true}
          onConfirm={() => modalConfirmOnExecute()()}
          onCancel={() => setModalConfirmOpen(null)}
        />
      </Show>
    </div>
  );
}