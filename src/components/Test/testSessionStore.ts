/**
 * Store global das execuções de testes.
 *
 * Todo o estado do executor de testes vive aqui (fora do componente), então trocar de
 * tela (dashboard, commits...) ou de projeto NÃO perde a execução em andamento: o
 * processo continua no backend e os eventos continuam sendo processados por este
 * módulo. Ao voltar para a tela de testes, o componente apenas reflete o estado atual.
 *
 * O backend só mantém UM processo de testes ativo por vez (ACTIVE_PROCESS em
 * process.rs), por isso existe um único `activeRunPath` global e os eventos
 * `test-event` são sempre roteados para a sessão do repositório que iniciou a execução.
 */
import { Accessor, batch, createEffect, createMemo, createRoot, createSignal, Setter } from 'solid-js';
import { listen } from '@tauri-apps/api/event';
import { ParsedEvent, ProjectType, TestRunnerOption } from '../../models/ProjectType.model';
import { getProjectType, getTestsFiles, runTestTerminal, stopTestExecution } from '../../services/testService';
import { notify } from '../../utils/notifications';
import { angularParser } from '../../lib/TestsPareser/AngularParser';
import { parseTrxToEvents } from '../../lib/TestsPareser/TrxParser';
import { goParser } from '../../lib/TestsPareser/goParser';
import { parseVitestToEvents } from '../../lib/TestsPareser/VitestParser';
import { rustParser } from '../../lib/TestsPareser/RustParser';
import { parseJavaXmlToEvents } from '../../lib/TestsPareser/JavaParser';
import { parseRubyJsonToEvents, rubyParser } from '../../lib/TestsPareser/RubyParser';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type TestStatus = 'pass' | 'fail' | 'running' | 'skip';

export interface TestSpec {
  id: string;
  name: string;
  status: TestStatus;
  log: string[];
  filePath?: string;
  duration?: string;
  resultId?: string;
  executionName?: string;
}

export interface MappedTestCase {
  name: string;
  suite: string;
}

export interface MappedTestFile {
  name: string;
  path: string;
  label: string;
  tests: MappedTestCase[];
}

export type RunScope = 'all' | 'suite' | 'single';
export type RunPhase = 'starting' | 'building' | 'running' | 'collecting' | 'done';
export type RunOutcome = 'passed' | 'failed' | 'stopped' | 'compile_error' | 'error' | 'empty';

export const PHASE_ORDER: RunPhase[] = ['starting', 'building', 'running', 'collecting', 'done'];

export interface RunInfo {
  id: number;
  scope: RunScope;
  suite?: string;
  singleTest?: string;
  filePath?: string;
  runnerId?: string;
  runnerLabel: string;
  framework?: string;
  startedAt: number;
  finishedAt?: number;
  phase: RunPhase;
  outcome?: RunOutcome;
  linesReceived: number;
  lastLine?: string;
  currentTest?: string;
  lastResult?: { name: string; status: TestStatus };
  results: number;
  passed: number;
  failed: number;
  skipped: number;
  expected: number;
  errorMessage?: string;
}

export type ConsoleKind = 'out' | 'err' | 'system' | 'pass' | 'fail' | 'skip' | 'error';

export interface ConsoleLine {
  id: number;
  at: number; // ms desde o início da execução
  text: string;
  kind: ConsoleKind;
}

export interface TestSession {
  repoPath: string;
  specs: Accessor<TestSpec[]>;
  setSpecs: Setter<TestSpec[]>;
  projectInfo: Accessor<ProjectType | null>;
  selectedRunnerId: Accessor<string | null>;
  mappedFiles: Accessor<MappedTestFile[]>;
  compilationError: Accessor<string[] | null>;
  run: Accessor<RunInfo | null>;
  isStopping: Accessor<boolean>;
  consoleLines: Accessor<ConsoleLine[]>;
  activeRunner: Accessor<TestRunnerOption | null>;
  activeFramework: () => string | undefined;
  // estado de UI preservado entre navegações
  selectedSuite: Accessor<string | null>;
  setSelectedSuite: Setter<string | null>;
  searchQuery: Accessor<string>;
  setSearchQuery: Setter<string>;
  filterStatus: Accessor<'all' | 'pass' | 'fail'>;
  setFilterStatus: Setter<'all' | 'pass' | 'fail'>;
}

interface InternalSession extends TestSession {
  setProjectInfo: Setter<ProjectType | null>;
  setSelectedRunnerId: Setter<string | null>;
  setMappedFiles: Setter<MappedTestFile[]>;
  setCompilationError: Setter<string[] | null>;
  setRun: Setter<RunInfo | null>;
  setIsStopping: Setter<boolean>;
  setConsoleLines: Setter<ConsoleLine[]>;
  projectInfoRequested: boolean;
  mappingRequestId: number;
  compileLogBuffer: string[];
  seenResults: Set<string>;
  /** Resultados de cada runner (Karma, Vitest, Cargo...) mantidos em memória. */
  runnerStates: Map<string, RunnerState>;
}

/** Tudo que pertence a um runner específico e precisa sobreviver à troca de runner. */
interface RunnerState {
  specs: TestSpec[];
  run: RunInfo | null;
  consoleLines: ConsoleLine[];
  compilationError: string[] | null;
  selectedSuite: string | null;
}

// ---------------------------------------------------------------------------
// Estado global
// ---------------------------------------------------------------------------

const MAX_CONSOLE_LINES = 4000;
const COMPILE_BUFFER_SIZE = 50;

const sessions = new Map<string, InternalSession>();

const [activeRunPath, setActiveRunPath] = createSignal<string | null>(null);
const [visibleRepoPath, setVisibleRepoPath] = createSignal<string | null>(null);
const [now, setNow] = createSignal(Date.now());
const [randomizeTests, setRandomizeTestsSignal] = createSignal(
  localStorage.getItem('test-runner-randomize') === 'true'
);

/** Caminho do repositório com testes em execução (ou null). */
export { activeRunPath, now, randomizeTests };

export const setRandomizeTests = (enabled: boolean) => {
  setRandomizeTestsSignal(enabled);
  localStorage.setItem('test-runner-randomize', String(enabled));
};

/** Informa qual repositório está com a tela de testes visível (usado para notificações). */
export const setVisibleTestRepo = (path: string | null) => setVisibleRepoPath(path);

type Translator = (key: string) => string;
let translate: Translator = (key) => key;
/** Registra as traduções usadas nas notificações disparadas em segundo plano. */
export const registerTestTranslator = (fn: Translator) => { translate = fn; };

export const repoDisplayName = (path?: string | null) =>
  (path || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path || '';

let runCounter = 0;
let consoleCounter = 0;
let ticker: ReturnType<typeof setInterval> | undefined;

const startTicker = () => {
  if (ticker) return;
  setNow(Date.now());
  ticker = setInterval(() => setNow(Date.now()), 1000);
};

const stopTicker = () => {
  if (ticker) clearInterval(ticker);
  ticker = undefined;
  setNow(Date.now());
};

// ---------------------------------------------------------------------------
// Sessões
// ---------------------------------------------------------------------------

// Chaves antigas (um único cache por repositório, antes de separar por runner)
const legacySpecsKey = (path: string) => `brook_test_cache_${path}`;
const legacyLastRunKey = (path: string) => `brook_test_lastrun_${path}`;
// Chaves atuais: um cache por repositório + runner
const specsKey = (path: string, runnerId: string) => `brook_test_cache_${path}::${runnerId}`;
const lastRunKey = (path: string, runnerId: string) => `brook_test_lastrun_${path}::${runnerId}`;
const preferredRunnerKey = (path: string) => `brook_test_runner_${path}`;

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const createSession = (repoPath: string): InternalSession =>
  createRoot(() => {
    // Os resultados são carregados por runner assim que o tipo do projeto é detectado
    // (veja ensureProjectInfo / loadRunnerState).
    const [specs, setSpecs] = createSignal<TestSpec[]>([]);
    const [projectInfo, setProjectInfo] = createSignal<ProjectType | null>(null);
    const [selectedRunnerId, setSelectedRunnerId] = createSignal<string | null>(null);
    const [mappedFiles, setMappedFiles] = createSignal<MappedTestFile[]>([]);
    const [compilationError, setCompilationError] = createSignal<string[] | null>(null);
    const [run, setRun] = createSignal<RunInfo | null>(null);
    const [isStopping, setIsStopping] = createSignal(false);
    const [consoleLines, setConsoleLines] = createSignal<ConsoleLine[]>([]);
    const [selectedSuite, setSelectedSuite] = createSignal<string | null>(null);
    const [searchQuery, setSearchQuery] = createSignal('');
    const [filterStatus, setFilterStatus] = createSignal<'all' | 'pass' | 'fail'>('all');

    const activeRunner = createMemo<TestRunnerOption | null>(() => {
      const info = projectInfo();
      if (!info) return null;
      return info.runners.find(runner => runner.id === selectedRunnerId())
        || info.runners[0]
        || {
          id: 'legacy',
          label: info.testRunner,
          kind: info.testRunner.toLowerCase(),
          framework: info.framework,
          targetPath: null,
        };
    });

    // Persiste os resultados do runner atual (cada runner tem sua própria chave)
    const storageTimers = new Map<string, ReturnType<typeof setTimeout>>();
    createEffect(() => {
      const list = specs();
      const runnerId = selectedRunnerId();
      if (!runnerId || list.length === 0) return;
      const key = specsKey(repoPath, runnerId);
      const pending = storageTimers.get(key);
      if (pending) clearTimeout(pending);
      storageTimers.set(key, setTimeout(() => {
        storageTimers.delete(key);
        try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* quota */ }
      }, 300));
    });

    return {
      repoPath,
      specs, setSpecs,
      projectInfo, setProjectInfo,
      selectedRunnerId, setSelectedRunnerId,
      mappedFiles, setMappedFiles,
      compilationError, setCompilationError,
      run, setRun,
      isStopping, setIsStopping,
      consoleLines, setConsoleLines,
      selectedSuite, setSelectedSuite,
      searchQuery, setSearchQuery,
      filterStatus, setFilterStatus,
      activeRunner,
      activeFramework: () => activeRunner()?.framework || projectInfo()?.framework,
      projectInfoRequested: false,
      mappingRequestId: 0,
      compileLogBuffer: [],
      seenResults: new Set<string>(),
      runnerStates: new Map<string, RunnerState>(),
    };
  });

export const getTestSession = (repoPath: string): TestSession => {
  ensureListener();
  let session = sessions.get(repoPath);
  if (!session) {
    session = createSession(repoPath);
    sessions.set(repoPath, session);
  }
  return session;
};

const internal = (session: TestSession) => session as InternalSession;

export const isSessionRunning = (session: TestSession) => activeRunPath() === session.repoPath;

// ---------------------------------------------------------------------------
// Mapeamento físico dos arquivos de teste
// ---------------------------------------------------------------------------

export const isSuiteMatch = (rawSuite: string, mappedSuite: string): boolean => {
  const s1 = rawSuite.trim().toLowerCase();
  const s2 = mappedSuite.trim().toLowerCase();
  return s1 === s2 || s1.startsWith(s2 + ' >') || s2.startsWith(s1 + ' >');
};

export const findFilePathForTest = (session: TestSession, suite: string, testName: string) =>
  session.mappedFiles().find(file =>
    file.tests.some(t => isSuiteMatch(suite, t.suite) && t.name.trim() === testName.trim())
  )?.path;

export const findFilePathBySuite = (session: TestSession, suiteName: string) => {
  if (!suiteName) return undefined;
  return session.mappedFiles().find(file => file.tests.some(t => isSuiteMatch(suiteName, t.suite)))?.path;
};

export const updateFileMapping = async (session: TestSession, runner = session.activeRunner()) => {
  const s = internal(session);
  if (!runner) return;
  const requestId = ++s.mappingRequestId;
  try {
    const files = await getTestsFiles(s.repoPath, runner);
    if (requestId !== s.mappingRequestId || s.activeRunner()?.id !== runner.id) return;
    s.setMappedFiles(files);
  } catch (e) {
    console.error('Erro ao remapear arquivos de testes:', e);
  }
};

const snapshotRunnerState = (s: InternalSession): RunnerState => ({
  specs: s.specs(),
  run: s.run(),
  consoleLines: s.consoleLines(),
  compilationError: s.compilationError(),
  selectedSuite: s.selectedSuite(),
});

/** Lê o estado de um runner: memória primeiro, depois o cache em disco (localStorage). */
const loadRunnerState = (s: InternalSession, runnerId: string, allowUnlabeledLegacy: boolean): RunnerState => {
  const inMemory = s.runnerStates.get(runnerId);
  if (inMemory) return inMemory;

  let specs = readJson<TestSpec[] | null>(specsKey(s.repoPath, runnerId), null);
  let run = readJson<RunInfo | null>(lastRunKey(s.repoPath, runnerId), null);

  // Migração do cache antigo (sem runner): vai para o runner que fez a última execução
  // (pelo nome salvo) ou, se não houver nome, para o primeiro runner carregado.
  const legacyRun = readJson<RunInfo | null>(legacyLastRunKey(s.repoPath), null);
  const runnerLabel = s.projectInfo()?.runners.find(runner => runner.id === runnerId)?.label;
  const legacyIsMine = legacyRun?.runnerLabel ? legacyRun.runnerLabel === runnerLabel : allowUnlabeledLegacy;
  if (legacyIsMine && specs === null) {
    const legacy = readJson<TestSpec[] | null>(legacySpecsKey(s.repoPath), null);
    if (legacy) {
      specs = legacy;
      run = run ?? readJson<RunInfo | null>(legacyLastRunKey(s.repoPath), null);
      try {
        localStorage.setItem(specsKey(s.repoPath, runnerId), JSON.stringify(legacy));
        if (run) localStorage.setItem(lastRunKey(s.repoPath, runnerId), JSON.stringify(run));
        localStorage.removeItem(legacySpecsKey(s.repoPath));
        localStorage.removeItem(legacyLastRunKey(s.repoPath));
      } catch { /* ignore */ }
    }
  }

  return {
    // Se o app foi fechado no meio de uma execução, os testes "running" viram "skip".
    specs: (specs || []).map(spec => spec.status === 'running' ? { ...spec, status: 'skip' as const } : spec),
    run: run?.finishedAt ? run : null,
    consoleLines: [],
    compilationError: null,
    selectedSuite: null,
  };
};

const applyRunnerState = (s: InternalSession, state: RunnerState) => {
  s.setSpecs(state.specs);
  s.setRun(state.run);
  s.setConsoleLines(state.consoleLines);
  s.setCompilationError(state.compilationError);
  s.setSelectedSuite(state.selectedSuite);
};

/** Carrega (uma única vez por sessão) o tipo do projeto e o mapeamento de arquivos. */
export const ensureProjectInfo = async (session: TestSession) => {
  const s = internal(session);
  if (s.projectInfoRequested) return;
  s.projectInfoRequested = true;
  try {
    const info = await getProjectType(s.repoPath);
    const preferred = localStorage.getItem(preferredRunnerKey(s.repoPath));
    const current = s.selectedRunnerId();
    // O cache antigo guardava o nome do runner da última execução: usa para saber de quem ele é.
    const legacyRun = readJson<RunInfo | null>(legacyLastRunKey(s.repoPath), null);
    const legacyRunner = legacyRun?.runnerLabel
      ? info.runners.find(runner => runner.label === legacyRun.runnerLabel)
      : undefined;
    const runnerId = [current, preferred, legacyRunner?.id].find(id => id && info.runners.some(runner => runner.id === id))
      || info.runners[0]?.id
      || null;
    s.setProjectInfo(info); // antes do loadRunnerState, que usa os labels dos runners
    const state = runnerId && runnerId !== current && !isSessionRunning(s)
      ? loadRunnerState(s, runnerId, true)
      : null;
    batch(() => {
      s.setSelectedRunnerId(runnerId);
      if (state) applyRunnerState(s, state);
    });
    await updateFileMapping(s);
  } catch (error) {
    s.projectInfoRequested = false;
    console.error('Erro ao detectar o tipo do projeto:', error);
  }
};

export const selectRunner = (session: TestSession, runnerId: string) => {
  const s = internal(session);
  const previous = s.selectedRunnerId();
  if (isSessionRunning(s) || runnerId === previous) return;

  // Guarda os resultados do runner atual antes de trocar, e restaura os do novo runner.
  if (previous) s.runnerStates.set(previous, snapshotRunnerState(s));
  const next = loadRunnerState(s, runnerId, false);

  batch(() => {
    s.setSelectedRunnerId(runnerId);
    s.setMappedFiles([]);
    applyRunnerState(s, next);
  });
  try { localStorage.setItem(preferredRunnerKey(s.repoPath), runnerId); } catch { /* ignore */ }
  void updateFileMapping(s);
};

// ---------------------------------------------------------------------------
// Console (saída do processo) — com buffer para não renderizar a cada linha
// ---------------------------------------------------------------------------

let pendingLines: ConsoleLine[] = [];
let pendingLineCount = 0;
let pendingLastLine: string | undefined;
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let flushTarget: InternalSession | null = null;

const flushConsole = () => {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = undefined;
  const s = flushTarget;
  if (!s) return;
  const lines = pendingLines;
  const count = pendingLineCount;
  const last = pendingLastLine;
  pendingLines = [];
  pendingLineCount = 0;
  pendingLastLine = undefined;
  if (lines.length === 0 && count === 0) return;

  batch(() => {
    if (lines.length) {
      s.setConsoleLines(prev => {
        const next = prev.concat(lines);
        return next.length > MAX_CONSOLE_LINES ? next.slice(next.length - MAX_CONSOLE_LINES) : next;
      });
    }
    if (count || last) {
      s.setRun(run => run ? {
        ...run,
        linesReceived: run.linesReceived + count,
        lastLine: last ?? run.lastLine,
      } : run);
    }
  });
};

const pushConsole = (s: InternalSession, text: string, kind: ConsoleKind, countAsOutput = false) => {
  if (flushTarget !== s) {
    flushConsole();
    flushTarget = s;
  }
  const startedAt = s.run()?.startedAt ?? Date.now();
  pendingLines.push({ id: ++consoleCounter, at: Date.now() - startedAt, text, kind });
  if (countAsOutput) {
    pendingLineCount++;
    pendingLastLine = text;
  }
  if (!flushTimer) flushTimer = setTimeout(flushConsole, 120);
};

const countOutput = (s: InternalSession) => {
  if (flushTarget !== s) {
    flushConsole();
    flushTarget = s;
  }
  pendingLineCount++;
  if (!flushTimer) flushTimer = setTimeout(flushConsole, 120);
};

export const clearConsole = (session: TestSession) => internal(session).setConsoleLines([]);

// ---------------------------------------------------------------------------
// Fases da execução
// ---------------------------------------------------------------------------

const BUILD_RE = /(compil|building|build started|restor|bundl|webpack|esbuild|transpil|generating|determining projects|> task :|resolving|downloading|installing|\[info\] scanning|preparing)/i;
const RUN_RE = /(=== run|starting test execution|executed \d+ of|\brun\s+v\d|running \d+ tests?|test run for|connected on socket|starting browser|tests run:|running tests|chrome headless|karma.*started|^\s*running\s|test files|randomized with seed)/i;

const advancePhase = (s: InternalSession, phase: RunPhase) => {
  s.setRun(run => {
    if (!run || run.finishedAt) return run;
    return PHASE_ORDER.indexOf(phase) > PHASE_ORDER.indexOf(run.phase) ? { ...run, phase } : run;
  });
};

// ---------------------------------------------------------------------------
// Atualização dos specs a partir dos eventos
// ---------------------------------------------------------------------------

const updateSpecState = (s: InternalSession, parsed: ParsedEvent) => {
  if (parsed.type !== 'RESULT' || !parsed.data?.name) return;
  const specData = parsed.data;
  const run = s.run();

  if (run?.scope === 'single') {
    const expectedName = run.singleTest?.split(' > ').pop()?.trim();
    const receivedName = specData.name?.split(' > ').pop()?.trim();
    if (expectedName !== receivedName) return;
  }

  let resolvedFilePath = specData.filePath;
  const parts = specData.name!.split(' > ');
  if (parts.length >= 2 && !resolvedFilePath) {
    const testName = parts.pop()!;
    resolvedFilePath = findFilePathForTest(s, parts.join(' > '), testName);
  }

  const framework = s.activeFramework();
  s.setSpecs(prev => {
    const existingIndex = prev.findIndex(spec => {
      if (specData.resultId) {
        return spec.resultId === specData.resultId || (!spec.resultId && spec.name === specData.name);
      }
      if (spec.name === specData.name) return true;

      const prevParts = spec.name.split(' > ');
      const prevTestName = prevParts.pop()?.trim();
      const prevSuite = prevParts.join(' > ').trim();
      const currParts = specData.name!.split(' > ');
      const currTestName = currParts.pop()?.trim();
      const currSuite = currParts.join(' > ').trim();

      return prevTestName === currTestName && (isSuiteMatch(currSuite, prevSuite) || framework === 'Rust');
    });

    const newSpec: TestSpec = {
      id: existingIndex !== -1 ? prev[existingIndex].id : crypto.randomUUID(),
      name: specData.name!,
      status: specData.status!,
      log: specData.log || [],
      filePath: resolvedFilePath,
      duration: specData.duration,
      resultId: specData.resultId,
      executionName: specData.executionName || (existingIndex !== -1 ? prev[existingIndex].executionName : undefined),
    };

    if (existingIndex !== -1) {
      const copy = [...prev];
      copy[existingIndex] = newSpec;
      return copy;
    }
    return [...prev, newSpec];
  });

  // Contadores da execução atual
  if (run && !run.finishedAt) {
    const key = specData.resultId || specData.name!;
    const isNew = !s.seenResults.has(key);
    s.seenResults.add(key);
    const status = specData.status!;
    s.setRun(current => {
      if (!current || current.finishedAt) return current;
      return {
        ...current,
        phase: PHASE_ORDER.indexOf(current.phase) < PHASE_ORDER.indexOf('running') ? 'running' : current.phase,
        results: isNew ? current.results + 1 : current.results,
        passed: current.passed + (isNew && status === 'pass' ? 1 : 0),
        failed: current.failed + (isNew && status === 'fail' ? 1 : 0),
        skipped: current.skipped + (isNew && status === 'skip' ? 1 : 0),
        lastResult: { name: specData.name!, status },
      };
    });
    const icon = status === 'pass' ? '✓' : status === 'skip' ? '○' : '✗';
    const duration = specData.duration ? ` (${specData.duration}${/^\d+(\.\d+)?$/.test(specData.duration) ? 'ms' : ''})` : '';
    pushConsole(s, `${icon} ${specData.name}${duration}`, status === 'pass' ? 'pass' : status === 'skip' ? 'skip' : 'fail');
  }
};

const syncSpecsWithPhysicalCode = (s: InternalSession, run: RunInfo) => {
  const scope = run.scope;
  const currentSuite = run.suite;
  const singleTest = run.singleTest;
  const framework = s.activeFramework();

  s.setSpecs(prev => {
    const mapped = prev.map(spec =>
      scope === 'single' && spec.name !== singleTest && spec.status === 'running'
        ? { ...spec, status: 'skip' as const }
        : spec
    );

    if (['Go', 'Dotnet', 'Vitest', 'Rust', 'Java', 'Ruby'].includes(framework || '')) {
      return mapped.filter(spec => {
        const [specSuite] = spec.name.split(' > ');
        if ((scope === 'suite' && specSuite.trim() === currentSuite?.trim()) || scope === 'all') {
          return spec.status !== 'running';
        }
        return true;
      });
    }

    // Regra padrão (Angular / Jest)
    return mapped.filter(spec => {
      if (spec.status !== 'running') return true;
      if (scope === 'all') return false;
      const [rootSuite] = spec.name.split(' > ');
      return scope !== 'suite' || rootSuite.trim() !== currentSuite?.trim();
    });
  });
};

// ---------------------------------------------------------------------------
// Início / fim de execução
// ---------------------------------------------------------------------------

const scopeLabel = (run: RunInfo) =>
  run.scope === 'all'
    ? translate('scope_all')
    : run.scope === 'suite'
      ? `${translate('scope_suite')}: ${run.suite}`
      : `${translate('scope_single')}: ${run.singleTest}`;

const finishRun = (s: InternalSession, outcome?: RunOutcome, message?: string) => {
  flushConsole();
  const run = s.run();
  if (!run || run.finishedAt) {
    if (activeRunPath() === s.repoPath) setActiveRunPath(null);
    return;
  }

  const finalOutcome: RunOutcome = outcome
    || (s.compilationError() ? 'compile_error'
      : run.failed > 0 ? 'failed'
        : run.results === 0 ? 'empty'
          : 'passed');

  const finished: RunInfo = {
    ...run,
    finishedAt: Date.now(),
    phase: 'done',
    outcome: finalOutcome,
    errorMessage: message ?? run.errorMessage,
  };

  const elapsed = formatElapsed(finished.finishedAt! - finished.startedAt);
  batch(() => {
    s.setRun(finished);
    s.setIsStopping(false);
    if (activeRunPath() === s.repoPath) setActiveRunPath(null);
  });
  pushConsole(s, `— ${translate(`outcome_${finalOutcome}`)} · ${elapsed} —`, finalOutcome === 'passed' ? 'pass' : finalOutcome === 'stopped' || finalOutcome === 'empty' ? 'system' : 'error');
  flushConsole();
  stopTicker();

  const runnerId = finished.runnerId || s.selectedRunnerId();
  if (runnerId) {
    try { localStorage.setItem(lastRunKey(s.repoPath, runnerId), JSON.stringify(finished)); } catch { /* ignore */ }
  }

  // Se o usuário não está olhando a tela de testes deste repositório, avisa.
  if (visibleRepoPath() !== s.repoPath) {
    const title = `${translate('run_finished_notify')} · ${repoDisplayName(s.repoPath)}`;
    const summary = `${translate(`outcome_${finalOutcome}`)} — ${finished.passed} ✓  ${finished.failed} ✗  (${elapsed})`;
    if (finalOutcome === 'passed' || finalOutcome === 'stopped' || finalOutcome === 'empty') notify.success(title, summary);
    else notify.error(title, summary);
  }
};

interface StartOptions {
  scope: RunScope;
  suite?: string;
  singleTest?: string;
  filePath?: string;
  testName?: string;
}

const startRun = async (session: TestSession, opts: StartOptions) => {
  const s = internal(session);
  const runningPath = activeRunPath();
  if (runningPath) {
    notify.error(
      translate('test'),
      runningPath === s.repoPath
        ? translate('already_running')
        : `${translate('running_other_repo')}: ${repoDisplayName(runningPath)}`
    );
    return;
  }

  const runner = s.activeRunner();
  const specs = s.specs();
  const mappedTotal = s.mappedFiles().reduce((acc, file) => acc + file.tests.length, 0);
  const expected = opts.scope === 'all'
    ? Math.max(mappedTotal, specs.length)
    : opts.scope === 'suite'
      ? specs.filter(spec => spec.name.split(' > ')[0].trim() === opts.suite?.trim()).length
      : 1;

  const run: RunInfo = {
    id: ++runCounter,
    scope: opts.scope,
    suite: opts.suite,
    singleTest: opts.singleTest,
    filePath: opts.filePath,
    runnerId: s.selectedRunnerId() || undefined,
    runnerLabel: runner?.label || 'Runner',
    framework: s.activeFramework(),
    startedAt: Date.now(),
    phase: 'starting',
    linesReceived: 0,
    results: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    expected,
  };

  flushConsole();
  s.compileLogBuffer = [];
  s.seenResults = new Set();

  batch(() => {
    setActiveRunPath(s.repoPath);
    s.setCompilationError(null);
    s.setIsStopping(false);
    s.setRun(run);
    s.setConsoleLines([]);
    s.setSpecs(prev => prev.map(spec => {
      const [rootSuite] = spec.name.split(' > ');
      const affected = opts.scope === 'all'
        || (opts.scope === 'suite' && rootSuite.trim() === opts.suite?.trim())
        || (opts.scope === 'single' && spec.name === opts.singleTest);
      return affected ? { ...spec, status: 'running' as const, log: [], duration: undefined } : spec;
    }));
  });
  startTicker();

  pushConsole(s, `▶ ${run.runnerLabel} · ${scopeLabel(run)}`, 'system');
  if (opts.filePath) pushConsole(s, `  ${translate('file')}: ${opts.filePath}`, 'system');
  pushConsole(s, `  ${translate('directory')}: ${s.repoPath}`, 'system');
  if (randomizeTests()) pushConsole(s, `  ${translate('random_order')}`, 'system');

  try {
    await runTestTerminal(
      runner || 'dockerfile',
      s.repoPath,
      opts.filePath || '',
      opts.testName || '',
      randomizeTests()
    );
    pushConsole(s, `  ${translate('process_started')}`, 'system');
  } catch (err) {
    pushConsole(s, String(err), 'error');
    s.setSpecs(prev => prev.map(spec => spec.status === 'running' ? { ...spec, status: 'skip' as const } : spec));
    finishRun(s, 'error', String(err));
  }
};

export const runAllTests = (session: TestSession) => startRun(session, { scope: 'all' });

export const runSuite = (session: TestSession, suite: string) => {
  const filePath = findFilePathBySuite(session, suite);
  if (!filePath) {
    notify.error(translate('test'), translate('file_not_found'));
    return;
  }
  return startRun(session, { scope: 'suite', suite, filePath });
};

export const runSingleTest = (session: TestSession, spec: TestSpec) => {
  const parts = spec.name.split(' > ');
  const pureItName = parts.pop()?.trim() || spec.name;
  const specSuite = parts.join(' > ').trim();
  const filePath = findFilePathForTest(session, specSuite, pureItName)
    || findFilePathBySuite(session, session.selectedSuite() || specSuite);

  if (!filePath) {
    notify.error(translate('test'), translate('file_not_found'));
    return;
  }
  return startRun(session, {
    scope: 'single',
    singleTest: spec.name,
    suite: parts[0]?.trim(),
    filePath,
    testName: spec.executionName || pureItName,
  });
};

export const stopTests = async (session?: TestSession) => {
  const path = session?.repoPath || activeRunPath();
  if (!path || activeRunPath() !== path) return;
  const s = sessions.get(path);
  if (!s || s.isStopping()) return;

  const runId = s.run()?.id;
  s.setIsStopping(true);
  pushConsole(s, `■ ${translate('stopping')}`, 'system');
  try {
    await stopTestExecution();
    // Se o backend não tinha processo ativo (ou o evento de parada se perder), encerra localmente.
    setTimeout(() => {
      if (activeRunPath() === path && s.run()?.id === runId && !s.run()?.finishedAt) {
        s.setSpecs(prev => prev.map(spec => spec.status === 'running' ? { ...spec, status: 'skip' as const } : spec));
        finishRun(s, 'stopped');
      }
    }, 4000);
  } catch (error) {
    s.setIsStopping(false);
    notify.error(translate('test'), String(error));
  }
};

/** Limpa o resumo da última execução. */
export const dismissRun = (session: TestSession) => {
  const s = internal(session);
  if (isSessionRunning(s)) return;
  s.setRun(null);
  const runnerId = s.selectedRunnerId();
  if (runnerId) {
    try { localStorage.removeItem(lastRunKey(s.repoPath, runnerId)); } catch { /* ignore */ }
  }
};

// ---------------------------------------------------------------------------
// Listener global de eventos do backend (registrado uma única vez)
// ---------------------------------------------------------------------------

const stripAnsi = (str: string) => str.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '');

let listenerStarted = false;
const ensureListener = () => {
  if (listenerStarted) return;
  listenerStarted = true;
  void listen('test-event', (event: any) => {
    void handleTestEvent(event.payload).catch(error => console.error('Erro ao processar evento de teste:', error));
  });
};

const handleTestEvent = async (payloadRaw: any) => {
  const path = activeRunPath();
  if (!path) return;
  const s = sessions.get(path);
  if (!s) return;

  const payload = payloadRaw && typeof payloadRaw === 'object' ? payloadRaw : null;
  const rawLine: string | undefined = payload ? payload.name : payloadRaw;

  const isFinished = payload?.status === 'finished'
    || rawLine === 'PROCESS_FINISHED'
    || rawLine === 'PROCESS_STOPPED';

  if (isFinished) {
    const wasStopped = rawLine === 'PROCESS_STOPPED';
    if (payload?.error) pushConsole(s, payload.error, 'error');

    if (wasStopped) {
      s.setSpecs(prev => prev.map(spec => spec.status === 'running' ? { ...spec, status: 'skip' as const } : spec));
      finishRun(s, 'stopped');
      return;
    }

    const run = s.run();
    advancePhase(s, 'collecting');
    pushConsole(s, `  ${translate('process_finished')}`, 'system');
    await updateFileMapping(s);
    if (run && !s.compilationError()) syncSpecsWithPhysicalCode(s, run);
    finishRun(s, payload?.error ? 'error' : undefined, payload?.error);
    return;
  }

  if (!rawLine) return;
  const framework = s.activeFramework();

  // Relatórios completos (XML / JSON) enviados ao fim do processo
  if (payload?.status === 'result_xml' || (framework === 'Dotnet' && rawLine.trim().startsWith('<?xml'))) {
    advancePhase(s, 'collecting');
    const results = framework === 'Java' ? parseJavaXmlToEvents(rawLine) : parseTrxToEvents(rawLine);
    pushConsole(s, `  ${translate('report_received')}: ${results.length}`, 'system');
    batch(() => results.forEach(res => updateSpecState(s, res)));
    return;
  }
  if (payload?.status === 'result_json' || payload?.file === 'VITEST_JSON') {
    advancePhase(s, 'collecting');
    const results = framework === 'Ruby' && payload?.status === 'result_json'
      ? parseRubyJsonToEvents(rawLine)
      : parseVitestToEvents(rawLine);
    pushConsole(s, `  ${translate('report_received')}: ${results.length}`, 'system');
    batch(() => results.forEach(res => updateSpecState(s, res)));
    return;
  }

  const line = stripAnsi(rawLine).trimEnd();
  if (!line.trim()) return;
  const trimmed = line.trim();

  // Exibição no console (Go envia JSON: mostra apenas o Output legível)
  let display: string | null = line;
  if (framework === 'Go' && trimmed.startsWith('{')) {
    try {
      const ev = JSON.parse(trimmed);
      if (ev.Action === 'run' && ev.Test) {
        s.setRun(run => run && !run.finishedAt ? { ...run, currentTest: ev.Test } : run);
      }
      display = typeof ev.Output === 'string' ? ev.Output.replace(/\n$/, '') : null;
    } catch { /* mantém a linha original */ }
  }
  const isSpecMarker = trimmed.includes('SPEC_RESULT|');
  if (display && display.trim() && !isSpecMarker) {
    pushConsole(s, display, payload?.file === 'STDERR' ? 'err' : 'out', true);
  } else {
    countOutput(s); // ainda conta como saída recebida
  }

  // Fase (só avança)
  const run = s.run();
  if (run && !run.finishedAt) {
    if (RUN_RE.test(trimmed)) advancePhase(s, 'running');
    else if (run.phase === 'starting' || BUILD_RE.test(trimmed)) advancePhase(s, 'building');

    // "Executando agora" para runners que anunciam o teste antes de rodar
    const runMatch = trimmed.match(/^=== RUN\s+(\S+)/);
    if (runMatch) {
      const current = runMatch[1].trim();
      s.setRun(r => r && !r.finishedAt ? { ...r, currentTest: current } : r);
    }
  }

  s.compileLogBuffer.push(trimmed);
  if (s.compileLogBuffer.length > COMPILE_BUFFER_SIZE) s.compileLogBuffer.shift();

  // Detector de falha crítica do compilador
  const isAngularError = trimmed.includes('ERROR [karma-server]') || trimmed.includes('error TS23') || trimmed.includes('Found 1 load error');
  const isGoError = trimmed.includes('build failed') || /:\d+:\d+: undefined:/.test(trimmed) || /syntax error:/.test(trimmed);
  const isDotnetError = /: error CS\d+:/.test(trimmed) || trimmed.includes('Build FAILED.');
  const isRustError = trimmed.includes('error[E') || trimmed.includes('could not compile');

  if (isAngularError || isGoError || isDotnetError || isRustError) {
    const errorLog = s.compileLogBuffer.length > 0
      ? [...s.compileLogBuffer]
      : ['Falha crítica devido a erro de compilação do projeto.'];
    batch(() => {
      s.setCompilationError(errorLog);
      s.setSpecs(prev => prev.map(spec => spec.status === 'running'
        ? { ...spec, status: 'fail' as const, log: errorLog }
        : spec));
    });
    // O processo pode continuar emitindo saída; a execução é encerrada quando ele terminar
    // (ou quando o usuário clicar em parar).
    return;
  }

  let parsed: ParsedEvent;
  if (framework === 'Angular') parsed = angularParser(trimmed, s.compileLogBuffer);
  else if (framework === 'Go') parsed = goParser(trimmed);
  else if (framework === 'Rust') parsed = rustParser(trimmed);
  else if (framework === 'Ruby') parsed = rubyParser(trimmed);
  else parsed = { type: 'LOG' };

  if (parsed.type === 'FINISH') {
    advancePhase(s, 'collecting');
    return;
  }

  updateSpecState(s, parsed);
  if (parsed.type === 'RESULT') s.compileLogBuffer = [];
};

// ---------------------------------------------------------------------------
// Utilitários de exibição / cópia
// ---------------------------------------------------------------------------

export const formatElapsed = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
};

const specLine = (spec: TestSpec) => {
  const tag = spec.status === 'pass' ? 'PASSOU' : spec.status === 'fail' ? 'FALHOU' : spec.status === 'skip' ? 'IGNORADO' : 'EXECUTANDO';
  const duration = spec.duration ? ` (${/^\d+(\.\d+)?$/.test(spec.duration) ? `${spec.duration}ms` : spec.duration})` : '';
  return `[${tag}] ${spec.name}${duration}`;
};

export const formatSpecForCopy = (spec: TestSpec) => {
  const lines = [specLine(spec)];
  if (spec.filePath) lines.push(`Arquivo: ${spec.filePath}`);
  if (spec.log.length) {
    lines.push('');
    lines.push(...spec.log);
  }
  return lines.join('\n');
};

export const buildReport = (
  session: TestSession,
  options: { onlyFailures?: boolean; suite?: string | null } = {}
) => {
  const run = session.run();
  let specs = session.specs();
  if (options.suite) specs = specs.filter(spec => spec.name.split(' > ')[0].trim() === options.suite!.trim());
  const passed = specs.filter(s => s.status === 'pass').length;
  const failed = specs.filter(s => s.status === 'fail').length;
  const skipped = specs.filter(s => s.status === 'skip').length;

  const header = [
    `Relatório de testes — ${repoDisplayName(session.repoPath)}`,
    `Runner: ${session.activeRunner()?.label || run?.runnerLabel || '-'}${options.suite ? ` | Suíte: ${options.suite}` : ''}`,
  ];
  if (run) {
    header.push(`Execução: ${new Date(run.startedAt).toLocaleString()} | Duração: ${formatElapsed((run.finishedAt ?? Date.now()) - run.startedAt)}`);
  }
  header.push(`Total: ${specs.length} | Passaram: ${passed} | Falharam: ${failed} | Ignorados: ${skipped}`);

  const compileError = session.compilationError();
  const body: string[] = [];
  if (compileError && !options.suite) {
    body.push('=== ERRO DE COMPILAÇÃO ===', ...compileError, '');
  }

  const selected = options.onlyFailures ? specs.filter(s => s.status === 'fail') : specs;
  selected.forEach(spec => {
    if (spec.status === 'fail' && spec.log.length) {
      body.push(formatSpecForCopy(spec), '');
    } else {
      body.push(specLine(spec));
    }
  });

  return [...header, '', ...body].join('\n').trimEnd();
};

export const formatConsoleForCopy = (lines: ConsoleLine[]) =>
  lines.map(line => `[${formatElapsed(line.at)}] ${line.text}`).join('\n');

export const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    notify.success(translate('copy'), translate('copied'));
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      if (ok) {
        notify.success(translate('copy'), translate('copied'));
        return true;
      }
    } catch { /* ignore */ }
    notify.error(translate('copy'), translate('copy_failed'));
    return false;
  }
};
