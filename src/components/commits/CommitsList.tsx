import { createEffect, createSignal, createMemo, For, Show, on, onCleanup } from "solid-js";
import { Repo } from "../../models/Repo.model";
import { getCommitDetails, getCommits } from "../../services/gitService";
import { formatRelativeDate } from "../../utils/date";
import { CommitDetails } from "./CommitDetails";
import { datepicker } from "../../directives/datepicker";
import { notify } from "../../utils/notifications";
import { getGravatarUrl } from "../../services/gravatarService";
import CommitMessage from "../ui/CommitMessage";
import { formatContributorName } from "../../utils/user";
import { useApp } from "../../context/AppContext";
import CommitGraph from "./CommitGraph";

declare module "solid-js" {
  namespace JSX {
    interface Directives {
      datepicker: any;
    }
  }
}

void datepicker;

let currentFetchId = 0;

function parseDateInput(value: string, endOfDay = false) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;

  return new Date(
    year,
    month - 1,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0,
  );
}

export default function CommitsList(props: {
  repo: Repo;
  branch?: string;
  class?: string;
  onCreateTag?: (commit: { hash: string; subject: string }) => void;
}) {
  const [commits, setCommits] = createSignal<any[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [selectedCommit, setSelectedCommit] = createSignal<any>(null);
  const [commitDetailsHeight, setCommitDetailsHeight] = createSignal(300);
  const [resizing, setResizing] = createSignal(false);
  const [startDate, setStartDate] = createSignal("");
  const [endDate, setEndDate] = createSignal("");
  const { t, locale, isDark } = useApp();
  const datePlaceholder = createMemo(() => ({
    pt: "dd/mm/aaaa",
    en: "mm/dd/yyyy",
    it: "gg/mm/aaaa",
    jp: "yyyy/mm/dd",
  })[locale()] || "dd/mm/aaaa");
  
  // Estados para Paginação e Filtro
  const [searchTerm, setSearchTerm] = createSignal("");
  const [currentPage, setCurrentPage] = createSignal(1);
  const itemsPerPage = 40;

  const commitsOnly = createMemo(() => 
    commits().filter(c => c.is_commit)
  );

  const filteredCommits = createMemo(() => {
    const term = searchTerm().trim().toLowerCase();
    const start = parseDateInput(startDate());
    const end = parseDateInput(endDate(), true);

    return commitsOnly().filter(c => {
      const message = String(c.message || "").toLowerCase();
      const hash = String(c.hash || "").toLowerCase();
      const author = String(c.author || "").toLowerCase();
      const matchesText = !term ||
        message.includes(term) ||
        hash.includes(term) ||
        author.includes(term);

      const commitTime = Date.parse(c.date);
      const hasValidCommitDate = !Number.isNaN(commitTime);
      const matchesDate = hasValidCommitDate &&
        (!start || commitTime >= start.getTime()) &&
        (!end || commitTime <= end.getTime());

      return matchesText && (!start && !end ? true : matchesDate);
    });
  });

  const loadCommits = async (repoPath: string | undefined, branchName: string | undefined, isNewBranch: boolean) => {
    if (!repoPath || !branchName) return;
    
    const myFetchId = ++currentFetchId;
    
    if (isNewBranch) setLoading(true);

    try {
      const cleanBranch = branchName.replace("* ", "");
      const res = await getCommits(repoPath, cleanBranch);
      
      if (myFetchId !== currentFetchId) return;

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
      if (myFetchId === currentFetchId) {
        const errorMessage = typeof e === 'string' ? e : String(e);
        notify.error(t('error').load_commits, errorMessage);
      }
    } finally {
      if (myFetchId === currentFetchId) {
        setLoading(false);
      }
    }
  };

  const paginatedCommits = createMemo(() => {
    const start = (currentPage() - 1) * itemsPerPage;
    return filteredCommits().slice(start, start + itemsPerPage);
  });

  const totalPages = createMemo(() => Math.ceil(filteredCommits().length / itemsPerPage));

  createEffect(() => {
    searchTerm();
    startDate();
    endDate();
    setCurrentPage(1);
  });

  async function selectCommit(hash: string) {
    if (!props.repo || !props.repo.path) return;
    const details = await getCommitDetails(props.repo.path, hash);
    setSelectedCommit({ ...details, _ts: Date.now() });
  }

  createEffect(on(() => [props.repo.path, props.branch, props.repo.activeBranch], ([path, branch, activeBranch], prev) => {
    const isNewRepo = !prev || path !== prev[0];
    const isNewBranch = !prev || branch !== prev[1];

    if (isNewRepo) {
      // Força o descarte imediato de qualquer requisição paralela anterior
      currentFetchId++; 
      setCommits([]);
      setCurrentPage(1);
      setSelectedCommit(null);

      if (branch !== activeBranch) {
        return;
      }
    }

    if (isNewRepo || isNewBranch) {
      loadCommits(path, branch || "", isNewRepo);
    } else {
      loadCommits(path, branch || "", false);
    }
  }));

  const handleFocus = () => {
    if (document.visibilityState === "visible") {
      loadCommits(props.repo.path, props.branch || "", false);
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

  return (
    <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pt-2 pb-2 pr-2"
         onMouseMove={onMouseMove} onMouseUp={() => setResizing(false)} onMouseLeave={() => setResizing(false)}>
      <div class="container-branch-list flex-1 min-h-0 min-w-0 overflow-hidden mb-1">
        {/* Busca, filtro de data e paginação */}
        <div class="commits-toolbar">
          <label class="commit-search flex min-w-0 flex-1 items-center gap-2">
            <i class="fas fa-search text-gray-400" aria-hidden="true" />
            <input
              type="search"
              placeholder={t('commits').search_placeholder}
              value={searchTerm()}
              onInput={(e) => setSearchTerm(e.currentTarget.value)}
            />
          </label>

          <div class="commit-date-filter" aria-label={`${t('common').start_date} ${t('common').to_date} ${t('common').end_date}`}>
            <label class="commit-date-field">
              <span>{t('common').start_date}</span>
              <input
                use:datepicker={{ value: startDate, onChange: setStartDate, locale, isDark, maxDate: endDate }}
                type="text"
                placeholder={datePlaceholder()}
                autocomplete="off"
              />
            </label>
            <span class="commit-date-separator">{t('common').to_date}</span>
            <label class="commit-date-field">
              <span>{t('common').end_date}</span>
              <input
                use:datepicker={{ value: endDate, onChange: setEndDate, locale, isDark, minDate: startDate }}
                type="text"
                placeholder={datePlaceholder()}
                autocomplete="off"
              />
            </label>
            <Show when={startDate() || endDate()}>
              <button
                type="button"
                onClick={() => { setStartDate(""); setEndDate(""); }}
                class="commit-clear-filter"
                title="Limpar datas"
                aria-label="Limpar datas"
              >
                <i class="fas fa-xmark" aria-hidden="true" />
              </button>
            </Show>
          </div>
        </div>

        <div class="commit-list-meta">
          <div class="min-w-0 truncate">
            <b class="text-green-600 dark:text-green-400">
              <i class="fas fa-code-branch mr-1" />{props.branch}
            </b>
            <span class="text-gray-500 ml-2">{t('common').showing} {paginatedCommits().length} {t('common').of} {filteredCommits().length}</span>
          </div>
          <div class="commit-pagination">
            <button
              type="button"
              disabled={currentPage() === 1}
              onClick={() => setCurrentPage(p => p - 1)}
              class="commit-page-button"
              aria-label={t('common').previous}
            >
              <i class="fas fa-chevron-left" aria-hidden="true" />
            </button>
            <span>{currentPage()} / {totalPages() || 1}</span>
            <button
              type="button"
              disabled={currentPage() >= totalPages()}
              onClick={() => setCurrentPage(p => p + 1)}
              class="commit-page-button"
              aria-label={t('common').next}
            >
              <i class="fas fa-chevron-right" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Lista de commits */}
        <div class="commit-list-viewport">
          <div class="commit-graph-column">
            <CommitGraph commits={paginatedCommits()} rowHeight={35} />
          </div>
          <div class="commit-rows">
            <Show when={!loading()} fallback={<div class="p-4 text-center">{t('common').loading}</div>}>
              <For each={paginatedCommits()}>
                {(c) => (
                  <div
                    class={`cm-commit-item ${
                      selectedCommit()?.hash === c.hash ? "selected" : ""
                    }`}
                    onClick={() => selectCommit(c.hash)}
                  >
                    <div class="commit-hash-cell">{c.hash.slice(0, 7)}</div>
                    <div class="commit-message-cell">
                      <div class="commit-message-text">
                        <CommitMessage message={c.message} class="text-sm font-mono whitespace-nowrap" />
                      </div>
                      <div class="commit-tags">
                        <For each={(c.ref_names || "").split(",").map((ref: string) => ref.trim()).filter((ref: string) => ref.startsWith("tag: "))}>
                          {(ref) => <span class="commit-tag" title={ref.replace("tag: ", "")}>{ref.replace("tag: ", "")}</span>}
                        </For>
                      </div>
                    </div>
                    <div class="commit-author-cell">
                      <img
                        src={getGravatarUrl(c.email, 80)}
                        alt={c.author}
                        class="w-[18px] h-[18px] rounded-full shadow-sm"
                      />
                      <span class="truncate">{formatContributorName(c.author)}</span>
                    </div>
                    <div class="commit-date-cell">{formatRelativeDate(c.date, t, locale())}</div>
                  </div>
                )}
              </For>
            </Show>
          </div>
        </div>
      </div>

      {/* Barra de resize */}
      <div class="resize-bar-horizontal" onMouseDown={(e) => { e.preventDefault(); setResizing(true); }}></div>
      
      {/* Detalhes */}
      <div style={{ height: `${commitDetailsHeight()}px`, "min-height": "100px" }} class="overflow-auto container-branch-list p-0 mt-1">
        <CommitDetails
          commit={selectedCommit()}
          repo={props.repo}
          branch={props.branch || ""}
          selectCommit={selectCommit}
          openParent={true}
          openProfile={true}
          onCreateTag={props.onCreateTag}
        />
      </div>
    </div>
  );
}