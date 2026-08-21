import { createEffect, createSignal, createMemo, For, Show } from "solid-js";
import { Repo } from "../models/Repo.model";
import { getCommitDetails, getCommits, listBranchFilesWithSize } from "../services/gitService";
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
import { CommitDetailsModal } from "../components/commits/CommitDetailsModal";
import { useApp } from "../context/AppContext";

declare module "solid-js" {
  namespace JSX {
    interface Directives {
      datepicker: any;
    }
  }
}

const commitsSignature = (commits: any[]) => commits.map(commit => [
  commit.hash,
  commit.date,
  commit.ref_names,
  commit.parent_hashes,
  commit.graph_symbol,
].join("|")).join("\u0000");

const DASHBOARD_COMMIT_LIMIT = 10_000;

function DashboardPanel(props: { loading: boolean; class?: string; children: any }) {
  return (
    <div class={`container-branch-list relative ${props.class || ""}`}>
      {props.children}
      <Show when={props.loading}>
        <div class="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-gray-900/35 backdrop-blur-[1px]">
          <i class="fa-solid fa-spinner animate-spin text-blue-400 text-xl"></i>
        </div>
      </Show>
    </div>
  );
}

export default function Dashboard(props: { repo: Repo; branch?: string, class?: string }) {
  const [commits, setCommits] = createSignal<any[]>([]);
  const [selectedCommits, setSelectedCommits] = createSignal<any[]>([]);
  const [commitsLoading, setCommitsLoading] = createSignal(false);
  const [filesLoading, setFilesLoading] = createSignal(false);
  const [selectedCommit, setSelectedCommit] = createSignal<any>(null);
  const [branchFiles, setBranchFiles] = createSignal<{path: string, size: number}[]>([]);
  const [modalUserProfileOpen, setModalUserProfileOpen] = createSignal(false);
  const [showCommits, setShowCommits] = createSignal(false);
  const [showCommitDetails, setShowCommitDetails] = createSignal(false);
  const [selectedUser, setSelectedUser] = createSignal({} as { name: string; email: string });
  let isFetchingCommits = false;
  let previousPath: string | undefined;
  let previousBranch: string | undefined;
  let previousRefsRevision: number | undefined;
  let commitsRequestId = 0;
  let filesRequestId = 0;
  const { t } = useApp();
  
  let pendingCommitsRefresh = false;

  const loadCommits = async (isNewBranch: boolean) => {
    if (!props.repo.path || !props.branch) return;
    if (isFetchingCommits) {
      pendingCommitsRefresh = true;
      return;
    }

    isFetchingCommits = true;
    const requestId = ++commitsRequestId;
    const requestPath = props.repo.path;
    const requestBranch = props.branch.replace("* ", "");
    setCommitsLoading(true);

    try {
      const res = await getCommits(requestPath, requestBranch, DASHBOARD_COMMIT_LIMIT);
      const isCurrentRequest = requestId === commitsRequestId
        && requestPath === props.repo.path
        && requestBranch === props.branch.replace("* ", "");

      if (!isCurrentRequest) return;

      if (commitsSignature(res) !== commitsSignature(commits())) {
        setCommits(res);
      }

      if (selectedCommit()) {
        const exists = res.find(c => c.hash === selectedCommit().hash);
        if (!exists && isNewBranch) {
          setSelectedCommit(null);
        }
      }
    } catch(e) {
      if (requestId === commitsRequestId) {
        const errorMessage = typeof e === 'string' ? e : String(e);
        notify.error(t('error').load_commits, errorMessage);
      }
    } finally {
      isFetchingCommits = false;
      if (pendingCommitsRefresh) {
        pendingCommitsRefresh = false;
        void loadCommits(false);
      } else if (requestId === commitsRequestId) {
        setCommitsLoading(false);
      }
    }
  };

  async function selectCommit(hash: string) {
    const details = await getCommitDetails(props.repo.path, hash);
    setSelectedCommit({ ...details, _ts: Date.now() });
  }

  const openCommitDetails = async (hash: string) => {
    try {
      await selectCommit(hash);
      setShowCommitDetails(true);
    } catch (error) {
      notify.error(t("error").load_commits, String(error));
    }
  };

  createEffect(() => {
    const path = props.repo.path;
    const branch = props.branch;
    const refsRevision = props.repo.refsRevision;
    const isNewRepoOrBranch = previousPath === undefined || path !== previousPath || branch !== previousBranch;
    const refsChanged = previousRefsRevision !== undefined && refsRevision !== previousRefsRevision;

    if (isNewRepoOrBranch) {
      setSelectedCommit(null);
      setCommits([]);
      setBranchFiles([]);
      void Promise.all([loadCommits(true), getFiles()]);
    } else if (refsChanged) {
      void Promise.all([loadCommits(false), getFiles()]);
    }

    previousPath = path;
    previousBranch = branch;
    previousRefsRevision = refsRevision;
  });

  const getFiles = async () => {
    if (!props.repo.path || !props.branch) return;

    const requestId = ++filesRequestId;
    const requestPath = props.repo.path;
    const requestBranch = props.branch;
    setFilesLoading(true);

    try {
      const files = await listBranchFilesWithSize(requestPath, requestBranch);
      if (requestId !== filesRequestId || requestPath !== props.repo.path || requestBranch !== props.branch) return;

      const mappedFiles = files.map(f => ({ path: f[0], size: f[1] }));
      setBranchFiles(mappedFiles);
    } catch (e) {
      if (requestId === filesRequestId) {
        console.error("Erro ao carregar arquivos do branch:", e);
        notify.error(t('error').load_file, String(e));
      }
    } finally {
      if (requestId === filesRequestId) setFilesLoading(false);
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
    <div class="flex-1 flex flex-col overflow-hidden pt-2 pb-2 pr-2 height-container">
      <div class="grid grid-cols-4 grid-rows-3 gap-4 w-full h-full pl-4 bg-gray-200 dark:bg-gray-900">

        <div class="grid grid-cols-2 grid-rows-2 gap-2">
          <DashboardPanel loading={commitsLoading()} class="items-center justify-center">
            <span class="text-xs uppercase opacity-60">{t('dashboard').total_commits}</span>
            <h3 class="font-bold !text-5xl mb-2">{commits()?.length}</h3>
          </DashboardPanel>
          <DashboardPanel loading={false} class="items-center justify-center">
            <span class="text-xs uppercase opacity-60">{t('dashboard').total_branches}</span>
            <h3 class="font-bold !text-5xl mb-2">{props.repo.remoteBranches?.length}</h3>
          </DashboardPanel>
          <DashboardPanel loading={commitsLoading()} class="items-center justify-center">
            <span class="text-xs uppercase opacity-60">{t('dashboard').contributors}</span>
            <h3 class="font-bold !text-5xl">{totalContributors()}</h3>
          </DashboardPanel>
          <DashboardPanel loading={filesLoading()} class="items-center justify-center">
            <span class="text-xs uppercase opacity-60">{t('dashboard').total_files}</span>
            <h3 class="font-bold !text-5xl mb-2">{branchFiles()?.length}</h3>
          </DashboardPanel>
        </div>

        <DashboardPanel loading={commitsLoading()} class="col-span-2">
          <ContributionGraph commits={commits()} openCommits={openModalWithCommits} />
        </DashboardPanel>

        <DashboardPanel loading={false} class="row-span-2">
          <HotspotsTable path={props.repo.path} branch={props.branch || ""} repo={props.repo} selectCommit={selectCommit} />
        </DashboardPanel>

        <DashboardPanel loading={commitsLoading()} class="col-span-2">
          <ActivityChart commits={commits()} openCommits={openModalWithCommits} />
        </DashboardPanel>

        <DashboardPanel loading={filesLoading()}>
          <LanguageBar files={branchFiles()} />
        </DashboardPanel>

        <DashboardPanel loading={commitsLoading()}>
          <h4 class="font-bold mb-0 flex items-center gap-2">
            <i class="fa-solid fa-trophy text-yellow-500"></i>
            {t('dashboard').top_contributors}
          </h4>
          <div class="overflow-auto flex-1 rounded-lg border border-gray-300 dark:border-gray-700">
            <table class="w-full text-left text-xs table-striped">
              <thead class="sticky top-0 bg-white dark:bg-gray-800">
                <tr class="border-b border-gray-200 dark:border-gray-700">
                  <th class="pb-2 !w-5"></th>
                  <th class="pb-2">{t('commits').author}</th>
                  <th class="pb-2 text-right">{t('commits').commits}</th>
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
        </DashboardPanel>

        <DashboardPanel loading={commitsLoading()}>
          <HourlyActivityChart commits={commits()} />
        </DashboardPanel>

        <DashboardPanel loading={false}>
          <TestCoverageDonut path={props.repo.path} branch={props.branch || ""} />
        </DashboardPanel>

        <DashboardPanel loading={commitsLoading()}>
          <CommitTypeDistribution commits={commits()} />
        </DashboardPanel>

      </div>
      <Show when={modalUserProfileOpen()}>
        <Dialog
            open={modalUserProfileOpen()}
            onClose={() => {
              setModalUserProfileOpen(false)
              setSelectedUser({ name: "", email: "" });
            }}
            title={t('auth').user_profile}
            icon="fa-solid fa-user"
            iconColor="text-indigo-600 dark:text-indigo-300"
            width={"90vw"}
        >
          <UserProfileDialog 
            repo={props.repo} 
            branch={props.branch || ""}
            email={selectedUser()?.email || ""}
            fallbackName={formatContributorName(selectedUser()?.name) || "Usuário Desconhecido"} 
            open={modalUserProfileOpen()}
            onClose={() => {
              setModalUserProfileOpen(false)
              setSelectedUser({ name: "", email: "" });
            }}
          />
        </Dialog>
      </Show>

      <Show when={showCommits()}>
        <Dialog 
          open={showCommits()} 
          onClose={() => setShowCommits(false)} 
          title={t('file').changes_history}
          icon="fa-solid fa-clock-rotate-left"
          iconColor="text-blue-600 dark:text-blue-300"
          width="550px" bodyClass="p-0"
        >
          <CommitsModalList
            commits={selectedCommits()}
            onSelectCommit={(commit) => void openCommitDetails(commit.hash)}
          />
        </Dialog>
      </Show>

      <Show when={showCommitDetails()}>
        <Dialog
          open={showCommitDetails()}
          onClose={() => setShowCommitDetails(false)}
          title={t('commits').details}
          icon="fa-solid fa-code-commit"
          iconColor="text-purple-600 dark:text-purple-300"
          panelClass="-translate-y-2"
          bodyClass="h-full p-0"
          width="calc(100vw - 40px)"
          height="calc(100vh - 150px)"
        >
          <CommitDetailsModal
            commit={selectedCommit()}
            repo={props.repo}
            branch={props.branch}
            openParent={true}
            openProfile={true}
            selectCommit={openCommitDetails}
          />
        </Dialog>
      </Show>
    </div>
  );
}