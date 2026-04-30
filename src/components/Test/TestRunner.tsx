import { createSignal, For, onMount, Show, createMemo, createEffect } from 'solid-js';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { ParsedEvent, ProjectType } from '../../models/ProjectType.model';
import { getProjectType } from '../../services/testService';
import { angularParser } from '../../lib/TestsPareser/AngularParser';
import { formatDuration } from '../../utils/date';
import FileIcon from '../ui/FileIcon';
import { useApp } from '../../context/AppContext';

interface TestSpec {
  id: string;
  name: string;
  status: 'pass' | 'fail' | 'running';
  log: string[];
  filePath?: string;
  duration?: string;
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
  const { t } = useApp();

  const stripAnsi = (str: string) => str.replace(/\x1B\[[0-9;]*[JKmsu]/g, '');
  const storageKey = () => `trident_test_cache_${props.repo?.path}`;

  // 1. Persistência: Carregar dados ao trocar de repositório
  createEffect(() => {
    const path = props.repo?.path;
    if (path) {
      const cached = localStorage.getItem(storageKey());
      if (cached) {
        setSpecs(JSON.parse(cached));
      } else {
        setSpecs([]);
      }
      // Marcar que as specs atuais pertencem a este path
      setLastLoadedPath(path); 
      setSelectedSuite(null);
      setIsRunning(false);
    }
  });

  // 2. Persistência: Salvar dados sempre que as specs mudarem
  createEffect(() => {
    const currentPath = props.repo?.path;
    const loadedPath = lastLoadedPath();

    if (currentPath && loadedPath === currentPath && specs().length > 0) {
      localStorage.setItem(storageKey(), JSON.stringify(specs()));
    }
  });

  // Estatísticas Globais
  const stats = createMemo(() => {
    const total = specs().length;
    const passed = specs().filter(s => s.status === 'pass').length;
    const failed = specs().filter(s => s.status === 'fail').length;
    return { total, passed, failed };
  });

  // Agrupamento
  const groupedSpecs = createMemo(() => {
    const groups: Record<string, { tests: TestSpec[], hasError: boolean }> = {};
    const currentSpecs = specs();
    
    currentSpecs.forEach(spec => {
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
    const allSuites = Object.keys(groupedSpecs());
    const query = searchQuery().toLowerCase().trim();
    
    if (!query) return allSuites;
    
    return allSuites.filter(suite => suite.toLowerCase().includes(query));
  });

  createEffect(async () => {
    if (props.repo?.path) {
      const info = await getProjectType(props.repo.path);
      setProjectInfo(info);
    }
  });

  onMount(async () => {
    let logBuffer: string[] = [];

    await listen('test-event', (event: any) => {
      const rawLine = typeof event.payload === 'string' ? event.payload : event.payload.name;
      if (!rawLine) return;

      if (event.payload.status === "finished" || event.payload.name === "PROCESS_FINISHED") {
        setIsRunning(false);
        return;
      }

      const line = stripAnsi(rawLine).trim();
      if (!line) return;

      let parsed: ParsedEvent;
      const type = projectInfo()?.framework;
      
      if (type === 'Angular') {
        parsed = angularParser(line, logBuffer);
      } else {
        parsed = { type: 'LOG' }; 
      }

      switch (parsed.type) {
        case 'RESULT':
          const specData = parsed.data!;
          setSpecs(prev => {
            // Se o teste já existe, atualizamos (importante para o Rerun não duplicar)
            const existingIndex = prev.findIndex(s => s.name === specData.name);
            const newSpec: TestSpec = {
              id: existingIndex !== -1 ? prev[existingIndex].id : crypto.randomUUID(),
              name: specData.name!,
              status: specData.status!,
              log: specData.log || [],
              filePath: specData.filePath,
              duration: specData.duration
            };

            if (existingIndex !== -1) {
              const copy = [...prev];
              copy[existingIndex] = newSpec;
              return copy;
            }
            return [...prev, newSpec];
          });
          logBuffer = [];
          break;

        case 'LOG':
          logBuffer.push(line);
          if (logBuffer.length > 30) logBuffer.shift();
          break;

        case 'FINISH':
          setIsRunning(false);
          break;
      }
    });
  });

  const runAllTests = async () => {
    if (!props.repo?.path || isRunning()) return;
    setIsRunning(true);
    setSpecs([]);
    
    try {
      await invoke('run_angular_tests', { projectPath: props.repo.path });
    } catch (err) {
      setIsRunning(false);
      setSpecs([{ id: 'error', name: 'Erro > Falha', status: 'fail', log: [String(err)] }]);
    }
  };

  const runSingleTest = async (filePath: string) => {
    if (!props.repo?.path || isRunning() || !filePath) return;
    setIsRunning(true);
    
    // Resetamos apenas os testes desse arquivo
    setSpecs(prev => prev.filter(s => s.filePath !== filePath));
    
    try {
      await invoke('run_angular_tests', { 
        projectPath: props.repo.path, 
        testFile: filePath 
      });
    } catch (err) {
      setIsRunning(false);
    }
  };

  return (
    <div 
      class="flex h-full w-full select-none bg-gray-200 dark:bg-gray-900 text-gray-800 dark:text-gray-200"
      onMouseMove={(e) => isResizing() && setSidebarWidth(Math.min(600, Math.max(200, e.clientX)))}
      onMouseUp={() => setIsResizing(false)}
    >
      {/* Sidebar */}
      <div class="flex flex-col border-r overflow-auto border-gray-300 pt-2 pb-2 pl-2 dark:border-gray-900 height-container"  style={{ width: `${sidebarWidth()}px` }}>
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
              <div class="bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 p-1 rounded">
                <div class="text-[10px] text-gray-500 dark:text-gray-400 uppercase">{t('test').total}</div>
                <div class="text-xs font-bold">{stats().total}</div>
              </div>
              <div class="bg-green-500/10 p-1 rounded border border-green-500/20">
                <div class="text-[10px] text-green-500 uppercase dark:text-green-500">{t('test').passed}</div>
                <div class="text-xs font-bold text-green-500">{stats().passed}</div>
              </div>
              <div class="bg-red-500/10 p-1 rounded border border-red-500/20">
                <div class="text-[10px] text-red-500 uppercase dark:text-red-500">{t('test').failed}</div>
                <div class="text-xs font-bold text-red-500">{stats().failed}</div>
              </div>
            </div>

            <div class="mt-3 h-1.5 w-full bg-gray-300 dark:bg-gray-800 rounded-full overflow-hidden flex">
              <Show when={stats().total > 0}>
                {/* Segmento de Sucesso */}
                <div 
                  class="h-full bg-green-500 transition-all duration-500 ease-out" 
                  style={{ width: `${(stats().passed / stats().total) * 100}%` }}
                />
                {/* Segmento de Falha */}
                <div 
                  class="h-full bg-red-500 transition-all duration-500 ease-out" 
                  style={{ width: `${(stats().failed / stats().total) * 100}%` }}
                />
              </Show>
            </div>

            {/* Opcional: Porcentagem de Sucesso */}
            <Show when={stats().total > 0}>
              <div class="mt-1 text-[9px] text-right font-mono opacity-50 uppercase tracking-tighter">
                {Math.round((stats().passed / stats().total) * 100)}% {t('test').rating_score}
              </div>
            </Show>

            <div class="relative mt-3">
              <i class={`fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-[10px] transition-opacity ${isRunning() ? 'opacity-20' : 'opacity-50'}`}></i>
              <input 
                type="text"
                placeholder={isRunning() ? t('test').running + "..." : t('common').search + '...'}
                disabled={isRunning()}
                value={searchQuery()}
                onInput={(e) => setSearchQuery(e.currentTarget.value)}
                class="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md py-1.5 pl-8 pr-3 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              />
              <Show when={searchQuery() && !isRunning()}>
                <button 
                  onClick={() => setSearchQuery("")}
                  class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <i class="fa-solid fa-xmark text-[10px]"></i>
                </button>
              </Show>
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
                  <Show when={groupedSpecs()[suite].hasError} fallback={<i class="fa-solid fa-circle-check text-green-500 text-[12px]"></i>}>
                    <i class="fa-solid fa-circle-xmark text-red-500 text-[12px] animate-pulse"></i>
                  </Show>
                  <span class={`text-xs truncate ${selectedSuite() === suite ? 'font-bold' : 'font-medium'}`}>{suite}</span>
                  <span class={`ml-auto text-[10px] px-1.5 py-0.5 rounded ${selectedSuite() === suite ? 'bg-white/20' : 'bg-gray-300 dark:bg-gray-700'}`}>
                    {groupedSpecs()[suite].tests.length}
                  </span>
                </div>
              )}
            </For>

            <Show when={suites().length === 0 && searchQuery()}>
              <div class="p-4 text-center dark:text-gray-400 italic text-[10px]">
                Nenhuma suíte encontrada
              </div>
            </Show>
          </div>
        </div>
      </div>

      <div class="resize-bar-vertical" onMouseDown={() => setIsResizing(true)} />

      {/* Painel Principal */}
      <div class="flex-1 flex flex-col overflow-hidden pt-2 pb-2 pr-2 height-container">
        <div class="flex-1 flex flex-col container-branch-list overflow-hidden h-full p-0">
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
              
              <Show when={
                  (() => {
                    const path = groupedSpecs()[selectedSuite()!]?.tests[0]?.filePath;
                    // Valida se existe e se não é um dos placeholders genéricos
                    return path && !['unknown', 'spec 0', 'spec 1'].includes(path) && path.includes('.');
                  })()
                }>
                  <button 
                    onClick={() => runSingleTest(groupedSpecs()[selectedSuite()!]?.tests[0]?.filePath!)}
                    disabled={isRunning()}
                    class="bg-gray-200 dark:bg-gray-700 hover:bg-blue-600 hover:text-white text-[10px] px-2 py-1 rounded font-bold transition-all flex items-center gap-1 disabled:opacity-50"
                  >
                    <i class="fa-solid fa-rotate-right"></i> RERUN SUITE
                  </button>
              </Show>
            </div>

            <div class="flex-1 overflow-y-auto p-4">
              <div class="grid grid-cols-1 gap-2">
                <For each={groupedSpecs()[selectedSuite()!]?.tests || []}>
                  {(spec) => (
                    <div class={`group flex items-center gap-4 px-3 py-1 rounded-lg border transition-all ${
                      spec.status === 'pass' 
                      ? 'bg-green-500/5 border-green-500/20' 
                      : 'bg-red-500/5 border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.1)]'
                    }`}>
                      <div class={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                        spec.status === 'pass' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                      }`}>
                        <i class={`fa-solid text-[10px] ${spec.status === 'pass' ? 'fa-check' : 'fa-xmark'}`}></i>
                      </div>
                      
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2">
                          <div class="text-xs font-bold font-mono truncate">{spec.name.split(' > ')[1] || spec.name}</div>
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

                      <div class="flex flex-col items-end gap-1">
                        <div class={`text-[10px] font-bold uppercase ${spec.status === 'pass' ? 'text-green-600' : 'text-red-600'}`}>
                          {spec.status === 'pass' ? t('test').passed : t('test').failed}
                        </div>
                        <Show when={spec.duration}>
                          <span class="text-[9px] font-mono dark:text-white">{formatDuration(spec.duration)}</span>
                        </Show>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
};