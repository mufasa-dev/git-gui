import { createSignal, For, onMount, onCleanup, Show, createMemo, createEffect } from 'solid-js';
import { listen } from '@tauri-apps/api/event';
import { ParsedEvent, ProjectType, TestRunnerOption } from '../../models/ProjectType.model';
import { getProjectType, runTestTerminal, getTestsFiles } from '../../services/testService';
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
  const [sidebarWidth, setSidebarWidth] = createSignal(300);
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
    if (path) {
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

  const updateFileMapping = async (runner: TestRunnerOption | null = activeRunner()) => {
    if (props.repo?.path && runner) {
      try {
        const files = await getTestsFiles(props.repo.path, runner);
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
      setSelectedRunnerId(info.runners[0]?.id || null);
    });
  });

  createEffect(() => {
    const path = props.repo?.path;
    const runner = activeRunner();
    if (!path || !runner) return;
    setMappedFiles([]);
    setSelectedSuite(null);
    void updateFileMapping(runner);
  });

  const stats = createMemo(() => {
    const total = specs().length;
    const passed = specs().filter(s => s.status === 'pass').length;
    const failed = specs().filter(s => s.status === 'fail').length;
    return { total, passed, failed };
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
        action: () => runIndividualTest(spec.name)
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
            resultId: specData.resultId
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
      if (
        event.payload?.status === "finished" ||
        event.payload?.name === "PROCESS_FINISHED" ||
        event.payload === "PROCESS_FINISHED"
      ) {
        setIsRunning(false);
        await updateFileMapping();
        syncSpecsWithPhysicalCode();
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
      setSpecs([{ id: 'error', name: 'Erro > Falha', status: 'fail', log: [String(err)] }]);
    }
  };

  const runIndividualTest = async (specName: string) => {
    const currentSuite = selectedSuite();
    if (!currentSuite || isRunning() || !specName || !props.repo?.path) return;

    const pureItName = specName.split(' > ').pop() || specName;
    const filePath = findFilePathBySuite(currentSuite);

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
        pureItName,
        randomizeTests()
      );
    } catch (err) {
      setIsRunning(false);
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
      setExecutionScope(null);
    }
  };

  return (
    <div
      class="flex h-full w-full select-none bg-gray-200 dark:bg-gray-900 text-gray-800 dark:text-gray-200"
      onMouseMove={(e) => isResizing() && setSidebarWidth(Math.min(600, Math.max(200, e.clientX)))}
      onMouseUp={() => setIsResizing(false)}
    >
      {/* Sidebar */}
      <div class="flex flex-col overflow-auto pt-2 pb-2 pl-2 height-container" style={{ width: `${sidebarWidth()}px` }}>
        <div class="container-branch-list p-0 overflow-hidden flex flex-col h-full">
          <div class="p-3 border-b border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800/50">
            <div class="flex justify-between items-center mb-3">
                <div class="flex min-w-0 items-center gap-2">
                  <span class="text-[10px] font-bold uppercase text-gray-500 dark:text-white flex items-center gap-2 truncate">
                    <FileIcon fileName={activeRunner()?.label || 'dockerfile'} />
                    {activeRunner()?.label || 'Runner'}
                  </span>
                  <Show when={(projectInfo()?.runners.length || 0) > 1}>
                    <select
                      value={selectedRunnerId() || ''}
                      onChange={(event) => selectRunner(event.currentTarget.value)}
                      disabled={isRunning()}
                      aria-label={t('test').select_runner}
                      class="max-w-[150px] rounded border border-gray-300 bg-white px-1.5 py-1 text-[10px] font-semibold text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
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
                  <button onClick={runAllTests} disabled={isRunning()} class="bg-blue-600 hover:bg-blue-500 text-white text-[10px] px-3 py-1 rounded-xl font-bold transition-all flex items-center gap-2">
                      <Show when={isRunning()} fallback={<i class="fa-solid fa-play"></i>}>
                        <i class="fa-solid fa-circle-notch animate-spin"></i>
                      </Show>
                      {isRunning() ? t('test').running : t('test').run}
                  </button>
                </div>
            </div>

            <div class="grid grid-cols-3 gap-1 text-center">
              <button 
                onClick={() => setFilterStatus('all')}
                class={`p-1 rounded border transition-all text-center focus:outline-none ${
                  filterStatus() === 'all' 
                    ? 'bg-gray-300 dark:bg-gray-600 border-gray-400 dark:border-gray-500 ring-1 ring-blue-500/30' 
                    : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300/70 dark:hover:bg-gray-700/70 border-gray-300 dark:border-gray-600'
                }`}
              >
                <div class="text-[10px] text-gray-500 dark:text-gray-400 uppercase">{t('test').total}</div>
                <div class="text-xs font-bold">{stats().total}</div>
              </button>
              
              <button 
                onClick={() => setFilterStatus('pass')}
                class={`p-1 rounded border transition-all text-center focus:outline-none ${
                  filterStatus() === 'pass' 
                    ? 'bg-green-500/20 border-green-500/50 ring-1 ring-green-500/30' 
                    : 'bg-green-500/10 hover:bg-green-500/15 border-green-500/20'
                }`}
              >
                <div class="text-[10px] text-green-500 uppercase">PASSED</div>
                <div class="text-xs font-bold text-green-500">{stats().passed}</div>
              </button>
              
              <button 
                onClick={() => setFilterStatus('fail')}
                class={`p-1 rounded border transition-all text-center focus:outline-none ${
                  filterStatus() === 'fail' 
                    ? 'bg-red-500/20 border-red-500/50 ring-1 ring-red-500/30' 
                    : 'bg-red-500/10 hover:bg-red-500/15 border-red-500/20'
                }`}
              >
                <div class="text-[10px] text-red-500 uppercase">FAILED</div>
                <div class="text-xs font-bold text-red-500">{stats().failed}</div>
              </button>
            </div>

            <div class="mt-3 h-1.5 w-full bg-gray-300 dark:bg-gray-900 rounded-full overflow-hidden flex">
              <Show when={stats().total > 0}>
                <div class="h-full bg-green-500 transition-all duration-500 ease-out" style={{ width: `${(stats().passed / stats().total) * 100}%` }} />
                <div class="h-full bg-red-500 transition-all duration-500 ease-out" style={{ width: `${(stats().failed / stats().total) * 100}%` }} />
              </Show>
            </div>

            <div class="relative mt-3">
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

          <div class="flex-1 overflow-y-auto p-1">
            <For each={suites()}>
              {(suite) => (
                <div 
                  onClick={() => setSelectedSuite(suite)}
                  class={`flex items-center gap-2 p-2 rounded-md cursor-pointer mb-1 transition-all ${
                    selectedSuite() === suite ? 'bg-blue-500 text-white' : 'hover:bg-gray-300 dark:hover:bg-gray-800'
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
              <div class="p-4 border-b border-gray-300 dark:border-gray-700 flex items-center justify-between bg-white dark:bg-gray-800/30">
                <h2 class="text-sm font-bold font-mono uppercase tracking-wider truncate mr-4 select-text">
                  <i class="fa-solid fa-flask text-purple-500 dark:text-purple-400 mr-2"></i>
                  {selectedSuite()}
                </h2>
                
                <button 
                  onClick={() => runSuiteTest()}
                  disabled={isRunning()}
                  class="bg-gray-200 dark:bg-gray-700 hover:bg-blue-600 hover:text-white text-[10px] px-2 py-1 rounded font-bold transition-all flex items-center gap-1 disabled:opacity-50"
                >
                  <Show when={isRunning() && groupedSpecs()[selectedSuite()!]?.tests.some(t => t.status === 'running')} fallback={<i class="fa-solid fa-rotate-right"></i>}>
                    <i class="fa-solid fa-circle-notch animate-spin"></i>
                  </Show>
                  RERUN SUITE
                </button>
              </div>

              <div class="flex-1 overflow-y-auto p-4">
                <div class="grid grid-cols-1 gap-2">
                  <For each={groupedSpecs()[selectedSuite()!]?.tests || []}>
                    {(spec) => (
                      <div
                        onContextMenu={(event) => showTestContextMenu(event, spec)}
                        class={`group flex items-center gap-4 px-3 py-1 rounded-lg border transition-all ${
                        spec.status === 'pass' 
                          ? 'bg-green-500/5 border-green-500/20' 
                          : spec.status === 'running'
                          ? 'bg-blue-500/5 border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.05)]'
                          : 'bg-red-500/5 border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.1)]'
                      }`}>
                        
                        <div class={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                          spec.status === 'pass' 
                            ? 'bg-green-500 text-white' 
                            : spec.status === 'running'
                            ? 'bg-blue-500 text-white animate-pulse'
                            : 'bg-red-500 text-white'
                        }`}>
                          <Show when={spec.status === 'running'} fallback={<i class={`fa-solid text-[10px] ${spec.status === 'pass' ? 'fa-check' : 'fa-xmark'}`}></i>}>
                            <i class="fa-solid fa-circle-notch text-[10px] animate-spin"></i>
                          </Show>
                        </div>
                        
                        <div class="flex-1 min-w-0">
                          <div class="flex items-center gap-2">
                            <div class={`text-xs font-bold font-mono truncate transition-opacity ${spec.status === 'running' ? 'opacity-60' : 'opacity-100'}`}>
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
                            onClick={() => runIndividualTest(spec.name)}
                            disabled={isRunning()}
                            title={`Executar apenas o teste: ${spec.name.split(' > ')[1] || spec.name}`}
                            class="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded bg-gray-300 dark:bg-gray-700 hover:bg-blue-500 hover:text-white text-[10px] disabled:opacity-30"
                          >
                            <i class="fa-solid fa-play"></i>
                          </button>

                          <div class="flex flex-col items-end gap-1 min-w-[60px]">
                            <div class={`text-[10px] font-bold uppercase ${
                              spec.status === 'pass' ? 'text-green-600' : spec.status === 'running' ? 'text-blue-500 animate-pulse' : 'text-red-600'
                            }`}>
                              {spec.status === 'pass' ? t('test').passed : spec.status === 'running' ? t('test').running : t('test').failed}
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