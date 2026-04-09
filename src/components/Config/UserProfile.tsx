import { createSignal, createResource, Show, For, createMemo } from "solid-js";
import { getGravatarProfile, getGravatarUrl } from "../../services/gravatarService";
import Dialog from "../ui/Dialog";
import { getUserCommits } from "../../services/gitService";
import ContributionGraph from "../Dashboard/ContributionGraph";
import ActivityChart from "../Dashboard/ActivityChart";
import HourlyActivityChart from "../Dashboard/HourlyActivityChart";
import CommitMessage from "../ui/CommitMessage";
import { openBrowser } from "../../services/openService";
import CommitTypeDistribution from "../Dashboard/CommitDistributionBar";
import CommitsModalList from "../commits/CommitsModalList";

// Helper para formatar data curta
const formatShortDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

interface UserProfileDialogProps {
  email: string;
  fallbackName: string;
  repoPath: string;
  branch: string;
  open: boolean;
  onClose: () => void;
}

export function UserProfileDialog(props: UserProfileDialogProps) {
  const [profile] = createResource(() => props.email, getGravatarProfile);
  const [showCommits, setShowCommits] = createSignal(false);
  const [selectedCommits, setSelectedCommits] = createSignal<any[]>([]);
  
  const [userCommits] = createResource(
    () => ({ path: props.repoPath, branch: props.branch, email: props.email }),
    async (params) => {
      if (!params.path || !params.email) return [];
      return await getUserCommits(params.path, params.branch, params.email);
    }
  );

  const openModalWithCommits = (commitsToShow: any[]) => {
    debugger;
    setSelectedCommits(commitsToShow);
    setShowCommits(true);
  }

  // Memo para pegar apenas os 5 últimos commits
  const recentCommits = createMemo(() => (userCommits() || []).slice(0, 5));

  const getAccountIcon = (shortname: string) => {
    switch (shortname) {
      case 'github': return 'fab fa-github';
      case 'twitter': return 'fab fa-twitter text-blue-400 hover:text-blue-500';
      case 'linkedin': return 'fab fa-linkedin text-blue-600 hover:text-blue-700';
      case 'pinterest': return 'fab fa-pinterest text-red-600 hover:text-red-700';
      case 'youtube': return 'fab fa-youtube text-red-600 hover:text-red-700';
      case 'instagram': return 'fab fa-instagram text-pink-500 hover:text-pink-600';
      case 'facebook': return 'fab fa-facebook text-blue-600 hover:text-blue-700';
      default: return 'fa fa-globe';
    }
  };

  return (
      <div class="flex flex-col gap-6 overflow-y-auto max-h-[85vh] custom-scrollbar p-2">
        
        {/* CABEÇALHO */}
        <div class="flex flex-col md:flex-row items-center gap-6 container-branch-list">
          <img
            src={getGravatarUrl(props.email, 120)}
            alt={props.fallbackName}
            class="w-28 h-28 rounded-full shadow-md border-2 border-blue-500/20"
          />
          <div class="flex-1 text-center md:text-left">
            <h3 class="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {profile()?.displayName || props.fallbackName}
            </h3>
            <p class="text-gray-500 dark:text-gray-400 text-sm font-mono">{props.email}</p>
            <Show when={profile()?.aboutMe}>
              <p class="text-sm text-gray-600 dark:text-gray-200">
                {profile()?.aboutMe}
              </p>
            </Show>
            <div class="mt-2 flex flex-wrap justify-center md:justify-start gap-4 items-center">
              <Show when={profile()?.currentLocation}>
                <span class="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
                  <i class="fa fa-map-marker-alt text-red-500"></i>
                  {profile()?.currentLocation}
                </span>
              </Show>
              <div class="flex gap-3 border-l dark:border-gray-700 pl-4">
                <For each={profile()?.accounts}>
                  {(account) => (
                    <div onClick={() => openBrowser(account.url)} class="text-gray-400 hover:text-blue-500 transition-colors cursor-pointer text-lg">
                      <i class={getAccountIcon(account.shortname)}></i>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </div>
        </div>

        {/* GRÁFICOS */}
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div class="lg:col-span-8 space-y-4">
            <div class="container-branch-list h-64 overflow-hidden">
               <ContributionGraph commits={userCommits() || []} openCommits={openModalWithCommits} />
            </div>
            <div class="container-branch-list p-4 h-64">
               <ActivityChart commits={userCommits() || []} openCommits={openModalWithCommits} />
            </div>
          </div>

          <div class="lg:col-span-4 space-y-4 flex flex-col">
            <div class="container-branch-list p-4 h-64">
                <HourlyActivityChart commits={userCommits() || []} />
            </div>
            <div class="container-branch-list p-4 flex-1">
              <h4 class="text-[10px] font-bold text-gray-900 dark:text-gray-100 uppercase mb-3 tracking-widest text-center">Resumo</h4>
              <div class="grid grid-cols-2 gap-2 text-center">
                <div class="p-2 bg-white dark:bg-gray-700 rounded-lg shadow-sm border dark:border-gray-700">
                    <span class="block text-xl font-bold text-blue-500">{userCommits()?.length || 0}</span>
                    <span class="text-[10px] text-gray-900 dark:text-gray-100 uppercase">Commits</span>
                </div>
                <div class="p-2 bg-white dark:bg-gray-700 rounded-lg shadow-sm border dark:border-gray-700">
                    <span class="block text-xl font-bold text-green-500">
                        {new Set(userCommits()?.map(c => new Date(c.date).toISOString().split('T')[0])).size}
                    </span>
                    <span class="text-[10px] text-gray-900 dark:text-gray-100 uppercase">Dias Ativos</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* TABELA DE ÚLTIMOS COMMITS */}
          <div class="lg:col-span-8 container-branch-list p-4">
            <h4 class="text-[10px] font-bold text-gray-900 dark:text-gray-100 uppercase mb-1 tracking-widest flex items-center gap-2">
              <i class="fa-solid fa-clock-rotate-left text-blue-500"></i>
              Atividades recentes
            </h4>
            <div class="overflow-x-auto rounded-lg border border-gray-300 dark:border-gray-700">
              <table class="table-striped">
                <thead>
                  <tr class="text-[10px] uppercase text-gray-500">
                    <th class="p-2 w-[100px]">Hash</th>
                    <th class="p-2">Mensagem</th>
                    <th class="p-2 text-right">Data</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={recentCommits()} fallback={
                    <tr>
                      <td colspan="3" class="p-8 text-center text-xs text-gray-500 italic">Buscando histórico...</td>
                    </tr>
                  }>
                    {(commit) => (
                      <tr class="group">
                        <td class="p-2 font-mono text-[10px] text-blue-400 opacity-70 group-hover:opacity-100">
                          {commit.hash.substring(0, 7)}
                        </td>
                        <td class="p-2 text-xs text-gray-900 dark:text-gray-100 truncate max-w-[400px]">
                          <CommitMessage message={commit.message} />
                        </td>
                        <td class="p-2 text-[10px] text-gray-900 dark:text-gray-100 text-right whitespace-nowrap italic">
                          {formatShortDate(commit.date)}
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </div>
          
          <div class="lg:col-span-4 container-branch-list p-4 flex-1">
              <CommitTypeDistribution commits={userCommits() || []} />
          </div>
        </div>

        <Show when={showCommits()}>
          <Dialog 
            open={showCommits()} 
            onClose={() => setShowCommits(false)} 
            title="Histórico de Alterações"
            width="550px" bodyClass="p-0"
          >
            <CommitsModalList commits={selectedCommits()} />
          </Dialog>
        </Show>
      </div>
  );
}