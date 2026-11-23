import { createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show } from 'solid-js';
import { formatDuration } from '../../utils/date';
import FileIcon from '../ui/FileIcon';
import ContextMenu, { ContextMenuItem } from '../ui/ContextMenu';
import Dialog from '../ui/Dialog';
import { openVsCode } from '../../services/openService';
import { notify } from '../../utils/notifications';
import { useApp } from '../../context/AppContext';
import {
  activeRunPath,
  buildReport,
  clearConsole,
  ConsoleLine,
  copyToClipboard,
  dismissRun,
  ensureProjectInfo,
  findFilePathForTest,
  formatConsoleForCopy,
  formatElapsed,
  formatSpecForCopy,
  getTestSession,
  now,
  PHASE_ORDER,
  randomizeTests,
  registerTestTranslator,
  repoDisplayName,
  RunPhase,
  runAllTests,
  runSingleTest,
  runSuite,
  selectRunner,
  setRandomizeTests,
  setVisibleTestRepo,
  stopTests,
  TestSpec,
} from './testSessionStore';

const CONSOLE_OPEN_KEY = 'test-runner-console-open';
const CONSOLE_HEIGHT_KEY = 'test-runner-console-height';

const PHASE_STEPS: { phase: RunPhase; icon: string; key: string }[] = [
  { phase: 'starting', icon: 'fa-power-off', key: 'phase_starting' },
  { phase: 'building', icon: 'fa-hammer', key: 'phase_building' },
  { phase: 'running', icon: 'fa-flask', key: 'phase_running' },
  { phase: 'collecting', icon: 'fa-clipboard-check', key: 'phase_collecting' },
];

const testDisplayName = (spec: TestSpec) => {
  const parts = spec.name.split(' > ');
  return parts.length > 1 ? parts.slice(1).join(' > ') : spec.name;
};

export const TestRunner = (props: { repo: any }) => {
  const { t } = useApp();
  const tt = () => t('test') as unknown as Record<string, string>;
  registerTestTranslator((key) => tt()[key] ?? key);

  const session = createMemo(() => getTestSession(props.repo?.path));

  createEffect(() => {
    const current = session();
    setVisibleTestRepo(current.repoPath);
    void ensureProjectInfo(current);
  });
  onCleanup(() => setVisibleTestRepo(null));

  // ---- estado local de UI -------------------------------------------------
  const [sidebarWidth, setSidebarWidth] = createSignal(240);
  const [isResizing, setIsResizing] = createSignal(false);
  const [isResizingConsole, setIsResizingConsole] = createSignal(false);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [testMenuVisible, setTestMenuVisible] = createSignal(false);
  const [testMenuPosition, setTestMenuPosition] = createSignal({ x: 0, y: 0 });
  const [contextTest, setContextTest] = createSignal<TestSpec | null>(null);
  const [consoleOpen, setConsoleOpenSignal] = createSignal(localStorage.getItem(CONSOLE_OPEN_KEY) !== 'false');
  const [consoleHeight, setConsoleHeight] = createSignal(Number(localStorage.getItem(CONSOLE_HEIGHT_KEY)) || 220);
  const [autoScroll, setAutoScroll] = createSignal(true);
  let mainPanelRef: HTMLDivElement | undefined;
  let consoleRef: HTMLDivElement | undefined;

  const setConsoleOpen = (open: boolean) => {
    setConsoleOpenSignal(open);
    localStorage.setItem(CONSOLE_OPEN_KEY, String(open));
  };

  // ---- atalhos para o estado da sessão ------------------------------------
  const specs = () => session().specs();
  const run = () => session().run();
  const isRunning = () => activeRunPath() === session().repoPath;
  const otherRepoRunning = () => {
    const path = activeRunPath();
    return path && path !== session().repoPath ? path : null;
  };
  const busy = () => !!activeRunPath();
  const projectInfo = () => session().projectInfo();
  const activeRunner = () => session().activeRunner();
  const activeFramework = () => session().activeFramework();
  const selectedSuite = () => session().selectedSuite();
  const filterStatus = () => session().filterStatus();

  // ---- estatísticas -------------------------------------------------------
  const stats = createMemo(() => {
    const list = specs();
    const passed = list.filter(s => s.status === 'pass').length;
    const failed = list.filter(s => s.status === 'fail').length;
    const skipped = list.filter(s => s.status === 'skip').length;
    const completed = passed + failed;
    return { total: list.length, passed, failed, skipped, passRate: completed > 0 ? Math.round((passed / completed) * 100) : 0 };
  });

  const groupedSpecs = createMemo(() => {
    const groups: Record<string, { tests: TestSpec[]; hasError: boolean }> = {};
    specs().forEach(spec => {
      const [rootSuite] = spec.name.split(' > ');
      const key = rootSuite.trim();
      if (!groups[key]) groups[key] = { tests: [], hasError: false };
      groups[key].tests.push(spec);
      if (spec.status === 'fail') groups[key].hasError = true;
    });
    return groups;
  });

  const selectedSuiteStats = createMemo(() => {
    const tests = selectedSuite() ? groupedSpecs()[selectedSuite()!]?.tests || [] : [];
    const passed = tests.filter(test => test.status === 'pass').length;
    const failed = tests.filter(test => test.status === 'fail').length;
    const skipped = tests.filter(test => test.status === 'skip').length;
    const completed = passed + failed;
    return { total: tests.length, passed, failed, skipped, passRate: completed > 0 ? Math.round((passed / completed) * 100) : 0 };
  });

  const suites = createMemo(() => {
    let allSuites = Object.keys(groupedSpecs());
    const currentFilter = filterStatus();
    if (currentFilter === 'pass') {
      allSuites = allSuites.filter(suite => !groupedSpecs()[suite].hasError && groupedSpecs()[suite].tests.some(t => t.status === 'pass'));
    } else if (currentFilter === 'fail') {
      allSuites = allSuites.filter(suite => groupedSpecs()[suite].hasError);
    }
    const query = session().searchQuery().toLowerCase().trim();
    if (!query) return allSuites;
    return allSuites.filter(suite => suite.toLowerCase().includes(query));
  });

  const failedSpecs = createMemo(() => specs().filter(spec => spec.status === 'fail'));

  // ---- execução em andamento ----------------------------------------------
  const elapsedMs = () => {
    const r = run();
    if (!r) return 0;
    return (r.finishedAt ?? now()) - r.startedAt;
  };

  const progressPct = () => {
    const r = run();
    if (!r) return null;
    if (r.finishedAt) return 100;
    if (!r.expected || r.results === 0) return null;
    return Math.min(99, Math.round((r.results / r.expected) * 100));
  };

  const etaMs = () => {
    const r = run();
    if (!r || r.finishedAt || r.results < 3 || r.expected <= r.results) return null;
    return (elapsedMs() / r.results) * (r.expected - r.results);
  };

  const scopeText = () => {
    const r = run();
    if (!r) return '';
    if (r.scope === 'all') return tt().scope_all;
    if (r.scope === 'suite') return `${tt().scope_suite}: ${r.suite}`;
    return `${tt().scope_single}: ${r.singleTest?.split(' > ').slice(1).join(' > ') || r.singleTest}`;
  };

  const phaseIndex = () => PHASE_ORDER.indexOf(run()?.phase || 'starting');

  const outcomeStyle = () => {
    switch (run()?.outcome) {
      case 'passed': return { icon: 'fa-circle-check', color: 'text-green-500', border: 'border-green-500/30', bg: 'bg-green-500/10' };
      case 'failed': return { icon: 'fa-circle-xmark', color: 'text-red-500', border: 'border-red-500/30', bg: 'bg-red-500/10' };
      case 'compile_error': return { icon: 'fa-triangle-exclamation', color: 'text-red-500', border: 'border-red-500/30', bg: 'bg-red-500/10' };
      case 'error': return { icon: 'fa-bug', color: 'text-red-500', border: 'border-red-500/30', bg: 'bg-red-500/10' };
      case 'stopped': return { icon: 'fa-circle-stop', color: 'text-amber-500', border: 'border-amber-500/30', bg: 'bg-amber-500/10' };
      default: return { icon: 'fa-circle-info', color: 'text-gray-400', border: 'border-gray-400/30', bg: 'bg-gray-500/10' };
    }
  };

  // Abre o console automaticamente quando uma execução começa
  createEffect(on(() => run()?.id, (id, prevId) => {
    if (id && id !== prevId && isRunning()) {
      setConsoleOpen(true);
      setAutoScroll(true);
    }
  }));

  // Rolagem automática do console
  createEffect(on(() => session().consoleLines().length, () => {
    if (!autoScroll() || !consoleRef) return;
    queueMicrotask(() => { if (consoleRef) consoleRef.scrollTop = consoleRef.scrollHeight; });
  }));

  const onConsoleScroll = () => {
    if (!consoleRef) return;
    const nearBottom = consoleRef.scrollHeight - consoleRef.scrollTop - consoleRef.clientHeight < 24;
    if (nearBottom !== autoScroll()) setAutoScroll(nearBottom);
  };

  // ---- ações ---------------------------------------------------------------
  const resolveTestFilePath = (spec: TestSpec): string | undefined => {
    const parts = spec.name.split(' > ');
    const testName = parts.pop()?.trim() || '';
    const suite = parts.join(' > ').trim();
    const mappedPath = spec.filePath && spec.filePath !== 'unknown'
      ? spec.filePath
      : findFilePathForTest(session(), suite, testName);
    if (!mappedPath || !props.repo?.path) return undefined;
    if (/^(?:[A-Za-z]:[\\/]|[\\/]{2})/.test(mappedPath)) return mappedPath;
    return `${props.repo.path.replace(/[\\/]+$/, '')}/${mappedPath.replace(/^[/\\]+/, '')}`;
  };

  const openTestInVsCode = async (spec: TestSpec) => {
    const filePath = resolveTestFilePath(spec);
    if (!filePath) {
      notify.error(tt().test, tt().file_not_found);
      return;
    }
    try {
      await openVsCode(filePath);
    } catch (error) {
      notify.error(tt().open_vscode, String(error));
    }
  };

  const showTestContextMenu = (event: MouseEvent, spec: TestSpec) => {
    // Se há texto selecionado, deixa o menu nativo (Copiar) aparecer
    if (window.getSelection()?.toString()) return;
    event.preventDefault();
    setContextTest(spec);
    setTestMenuPosition({ x: event.clientX, y: event.clientY });
    setTestMenuVisible(true);
  };

  const hideTestContextMenu = () => {
    setTestMenuVisible(false);
    setContextTest(null);
  };

  const testContextItems = (): ContextMenuItem[] => {
    const spec = contextTest();
    if (!spec) return [];
    const items: ContextMenuItem[] = [];
    if (!busy()) items.push({ label: tt().rerun, action: () => runSingleTest(session(), spec) });
    items.push({ label: tt().copy_name, action: () => copyToClipboard(spec.name) });
    if (spec.status === 'fail') items.push({ label: tt().copy_error, action: () => copyToClipboard(formatSpecForCopy(spec)) });
    items.push({ label: tt().open_vscode, action: () => openTestInVsCode(spec) });
    return items;
  };

  onMount(() => document.addEventListener('click', hideTestContextMenu));
  onCleanup(() => document.removeEventListener('click', hideTestContextMenu));

  const onMouseMove = (e: MouseEvent) => {
    if (isResizing()) setSidebarWidth(Math.min(420, Math.max(220, e.clientX)));
    if (isResizingConsole() && mainPanelRef) {
      const rect = mainPanelRef.getBoundingClientRect();
      const height = Math.min(rect.height - 120, Math.max(100, rect.bottom - e.clientY));
      setConsoleHeight(height);
    }
  };
  const stopResizing = () => {
    if (isResizingConsole()) localStorage.setItem(CONSOLE_HEIGHT_KEY, String(Math.round(consoleHeight())));
    setIsResizing(false);
    setIsResizingConsole(false);
  };

  const consoleLineClass = (line: ConsoleLine) => {
    switch (line.kind) {
      case 'err': return 'text-amber-600 dark:text-amber-300';
      case 'system': return 'text-sky-600 dark:text-sky-400';
      case 'pass': return 'text-green-600 dark:text-green-400';
      case 'fail': return 'text-red-600 dark:text-red-400 font-semibold';
      case 'skip': return 'text-amber-600 dark:text-amber-400';
      case 'error': return 'text-red-600 dark:text-red-400 font-bold';
      default: return 'text-gray-700 dark:text-gray-300';
    }
  };

  // ---- blocos de UI --------------------------------------------------------

  const OtherRepoBanner = () => (
    <Show when={otherRepoRunning()}>
      {(path) => (
        <div class="flex items-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-[11px] text-amber-700 dark:text-amber-300">
          <i class="fa-solid fa-circle-notch animate-spin"></i>
          <span class="min-w-0 flex-1 truncate">
            {tt().running_other_repo}: <b>{repoDisplayName(path())}</b>
          </span>
          <button
            onClick={() => stopTests()}
            class="rounded-md bg-red-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-red-500"
          >
            <i class="fa-solid fa-stop mr-1"></i>{tt().stop}
          </button>
        </div>
      )}
    </Show>
  );

  const RunningPanel = () => (
    <div class="border-b border-blue-500/20 bg-gradient-to-r from-blue-500/10 via-blue-500/5 to-transparent p-3">
      <div class="flex items-start gap-3">
        <div class="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500 text-white shadow-[0_0_18px_rgba(59,130,246,0.45)]">
          <i class="fa-solid fa-flask text-sm"></i>
          <span class="absolute -right-1 -top-1 flex h-3 w-3">
            <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
            <span class="relative inline-flex h-3 w-3 rounded-full bg-blue-500 ring-2 ring-white dark:ring-gray-800"></span>
          </span>
        </div>

        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <h3 class="text-sm font-bold text-gray-800 dark:text-gray-100">
              {session().isStopping() ? tt().stopping : tt().running_tests}
            </h3>
            <span class="rounded-full bg-blue-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-blue-600 dark:text-blue-300">
              {run()?.runnerLabel}
            </span>
          </div>
          <div class="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400 select-text" title={scopeText()}>
            {scopeText()}
            <Show when={run()?.filePath}>
              <span class="opacity-70"> · {run()?.filePath}</span>
            </Show>
          </div>
        </div>

        <div class="flex shrink-0 flex-col items-end">
          <span class="font-mono text-xl font-black tabular-nums text-gray-800 dark:text-gray-100">{formatElapsed(elapsedMs())}</span>
          <span class="text-[9px] font-bold uppercase tracking-wide text-gray-400">{tt().elapsed}</span>
        </div>

        <button
          onClick={() => stopTests(session())}
          disabled={session().isStopping()}
          class="ml-1 flex h-10 items-center gap-2 rounded-lg bg-red-600 px-3 text-[11px] font-bold text-white shadow-sm transition-all hover:bg-red-500 disabled:cursor-wait disabled:opacity-70"
        >
          <Show when={session().isStopping()} fallback={<i class="fa-solid fa-stop text-[10px]"></i>}>
            <i class="fa-solid fa-circle-notch animate-spin text-[10px]"></i>
          </Show>
          {tt().stop}
        </button>
      </div>

      {/* Etapas */}
      <div class="mt-3 flex items-center gap-1">
        <For each={PHASE_STEPS}>
          {(step, index) => {
            const state = () => {
              const current = phaseIndex();
              const idx = PHASE_ORDER.indexOf(step.phase);
              return idx < current ? 'done' : idx === current ? 'active' : 'pending';
            };
            return (
              <>
                <div class={`flex min-w-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-bold transition-all ${
                  state() === 'done'
                    ? 'border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400'
                    : state() === 'active'
                      ? 'border-blue-500/40 bg-blue-500/15 text-blue-600 dark:text-blue-300'
                      : 'border-gray-300 text-gray-400 dark:border-gray-700'
                }`}>
                  <Show
                    when={state() === 'active'}
                    fallback={<i class={`fa-solid ${state() === 'done' ? 'fa-check' : step.icon} text-[9px]`}></i>}
                  >
                    <i class="fa-solid fa-circle-notch animate-spin text-[9px]"></i>
                  </Show>
                  <span class="truncate">{tt()[step.key]}</span>
                </div>
                <Show when={index() < PHASE_STEPS.length - 1}>
                  <div class={`h-px min-w-[8px] flex-1 ${PHASE_ORDER.indexOf(step.phase) < phaseIndex() ? 'bg-green-500/50' : 'bg-gray-300 dark:bg-gray-700'}`}></div>
                </Show>
              </>
            );
          }}
        </For>
      </div>

      {/* Progresso */}
      <div class="mt-3">
        <div class="relative h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <Show
            when={progressPct() !== null}
            fallback={<div class="test-progress-indeterminate absolute inset-y-0 w-1/3 rounded-full bg-blue-500"></div>}
          >
            <div class="flex h-full">
              <div class="h-full bg-green-500 transition-all duration-500" style={{ width: `${run()!.expected ? (run()!.passed / run()!.expected) * 100 : 0}%` }}></div>
              <div class="h-full bg-red-500 transition-all duration-500" style={{ width: `${run()!.expected ? (run()!.failed / run()!.expected) * 100 : 0}%` }}></div>
              <div class="h-full bg-amber-500 transition-all duration-500" style={{ width: `${run()!.expected ? (run()!.skipped / run()!.expected) * 100 : 0}%` }}></div>
            </div>
          </Show>
        </div>
        <div class="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-semibold text-gray-500 dark:text-gray-400">
          <span>
            <i class="fa-solid fa-list-check mr-1"></i>
            {tt().completed}: <b class="text-gray-700 dark:text-gray-200">{run()?.results}</b>
            <Show when={run()?.expected}> / {run()?.expected}</Show>
            <Show when={progressPct() !== null}> ({progressPct()}%)</Show>
          </span>
          <span class="text-green-600 dark:text-green-400"><i class="fa-solid fa-check mr-1"></i>{run()?.passed}</span>
          <span class="text-red-600 dark:text-red-400"><i class="fa-solid fa-xmark mr-1"></i>{run()?.failed}</span>
          <span class="text-amber-600 dark:text-amber-400"><i class="fa-solid fa-minus mr-1"></i>{run()?.skipped}</span>
          <span><i class="fa-solid fa-terminal mr-1"></i>{tt().output_lines}: {run()?.linesReceived}</span>
          <Show when={etaMs() !== null}>
            <span><i class="fa-regular fa-hourglass-half mr-1"></i>{tt().remaining}: ~{formatElapsed(etaMs()!)}</span>
          </Show>
        </div>
      </div>

      {/* Atividade atual */}
      <div class="mt-2 grid gap-1 rounded-lg border border-gray-200 bg-white/70 p-2 font-mono text-[10px] dark:border-gray-700 dark:bg-gray-900/50">
        <Show when={run()?.currentTest}>
          <div class="flex min-w-0 items-center gap-2">
            <span class="shrink-0 font-sans font-bold uppercase tracking-wide text-gray-400">{tt().now_running}</span>
            <i class="fa-solid fa-circle-notch animate-spin text-blue-500"></i>
            <span class="truncate text-gray-700 dark:text-gray-200 select-text">{run()?.currentTest}</span>
          </div>
        </Show>
        <div class="flex min-w-0 items-center gap-2">
          <span class="shrink-0 font-sans font-bold uppercase tracking-wide text-gray-400">{tt().last_result}</span>
          <Show when={run()?.lastResult} fallback={<span class="italic text-gray-400">—</span>}>
            {(last) => (
              <>
                <i class={`fa-solid ${last().status === 'pass' ? 'fa-check text-green-500' : last().status === 'skip' ? 'fa-minus text-amber-500' : 'fa-xmark text-red-500'}`}></i>
                <span class="truncate text-gray-700 dark:text-gray-200 select-text">{last().name}</span>
              </>
            )}
          </Show>
        </div>
        <div class="flex min-w-0 items-center gap-2">
          <span class="shrink-0 font-sans font-bold uppercase tracking-wide text-gray-400">{tt().last_output}</span>
          <span class="truncate text-gray-500 dark:text-gray-400 select-text">{run()?.lastLine || tt().waiting_output}</span>
        </div>
      </div>

      <div class="mt-2 flex items-center gap-1.5 text-[10px] text-gray-400">
        <i class="fa-solid fa-circle-info"></i>
        {tt().background_hint}
      </div>
    </div>
  );

  const FinishedBar = () => (
    <div class={`flex flex-wrap items-center gap-3 border-b px-3 py-2 ${outcomeStyle().border} ${outcomeStyle().bg}`}>
      <i class={`fa-solid ${outcomeStyle().icon} ${outcomeStyle().color} text-base`}></i>
      <div class="min-w-0 flex-1">
        <div class={`text-[11px] font-bold ${outcomeStyle().color}`}>{tt()[`outcome_${run()?.outcome}`]}</div>
        <div class="truncate text-[10px] text-gray-500 dark:text-gray-400 select-text">
          {scopeText()} · {run()?.runnerLabel} · {tt().finished_in} {formatElapsed(elapsedMs())} · {new Date(run()!.startedAt).toLocaleTimeString()}
          <span class="ml-2 text-green-600 dark:text-green-400">✓ {run()?.passed}</span>
          <span class="ml-2 text-red-600 dark:text-red-400">✗ {run()?.failed}</span>
          <span class="ml-2 text-amber-600 dark:text-amber-400">○ {run()?.skipped}</span>
          <Show when={run()?.errorMessage}>
            <span class="ml-2 text-red-500">· {run()?.errorMessage}</span>
          </Show>
        </div>
      </div>
      <div class="flex shrink-0 items-center gap-1">
        <Show when={stats().failed > 0 || session().compilationError()}>
          <button
            onClick={() => copyToClipboard(buildReport(session(), { onlyFailures: true }))}
            class="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold text-red-600 hover:bg-red-500/10 dark:text-red-400"
            title={tt().copy_failures}
          >
            <i class="fa-regular fa-copy"></i>{tt().copy_failures}
          </button>
        </Show>
        <button
          onClick={() => copyToClipboard(buildReport(session()))}
          class="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold text-gray-600 hover:bg-gray-500/10 dark:text-gray-300"
          title={tt().copy_report}
        >
          <i class="fa-solid fa-file-lines"></i>{tt().copy_report}
        </button>
        <button
          onClick={() => dismissRun(session())}
          class="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-gray-500/10 hover:text-gray-600"
          title={tt().dismiss}
        >
          <i class="fa-solid fa-xmark text-[10px]"></i>
        </button>
      </div>
    </div>
  );

  const ConsolePanel = () => (
    <div class="flex shrink-0 flex-col border-t border-gray-300 dark:border-gray-700" style={{ height: consoleOpen() ? `${consoleHeight()}px` : 'auto' }}>
      <Show when={consoleOpen()}>
        <div
          class="h-1 cursor-row-resize bg-transparent transition-colors hover:bg-blue-500/40"
          onMouseDown={(e) => { e.preventDefault(); setIsResizingConsole(true); }}
        />
      </Show>
      <div class="flex items-center gap-2 bg-gray-100 px-3 py-1.5 dark:bg-gray-900">
        <button
          onClick={() => setConsoleOpen(!consoleOpen())}
          class="flex min-w-0 flex-1 items-center gap-2 text-left text-[10px] font-black uppercase tracking-wider text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <i class={`fa-solid ${consoleOpen() ? 'fa-chevron-down' : 'fa-chevron-up'} text-[9px]`}></i>
          <i class="fa-solid fa-terminal text-[9px]"></i>
          {tt().console}
          <span class="rounded bg-gray-300 px-1.5 py-0.5 text-[9px] font-bold normal-case tracking-normal dark:bg-gray-700">
            {session().consoleLines().length}
          </span>
          <Show when={isRunning()}>
            <span class="flex items-center gap-1 normal-case tracking-normal text-blue-500">
              <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500"></span>live
            </span>
          </Show>
        </button>
        <Show when={consoleOpen()}>
          <button
            onClick={() => {
              const next = !autoScroll();
              setAutoScroll(next);
              if (next && consoleRef) consoleRef.scrollTop = consoleRef.scrollHeight;
            }}
            title={tt().auto_scroll}
            class={`flex h-6 items-center gap-1 rounded px-1.5 text-[10px] font-bold ${autoScroll() ? 'bg-blue-500/15 text-blue-600 dark:text-blue-300' : 'text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800'}`}
          >
            <i class="fa-solid fa-arrow-down-long text-[9px]"></i>{tt().auto_scroll}
          </button>
          <button
            onClick={() => copyToClipboard(formatConsoleForCopy(session().consoleLines()))}
            disabled={session().consoleLines().length === 0}
            title={tt().copy_output}
            class="flex h-6 items-center gap-1 rounded px-1.5 text-[10px] font-bold text-gray-500 hover:bg-gray-200 disabled:opacity-40 dark:hover:bg-gray-800"
          >
            <i class="fa-regular fa-copy text-[9px]"></i>{tt().copy}
          </button>
          <button
            onClick={() => clearConsole(session())}
            disabled={isRunning() || session().consoleLines().length === 0}
            title={tt().clear}
            class="flex h-6 items-center gap-1 rounded px-1.5 text-[10px] font-bold text-gray-500 hover:bg-gray-200 disabled:opacity-40 dark:hover:bg-gray-800"
          >
            <i class="fa-solid fa-eraser text-[9px]"></i>{tt().clear}
          </button>
        </Show>
      </div>
      <Show when={consoleOpen()}>
        <div
          ref={consoleRef}
          onScroll={onConsoleScroll}
          tabIndex={0}
          class="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-white px-3 py-2 font-mono text-[11px] leading-[1.45] select-text dark:bg-gray-950 focus:outline-none"
        >
          <Show
            when={session().consoleLines().length > 0}
            fallback={<div class="select-none italic text-gray-400">{tt().console_empty}</div>}
          >
            <For each={session().consoleLines()}>
              {(line) => (
                <div class="flex gap-3 hover:bg-gray-100 dark:hover:bg-gray-900">
                  <span class="shrink-0 select-none tabular-nums text-gray-400/70">{formatElapsed(line.at)}</span>
                  <span class={`min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere] ${consoleLineClass(line)}`}>{line.text}</span>
                </div>
              )}
            </For>
          </Show>
        </div>
      </Show>
    </div>
  );

  const CompilationErrorView = () => (
    <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-red-950/10 p-4 animate-fadeIn">
      <div class="mb-3 flex min-w-0 shrink-0 items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-3">
        <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500 text-sm text-white shadow-[0_0_15px_rgba(239,68,68,0.3)]">
          <i class="fa-solid fa-triangle-exclamation"></i>
        </div>
        <div class="min-w-0 flex-1">
          <h3 class="text-sm font-bold uppercase tracking-wide text-red-500">
            {tt().compile_error_title} ({activeFramework() || 'Build'})
          </h3>
          <p class="text-[11px] opacity-70">{tt().compile_error_desc}</p>
        </div>
        <button
          onClick={() => copyToClipboard((session().compilationError() || []).join('\n'))}
          class="flex shrink-0 items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-red-500"
        >
          <i class="fa-regular fa-copy"></i>{tt().copy_error}
        </button>
      </div>

      <div class="flex min-h-[120px] min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-300 bg-white font-mono shadow-inner dark:border-gray-800 dark:bg-gray-950">
        <div class="flex items-center justify-between border-b border-gray-300 bg-gray-100 px-4 py-2 text-[10px] font-bold uppercase tracking-wider opacity-60 dark:border-gray-800 dark:bg-gray-900">
          <span>{tt().compile_output}</span>
          <i class="fa-solid fa-terminal text-[9px]"></i>
        </div>
        <div class="min-h-0 min-w-0 flex-1 overflow-auto whitespace-pre-wrap p-4 text-[11px] leading-relaxed text-red-600 [overflow-wrap:anywhere] select-text selection:bg-red-500/30 dark:text-red-300">
          <For each={session().compilationError()}>
            {(line) => {
              const isTargetError = line.includes('error TS') || line.includes('error CS') || line.includes('undefined:') || line.includes('FAILED') || line.includes('error[E');
              return <div class={isTargetError ? 'rounded bg-red-500/5 px-1 py-0.5 font-bold text-red-500' : ''}>{line}</div>;
            }}
          </For>
        </div>
      </div>
    </div>
  );

  const EmptyState = () => (
    <div class="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
      <Show
        when={failedSpecs().length > 0}
        fallback={
          <div class="flex flex-1 flex-col items-center justify-center text-center opacity-40">
            <i class="fa-solid fa-vials mb-4 text-4xl"></i>
            <span class="text-sm italic">{tt().select_suit}</span>
          </div>
        }
      >
        <div class="mb-2 flex items-center justify-between px-1">
          <span class="text-[10px] font-black uppercase tracking-[0.16em] text-red-500">
            <i class="fa-solid fa-circle-xmark mr-1"></i>{tt().failures} ({failedSpecs().length})
          </span>
          <button
            onClick={() => copyToClipboard(buildReport(session(), { onlyFailures: true }))}
            class="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold text-red-600 hover:bg-red-500/10 dark:text-red-400"
          >
            <i class="fa-regular fa-copy"></i>{tt().copy_failures}
          </button>
        </div>
        <div class="space-y-1.5">
          <For each={failedSpecs()}>
            {(spec) => (
              <button
                onClick={() => session().setSelectedSuite(spec.name.split(' > ')[0].trim())}
                class="flex w-full items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-left hover:bg-red-500/10"
              >
                <i class="fa-solid fa-xmark text-[10px] text-red-500"></i>
                <span class="min-w-0 flex-1 truncate text-[11px] font-semibold">{spec.name}</span>
                <i class="fa-solid fa-chevron-right text-[9px] text-gray-400"></i>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );

  const SuiteView = () => (
    <>
      <div class="border-b border-gray-300 bg-white p-3 dark:border-gray-700 dark:bg-gray-800/30">
        <div class="flex min-w-0 items-center justify-between gap-3">
          <div class="flex min-w-0 items-center gap-3">
            <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-300">
              <i class="fa-solid fa-flask text-sm"></i>
            </div>
            <div class="min-w-0">
              <div class="text-[9px] font-black uppercase tracking-[0.18em] text-gray-400">{activeFramework() || tt().test}</div>
              <h2 class="truncate text-sm font-bold tracking-tight text-gray-800 select-text dark:text-gray-100">{selectedSuite()}</h2>
            </div>
          </div>

          <div class="flex shrink-0 items-center gap-2">
            <Show
              when={isRunning() && groupedSpecs()[selectedSuite()!]?.tests.some(t => t.status === 'running')}
              fallback={
                <span class={`hidden items-center gap-1.5 rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wide sm:flex ${
                  selectedSuiteStats().failed > 0
                    ? 'border-red-500/20 bg-red-500/10 text-red-500'
                    : 'border-green-500/20 bg-green-500/10 text-green-500'
                }`}>
                  <i class={`fa-solid ${selectedSuiteStats().failed > 0 ? 'fa-circle-xmark' : 'fa-circle-check'}`}></i>
                  {selectedSuiteStats().failed > 0 ? tt().failed : tt().passed}
                </span>
              }
            >
              <span class="hidden items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-blue-500 sm:flex">
                <i class="fa-solid fa-circle-notch animate-spin"></i>
                {tt().running}
              </span>
            </Show>
            <button
              onClick={() => copyToClipboard(buildReport(session(), { suite: selectedSuite() }))}
              title={tt().copy_suite}
              aria-label={tt().copy_suite}
              class="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-600 transition-all hover:bg-gray-600 hover:text-white dark:bg-gray-700 dark:text-gray-200"
            >
              <i class="fa-regular fa-copy text-[11px]"></i>
            </button>
            <button
              onClick={() => runSuite(session(), selectedSuite()!)}
              disabled={busy()}
              title={tt().rerun}
              aria-label={tt().rerun}
              class="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-600 transition-all hover:bg-blue-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200"
            >
              <Show when={isRunning() && groupedSpecs()[selectedSuite()!]?.tests.some(t => t.status === 'running')} fallback={<i class="fa-solid fa-rotate-right text-[10px]"></i>}>
                <i class="fa-solid fa-circle-notch animate-spin text-[10px]"></i>
              </Show>
            </button>
          </div>
        </div>

        <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div class="rounded-lg border border-gray-200 bg-gray-50/80 px-2.5 py-2 dark:border-gray-700 dark:bg-gray-900/30">
            <div class="flex items-center justify-between text-[9px] font-bold uppercase tracking-wide text-gray-400"><span>{tt().tests}</span><i class="fa-solid fa-layer-group"></i></div>
            <div class="mt-1 text-base font-black text-gray-800 dark:text-gray-100">{selectedSuiteStats().total}</div>
          </div>
          <div class="rounded-lg border border-green-500/15 bg-green-500/5 px-2.5 py-2">
            <div class="flex items-center justify-between text-[9px] font-bold uppercase tracking-wide text-green-600/70 dark:text-green-400/70"><span>{tt().passed}</span><i class="fa-solid fa-check"></i></div>
            <div class="mt-1 text-base font-black text-green-600 dark:text-green-400">{selectedSuiteStats().passed}</div>
          </div>
          <div class="rounded-lg border border-red-500/15 bg-red-500/5 px-2.5 py-2">
            <div class="flex items-center justify-between text-[9px] font-bold uppercase tracking-wide text-red-600/70 dark:text-red-400/70"><span>{tt().failed}</span><i class="fa-solid fa-xmark"></i></div>
            <div class="mt-1 text-base font-black text-red-600 dark:text-red-400">{selectedSuiteStats().failed}</div>
          </div>
          <div class="rounded-lg border border-blue-500/15 bg-blue-500/5 px-2.5 py-2">
            <div class="flex items-center justify-between text-[9px] font-bold uppercase tracking-wide text-blue-600/70 dark:text-blue-400/70"><span>{tt().rating_score}</span><i class="fa-solid fa-chart-line"></i></div>
            <div class="mt-1 text-base font-black text-blue-600 dark:text-blue-400">{selectedSuiteStats().passRate}%</div>
          </div>
        </div>

        <div class="mt-3 flex items-center gap-3">
          <div class="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div class="flex h-full">
              <div class="h-full bg-green-500 transition-all duration-500" style={{ width: `${selectedSuiteStats().total ? (selectedSuiteStats().passed / selectedSuiteStats().total) * 100 : 0}%` }}></div>
              <div class="h-full bg-red-500 transition-all duration-500" style={{ width: `${selectedSuiteStats().total ? (selectedSuiteStats().failed / selectedSuiteStats().total) * 100 : 0}%` }}></div>
              <div class="h-full bg-amber-500 transition-all duration-500" style={{ width: `${selectedSuiteStats().total ? (selectedSuiteStats().skipped / selectedSuiteStats().total) * 100 : 0}%` }}></div>
            </div>
          </div>
          <span class="shrink-0 text-[10px] font-bold text-gray-400">{selectedSuiteStats().passed}/{selectedSuiteStats().total} {tt().passed.toLowerCase()}</span>
        </div>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto p-3">
        <div class="mb-2 flex items-center justify-between px-1">
          <span class="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">{tt().test_details}</span>
          <span class="text-[10px] font-medium text-gray-400">{selectedSuiteStats().total} {tt().tests.toLowerCase()}</span>
        </div>
        <div class="space-y-1.5">
          <For each={groupedSpecs()[selectedSuite()!]?.tests || []}>
            {(spec) => (
              <div
                onContextMenu={(event) => showTestContextMenu(event, spec)}
                class={`group flex min-h-[42px] items-start gap-3 rounded-lg border px-3 py-2 transition-all hover:shadow-sm ${
                  spec.status === 'pass'
                    ? 'border-green-500/20 bg-green-500/5'
                    : spec.status === 'running'
                      ? 'border-blue-500/20 bg-blue-500/5 shadow-[0_0_15px_rgba(59,130,246,0.05)]'
                      : spec.status === 'skip'
                        ? 'border-amber-500/20 bg-amber-500/5'
                        : 'border-red-500/20 bg-red-500/5 shadow-[0_0_15px_rgba(239,68,68,0.1)]'
                }`}
              >
                <div class={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all ${
                  spec.status === 'pass'
                    ? 'bg-green-500 text-white'
                    : spec.status === 'running'
                      ? 'animate-pulse bg-blue-500 text-white'
                      : spec.status === 'skip'
                        ? 'bg-amber-500 text-white'
                        : 'bg-red-500 text-white'
                }`}>
                  <Show when={spec.status === 'running'} fallback={<i class={`fa-solid text-[10px] ${spec.status === 'pass' ? 'fa-check' : spec.status === 'skip' ? 'fa-minus' : 'fa-xmark'}`}></i>}>
                    <i class="fa-solid fa-circle-notch animate-spin text-[10px]"></i>
                  </Show>
                </div>

                <div class="min-w-0 flex-1 pt-1">
                  <div class={`text-[11px] font-semibold tracking-tight transition-opacity select-text ${spec.status === 'running' ? 'opacity-60' : 'opacity-100'}`}>
                    {testDisplayName(spec)}
                  </div>

                  <Show when={spec.status === 'fail' && spec.log.length > 0}>
                    <div
                      class="mt-2 min-w-0 rounded border border-red-500/30 bg-white/60 font-mono text-[11px] text-black dark:bg-red-950/30 dark:text-red-200"
                      onContextMenu={(event) => event.stopPropagation()}
                    >
                      <div class="flex items-center justify-between border-b border-red-500/20 px-3 py-1.5">
                        <span class="text-[10px] uppercase tracking-wide text-red-600 dark:text-red-300">{tt().error_details}</span>
                        <button
                          onClick={() => copyToClipboard(formatSpecForCopy(spec))}
                          title={tt().copy_error}
                          class="flex items-center gap-1 rounded px-1.5 py-0.5 font-sans text-[10px] font-bold text-red-600 hover:bg-red-500/10 dark:text-red-300"
                        >
                          <i class="fa-regular fa-copy"></i>{tt().copy}
                        </button>
                      </div>
                      <div class="max-h-80 overflow-auto p-3 select-text cursor-text">
                        <For each={spec.log}>
                          {(logLine) => (
                            <div class={`mb-1 whitespace-pre-wrap [overflow-wrap:anywhere] ${/^\s*at\s/.test(logLine) ? 'text-[10px] opacity-50' : 'font-bold'}`}>
                              {logLine}
                            </div>
                          )}
                        </For>
                      </div>
                    </div>
                  </Show>
                </div>

                <div class="flex items-center gap-3 pt-0.5">
                  <button
                    onClick={() => runSingleTest(session(), spec)}
                    disabled={busy()}
                    title={`${tt().run_only}: ${testDisplayName(spec)}`}
                    class="rounded-lg bg-gray-200 p-1.5 text-[10px] opacity-0 transition-opacity hover:bg-blue-500 hover:text-white focus:opacity-100 group-hover:opacity-100 disabled:opacity-30 dark:bg-gray-700"
                  >
                    <i class="fa-solid fa-play"></i>
                  </button>

                  <div class="flex min-w-[60px] flex-col items-end gap-1">
                    <div class={`rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wide ${
                      spec.status === 'pass'
                        ? 'border-green-500/20 bg-green-500/10 text-green-600 dark:text-green-400'
                        : spec.status === 'running'
                          ? 'animate-pulse border-blue-500/20 bg-blue-500/10 text-blue-500'
                          : spec.status === 'skip'
                            ? 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            : 'border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400'
                    }`}>
                      {spec.status === 'pass'
                        ? tt().passed
                        : spec.status === 'running'
                          ? tt().running
                          : spec.status === 'skip'
                            ? tt().skipped
                            : tt().failed}
                    </div>
                    <Show when={spec.duration && spec.status !== 'running'}>
                      <span class="font-mono text-[9px] dark:text-white">{formatDuration(spec.duration)}</span>
                    </Show>
                  </div>
                </div>
              </div>
            )}
          </For>
        </div>
      </div>
    </>
  );

  // ---- render --------------------------------------------------------------
  return (
    <div
      class={`flex h-full w-full min-w-0 flex-1 overflow-hidden bg-gray-200 text-gray-800 dark:bg-gray-900 dark:text-gray-200 ${isResizing() || isResizingConsole() ? 'select-none' : ''}`}
      onMouseMove={onMouseMove}
      onMouseUp={stopResizing}
      onMouseLeave={stopResizing}
    >
      {/* Sidebar */}
      <div class="height-container flex shrink-0 select-none flex-col overflow-auto pb-2 pl-2 pt-2" style={{ width: `${sidebarWidth()}px` }}>
        <div class="container-branch-list flex h-full flex-col overflow-hidden p-0">
          <div class="border-b border-gray-300 bg-gray-100 p-2.5 dark:border-gray-700 dark:bg-gray-800/50">
            <div class="mb-2 flex items-center justify-between gap-2">
              <div class="flex min-w-0 flex-1 items-center gap-2">
                <Show
                  when={(projectInfo()?.runners.length || 0) > 1}
                  fallback={
                    <span class="flex min-w-0 items-center gap-2 truncate text-[10px] font-bold uppercase text-gray-500 dark:text-white">
                      <FileIcon fileName={activeRunner()?.label || 'dockerfile'} />
                      {activeRunner()?.label || 'Runner'}
                    </span>
                  }
                >
                  <select
                    value={session().selectedRunnerId() || ''}
                    onChange={(event) => selectRunner(session(), event.currentTarget.value)}
                    disabled={isRunning()}
                    aria-label={tt().select_runner}
                    class="min-w-0 flex-1 rounded border border-gray-300 bg-white px-1.5 py-1 text-[10px] font-semibold text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                  >
                    <For each={projectInfo()?.runners || []}>
                      {(runner) => <option value={runner.id}>{runner.label}</option>}
                    </For>
                  </select>
                </Show>
              </div>
              <div class="flex items-center gap-1">
                <button
                  onClick={() => setSettingsOpen(true)}
                  disabled={isRunning()}
                  title={tt().settings}
                  aria-label={tt().settings}
                  class="h-7 w-7 rounded-lg text-gray-500 transition-colors hover:bg-gray-200 hover:text-blue-500 disabled:opacity-40 dark:hover:bg-gray-700"
                >
                  <i class="fa-solid fa-gear text-[11px]"></i>
                </button>
                <Show
                  when={isRunning()}
                  fallback={
                    <button
                      onClick={() => runAllTests(session())}
                      disabled={busy()}
                      title={otherRepoRunning() ? tt().running_other_repo : tt().run_tests}
                      aria-label={tt().run_tests}
                      class="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm transition-all hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400/50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <i class="fa-solid fa-play text-[10px]"></i>
                    </button>
                  }
                >
                  <button
                    onClick={() => stopTests(session())}
                    disabled={session().isStopping()}
                    title={tt().stop}
                    aria-label={tt().stop}
                    class="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600 text-white shadow-sm transition-all hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-400/50 disabled:cursor-wait disabled:opacity-70"
                  >
                    <Show when={session().isStopping()} fallback={<i class="fa-solid fa-stop text-[10px]"></i>}>
                      <i class="fa-solid fa-circle-notch animate-spin text-[10px]"></i>
                    </Show>
                  </button>
                </Show>
              </div>
            </div>

            {/* Mini status da execução */}
            <Show when={isRunning()}>
              <div class="mb-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-2 py-1.5">
                <div class="flex items-center gap-1.5 text-[10px] font-bold text-blue-600 dark:text-blue-300">
                  <i class="fa-solid fa-circle-notch animate-spin text-[9px]"></i>
                  <span class="truncate">{tt()[`phase_${run()?.phase}`] || tt().running}</span>
                  <span class="ml-auto font-mono tabular-nums">{formatElapsed(elapsedMs())}</span>
                </div>
                <div class="relative mt-1 h-1 overflow-hidden rounded-full bg-blue-500/20">
                  <Show
                    when={progressPct() !== null}
                    fallback={<div class="test-progress-indeterminate absolute inset-y-0 w-1/3 rounded-full bg-blue-500"></div>}
                  >
                    <div class="h-full rounded-full bg-blue-500 transition-all duration-500" style={{ width: `${progressPct()}%` }}></div>
                  </Show>
                </div>
                <div class="mt-1 flex justify-between text-[9px] font-semibold text-blue-600/80 dark:text-blue-300/80">
                  <span>{run()?.results}{run()?.expected ? ` / ${run()?.expected}` : ''}</span>
                  <span>
                    <span class="text-green-600 dark:text-green-400">✓{run()?.passed}</span>{' '}
                    <span class="text-red-600 dark:text-red-400">✗{run()?.failed}</span>
                  </span>
                </div>
              </div>
            </Show>

            <div class="mt-2 flex items-center gap-1 rounded-lg border border-gray-200 bg-white/70 p-1 dark:border-gray-700 dark:bg-gray-900/40">
              <button
                onClick={() => session().setFilterStatus('all')}
                title={tt().total}
                aria-label={tt().total}
                class={`flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md py-1 text-[10px] font-bold transition-all focus:outline-none ${
                  filterStatus() === 'all' ? 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-white' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <i class="fa-solid fa-layer-group text-[9px]"></i>
                {stats().total}
              </button>
              <button
                onClick={() => session().setFilterStatus('pass')}
                title={tt().passed}
                aria-label={tt().passed}
                class={`flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md py-1 text-[10px] font-bold transition-all focus:outline-none ${
                  filterStatus() === 'pass' ? 'bg-green-500/15 text-green-600 dark:text-green-400' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <i class="fa-solid fa-check text-[9px]"></i>
                {stats().passed}
              </button>
              <button
                onClick={() => session().setFilterStatus('fail')}
                title={tt().failed}
                aria-label={tt().failed}
                class={`flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md py-1 text-[10px] font-bold transition-all focus:outline-none ${
                  filterStatus() === 'fail' ? 'bg-red-500/15 text-red-600 dark:text-red-400' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <i class="fa-solid fa-xmark text-[9px]"></i>
                {stats().failed}
              </button>
            </div>

            <div class="relative mt-2">
              <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-[10px] opacity-50"></i>
              <input
                type="text"
                placeholder={t('common').search + '...'}
                value={session().searchQuery()}
                onInput={(e) => session().setSearchQuery(e.currentTarget.value)}
                class="w-full rounded-md border border-gray-300 bg-white py-1.5 pl-8 pr-3 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900"
              />
            </div>
          </div>

          <div class="flex items-center justify-between px-3 pb-1 pt-2">
            <span class="text-[9px] font-black uppercase tracking-[0.16em] text-gray-400">{tt().tests}</span>
            <span class="text-[9px] font-bold text-gray-400">{suites().length}</span>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5">
            <For each={suites()}>
              {(suite) => (
                <div
                  onClick={() => session().setSelectedSuite(suite)}
                  class={`flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 transition-all ${
                    selectedSuite() === suite
                      ? 'border-blue-400/50 bg-blue-500 text-white shadow-sm shadow-blue-900/20'
                      : 'border-transparent hover:border-gray-300 hover:bg-gray-200/80 dark:hover:border-gray-700 dark:hover:bg-gray-800'
                  }`}
                >
                  <Show
                    when={isRunning() && groupedSpecs()[suite].tests.some(t => t.status === 'running')}
                    fallback={
                      <Show when={groupedSpecs()[suite].hasError} fallback={<i class="fa-solid fa-circle-check text-[12px] text-green-500"></i>}>
                        <i class="fa-solid fa-circle-xmark text-[12px] text-red-500"></i>
                      </Show>
                    }
                  >
                    <i class="fa-solid fa-circle-notch animate-spin text-[12px] text-blue-400"></i>
                  </Show>

                  <span class={`truncate text-xs ${selectedSuite() === suite ? 'font-bold' : 'font-medium'}`}>{suite}</span>
                  <span class={`ml-auto rounded px-1.5 py-0.5 text-[10px] ${selectedSuite() === suite ? 'bg-white/20' : 'bg-gray-300 dark:bg-gray-700'}`}>
                    {groupedSpecs()[suite].tests.length}
                  </span>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>

      <div class="resize-bar-vertical" onMouseDown={(e) => { e.preventDefault(); setIsResizing(true); }} />

      {/* Painel principal */}
      <div class="height-container flex min-w-0 flex-1 flex-col overflow-hidden pb-2 pr-2 pt-2 [contain:inline-size]">
        <div ref={mainPanelRef} class="container-branch-list flex h-full min-w-0 flex-1 flex-col !space-y-0 overflow-hidden p-0">
          <OtherRepoBanner />

          <Show when={run()}>
            <Show when={isRunning()} fallback={<FinishedBar />}>
              <RunningPanel />
            </Show>
          </Show>

          <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <Show when={!session().compilationError()} fallback={<CompilationErrorView />}>
              <Show when={selectedSuite() && groupedSpecs()[selectedSuite()!]} fallback={<EmptyState />}>
                <SuiteView />
              </Show>
            </Show>
          </div>

          <ConsolePanel />
        </div>
      </div>

      <Show when={testMenuVisible()}>
        <ContextMenu
          name={contextTest()?.name || 'Teste'}
          items={testContextItems()}
          position={testMenuPosition()}
          onClose={hideTestContextMenu}
        />
      </Show>

      <Dialog
        open={settingsOpen()}
        title={tt().settings}
        icon="fa-solid fa-sliders"
        iconColor="text-blue-600 dark:text-blue-300"
        width="390px"
        onClose={() => setSettingsOpen(false)}
      >
        <div class="space-y-4">
          <div>
            <h3 class="text-sm font-bold text-gray-800 dark:text-white">{tt().settings}</h3>
            <p class="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{tt().settings_description}</p>
          </div>

          <label class="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/40">
            <input
              type="checkbox"
              checked={randomizeTests()}
              onChange={(event) => setRandomizeTests(event.currentTarget.checked)}
              class="mt-0.5 h-4 w-4 accent-blue-600"
            />
            <span>
              <span class="block text-xs font-bold text-gray-800 dark:text-gray-100">{tt().random_order}</span>
              <span class="mt-1 block text-[10px] leading-relaxed text-gray-500 dark:text-gray-400">{tt().random_order_description}</span>
            </span>
          </label>

          <div class="flex justify-end">
            <button
              onClick={() => setSettingsOpen(false)}
              class="rounded-md bg-blue-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-blue-500"
            >
              {t('common').close}
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};
