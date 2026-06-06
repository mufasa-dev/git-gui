import { createResource, Show } from "solid-js";
import { WorkItem } from "../../models/WorkItem";
import { githubService } from "../../services/github";
import { azureService } from "../../services/azure";
import MarkdownViewer from "../ui/MarkdownViewer";
import { GitProvider } from "../../utils/gitProvider";

type CardDetailViewProps = {
  cardId: string | number;
  provider: GitProvider;
  organization: string;
  repoPath: string;
  onClose: () => void; // 🎯 Evento obrigatório para fechar o modal
};

export default function CardDetailView(props: CardDetailViewProps) {
  
  const [cardData] = createResource(
    () => ({ id: props.cardId, provider: props.provider }),
    async ({ id, provider }) => {
      if (provider === "github") {
        return await githubService.getUnifiedIssue(props.organization, props.repoPath, Number(id));
      } else {
        return await azureService.getUnifiedWorkItem(props.organization, props.repoPath, Number(id));
      }
    }
  );

  return (
    /* 🎯 BACKDROP / OVERLAY: Fundo fixo semi-transparente */
    <div 
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={props.onClose} // Fecha ao clicar fora do modal
    >
      
      {/* 🎯 CORPO DO MODAL: Ajustado para max-w-5xl, bg-gray-100 / dark:bg-gray-800 e bordas limpas */}
      <div 
        class="relative w-full max-w-5xl max-h-[90vh] overflow-y-auto p-6 bg-gray-100 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700/70 shadow-2xl transition-all"
        onClick={(e) => e.stopPropagation()} // Impede o fechamento ao clicar dentro do card
      >
        
        {/* 🎯 BOTÃO FECHAR (X) */}
        <button 
          type="button"
          onClick={props.onClose}
          class="absolute top-4 right-4 flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
        >
          <i class="fa-solid fa-xmark text-lg"></i>
        </button>

        {/* Estado de Carregamento */}
        <Show when={!cardData.loading} fallback={
          <div class="flex flex-col items-center justify-center py-20 gap-3 text-gray-500">
            <i class="fa-solid fa-circle-notch animate-spin text-2xl text-blue-500"></i>
            <span class="text-xs font-semibold tracking-wide">Carregando detalhes do item...</span>
          </div>
        }>
          
          <Show when={cardData()} keyed fallback={
            <div class="text-center py-20 text-sm text-gray-500 dark:text-gray-400 font-medium">
              Não foi possível carregar os dados do cartão.
            </div>
          }>
            {(card: WorkItem) => (
              <div class="flex flex-col gap-6 pr-4">
                
                {/* CABEÇALHO DO CARD */}
                <div class="flex flex-col gap-3 border-b border-gray-200 dark:border-gray-700 pb-5">
                  <div class="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-400">
                    <span class={`flex items-center gap-1.5 px-2 py-0.5 rounded-md border ${
                      card.provider === 'github' 
                        ? 'bg-gray-200/60 dark:bg-gray-900/60 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700' 
                        : 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900/50'
                    }`}>
                      <i class={card.provider === 'github' ? 'fa-brands fa-github' : 'fa-solid fa-cloud'}></i>
                      {card.provider}
                    </span>
                    <span class="font-mono">#{card.number}</span>
                  </div>

                  {/* Título adaptado para o tamanho expandido */}
                  <h1 class="text-2xl font-bold text-gray-900 dark:text-white leading-snug max-w-[92%]">
                    {card.title}
                  </h1>

                  {/* Metadados de Status, Autor e Datas */}
                  <div class="flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-gray-400 mt-1">
                    <span class={`px-2.5 py-0.5 rounded-full border text-[11px] font-bold uppercase tracking-wider ${card.stateColor}`}>
                      {card.state}
                    </span>
                    
                    <div class="flex items-center gap-1.5">
                      <Show when={card.author.avatarUrl} fallback={<i class="fa-solid fa-circle-user text-base text-gray-400"></i>}>
                        <img src={card.author.avatarUrl} class="w-5 h-5 rounded-full border border-gray-300 dark:border-gray-600" />
                      </Show>
                      <span class="font-semibold text-gray-700 dark:text-gray-300">{card.author.name}</span>
                      <span>abriu este item</span>
                    </div>

                    <div class="flex items-center gap-1 text-gray-400 dark:text-gray-500">
                      <i class="fa-regular fa-clock"></i>
                      <span>{new Date(card.createdAt).toLocaleDateString()}</span>
                    </div>

                    <Show when={card.commentsCount > 0}>
                      <div class="flex items-center gap-1 text-gray-400 dark:text-gray-500">
                        <i class="fa-regular fa-comment"></i>
                        <span>{card.commentsCount} comentários</span>
                      </div>
                    </Show>
                  </div>
                </div>

                {/* CORPO / DETALHES (Grid de duas colunas) */}
                <div class="grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
                  
                  {/* Descrição Principal (Ocupa 3 colunas) */}
                  <div class="md:col-span-3 flex flex-col gap-2">
                    <h3 class="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Descrição</h3>
                    {/* Alterado para dar contraste sobre o fundo gray-100/gray-800 */}
                    <div class="p-4 bg-white dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700/80 rounded-xl min-h-[160px] shadow-inner">
                      <Show when={card.description.trim()} fallback={<p class="text-sm italic text-gray-400 dark:text-gray-500">Nenhuma descrição fornecida.</p>}>
                        <MarkdownViewer content={card.description} />
                      </Show>
                    </div>
                  </div>

                  {/* Barra Lateral de Responsáveis (Ocupa 1 coluna) */}
                  <div class="md:col-span-1 flex flex-col gap-4 p-4 border border-gray-200 dark:border-gray-700 rounded-xl bg-white/50 dark:bg-gray-900/30 shadow-sm">
                    <div>
                      <h4 class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">Atribuído a</h4>
                      <Show when={card.assignee} fallback={
                        <span class="text-xs italic text-gray-400 dark:text-gray-500 flex items-center gap-1.5">
                          <i class="fa-solid fa-user-slash"></i> Nenhum responsável
                        </span>
                      }>
                        <div class="flex items-center gap-2">
                          <Show when={card.assignee?.avatarUrl} fallback={<i class="fa-solid fa-circle-user text-xl text-gray-400 dark:text-gray-500"></i>}>
                            <img src={card.assignee?.avatarUrl} class="w-6 h-6 rounded-full border border-gray-200 dark:border-gray-600" />
                          </Show>
                          <span class="text-xs font-semibold text-gray-700 dark:text-gray-300">
                            {card.assignee?.name}
                          </span>
                        </div>
                      </Show>
                    </div>
                  </div>

                </div>

              </div>
            )}
          </Show>
        </Show>
      </div>
    </div>
  );
}