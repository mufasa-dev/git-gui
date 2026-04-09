import { createResource, Show, For, createSignal, Switch, Match, createMemo } from "solid-js";
import { githubService } from "../../services/github";
import MarkdownViewer from "../ui/MarkdownViewer";
import PRFilesTab from "./PRFilesTab";
import PRCommitsView from "./PRCommitsView";
import PRChecksView from "./PRChecksView";
import PRTimelineView from "./PRTimelineView";
import { getRelativeTime } from "../../utils/date";
import CommitMessage from "../ui/CommitMessage";
import Dialog from "../ui/Dialog";
import { CommitDetails } from "../commits/CommitDetails";
import { getCommitDetails } from "../../services/gitService";
import { Repo } from "../../models/Repo.model";

export default function PRDetailView(props: { pr: any, owner: string, repo: Repo }) {
  const [activeTab, setActiveTab] = createSignal("Visão Geral");
  const [showModalCommitDetails, setModalCommitDetails] = createSignal(false);
  const [selectedCommit, setSelectedCommit] = createSignal<any>(null);
  
  const [details] = createResource(
    () => ({ owner: props.owner, name: props.repo.name, number: props.pr.number }),
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

  async function selectCommit(hash: string) {
    const details = await getCommitDetails(props.repo.path, hash);
    setSelectedCommit({ ...details, _ts: Date.now() });
    setModalCommitDetails(true);
  }

  const tabs = ['Visão Geral', 'Files', 'Commits', 'Checks'];

  return (
    <div class="flex flex-col h-full select-text transition-colors">
      {/* HEADER ESTILO TRIDENT */}
      <header class="container-branch-list p-4 mb-2">
        <div class="flex items-center justify-between mb-2">
          <h1 class="text-lg font-black text-gray-900 dark:text-white tracking-tight flex items-center">
            <CommitMessage message={props.pr.title} class="text-xl" />
            <span class="text-gray-500/50 dark:text-gray-400 ml-2">#{props.pr.number}</span>
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
            <span class="font-bold text-blue-500 dark:text-blue-400">Branch 2</span>
            <span class="text-gray-500 mx-2">→</span>
            <span class="font-mono text-blue-500 dark:text-blue-400">main</span><br />
            <span class="font-bold text-gray-900 dark:text-white">{props.pr.author?.login}</span>
            <span class="text-gray-400 uppercase ml-3 text-[9px] font-black italic">{getRelativeTime(props.pr.createdAt)}</span>
          </div>
        </div>
      </header>

      <div class="flex flex-1 overflow-hidden">
        <div class="flex-1 overflow-y-auto custom-scrollbar">
          <div class="h-full flex flex-col">
            
            {/* NAVEGAÇÃO DE ABAS */}
            <nav class="flex gap-6 border border-gray-100 dark:border-gray-700 rounded-t-xl px-4 bg-gray-300 dark:bg-gray-900">
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
                  <PRTimelineView 
                    owner={props.owner} 
                    repo={props.repo.name} 
                    pr={props.pr} 
                    details={details()}
                    currentUserAvatar={props.pr.author?.avatarUrl}
                    selectCommit={selectCommit}
                />
              </Match>

              {/* OUTRAS ABAS */}
              <Match when={activeTab() === 'Files'}>
                <PRFilesTab 
                    owner={props.owner} 
                    repoName={props.repo.name} 
                    prNumber={props.pr.number} 
                />
              </Match>
              <Match when={activeTab() === 'Commits'}>
                <PRCommitsView 
                    owner={props.owner} 
                    repoName={props.repo.name} 
                    prNumber={props.pr.number} 
                    selectCommit={selectCommit}
                />
              </Match>
              <Match when={activeTab() === 'Checks'}>
                <PRChecksView
                    owner={props.owner} 
                    repoName={props.repo.name} 
                    prNumber={props.pr.number} 
                />
              </Match>
            </Switch>
          </div>
        </div>

        {/* SIDEBAR DE METADADOS */}
        <aside class="container-branch-list w-72 ml-2 p-4 space-y-10">
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
      <Dialog open={showModalCommitDetails()}
              title="Detalhes co Commit"
              onClose={() => setModalCommitDetails(false)}
              bodyClass="p-0 h-full"
              width={'calc(100vw - 40px)'}
              height={'calc(100vh - 100px)'}>
        <CommitDetails commit={selectedCommit()} repoPath={props.repo.path} branch={""} openParent={false} selectCommit={selectCommit} />
      </Dialog>
    </div>
  );
}