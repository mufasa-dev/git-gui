import { createSignal, For, onMount, onCleanup, Show, createMemo, createEffect } from 'solid-js';
import { listen } from '@tauri-apps/api/event';
import { ParsedEvent, ProjectType, TestRunnerOption } from '../../models/ProjectType.model';
import { getProjectType, runTestTerminal, getTestsFiles, stopTestExecution } from '../../services/testService';
import { formatDuration } from '../../utils/date';
import FileIcon from '../ui/FileIcon';
import ContextMenu, { ContextMenuItem } from '../ui/ContextMenu';
import Dialog from '../ui/Dialog';
import { openVsCode } from '../../services/openService';
import { notify } from '../../utils/notifications';
import { useApp } from '../../context/AppContext';
import { angularParser } from '../../lib/TestsPareser/AngularParser';
import { parseTrxToEvents } from '../../lib/TestsPareser/TrxParser';
import { goParser } from '../../lib/TestsPareser/goParser';
import { parseVitestToEvents } from '../../lib/TestsPareser/VitestParser';
import { rustParser } from '../../lib/TestsPareser/RustParser';
import { parseJavaXmlToEvents } from '../../lib/TestsPareser/JavaParser';
import { parseRubyJsonToEvents, rubyParser } from '../../lib/TestsPareser/RubyParser';

interface TestSpec {
  id: string;
  name: string;
  status: 'pass' | 'fail' | 'running' | 'skip';
  log: string[];
  filePath?: string;
  duration?: string;
  resultId?: string;
  executionName?: string;
}

interface MappedTestCase {
  name: string;
  suite: string;
}

interface MappedTestFile {
  name: string;
  path: string;
  label: string;
  tests: MappedTestCase[];
}

export const TestRunner = (props: { repo: any }) => {
  const [specs, setSpecs] = createSignal<TestSpec[]>([]);
  const [selectedSuite, setSelectedSuite] = createSignal<string | null>(null);
  const [isRunning, setIsRunning] = createSignal(false);
  const [isStopping, setIsStopping] = createSignal(false);
  const [sidebarWidth, setSidebarWidth] = createSignal(240);
  const [isResizing, setIsResizing] = createSignal(false);
  const [projectInfo, setProjectInfo] = createSignal<ProjectType | null>(null);
  const [selectedRunnerId, setSelectedRunnerId] = createSignal<string | null>(null);
  const [searchQuery, setSearchQuery] = createSignal("");
  const [lastLoadedPath, setLastLoadedPath] = createSignal<string | null>(null);
  const [mappedFiles, setMappedFiles] = createSignal<MappedTestFile[]>([]); 
  const [filterStatus, setFilterStatus] = createSignal<'all' | 'pass' | 'fail'>('all');

  // SINAL DE ERRO DE COMPILAÇÃO: Armazena o log completo se o build quebrar
  const [compilationError, setCompilationError] = createSignal<string[] | null>(null);

  const [executionScope, setExecutionScope] = createSignal<'all' | 'suite' | 'single' | null>(null);
  const [runningSingleTest, setRunningSingleTest] = createSignal<string | null>(null);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [randomizeTests, setRandomizeTests] = createSignal(
    localStorage.getItem('test-runner-randomize') === 'true'
  );
  const [testMenuVisible, setTestMenuVisible] = createSignal(false);
  const [testMenuPosition, setTestMenuPosition] = createSignal({ x: 0, y: 0 });
  const [contextTest, setContextTest] = createSignal<TestSpec | null>(null);

  const { t } = useApp();

  const stripAnsi = (str: string) => str.replace(/\x1B\[[0-9;]*[JKmsu]/g, '');
  const storageKey = () => `brook_test_cache_${props.repo?.path}`;
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
  const activeFramework = () => activeRunner()?.framework || projectInfo()?.framework;

  createEffect(() => {
    const path = props.repo?.path;
    if (path && lastLoadedPath() !== path) {
      const cached = localStorage.getItem(storageKey());
      if (cached) {
        setSpecs(JSON.parse(cached));
      } else {
        setSpecs([]);
      }
      setLastLoadedPath(path); 
      setProjectInfo(null);
      setSelectedRunnerId(null);
      setMappedFiles([]);
      setSelectedSuite(null);
      setIsRunning(false);
      setIsStopping(false);
      setFilterStatus('all');
      setExecutionScope(null);
      setRunningSingleTest(null);
      setCompilationError(null); // Reseta erro ao trocar de repo
    }
  });

  let storageTimer: ReturnType<typeof setTimeout> | undefined;

  createEffect(() => {
    const currentPath = props.repo?.path;
    const loadedPath = lastLoadedPath();
    if (currentPath && loadedPath === currentPath && specs().length > 0) {
      if (storageTimer) clearTimeout(storageTimer);
      storageTimer = setTimeout(() => {
        localStorage.setItem(storageKey(), JSON.stringify(specs()));
      }, 300);
    }
  });

  let mappingRequestId = 0;
  const updateFileMapping = async (runner: TestRunnerOption | null = activeRunner()) => {
    if (props.repo?.path && runner) {
      const requestId = ++mappingRequestId;
      try {
        const files = await getTestsFiles(props.repo.path, runner);
        if (requestId !== mappingRequestId || activeRunner()?.id !== runner.id) return;
        setMappedFiles(files);
      } catch (e) {
        console.error("Erro ao remapear arquivos de testes:", e);
      }
    }
  };

  createEffect(() => {
    const path = props.repo?.path;
    if (!path) return;
    void getProjectType(path).then(info => {
      if (props.repo?.path !== path) return;
      setProjectInfo(info);
      setSelectedRunnerId(currentRunnerId =>
        info.runners.some(runner => runner.id === currentRunnerId)
          ? currentRunnerId
          : info.runners[0]?.id || null
      );
    });
  });

  createEffect(() => {
    const path = props.repo?.path;
    const runner = activeRunner();
    if (!path || !runner) return;
    setMappedFiles([]);
    void updateFileMapping(runner);
  });

  const stats = createMemo(() => {
    const total = specs().length;
    const passed = specs().filter(s => s.status === 'pass').length;
    const failed = specs().filter(s => s.status === 'fail').length;
    const skipped = specs().filter(s => s.status === 'skip').length;
    const completed = passed + failed;
    return {
      total,
      passed,
      failed,
      skipped,
      passRate: completed > 0 ? Math.round((passed / completed) * 100) : 0,
    };
  });

  const groupedSpecs = createMemo(() => {
    const groups: Record<string, { tests: TestSpec[], hasError: boolean }> = {};
    specs().forEach(spec => {
      // Extrai sempre a suíte pai (primeira parte antes de qualquer ' > ')
      const [rootSuite] = spec.name.split(' > ');
      const key = rootSuite.trim();
      if (!groups[key]) {
        groups[key] = { tests: [], hasError: false };
      }
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
    return {
      total: tests.length,
      passed,
      failed,
      skipped,
      passRate: completed > 0 ? Math.round((passed / completed) * 100) : 0,
    };
  });

  const suites = createMemo(() => {
    let allSuites = Object.keys(groupedSpecs());
    const currentFilter = filterStatus();

    if (currentFilter === 'pass') {
      allSuites = allSuites.filter(suite => !groupedSpecs()[suite].hasError && groupedSpecs()[suite].tests.some(t => t.status === 'pass'));
    } else if (currentFilter === 'fail') {
      allSuites = allSuites.filter(suite => groupedSpecs()[suite].hasError);
    }

    const query = searchQuery().toLowerCase().trim();
    if (!query) return allSuites;
    return allSuites.filter(suite => suite.toLowerCase().includes(query));
  });

  // HELPER: Verifica se a suíte informada casa com a suíte mapeada estaticamente (suporta sub-describes)
  const isSuiteMatch = (rawSuite: string, mappedSuite: string): boolean => {
    const s1 = rawSuite.trim().toLowerCase();
    const s2 = mappedSuite.trim().toLowerCase();
    return s1 === s2 || s1.startsWith(s2 + ' >') || s2.startsWith(s1 + ' >');
  };

  const findFilePathForTest = (suite: string, testName: string): string | undefined => {
    const foundFile = mappedFiles().find(file => 
      file.tests.some(t => isSuiteMatch(suite, t.suite) && t.name.trim() === testName.trim())
    );
    return foundFile?.path;
  };

  const findFilePathBySuite = (suiteName: string): string | undefined => {
    if (!suiteName) return undefined;
    const foundFile = mappedFiles().find(file => 
      file.tests.some(t => isSuiteMatch(suiteName, t.suite))
    );
    return foundFile?.path;
  };

  const resolveTestFilePath = (spec: TestSpec): string | undefined => {
    const parts = spec.name.split(' > ');
    const testName = parts.pop()?.trim() || '';
    const suite = parts.join(' > ').trim();
    const mappedPath = spec.filePath && spec.filePath !== 'unknown'
      ? spec.filePath
      : findFilePathForTest(suite, testName);

    if (!mappedPath || !props.repo?.path) return undefined;
    if (/^(?:[A-Za-z]:[\\/]|[\\/]{2})/.test(mappedPath)) return mappedPath;
    return `${props.repo.path.replace(/[\\/]+$/, '')}/${mappedPath.replace(/^[/\\]+/, '')}`;
  };

  const openTestInVsCode = async (spec: TestSpec) => {
    const filePath = resolveTestFilePath(spec);
    if (!filePath) {
      notify.error(t('test').test, t('test').file_not_found);
      return;
    }

    try {
      await openVsCode(filePath);
    } catch (error) {
      notify.error(t('test').open_vscode, String(error));
    }
  };

  const showTestContextMenu = (event: MouseEvent, spec: TestSpec) => {
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

    return [
      {
        label: t('test').rerun,
        action: () => runIndividualTest(spec)
      },
      {
        label: t('test').open_vscode,
        hr: true,
        action: () => openTestInVsCode(spec)
      }
    ];
  };

  const syncSpecsWithPhysicalCode = () => {
    const scope = executionScope();
    const currentSuite = selectedSuite();
    const singleTest = runningSingleTest();
    const framework = activeFramework();

    setSpecs(prev => {
      // SE FOR GO, DOTNET, VITEST OU RUST
      if (framework === 'Go' || framework === 'Dotnet' || framework === 'Vitest' || framework === 'Rust' || framework === 'Java' || framework === 'Ruby') {
        return prev
          .map(spec => {
            if (scope === 'single' && spec.name !== singleTest && spec.status === 'running') {
              return { ...spec, status: 'skip' as const };
            }
            return spec;
          })
          .filter(spec => {
            const [specSuite] = spec.name.split(' > ');
            if ((scope === 'suite' && specSuite.trim() === currentSuite?.trim()) || scope === 'all') {
              if (spec.status === 'running') {
                return false; 
              }
            }
            return true;
          });
      }

      // REGRA PADRÃO PARA ANGULAR / JEST
      return prev
        .map(spec => {
          if (scope === 'single' && spec.name !== singleTest && spec.status === 'running') {
            return { ...spec, status: 'skip' as const };
          }
          return spec;
        })
        .filter(spec => {
          if (spec.status !== 'running') return true;

          if (scope === 'all') return false;

          const [rootSuite] = spec.name.split(' > ');
          return scope !== 'suite' || rootSuite.trim() !== currentSuite?.trim();
        });
    });

    setExecutionScope(null);
    setRunningSingleTest(null);
  };

  onMount(() => document.addEventListener('click', hideTestContextMenu));
  onCleanup(() => document.removeEventListener('click', hideTestContextMenu));

  onMount(async () => {
    let compileLogBuffer: string[] = [];

    const updateSpecState = (parsed: ParsedEvent) => {
      if (parsed.type === 'RESULT' && parsed.data) {
        const specData = parsed.data;
        if (executionScope() === 'single') {
          const expectedName = runningSingleTest()?.split(' > ').pop()?.trim();
          const receivedName = specData.name?.split(' > ').pop()?.trim();
          if (expectedName !== receivedName) return;
        }

        let resolvedFilePath = specData.filePath;

        const parts = specData.name!.split(' > ');
        if (parts.length >= 2) {
          const testName = parts.pop()!;
          const suite = parts.join(' > ');

          if (!resolvedFilePath) {
            resolvedFilePath = findFilePathForTest(suite, testName);
          }
        }

        setSpecs(prev => {
          // Busca teste correspondente considerando a suíte raiz ou nome do teste e sub-suíte
          const existingIndex = prev.findIndex(s => {
            if (specData.resultId) {
              return s.resultId === specData.resultId || (!s.resultId && s.name === specData.name);
            }
            if (s.name === specData.name) return true;

            const prevParts = s.name.split(' > ');
            const prevTestName = prevParts.pop()?.trim();
            const prevSuite = prevParts.join(' > ').trim();

            const currParts = specData.name!.split(' > ');
            const currTestName = currParts.pop()?.trim();
            const currSuite = currParts.join(' > ').trim();

            return prevTestName === currTestName
              && (isSuiteMatch(currSuite, prevSuite) || activeFramework() === 'Rust');
          });

          const newSpec: TestSpec = {
            id: existingIndex !== -1 ? prev[existingIndex].id : crypto.randomUUID(),
            name: specData.name!,
            status: specData.status!,
            log: specData.log || [],
            filePath: resolvedFilePath,
            duration: specData.duration,
            resultId: specData.resultId,
            executionName: specData.executionName || (existingIndex !== -1 ? prev[existingIndex].executionName : undefined)
          };

          if (existingIndex !== -1) {
            const copy = [...prev];
            copy[existingIndex] = newSpec;
            return copy;
          }
          return [...prev, newSpec];
        });
      }
    };

    await listen('test-event', async (event: any) => {
      const wasStopped = event.payload?.name === "PROCESS_STOPPED" || event.payload === "PROCESS_STOPPED";
      if (
        event.payload?.status === "finished" ||
        event.payload?.name === "PROCESS_FINISHED" ||
        event.payload?.name === "PROCESS_STOPPED" ||
        event.payload === "PROCESS_FINISHED" ||
        event.payload === "PROCESS_STOPPED"
      ) {
        setIsRunning(false);
        setIsStopping(false);
        if (wasStopped) {
          setSpecs(prev => prev.map(spec => spec.status === 'running'
            ? { ...spec, status: 'skip' as const }
            : spec
          ));
          setExecutionScope(null);
          setRunningSingleTest(null);
        } else {
          await updateFileMapping();
          syncSpecsWithPhysicalCode();
        }
        return;
      }

      const payload = typeof event.payload === 'string' ? null : event.payload;
      const rawLine = typeof event.payload === 'string' ? event.payload : event.payload.name;
      if (!rawLine) return;

      const type = activeFramework();
      if (payload?.status === 'result_xml') {
        const results = type === 'Java'
          ? parseJavaXmlToEvents(rawLine)
          : parseTrxToEvents(rawLine);
        results.forEach(res => updateSpecState(res));
        return;
      }
      if (type === 'Dotnet' && rawLine.trim().startsWith('<?xml')) {
        parseTrxToEvents(rawLine).forEach(res => updateSpecState(res));
        return;
      }
      if (payload?.status === 'result_json') {
        const results = type === 'Ruby'
          ? parseRubyJsonToEvents(rawLine)
          : parseVitestToEvents(rawLine);
        results.forEach(res => updateSpecState(res));
        return;
      }
      if (payload?.file === 'VITEST_JSON') {
        parseVitestToEvents(rawLine).forEach(res => updateSpecState(res));
        return;
      }

      const line = stripAnsi(rawLine).trim();
      if (!line) return;

      compileLogBuffer.push(line);
      if (compileLogBuffer.length > 50) compileLogBuffer.shift();

      // DETECTOR DE FALHA CRÍTICA DO COMPILADOR
      const isAngularError = line.includes('ERROR [karma-server]') || line.includes('error TS23') || line.includes('Found 1 load error');
      const isGoError = line.includes('build failed') || /:\d+:\d+: undefined:/.test(line) || /syntax error:/.test(line);
      const isDotnetError = /: error CS\d+:/.test(line) || line.includes('Build FAILED.');
      const isRustError = line.includes('error[E') || line.includes('could not compile');

      if (isAngularError || isGoError || isDotnetError || isRustError) {
        setIsRunning(false);
        setIsStopping(false);

        const errorLog = compileLogBuffer.length > 0
          ? [...compileLogBuffer]
          : ["Falha crítica devido a erro de compilação do projeto."];
        setCompilationError(errorLog);

        setSpecs(prev => prev.map(s => s.status === 'running'
          ? { ...s, status: 'fail' as const, log: errorLog }
          : s));
        return;
      }

      let parsed: ParsedEvent;
      if (type === 'Angular') {
        parsed = angularParser(line, compileLogBuffer);
      } else if (type === 'Go') {
        parsed = goParser(line);
      } else if (type === 'Rust') {
        parsed = rustParser(line);
      } else if (type === 'Ruby') {
        parsed = rubyParser(line);
      } else {
        parsed = { type: 'LOG' };
      }

      if (parsed.type === 'FINISH') {
        setIsRunning(false);
        setIsStopping(false);
        await updateFileMapping();
        syncSpecsWithPhysicalCode();
      } else {
        updateSpecState(parsed);
        if (parsed.type === 'RESULT') {
          compileLogBuffer = [];
        }
      }
    });
  });

  const stopTests = async () => {
    if (!isRunning() || isStopping()) return;
    setIsStopping(true);
    try {
      await stopTestExecution();
    } catch (error) {
      setIsStopping(false);
      notify.error(t('test').test, String(error));
    }
  };

  const runAllTests = async () => {
    if (!props.repo?.path || isRunning()) return;
    setIsRunning(true);
    setCompilationError(null); 
    setExecutionScope('all');
    
    setSpecs(prev => prev.map(s => ({ ...s, status: 'running', log: [] })));
    
    try {
      await runTestTerminal(
        activeRunner() || 'dockerfile',
        props.repo.path,
        '',
        '',
        randomizeTests()
      );
    } catch (err) {
      setIsRunning(false);
      setIsStopping(false);
      setSpecs([{ id: 'error', name: 'Erro > Falha', status: 'fail', log: [String(err)] }]);
    }
  };

  const runIndividualTest = async (spec: TestSpec) => {
    const specName = spec.name;
    if (isRunning() || !specName || !props.repo?.path) return;

    const parts = specName.split(' > ');
    const pureItName = parts.pop()?.trim() || specName;
    const specSuite = parts.join(' > ').trim();
    const filePath = findFilePathForTest(specSuite, pureItName)
      || findFilePathBySuite(selectedSuite() || specSuite);

    if (!filePath) {
      console.error(`Não foi possível mapear o arquivo para o teste individual: ${pureItName}`);
      return;
    }

    setIsRunning(true);
    setCompilationError(null);
    setExecutionScope('single');
    setRunningSingleTest(specName);

    setSpecs(prev => prev.map(s => {
      if (s.name === specName) {
        return { ...s, status: 'running', log: [], duration: undefined };
      }
      return s;
    }));

    try {
      await runTestTerminal(
        activeRunner() || 'angular',
        props.repo.path,
        filePath,
        spec.executionName || pureItName,
        randomizeTests()
      );
    } catch (err) {
      setIsRunning(false);
      setIsStopping(false);
      setExecutionScope(null);
      setRunningSingleTest(null);
    }
  };

  const setRandomOrder = (enabled: boolean) => {
    setRandomizeTests(enabled);
    localStorage.setItem('test-runner-randomize', String(enabled));
  };

  const selectRunner = (runnerId: string) => {
    if (isRunning() || runnerId === selectedRunnerId()) return;
    setSelectedRunnerId(runnerId);
    setMappedFiles([]);
    setSpecs([]);
    setSelectedSuite(null);
    setCompilationError(null);
  };

  const runSuiteTest = async () => {
    const currentSuite = selectedSuite();
    if (!currentSuite || isRunning() || !props.repo?.path) return;

    const filePath = findFilePathBySuite(currentSuite);

    if (!filePath) {
      console.error(`Não foi possível associar a suíte "${currentSuite}" a nenhum arquivo físico.`);
      return;
    }

    setIsRunning(true);
    setCompilationError(null); 
    setExecutionScope('suite');

    setSpecs(prev => prev.map(spec => {
      const [specSuite] = spec.name.split(' > ');
      if (specSuite.trim() === currentSuite.trim()) {
        return { ...spec, status: 'running', log: [], duration: undefined };
      }
      return spec;
    }));

    try {
      await runTestTerminal(
        activeRunner() || 'angular',
        props.repo.path,
        filePath,
        '',
        randomizeTests()
      );
    } catch (err) {
      setIsRunning(false);
      setIsStopping(false);
      setExecutionScope(null);
    }
  };

  return (
    <div
      class="flex h-full w-full select-none bg-gray-200 dark:bg-gray-900 text-gray-800 dark:text-gray-200"
      onMouseMove={(e) => isResizing() && setSidebarWidth(Math.min(420, Math.max(220, e.clientX)))}
      onMouseUp={() => setIsResizing(false)}
      onMouseLeave={() => setIsResizing(false)}
    >
      {/* Sidebar */}
      <div class="flex flex-col overflow-auto pt-2 pb-2 pl-2 height-container" style={{ width: `${sidebarWidth()}px` }}>
        <div class="container-branch-list p-0 overflow-hidden flex flex-col h-full">
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
                      value={selectedRunnerId() || ''}
                      onChange={(event) => selectRunner(event.currentTarget.value)}
                      disabled={isRunning()}
                      aria-label={t('test').select_runner}
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
                    title={t('test').settings}
                    aria-label={t('test').settings}
                    class="w-7 h-7 rounded-lg text-gray-500 hover:text-blue-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-40"
                  >
                    <i class="fa-solid fa-gear text-[11px]"></i>
                  </button>
                  <Show
                    when={isRunning()}
                    fallback={
                      <button
                        onClick={runAllTests}
                        title={t('test').run_tests}
                        aria-label={t('test').run_tests}
                        class="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm transition-all hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
                      >
                        <i class="fa-solid fa-play text-[10px]"></i>
                      </button>
                    }
                  >
                    <button
                      onClick={stopTests}
                      disabled={isStopping()}
                      title={t('test').stop}
                      aria-label={t('test').stop}
                      class="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600 text-white shadow-sm transition-all hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-400/50 disabled:cursor-wait disabled:opacity-70"
                    >
                      <Show when={isStopping()} fallback={<i class="fa-solid fa-stop text-[10px]"></i>}>
                        <i class="fa-solid fa-circle-notch animate-spin text-[10px]"></i>
                      </Show>
                    </button>
                  </Show>
                </div>
            </div>

            <div class="mt-2 flex items-center gap-1 rounded-lg border border-gray-200 bg-white/70 p-1 dark:border-gray-700 dark:bg-gray-900/40">
              <button
                onClick={() => setFilterStatus('all')}
                title={t('test').total}
                aria-label={t('test').total}
                class={`flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md py-1 text-[10px] font-bold transition-all focus:outline-none ${
                  filterStatus() === 'all'
                    ? 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-white'
                    : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <i class="fa-solid fa-layer-group text-[9px]"></i>
                {stats().total}
              </button>
              <button
                onClick={() => setFilterStatus('pass')}
                title={t('test').passed}
                aria-label={t('test').passed}
                class={`flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md py-1 text-[10px] font-bold transition-all focus:outline-none ${
                  filterStatus() === 'pass'
                    ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                    : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <i class="fa-solid fa-check text-[9px]"></i>
                {stats().passed}
              </button>
              <button
                onClick={() => setFilterStatus('fail')}
                title={t('test').failed}
                aria-label={t('test').failed}
                class={`flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md py-1 text-[10px] font-bold transition-all focus:outline-none ${
                  filterStatus() === 'fail'
                    ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                    : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <i class="fa-solid fa-xmark text-[9px]"></i>
                {stats().failed}
              </button>
            </div>

            <div class="relative mt-2">
              <i class={`fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-[10px] transition-opacity ${isRunning() ? 'opacity-20' : 'opacity-50'}`}></i>
              <input 
                type="text"
                placeholder={isRunning() ? t('test').running + "..." : t('common').search + '...'}
                disabled={isRunning()}
                value={searchQuery()}
                onInput={(e) => setSearchQuery(e.currentTarget.value)}
                class="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md py-1.5 pl-8 pr-3 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div class="flex items-center justify-between px-3 pb-1 pt-2">
            <span class="text-[9px] font-black uppercase tracking-[0.16em] text-gray-400">{t('test').tests}</span>
            <span class="text-[9px] font-bold text-gray-400">{suites().length}</span>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5">
            <For each={suites()}>
              {(suite) => (
                <div 
                  onClick={() => setSelectedSuite(suite)}
                  class={`flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 transition-all ${
                    selectedSuite() === suite
                      ? 'border-blue-400/50 bg-blue-500 text-white shadow-sm shadow-blue-900/20'
                      : 'border-transparent hover:border-gray-300 hover:bg-gray-200/80 dark:hover:border-gray-700 dark:hover:bg-gray-800'
                  }`}
                >
                  <Show 
                    when={isRunning() && groupedSpecs()[suite].tests.some(t => t.status === 'running')} 
                    fallback={
                      <Show when={groupedSpecs()[suite].hasError} fallback={<i class="fa-solid fa-circle-check text-green-500 text-[12px]"></i>}>
                        <i class="fa-solid fa-circle-xmark text-red-500 text-[12px]"></i>
                      </Show>
                    }
                  >
                    <i class="fa-solid fa-circle-notch text-blue-400 text-[12px] animate-spin"></i>
                  </Show>
                  
                  <span class={`text-xs truncate ${selectedSuite() === suite ? 'font-bold' : 'font-medium'}`}>{suite}</span>
                  <span class={`ml-auto text-[10px] px-1.5 py-0.5 rounded ${selectedSuite() === suite ? 'bg-white/20' : 'bg-gray-300 dark:bg-gray-700'}`}>
                    {groupedSpecs()[suite].tests.length}
                  </span>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>

      <div class="resize-bar-vertical" onMouseDown={() => setIsResizing(true)} />

      {/* Painel Principal com Condicional de Erro Genérico/Compilação */}
      <div class="flex-1 flex flex-col overflow-hidden pt-2 pb-2 pr-2 height-container">
        <div class="flex-1 flex flex-col container-branch-list overflow-hidden h-full p-0">
          
          <Show 
            when={!compilationError()} 
            fallback={
              /* VIEW DE ERRO DE COMPILAÇÃO GENÉRICA E DINÂMICA */
              <div class="flex-1 flex flex-col overflow-hidden bg-red-950/10 p-6 animate-fadeIn">
                <div class="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl mb-4">
                  <div class="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center text-white text-sm shrink-0 shadow-[0_0_15px_rgba(239,68,68,0.3)]">
                    <i class="fa-solid fa-triangle-exclamation animate-bounce"></i>
                  </div>
                  <div>
                    <h3 class="text-sm font-bold text-red-500 uppercase tracking-wide">
                      Erro de Compilação ({activeFramework() || 'Build Error'})
                    </h3>
                    <p class="text-[11px] opacity-70">
                      O compilador do {activeFramework() || 'sistema'} barrou a execução antes de conseguir iniciar a suíte de testes.
                    </p>
                  </div>
                </div>

                <div class="flex-1 flex flex-col overflow-hidden rounded-xl border border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-950 font-mono shadow-inner">
                  <div class="px-4 py-2 bg-gray-100 dark:bg-gray-900 border-b border-gray-300 dark:border-gray-800 text-[10px] uppercase font-bold tracking-wider opacity-60 flex justify-between items-center">
                    <span>Terminal Output Cache (Rust STDOUT)</span>
                    <i class="fa-solid fa-terminal text-[9px]"></i>
                  </div>
                  <div class="flex-1 overflow-auto p-4 text-[11px] text-red-600 dark:text-red-300 leading-relaxed whitespace-pre selection:bg-red-500/30">
                    <For each={compilationError()}>
                      {(line) => {
                        // Destaca linhas com assinaturas conhecidas de erro de build
                        const isTargetError = line.includes('error TS') || line.includes('error CS') || line.includes('undefined:') || line.includes('FAILED');
                        return (
                          <div class={`${isTargetError ? 'font-bold bg-red-500/5 px-1 py-0.5 rounded text-red-500' : ''}`}>
                            {line}
                          </div>
                        );
                      }}
                    </For>
                  </div>
                </div>
              </div>
            }
          >
            {/* RENDERIZAÇÃO TRADICIONAL DOS SPECS */}
            <Show when={selectedSuite()} fallback={
              <div class="flex-1 flex flex-col items-center justify-center opacity-30">
                <i class="fa-solid fa-vials text-4xl mb-4"></i>
                <span class="italic text-sm">{t('test').select_suit}</span>
              </div>
            }>
              <div class="border-b border-gray-300 bg-white p-3 dark:border-gray-700 dark:bg-gray-800/30">
                <div class="flex min-w-0 items-center justify-between gap-3">
                  <div class="flex min-w-0 items-center gap-3">
                    <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-300">
                      <i class="fa-solid fa-flask text-sm"></i>
                    </div>
                    <div class="min-w-0">
                      <div class="text-[9px] font-black uppercase tracking-[0.18em] text-gray-400">{activeFramework() || t('test').test}</div>
                      <h2 class="truncate text-sm font-bold tracking-tight text-gray-800 dark:text-gray-100 select-text">{selectedSuite()}</h2>
                    </div>
                  </div>

                  <div class="flex shrink-0 items-center gap-2">
                    <Show
                      when={isRunning()}
                      fallback={
                        <span class={`hidden items-center gap-1.5 rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wide sm:flex ${
                          selectedSuiteStats().failed > 0
                            ? 'border-red-500/20 bg-red-500/10 text-red-500'
                            : 'border-green-500/20 bg-green-500/10 text-green-500'
                        }`}>
                          <i class={`fa-solid ${selectedSuiteStats().failed > 0 ? 'fa-circle-xmark' : 'fa-circle-check'}`}></i>
                          {selectedSuiteStats().failed > 0 ? t('test').failed : t('test').passed}
                        </span>
                      }
                    >
                      <span class="hidden items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-blue-500 sm:flex">
                        <i class="fa-solid fa-circle-notch animate-spin"></i>
                        {t('test').running}
                      </span>
                    </Show>
                    <button
                      onClick={() => runSuiteTest()}
                      disabled={isRunning()}
                      title={t('test').rerun}
                      aria-label={t('test').rerun}
                      class="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-600 transition-all hover:bg-blue-600 hover:text-white dark:bg-gray-700 dark:text-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Show when={isRunning() && groupedSpecs()[selectedSuite()!]?.tests.some(t => t.status === 'running')} fallback={<i class="fa-solid fa-rotate-right text-[10px]"></i>}>
                        <i class="fa-solid fa-circle-notch animate-spin text-[10px]"></i>
                      </Show>
                    </button>
                  </div>
                </div>

                <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div class="rounded-lg border border-gray-200 bg-gray-50/80 px-2.5 py-2 dark:border-gray-700 dark:bg-gray-900/30">
                    <div class="flex items-center justify-between text-[9px] font-bold uppercase tracking-wide text-gray-400"><span>{t('test').tests}</span><i class="fa-solid fa-layer-group"></i></div>
                    <div class="mt-1 text-base font-black text-gray-800 dark:text-gray-100">{selectedSuiteStats().total}</div>
                  </div>
                  <div class="rounded-lg border border-green-500/15 bg-green-500/5 px-2.5 py-2">
                    <div class="flex items-center justify-between text-[9px] font-bold uppercase tracking-wide text-green-600/70 dark:text-green-400/70"><span>{t('test').passed}</span><i class="fa-solid fa-check"></i></div>
                    <div class="mt-1 text-base font-black text-green-600 dark:text-green-400">{selectedSuiteStats().passed}</div>
                  </div>
                  <div class="rounded-lg border border-red-500/15 bg-red-500/5 px-2.5 py-2">
                    <div class="flex items-center justify-between text-[9px] font-bold uppercase tracking-wide text-red-600/70 dark:text-red-400/70"><span>{t('test').failed}</span><i class="fa-solid fa-xmark"></i></div>
                    <div class="mt-1 text-base font-black text-red-600 dark:text-red-400">{selectedSuiteStats().failed}</div>
                  </div>
                  <div class="rounded-lg border border-blue-500/15 bg-blue-500/5 px-2.5 py-2">
                    <div class="flex items-center justify-between text-[9px] font-bold uppercase tracking-wide text-blue-600/70 dark:text-blue-400/70"><span>{t('test').rating_score}</span><i class="fa-solid fa-chart-line"></i></div>
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
                  <span class="shrink-0 text-[10px] font-bold text-gray-400">{selectedSuiteStats().passed}/{selectedSuiteStats().total} {t('test').passed.toLowerCase()}</span>
                </div>
              </div>

              <div class="min-h-0 flex-1 overflow-y-auto p-3">
                <div class="mb-2 flex items-center justify-between px-1">
                  <span class="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">{t('test').test_details}</span>
                  <span class="text-[10px] font-medium text-gray-400">{selectedSuiteStats().total} {t('test').tests.toLowerCase()}</span>
                </div>
                <div class="space-y-1.5">
                  <For each={groupedSpecs()[selectedSuite()!]?.tests || []}>
                    {(spec) => (
                      <div
                        onContextMenu={(event) => showTestContextMenu(event, spec)}
                        class={`group flex min-h-[42px] items-center gap-3 rounded-lg border px-3 py-2 transition-all hover:shadow-sm ${
                        spec.status === 'pass'
                          ? 'bg-green-500/5 border-green-500/20'
                          : spec.status === 'running'
                          ? 'bg-blue-500/5 border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.05)]'
                          : spec.status === 'skip'
                          ? 'bg-amber-500/5 border-amber-500/20'
                          : 'bg-red-500/5 border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.1)]'
                      }`}>
                        
                        <div class={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all ${
                          spec.status === 'pass'
                            ? 'bg-green-500 text-white'
                            : spec.status === 'running'
                            ? 'bg-blue-500 text-white animate-pulse'
                            : spec.status === 'skip'
                            ? 'bg-amber-500 text-white'
                            : 'bg-red-500 text-white'
                        }`}>
                          <Show when={spec.status === 'running'} fallback={<i class={`fa-solid text-[10px] ${spec.status === 'pass' ? 'fa-check' : spec.status === 'skip' ? 'fa-minus' : 'fa-xmark'}`}></i>}>
                            <i class="fa-solid fa-circle-notch text-[10px] animate-spin"></i>
                          </Show>
                        </div>
                        
                        <div class="flex-1 min-w-0">
                          <div class="flex items-center gap-2">
                            <div class={`truncate text-[11px] font-semibold tracking-tight transition-opacity ${spec.status === 'running' ? 'opacity-60' : 'opacity-100'}`}>
                              {spec.name.split(' > ')[1] || spec.name}
                            </div>
                          </div>

                          <Show when={spec.status === 'fail' && spec.log.length > 0}>
                            <div class="mt-2 p-3 dark:bg-red-950/30 rounded border border-red-500/30 font-mono text-[11px] text-black dark:text-red-200 overflow-x-auto select-text">
                              <div class="mb-2 text-[10px] uppercase tracking-wide text-red-600 dark:text-red-300">{t('test').error_details}</div>
                              <For each={spec.log}>
                                {(logLine) => (
                                  <div class={`mb-1 whitespace-pre-wrap break-words ${logLine.includes('at ') ? 'opacity-50 text-[10px]' : 'font-bold'}`}>
                                    {logLine}
                                  </div>
                                )}
                              </For>
                            </div>
                          </Show>
                        </div>

                        <div class="flex items-center gap-3">
                          <button 
                            onClick={() => runIndividualTest(spec)}
                            disabled={isRunning()}
                            title={`Executar apenas o teste: ${spec.name.split(' > ')[1] || spec.name}`}
                            class="rounded-lg bg-gray-200 p-1.5 text-[10px] opacity-0 transition-opacity hover:bg-blue-500 hover:text-white group-hover:opacity-100 focus:opacity-100 dark:bg-gray-700 disabled:opacity-30"
                          >
                            <i class="fa-solid fa-play"></i>
                          </button>

                          <div class="flex flex-col items-end gap-1 min-w-[60px]">
                            <div class={`rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wide ${
                              spec.status === 'pass'
                                ? 'border-green-500/20 bg-green-500/10 text-green-600 dark:text-green-400'
                                : spec.status === 'running'
                                ? 'border-blue-500/20 bg-blue-500/10 text-blue-500 animate-pulse'
                                : spec.status === 'skip'
                                ? 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                : 'border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400'
                            }`}>
                              {spec.status === 'pass'
                                ? t('test').passed
                                : spec.status === 'running'
                                ? t('test').running
                                : spec.status === 'skip'
                                ? t('test').skipped
                                : t('test').failed}
                            </div>
                            <Show when={spec.duration && spec.status !== 'running'}>
                              <span class="text-[9px] font-mono dark:text-white">{formatDuration(spec.duration)}</span>
                            </Show>
                          </div>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>
          </Show>
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
        title={t('test').settings}
        icon="fa-solid fa-sliders"
        iconColor="text-blue-600 dark:text-blue-300"
        width="390px"
        onClose={() => setSettingsOpen(false)}
      >
        <div class="space-y-4">
          <div>
            <h3 class="text-sm font-bold text-gray-800 dark:text-white">{t('test').settings}</h3>
            <p class="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{t('test').settings_description}</p>
          </div>

          <label class="flex items-start gap-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40">
            <input
              type="checkbox"
              checked={randomizeTests()}
              onChange={(event) => setRandomOrder(event.currentTarget.checked)}
              class="mt-0.5 h-4 w-4 accent-blue-600"
            />
            <span>
              <span class="block text-xs font-bold text-gray-800 dark:text-gray-100">{t('test').random_order}</span>
              <span class="block mt-1 text-[10px] leading-relaxed text-gray-500 dark:text-gray-400">{t('test').random_order_description}</span>
            </span>
          </label>

          <div class="flex justify-end">
            <button
              onClick={() => setSettingsOpen(false)}
              class="rounded-md bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 transition-colors"
            >
              {t('common').close}
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};