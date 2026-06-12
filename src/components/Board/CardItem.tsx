import { createEffect, createResource, createSignal, Show } from "solid-js";
import { azureService } from "../../services/azure";
import { githubService } from "../../services/github";
import { GitProvider } from "../../utils/gitProvider";
import CardDetailsTab from "./CardDetailsTab";
import CardHistoryTab from "./CardHistoryTab";
import { useApp } from "../../context/AppContext";

type CardDetailViewProps = {
  cardId: string | number;
  provider: GitProvider;
  organization: string;
  repoPath: string;
  onClose: () => void;
};

export default function CardDetailView(props: CardDetailViewProps) {
  const [currentCardId, setCurrentCardId] = createSignal<string | number>(props.cardId);
  const { t } = useApp();
  
  createEffect(() => {
    setCurrentCardId(props.cardId);
  });

  const [cardData] = createResource(
    () => ({ id: currentCardId(), provider: props.provider }),
    async ({ id, provider }) => {
      if (provider === "github") {
        return await githubService.getUnifiedIssue(props.organization, props.repoPath, Number(id));
      } else {
        return await azureService.getUnifiedWorkItem(props.organization, props.repoPath, Number(id));
      }
    }
  );

  const [activeTab, setActiveTab] = createSignal<"details" | "history">("details");

  const handleNavigateToTask = (taskId: string | number) => {
    setCurrentCardId(taskId);
    setActiveTab("details");
  };

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={props.onClose}>
      <Show when={cardData()} keyed>
        {(card: any) => (
          <div 
            class={`relative w-full h-[92vh] flex flex-col p-6 bg-gray-100 dark:bg-gray-800 rounded-xl border border-y-gray-200 border-r-gray-200 dark:border-y-gray-700/70 dark:border-r-gray-700/70 shadow-2xl overflow-hidden border-l-[6px] ${
              card.state === 'Done' || card.state === 'Completed' 
                ? 'border-l-green-500' 
                : card.state === 'Active' || card.state === 'Doing' || card.state === 'In Progress'
                ? 'border-l-blue-500' 
                : 'border-l-gray-400 dark:border-l-gray-500'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* BOTÃO FECHAR */}
            <button type="button" onClick={props.onClose} class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 z-10 cursor-pointer">
              <i class="fa-solid fa-xmark text-lg"></i>
            </button>

            <div class="flex flex-col h-full overflow-hidden">
              {/* CABEÇALHO SUPERIOR */}
              <div class="flex flex-col gap-3 border-b border-gray-200 dark:border-gray-700 pb-3 shrink-0">
                <div class="flex items-center gap-2 text-xs font-bold uppercase text-gray-400">
                  <span class="bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-900/50">
                    {card.provider}
                  </span>
                  <span class="font-mono">#{card.number}</span>
                </div>
                
                <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{card.title}</h1>
                  
                  {/* SELETOR DE ABAS */}
                  <div class="flex bg-gray-200/60 dark:bg-gray-900/50 p-1 rounded-xl self-start lg:self-auto border border-gray-300/30">
                    <button
                      type="button"
                      onClick={() => setActiveTab("details")}
                      class={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                        activeTab() === "details"
                          ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                          : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                      }`}
                    >
                      <i class="fa-solid fa-circle-info"></i>
                      Details
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("history")}
                      class={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                        activeTab() === "history"
                          ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                          : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                      }`}
                    >
                      <i class="fa-solid fa-clock-rotate-left"></i>
                      {t('file').history}
                    </button>
                  </div>
                </div>
                
                {/* Metadados Básicos */}
                <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500 dark:text-gray-400 mt-1">
                  <span class={`px-2.5 py-0.5 rounded-full border text-[11px] font-bold uppercase ${card.stateColor}`}>
                    {card.state}
                  </span>
                  <div class="flex items-center gap-1.5">
                    <Show when={card.assignee?.avatarUrl} fallback={<i class="fa-solid fa-circle-user text-base text-gray-400"></i>}>
                      <img src={card.assignee?.avatarUrl} class="w-5 h-5 rounded-full" />
                    </Show>
                    <span class="font-semibold text-gray-700 dark:text-gray-200">{card.assignee?.name || "Sem responsável"}</span>
                  </div>
                  <span class="border-l border-gray-300 dark:border-gray-700 pl-3">{t('common').created_at} {new Date(card.createdAt).toLocaleDateString()}</span>
                </div>
              </div>

              {/* CONTEÚDO DINÂMICO DAS ABAS MODULARIZADAS */}
              <div class="flex-1 overflow-hidden">
                <Show when={activeTab() === "details"}>
                  <CardDetailsTab 
                    card={card} 
                    organization={props.organization} 
                    repoPath={props.repoPath}
                    onNavigateTask={handleNavigateToTask}
                  />
                </Show>

                <Show when={activeTab() === "history"}>
                  <CardHistoryTab 
                    cardId={card.number} 
                    organization={props.organization} 
                    repoPath={props.repoPath} 
                    onNavigateTask={handleNavigateToTask}
                  />
                </Show>
              </div>
              
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}