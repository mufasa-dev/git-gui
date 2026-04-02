import { createEffect, createSignal, createMemo, For, Show, on, onCleanup } from "solid-js";
import { Repo } from "../models/Repo.model";
import { getCommitDetails, getCommits, listBranchFilesWithSize } from "../services/gitService";
import { formatRelativeDate } from "../utils/date";
import { notify } from "../utils/notifications";
import { getGravatarUrl } from "../services/gravatarService";
import LanguageBar from "../components/Dashboard/LanguageBar";
import ActivityChart from "../components/Dashboard/ActivityChart";
import ContributionGraph from "../components/Dashboard/ContributionGraph";
import CommitTypeDistribution from "../components/Dashboard/CommitDistributionBar";
import TestCoverageDonut from "../components/Dashboard/TestCoverageDonut";
import HourlyActivityChart from "../components/Dashboard/HourlyActivityChart";
import HotspotsTable from "../components/Dashboard/HotspotsTable";
import { UserProfileDialog } from "../components/Config/UserProfile";
import { formatContributorName } from "../utils/user";
import Dialog from "../components/ui/Dialog";
import CommitsModalList from "../components/commits/CommitsModalList";

declare module "solid-js" {
  namespace JSX {
    interface Directives {
      datepicker: any;
    }
  }
}
let isFetchingCommits = false;

export default function Dashboard(props: { repo: Repo; branch?: string, class?: string }) {
  const [commits, setCommits] = createSignal<any[]>([]);
  const [selectedCommits, setSelectedCommits] = createSignal<any[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [selectedCommit, setSelectedCommit] = createSignal<any>(null);
  const [commitDetailsHeight, setCommitDetailsHeight] = createSignal(300);
  const [branchFiles, setBranchFiles] = createSignal<{path: string, size: number}[]>([]);
  const [resizing, setResizing] = createSignal(false);
  const [startDate, setStartDate] = createSignal("");
  const [endDate, setEndDate] = createSignal("");
  const [modalUserProfileOpen, setModalUserProfileOpen] = createSignal(false);
  const [showCommits, setShowCommits] = createSignal(false);
  const [selectedUser, setSelectedUser] = createSignal({} as { name: string; email: string });
  
  // Estados para Paginação e Filtro
  const [searchTerm, setSearchTerm] = createSignal("");
  const [currentPage, setCurrentPage] = createSignal(1);
  const itemsPerPage = 40;

  const filteredCommits = createMemo(() => {
    const term = searchTerm().toLowerCase();
    const start = startDate() ? new Date(startDate()) : null;
    const end = endDate() ? new Date(endDate()) : null;

    return commits().filter(c => {
      // 1. Filtro de Texto
      const matchesText = !term || 
        c.message.toLowerCase().includes(term) || 
        c.hash.toLowerCase().includes(term) ||
        c.author.toLowerCase().includes(term);

      // 2. Filtro de Data
      const commitDate = new Date(c.date);
      let matchesDate = true;
      
      if (start) {
        matchesDate = matchesDate && commitDate >= start;
      }
      if (end) {
        // Adicionamos 23:59:59 para garantir que pegue o dia final inteiro
        const endWithTime = new Date(end);
        endWithTime.setHours(23, 59, 59, 999);
        matchesDate = matchesDate && commitDate <= endWithTime;
      }

      return matchesText && matchesDate;
    });
  });

  const loadCommits = async (isNewBranch: boolean) => {
    if (!props.repo.path || !props.branch || isFetchingCommits) return;

    isFetchingCommits = true;
    if (isNewBranch) setLoading(true);

    try {
      const branchName = props.branch.replace("* ", "");
      const res = await getCommits(props.repo.path, branchName);
      
      if (JSON.stringify(res) !== JSON.stringify(commits())) {
        setCommits(res);
      }

      if (selectedCommit()) {
        const exists = res.find(c => c.hash === selectedCommit().hash);
        if (!exists && isNewBranch) {
          setSelectedCommit(null);
        }
      }
    } catch(e) {
      const errorMessage = typeof e === 'string' ? e : String(e);
      notify.error('Erro ao carregar commits', errorMessage);
    } finally {
      setLoading(false);
      isFetchingCommits = false;
    }
  };

  async function selectCommit(hash: string) {
    const details = await getCommitDetails(props.repo.path, hash);
    setSelectedCommit({ ...details, _ts: Date.now() });
  }

  createEffect(on(() => [props.repo.path, props.branch], async ([path, branch], prev) => {
    const isNewRepoOrBranch = !prev || path !== prev[0] || branch !== prev[1];
    
    if (isNewRepoOrBranch) {
       setCurrentPage(1);
       setSelectedCommit(null);
       loadCommits(true);
       getFiles();
    } else {
       loadCommits(false);
    }
  }));

  const getFiles = async () => {
    if (!props.repo.path || !props.branch) return;
    try {
      const files = await listBranchFilesWithSize(props.repo.path, props.branch);
      const mappedFiles = files.map(f => ({ path: f[0], size: f[1] }));
      setBranchFiles(mappedFiles);
    } catch (e) {
      console.error("Erro ao carregar arquivos do branch:", e);
      notify.error("Erro ao carregar arquivos do branch", String(e));
    }
  }

  const handleFocus = () => {
    if (document.visibilityState === "visible") {
      loadCommits(false);
    }
  };

  window.addEventListener("focus", handleFocus);
  onCleanup(() => window.removeEventListener("focus", handleFocus));

  function onMouseMove(e: MouseEvent) {
    if (resizing()) {
      const newHeight = window.innerHeight - e.clientY - 20;
      setCommitDetailsHeight(Math.max(150, newHeight));
    }
  }

  const openModalWithCommits = (commitsToShow: any[]) => {
    setSelectedCommits(commitsToShow);
    setShowCommits(true);
  }

  const contributorStats = createMemo(() => {
    const allCommits = commits();
    const stats: Record<string, { name: string, email: string, count: number }> = {};

    allCommits.forEach(c => {
      if (c.email.includes("noreply.github.com")) return;

      if (!stats[c.email]) {
        stats[c.email] = { name: c.author, email: c.email, count: 0 };
      }
      stats[c.email].count++;
    });

    return Object.values(stats).sort((a, b) => b.count - a.count);
  });

  // Total de contribuidores únicos
  const totalContributors = createMemo(() => contributorStats().length);

  // Pega apenas os top 5 para a tabela
  const topContributors = createMemo(() => contributorStats().slice(0, 100));

  return (
    <div class="flex-1 flex flex-col overflow-hidden pt-2 pb-4 pr-2"  style={{"height": "calc(100vh - 101px)"}} 
         onMouseMove={onMouseMove} onMouseUp={() => setResizing(false)} onMouseLeave={() => setResizing(false)}>
      <div class="grid grid-cols-4 grid-rows-3 gap-4 w-full h-full pl-4 bg-gray-200 dark:bg-gray-900">
  
        <div class="grid grid-cols-2 grid-rows-2 gap-2">
          <div class="container-branch-list items-center justify-center">
            <span class="text-xs uppercase opacity-60">Total de Commits</span>
            <h3 class="font-bold !text-5xl mb-2">{commits()?.length}</h3>
          </div>
          <div class="container-branch-list items-center justify-center">
            <span class="text-xs uppercase opacity-60">Total de Branchs</span>
            <h3 class="font-bold !text-5xl mb-2">{props.repo.remoteBranches?.length}</h3>
          </div>
          <div class="container-branch-list items-center justify-center">
            <span class="text-xs uppercase opacity-60">Contribuidores</span>
            <h3 class="font-bold !text-5xl">{totalContributors()}</h3>
          </div>
          <div class="container-branch-list items-center justify-center">
            <span class="text-xs uppercase opacity-60">Total de Arquivos</span>
            <h3 class="font-bold !text-5xl mb-2">{branchFiles()?.length}</h3>
          </div>
        </div>

        <div class="col-span-2 container-branch-list">
          <ContributionGraph commits={commits()} openCommits={openModalWithCommits} />
        </div>

        <div class="row-span-2 container-branch-list">
          <HotspotsTable path={props.repo.path} branch={props.branch || ""} />
        </div>

        <div class="col-span-2 container-branch-list">
          <ActivityChart commits={commits()} openCommits={openModalWithCommits} />
        </div>

        <div class="container-branch-list">
          <LanguageBar files={branchFiles()} />
        </div>

        <div class="container-branch-list">
          <h4 class="font-bold mb-0 flex items-center gap-2">
            <i class="fa-solid fa-trophy text-yellow-500"></i>
            Top Contribuidores
          </h4>
          <div class="overflow-auto flex-1 rounded-lg border border-gray-300 dark:border-gray-700">
            <table class="w-full text-left text-xs table-striped">
              <thead class="sticky top-0 bg-white dark:bg-gray-800">
                <tr class="border-b border-gray-200 dark:border-gray-700">
                  <th class="pb-2 !w-5"></th>
                  <th class="pb-2">Autor</th>
                  <th class="pb-2 text-right">Commits</th>
                  <th class="pb-2 text-right text-gray-400">%</th>
                </tr>
              </thead>
              <tbody>
                <For each={topContributors()}>
                  {(contributor, i) => (
                    <tr class="border-b border-gray-100 dark:border-gray-800 last:border-0" onClick={() => {
                      setSelectedUser({ name: contributor.name, email: contributor.email });
                      setModalUserProfileOpen(true);
                    }}>
                      <td class="py-2 !w-5">
                        <span class={`w-5 h-5 flex items-center justify-center rounded-full text-white font-mono text-[10px] !mr-0
                            ${i() === 0 ? "bg-yellow-400" : i() === 1 ? "bg-gray-400" : i() === 2 ? "bg-orange-400" : "bg-gray-500"}`}>
                          {i() + 1}
                        </span>
                      </td>
                      <td class="py-2 flex items-center gap-2">
                        <div class="w-6 h-6 rounded-full bg-gray-300 dark:bg-gray-700 flex-shrink-0 flex items-center justify-center overflow-hidden">
                          <img
                              src={getGravatarUrl(contributor.email || '', 80)}
                              alt={contributor.name}
                              class="w-[18px] h-[18px] rounded-full shadow-sm"
                            /> 
                        </div>
                        <span class="truncate font-medium">{formatContributorName(contributor.name)}</span>
                      </td>
                      <td class="py-2 text-right font-mono">{contributor.count}</td>
                      <td class="py-2 text-right text-gray-500">
                        {Math.round((contributor.count / commits().length) * 100)}%
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </div>

        <div class="container-branch-list">
          <HourlyActivityChart commits={commits()} />
        </div>

        <div class="container-branch-list">
          <TestCoverageDonut path={props.repo.path} branch={props.branch || ""} />
        </div>

        <div class="container-branch-list">
          <CommitTypeDistribution commits={commits()} /> 
        </div>

      </div>
      <Show when={modalUserProfileOpen()}>
        <UserProfileDialog 
          repoPath={props.repo.path || ""} 
          branch={props.branch || ""}
          email={selectedUser()?.email || ""}
          fallbackName={formatContributorName(selectedUser()?.name) || "Usuário Desconhecido"} 
          open={modalUserProfileOpen()}
          onClose={() => {
            setModalUserProfileOpen(false)
            setSelectedUser({ name: "", email: "" });
          }}
        />
      </Show>

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