import { createResource, Show, For, createSignal, Switch, Match, createMemo } from "solid-js";
import { githubService } from "../../services/github";
import MarkdownViewer from "../ui/MarkdownViewer";
import PRFilesTab from "./PRFilesTab";
import PRCommitsView from "./PRCommitsView";

const ChecksTab = () => <div class="p-4 text-gray-400 font-bold uppercase text-[10px]">Status do CI/CD</div>;

export default function PRDetailView(props: { pr: any, owner: string, repoName: string }) {
  const [comment, setComment] = createSignal("");
  const [activeTab, setActiveTab] = createSignal("Visão Geral"); // Estado da Aba
  
  const [details] = createResource(
    () => ({ owner: props.owner, name: props.repoName, number: props.pr.number }),
    async (p) => await githubService.getPullRequestDescription(p.owner, p.name, p.number)
  );

  const additionsWidth = () => {
    const total = (details()?.additions || 0) + (details()?.deletions || 0);
    return total === 0 ? 50 : (details()?.additions / total) * 100;
  };

  const reviewersList = createMemo(() => {
    const data = details();
    if (!data) return [];

    const list: any[] = [];

    // 1. Adiciona quem já revisou
    data.reviews?.nodes?.forEach((review: any) => {
      // Evita duplicados, pegando sempre o estado mais recente
      const existing = list.find(r => r.login === review.author.login);
      if (existing) {
        existing.state = review.state;
      } else {
        list.push({
          login: review.author.login,
          avatarUrl: review.author.avatarUrl,
          name: review.author.name,
          state: review.state, // APPROVED, CHANGES_REQUESTED, COMMENTED
        });
      }
    });

    // 2. Adiciona quem foi solicitado e ainda não fez nada
    data.reviewRequests?.nodes?.forEach((req: any) => {
      const user = req.requestedReviewer;
      if (!list.find(r => r.login === user.login)) {
        list.push({
          login: user.login,
          avatarUrl: user.avatarUrl,
          name: user.name,
          state: "PENDING",
        });
      }
    });

    return list;
  });

  const tabs = ['Visão Geral', 'Files', 'Commits', 'Checks'];

  return (
    <div class="flex flex-col h-full select-text transition-colors">
      {/* HEADER ESTILO TRIDENT */}
      <header class="container-branch-list p-6 mb-2 border-b border-gray-200 dark:border-gray-700">
        <div class="flex items-center justify-between mb-2">
          <h1 class="text-2xl font-black text-gray-900 dark:text-white tracking-tight">
            {props.pr.title} <span class="text-gray-500/50 ml-2 font-mono text-lg">#{props.pr.number}</span>
          </h1>
          <button class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all shadow-lg shadow-blue-500/20">
            <i class="fa-solid fa-check"></i> Approve
          </button>
        </div>
        
        <div class="flex items-center gap-3 mt-4">
          <span class="px-3 py-1 rounded-full bg-purple-500/10 text-purple-500 dark:text-purple-400 text-[10px] font-black uppercase tracking-widest border border-purple-500/20">
            {props.pr.state}
          </span>
          <div class="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden border border-gray-300 dark:border-gray-600">
            <img src={props.pr.author?.avatarUrl} alt={props.pr.author?.login} />
          </div>
          <div class="text-xs">
            <span class="font-bold text-gray-900 dark:text-white">{props.pr.author?.login}</span>
            <span class="text-gray-500 mx-2">→</span>
            <span class="font-mono text-blue-500 dark:text-blue-400">main</span>
            <span class="text-gray-400 ml-3 uppercase text-[9px] font-black italic">4h atrás</span>
          </div>
        </div>
      </header>

      <div class="flex flex-1 overflow-hidden">
        <div class="flex-1 overflow-y-auto custom-scrollbar">
          <div class="h-full flex flex-col">
            
            {/* NAVEGAÇÃO DE ABAS */}
            <nav class="flex gap-6 border border-gray-200 dark:border-gray-700 rounded-t-xl px-4 dark:bg-gray-900">
              <For each={tabs}>
                {(tab) => (
                  <button 
                    onClick={() => setActiveTab(tab)}
                    class={`pb-3 pt-2 px-2 text-[11px] font-black uppercase tracking-widest transition-all ${
                      activeTab() === tab 
                      ? 'bg-gray-200 dark:bg-gray-700 dark:text-white' 
                      : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
                    }`}
                  >
                    {tab}
                  </button>
                )}
              </For>
            </nav>

            {/* RENDERIZAÇÃO CONDICIONAL DO CONTEÚDO */}
            <Switch>
              {/* ABA: VISÃO GERAL */}
              <Match when={activeTab() === 'Visão Geral'}>
                <div class="flex-1 space-y-8 p-2 animate-in fade-in slide-in-from-bottom-2 duration-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-b-xl">
                  {/* BARRA DE PROGRESSO */}
                  <div class="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50 rounded-xl p-5">
                    <div class="flex justify-between items-end mb-3">
                      <span class="text-lg font-black text-gray-900 dark:text-white">
                        {details()?.changedFiles || 0} <span class="text-[10px] text-gray-400 font-black uppercase ml-1 tracking-widest">arquivos</span>
                      </span>
                      <div class="flex gap-4 font-mono font-bold text-xs">
                        <span class="text-green-500">+{details()?.additions || 0}</span>
                        <span class="text-red-500">-{details()?.deletions || 0}</span>
                      </div>
                    </div>
                    <div class="h-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden flex">
                      <div class="h-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)] transition-all duration-500" style={{ width: `${additionsWidth()}%` }}></div>
                      <div class="h-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)] transition-all duration-500" style={{ width: `${100 - additionsWidth()}%` }}></div>
                    </div>
                  </div>

                  {/* TIMELINE */}
                  <div class="space-y-6">
                    <h3 class="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Linha do Tempo</h3>
                    <div class="relative border-l-2 border-gray-200 dark:border-gray-600 ml-4 pl-8 space-y-8">
                      <div class="relative">
                        <div class="absolute -left-[35px] top-0 w-[12px] h-[12px] rounded-full bg-blue-500 border-4 border-gray-200 dark:border-gray-600"></div>
                        <p class="text-xs font-bold text-gray-500">Pull request aberto por <span class="text-gray-900 dark:text-white font-black">{props.pr.author?.login}</span> <span class="ml-4 opacity-30 font-mono">10:18</span></p>
                      </div>

                      {/* COMENTÁRIO */}
                      <div class="bg-gray-50 dark:bg-gray-800/30 border border-gray-200 dark:border-gray-700/50 rounded-xl overflow-hidden shadow-sm">
                         <div class="p-5 flex gap-4">
                            <div class="w-10 h-10 rounded-lg bg-blue-500/20 text-blue-500 flex items-center justify-center font-black">BR</div>
                            <div class="flex-1">
                               <div class="flex justify-between items-center mb-2">
                                  <span class="text-xs font-black text-gray-900 dark:text-white">Bruno Ribeiro <span class="text-[9px] text-gray-400 font-normal ml-2 lowercase">há 1h</span></span>
                                  <span class="text-[10px] text-gray-400 font-mono">10:18</span>
                               </div>
                               <div class="text-sm text-gray-600 dark:text-gray-300 leading-relaxed italic">
                                  "Isso aqui pode ser refatorado para usar o novo service de context menu."
                               </div>
                               <div class="flex gap-4 mt-4 text-[9px] font-black uppercase tracking-widest text-gray-400">
                                  <button class="hover:text-blue-500 transition-colors"><i class="fa-solid fa-reply mr-1"></i> Responder</button>
                                  <button class="hover:text-pink-500 transition-colors"><i class="fa-solid fa-heart mr-1"></i> Curtir</button>
                               </div>
                            </div>
                         </div>
                      </div>
                    </div>
                  </div>

                  {/* INPUT DE COMENTÁRIO */}
                  <div class="ml-12 bg-gray-50 dark:bg-gray-800/50 border border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-4 flex gap-4">
                      <div class="w-8 h-8 rounded-full bg-gray-400 dark:bg-gray-600 flex-shrink-0 border border-white dark:border-gray-700 shadow-sm"></div>
                      <div class="flex-1 relative">
                          <textarea 
                              placeholder="Adicione um comentário à discussão..."
                              value={comment()}
                              onInput={(e) => setComment(e.currentTarget.value)}
                              class="w-full bg-transparent text-sm text-gray-700 dark:text-gray-200 outline-none min-h-[80px] resize-none p-2"
                          ></textarea>
                          <button class="absolute bottom-2 right-2 bg-gray-900 dark:bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded text-[10px] font-black uppercase tracking-widest transition-all active:scale-95">
                              Enviar
                          </button>
                      </div>
                  </div>
                </div>
              </Match>

              {/* OUTRAS ABAS */}
              <Match when={activeTab() === 'Files'}>
                <PRFilesTab 
                    owner={props.owner} 
                    repoName={props.repoName} 
                    prNumber={props.pr.number} 
                />
              </Match>
              <Match when={activeTab() === 'Commits'}>
                <PRCommitsView 
                    owner={props.owner} 
                    repoName={props.repoName} 
                    prNumber={props.pr.number} 
                />
              </Match>
              <Match when={activeTab() === 'Checks'}><ChecksTab /></Match>
            </Switch>
          </div>
        </div>

        {/* SIDEBAR DE METADADOS */}
        <aside class="container-branch-list w-72 ml-2 border-l border-gray-200 dark:border-gray-700 p-4 space-y-10 bg-gray-50/50 dark:bg-gray-800">
          <div>
            <div class="flex justify-between items-center mb-6 text-[10px] font-black uppercase text-gray-400 tracking-widest">
              <span>Reviewers</span>
              <i class="fa-solid fa-gear hover:text-blue-500 cursor-pointer transition-colors"></i>
            </div>
            
            <div class="space-y-5">
              <For each={reviewersList()}>
                {(reviewer) => (
                  <div class="flex items-center justify-between group">
                    <div class="flex items-center gap-3">
                      <div class="relative">
                        <img 
                          src={reviewer.avatarUrl} 
                          class="w-8 h-8 rounded-lg border border-gray-200 dark:border-gray-700" 
                        />
                        {/* Indicador de status visual sobre o avatar ou ao lado */}
                      </div>
                      <div class="flex flex-col">
                        <span class="text-xs font-bold text-gray-700 dark:text-gray-200">
                          {reviewer.name || reviewer.login}
                        </span>
                        <span class="text-[9px] text-gray-500 uppercase font-black tracking-tighter">
                          {reviewer.state.replace('_', ' ')}
                        </span>
                      </div>
                    </div>

                    {/* Ícones de Status Dinâmicos */}
                    <Switch>
                      <Match when={reviewer.state === 'APPROVED'}>
                        <i class="fa-solid fa-circle-check text-green-500 text-sm shadow-[0_0_8px_rgba(34,197,94,0.4)]"></i>
                      </Match>
                      <Match when={reviewer.state === 'CHANGES_REQUESTED'}>
                        <i class="fa-solid fa-circle-exclamation text-red-500 text-sm"></i>
                      </Match>
                      <Match when={reviewer.state === 'PENDING'}>
                        <div class="flex gap-1 items-center">
                          <span class="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse"></span>
                        </div>
                      </Match>
                      <Match when={reviewer.state === 'COMMENTED'}>
                        <i class="fa-solid fa-comment-dots text-gray-400 text-sm"></i>
                      </Match>
                    </Switch>
                  </div>
                )}
              </For>
              
              <Show when={reviewersList().length === 0}>
                <div class="text-[10px] text-gray-500 italic">Nenhum revisor solicitado</div>
              </Show>
            </div>
          </div>

          <div>
            <div class="flex justify-between items-center mb-6 text-[10px] font-black uppercase text-gray-400 tracking-widest">
              <span>Participantes</span>
            </div>
            <div class="flex flex-col flex-wrap gap-2">
              <For each={details()?.participants?.nodes}>
                {(p: any) => (<div class="flex items-center gap-3">
                  <img class="w-7 h-7 rounded-full border-2 border-gray-200 dark:border-gray-600 
                        hover:scale-110 transition-transform" 
                        src={p.avatarUrl} title={p.login} 
                  />
                  <span>{p.login}</span>
                </div>

                )}
              </For>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}