import { createSignal, For, onMount, Show, createMemo, createEffect } from 'solid-js';
import { listen } from '@tauri-apps/api/event';
import { ParsedEvent, ProjectType } from '../../models/ProjectType.model';
import { getProjectType, runTestTerminal, getTestsFiles } from '../../services/testService';
import { formatDuration } from '../../utils/date';
import FileIcon from '../ui/FileIcon';
import { useApp } from '../../context/AppContext';
import { angularParser } from '../../lib/TestsPareser/AngularParser';
import { parseTrxToEvents } from '../../lib/TestsPareser/TrxParser';
import { goParser } from '../../lib/TestsPareser/goParser';

interface TestSpec {
  id: string;
  name: string;
  status: 'pass' | 'fail' | 'running' | 'skip';
  log: string[];
  filePath?: string;
  duration?: string;
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
  const [searchQuery, setSearchQuery] = createSignal("");
  const [lastLoadedPath, setLastLoadedPath] = createSignal<string | null>(null);
  const [mappedFiles, setMappedFiles] = createSignal<MappedTestFile[]>([]); 
  const [filterStatus, setFilterStatus] = createSignal<'all' | 'pass' | 'fail'>('all');
  
  // SINAL DE ERRO DE COMPILAÇÃO: Armazena o log completo se o build quebrar
  const [compilationError, setCompilationError] = createSignal<string[] | null>(null);
  
  const [executionScope, setExecutionScope] = createSignal<'all' | 'suite' | 'single' | null>(null);
  const [runningSingleTest, setRunningSingleTest] = createSignal<string | null>(null);
  
  const { t } = useApp();

  const stripAnsi = (str: string) => str.replace(/\x1B\[[0-9;]*[JKmsu]/g, '');
  const storageKey = () => `brook_test_cache_${props.repo?.path}`;

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
      setSelectedSuite(null);
      setIsRunning(false);
      setFilterStatus('all');
      setExecutionScope(null);
      setRunningSingleTest(null);
      setCompilationError(null); // Reseta erro ao trocar de repo
    }
  });

  createEffect(() => {
    const currentPath = props.repo?.path;
    const loadedPath = lastLoadedPath();
    if (currentPath && loadedPath === currentPath && specs().length > 0) {
      localStorage.setItem(storageKey(), JSON.stringify(specs()));
    }
  });

  const updateFileMapping = async () => {
    if (props.repo?.path && projectInfo()?.testRunner) {
      try {
        const files = await getTestsFiles(props.repo.path, projectInfo()!.testRunner);
        setMappedFiles(files);
      } catch (e) {
        console.error("Erro ao remapear arquivos de testes:", e);
      }
    }
  };

  createEffect(async () => {
    if (props.repo?.path) {
      const info = await getProjectType(props.repo.path);
      setProjectInfo(info);
      if (info?.testRunner) {
        await updateFileMapping();
      }
    }
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
      const [suiteName] = spec.name.split(' > ');
      if (!groups[suiteName]) {
        groups[suiteName] = { tests: [], hasError: false };
      }
      groups[suiteName].tests.push(spec);
      if (spec.status === 'fail') groups[suiteName].hasError = true;
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

  const findFilePathForTest = (suite: string, testName: string): string | undefined => {
    const foundFile = mappedFiles().find(file => 
      file.tests.some(t => t.suite.trim() === suite.trim() && t.name.trim() === testName.trim())
    );
    return foundFile?.path;
  };

  const syncSpecsWithPhysicalCode = () => {
  const scope = executionScope();
  const currentSuite = selectedSuite();
  const singleTest = runningSingleTest();
  const framework = projectInfo()?.framework;

  setSpecs(prev => {
      // SE FOR GO OU DOTNET
      if (framework === 'Go' || framework === 'Dotnet') {
        return prev
          .map(spec => {
            // Se rodou um teste individual, bota os outros que estavam rodando em skip
            if (scope === 'single' && spec.name !== singleTest && spec.status === 'running') {
              return { ...spec, status: 'skip' as const };
            }
            return spec;
          })
          .filter(spec => {
            // Se uma suíte inteira rodou, remove do estado qualquer teste 
            // dessa suíte que tenha ficado travado em 'running' (sinal de que foi renomeado/removido)
            const [specSuite] = spec.name.split(' > ');
            if ((scope === 'suite' && specSuite.trim() === currentSuite?.trim()) || scope === 'all') {
              if (spec.status === 'running') {
                return false; // Remove fantasmas/renomeados
              }
            }
            return true;
          });
      }

      // REGRA PADRÃO PARA ANGULAR / JEST (Mantém idêntico ao que já funciona)
      const validTestsInCode = new Set<string>();
      mappedFiles().forEach(file => {
        file.tests.forEach(t => {
          validTestsInCode.add(`${t.suite.trim()} > ${t.name.trim()}`);
        });
      });

      return prev
        .map(spec => {
          if (scope === 'single' && spec.name !== singleTest && spec.status === 'running') {
            return { ...spec, status: 'skip' as const }; 
          }
          return spec;
        })
        .filter(spec => {
          const [specSuite] = spec.name.split(' > ');
          if (!validTestsInCode.has(spec.name.trim())) {
            if (scope === 'all' || (scope === 'suite' && specSuite.trim() === currentSuite?.trim())) {
              return false; 
            }
          }
          return true;
        });
    });

    setExecutionScope(null);
    setRunningSingleTest(null);
  };

  onMount(async () => {
    // Vamos usar um buffer temporário focado em acumular as linhas de erro de compilação
    let compileLogBuffer: string[] = [];

    const updateSpecState = (parsed: ParsedEvent) => {
      if (parsed.type === 'RESULT' && parsed.data) {
        const specData = parsed.data;
        if (executionScope() === 'single' && specData.name !== runningSingleTest()) {
          return;
        }

        let resolvedFilePath = specData.filePath;
        const [suite, testName] = specData.name!.split(' > ');
        if (!resolvedFilePath && suite && testName) {
          resolvedFilePath = findFilePathForTest(suite, testName);
        }

        setSpecs(prev => {
          const existingIndex = prev.findIndex(s => s.name === specData.name);
          const newSpec: TestSpec = {
            id: existingIndex !== -1 ? prev[existingIndex].id : crypto.randomUUID(),
            name: specData.name!,
            status: specData.status!,
            log: specData.log || [],
            filePath: resolvedFilePath,
            duration: specData.duration
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

      const rawLine = typeof event.payload === 'string' ? event.payload : event.payload.name;
      if (!rawLine) return;

      const line = stripAnsi(rawLine).trim();
      if (!line) return;

      // Alimentamos o buffer do log bruto para caso precise exibir o crash dump
      compileLogBuffer.push(line);
      if (compileLogBuffer.length > 50) compileLogBuffer.shift();

      // DETECTOR DE FALHA CRÍTICA DO COMPILADOR
      const isAngularError = line.includes('ERROR [karma-server]') || line.includes('error TS23') || line.includes('Found 1 load error');
      const isGoError = line.includes('build failed') || /:\d+:\d+: undefined:/.test(line) || /syntax error:/.test(line);
      const isDotnetError = /: error CS\d+:/.test(line) || line.includes('Build FAILED.');

      if (isAngularError || isGoError || isDotnetError) {
        setIsRunning(false);
        
        // Clona e salva o rastro do erro de compilação para renderizar na tela
        setCompilationError([...compileLogBuffer]);
        
        // Desmarca os testes que ficaram travados em loading de volta para o estado de falha
        setSpecs(prev => prev.map(s => s.status === 'running' ? { ...s, status: 'fail' as const, log: ["Falha crítica devido a erro de compilação do projeto."] } : s));
        return;
      }

      const type = projectInfo()?.framework;

      if (type === 'Dotnet' && line.startsWith('<?xml')) {
        const results = parseTrxToEvents(line);
        results.forEach(res => updateSpecState(res));
        return;
      }

      let parsed: ParsedEvent;
      if (type === 'Angular') {
        parsed = angularParser(line, []);
      } else if (type === 'Go') {
        parsed = goParser(line);
      } else {
        parsed = { type: 'LOG' };
      }

      if (parsed.type === 'FINISH') {
        setIsRunning(false);
        await updateFileMapping();
        syncSpecsWithPhysicalCode();
      } else {
        updateSpecState(parsed);
        // Se começarem a chegar resultados válidos, significa que passou da fase de compilação com sucesso
        if (parsed.type === 'RESULT') {
          compileLogBuffer = [];
        }
      }
    });
  });

  const runAllTests = async () => {
    if (!props.repo?.path || isRunning()) return;
    setIsRunning(true);
    setCompilationError(null); // Reseta erro anterior
    setExecutionScope('all');
    
    setSpecs(prev => prev.map(s => ({ ...s, status: 'running', log: [] })));
    
    try {
      await runTestTerminal(projectInfo()?.testRunner || 'dockerfile', props.repo.path);
    } catch (err) {
      setIsRunning(false);
      setSpecs([{ id: 'error', name: 'Erro > Falha', status: 'fail', log: [String(err)] }]);
    }
  };

  const runIndividualTest = async (specName: string) => {
    const currentSuite = selectedSuite();
    if (!currentSuite || isRunning() || !specName || !props.repo?.path) return;

    const pureItName = specName.split(' > ')[1] || specName;
    const filePath = findFilePathBySuite(currentSuite);

    if (!filePath) {
      console.error(`Não foi possível mapear o arquivo para o teste individual: ${pureItName}`);
      return;
    }

    setIsRunning(true);
    setCompilationError(null); // Reseta erro anterior
    setExecutionScope('single'); 
    setRunningSingleTest(specName);

    setSpecs(prev => prev.map(s => {
      if (s.name === specName) {
        return { ...s, status: 'running', log: [], duration: undefined };
      }
      return s;
    }));

    try {
      await runTestTerminal(projectInfo()?.testRunner || 'angular', props.repo.path, filePath, pureItName);
    } catch (err) {
      setIsRunning(false);
      setExecutionScope(null);
      setRunningSingleTest(null);
    }
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
    setCompilationError(null); // Reseta erro anterior
    setExecutionScope('suite');

    setSpecs(prev => prev.map(spec => {
      const [specSuite] = spec.name.split(' > ');
      if (specSuite.trim() === currentSuite.trim()) {
        return { ...spec, status: 'running', log: [], duration: undefined };
      }
      return spec;
    }));

    try {
      await runTestTerminal(projectInfo()?.testRunner || 'angular', props.repo.path, filePath);
    } catch (err) {
      setIsRunning(false);
      setExecutionScope(null);
    }
  };

  const findFilePathBySuite = (suiteName: string): string | undefined => {
    if (!suiteName) return undefined;
    const foundFile = mappedFiles().find(file => 
      file.tests.some(t => t.suite.trim().toLowerCase() === suiteName.trim().toLowerCase())
    );
    return foundFile?.path;
  };

  return (
    <div 
      class="flex h-full w-full select-none bg-gray-200 dark:bg-gray-900 text-gray-800 dark:text-gray-200"
      onMouseMove={(e) => isResizing() && setSidebarWidth(Math.min(600, Math.max(200, e.clientX)))}
      onMouseUp={() => setIsResizing(false)}
    >
      {/* Sidebar */}
      <div class="flex flex-col border-r overflow-auto border-gray-300 pt-2 pb-2 pl-2 dark:border-gray-900 height-container" style={{ width: `${sidebarWidth()}px` }}>
        <div class="container-branch-list p-0 overflow-hidden flex flex-col h-full">
          <div class="p-3 border-b border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800/50">
            <div class="flex justify-between items-center mb-3">
                <span class="text-[10px] font-bold uppercase text-gray-500 dark:text-white flex items-center gap-2">
                  <FileIcon fileName={projectInfo()?.testRunner || 'dockerfile'} />
                  {projectInfo()?.testRunner || 'Runner'}
                </span>
                <button onClick={runAllTests} disabled={isRunning()} class="bg-blue-600 hover:bg-blue-500 text-white text-[10px] px-3 py-1 rounded-xl font-bold transition-all flex items-center gap-2">
                    <Show when={isRunning()} fallback={<i class="fa-solid fa-play"></i>}>
                      <i class="fa-solid fa-circle-notch animate-spin"></i>
                    </Show>
                    {isRunning() ? t('test').running : t('test').run}
                </button>
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
                      Erro de Compilação ({projectInfo()?.framework || 'Build Error'})
                    </h3>
                    <p class="text-[11px] opacity-70">
                      O compilador do {projectInfo()?.framework || 'sistema'} barrou a execução antes de conseguir iniciar a suíte de testes.
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
                <h2 class="text-sm font-bold font-mono uppercase tracking-wider truncate mr-4">
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
                      <div class={`group flex items-center gap-4 px-3 py-1 rounded-lg border transition-all ${
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
                            <div class="mt-2 p-3 dark:bg-red-950/30 rounded border border-red-500/30 font-mono text-[11px] text-black dark:text-red-200 overflow-x-auto">
                              <For each={spec.log}>
                                {(logLine) => (
                                  <div class={`mb-1 whitespace-pre ${logLine.includes('at ') ? 'opacity-50 text-[10px]' : 'font-bold'}`}>
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
    </div>
  );
};