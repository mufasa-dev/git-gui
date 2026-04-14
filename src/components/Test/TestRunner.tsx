import { createSignal, For, onMount, Show, createMemo, createEffect } from 'solid-js';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

interface TestSpec {
  id: string;
  name: string;
  status: 'pass' | 'fail' | 'running';
  log: string[];
}

export const TestRunner = (props: { repo: any }) => {
  const [specs, setSpecs] = createSignal<TestSpec[]>([]);
  const [selectedSuite, setSelectedSuite] = createSignal<string | null>(null);
  const [isRunning, setIsRunning] = createSignal(false);
  const [sidebarWidth, setSidebarWidth] = createSignal(300);
  const [isResizing, setIsResizing] = createSignal(false);

  const stripAnsi = (str: string) => str.replace(/\x1B\[[0-9;]*[JKmsu]/g, '');

  // Estatísticas Globais
  const stats = createMemo(() => {
    const total = specs().length;
    const passed = specs().filter(s => s.status === 'pass').length;
    const failed = specs().filter(s => s.status === 'fail').length;
    return { total, passed, failed };
  });

  // Agrupamento com lógica de status da Suíte
  const groupedSpecs = createMemo(() => {
    const groups: Record<string, { tests: TestSpec[], hasError: boolean }> = {};
    const currentSpecs = specs();
    
    if (!currentSpecs.length) return groups;

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

  const suites = createMemo(() => Object.keys(groupedSpecs()));

  createEffect(() => {
    if (props.repo?.path) {
      setSpecs([]);
      setSelectedSuite(null);
      setIsRunning(false);
    }
  });

  onMount(async () => {
    let logBuffer: string[] = [];

    await listen('test-event', (event: any) => {
      const rawLine = typeof event.payload === 'string' ? event.payload : event.payload.name;
      if (!rawLine) return;

      let line = stripAnsi(rawLine).trim();

      // Se for o resultado de uma falha
      if (line.includes('SPEC_RESULT|') && line.includes('|FAIL')) {
        const parts = line.split('|');
        const newId = crypto.randomUUID();

        setSpecs(prev => [...prev, { 
          id: newId, 
          name: `${parts[1]} > ${parts[2]}`, 
          status: 'fail', 
          log: [...logBuffer] // Pega o que está no buffer AGORA
        }]);
        logBuffer = []; // Limpa para o próximo
        return;
      } 

      // Se for um resultado de sucesso, só adiciona e limpa o buffer
      if (line.includes('SPEC_RESULT|') && line.includes('|PASS')) {
          const parts = line.split('|');
          setSpecs(prev => [...prev, { 
              id: crypto.randomUUID(), 
              name: `${parts[1]} > ${parts[2]}`, 
              status: 'pass', 
              log: [] 
          }]);
          logBuffer = [];
          return;
      }

      // Se não for resultado, e não for lixo de conexão, guarda no buffer
      if (line.length > 0 && !line.includes("INFO [") && !line.includes("Connected")) {
        logBuffer.push(line);
        if (logBuffer.length > 30) logBuffer.shift();
      }

      if (
        line.includes("TOTAL:") || 
        line.includes("Done") || 
        line.includes("Executed") || 
        line.includes("Finished")
      ) {
        console.log("Parada detectada na linha:", line);
        setIsRunning(false);
      }
    });
  });

  const runAllTests = async () => {
    if (!props.repo?.path || isRunning()) return;
    setIsRunning(true);
    
    setSpecs([]);
    setSelectedSuite(null);
    
    try {
      await invoke('run_angular_tests', { projectPath: props.repo.path });
    } catch (err) {
      setIsRunning(false);
      setSpecs([{ id: 'error', name: 'Erro > Falha', status: 'fail', log: [String(err)] }]);
    }
  };

  return (
    <div 
      class="flex h-full w-full select-none bg-gray-200 dark:bg-gray-900 text-gray-800 dark:text-gray-200 p-2"
      onMouseMove={(e) => isResizing() && setSidebarWidth(Math.min(600, Math.max(200, e.clientX)))}
      onMouseUp={() => setIsResizing(false)}
    >
      {/* Sidebar: Suítes + Resumo */}
      <div 
        class="container-branch-list p-0 overflow-hidden flex flex-col mb-2" 
        style={{ width: `${sidebarWidth()}px`, height: `calc(100vh - 124px)` }}
      >
        {/* Header com Stats */}
        <div class="p-3 border-b border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800/50">
          <div class="flex justify-between items-center mb-3">
             <span class="text-[10px] font-bold uppercase text-gray-500">Test Runner</span>
             <button onClick={runAllTests} disabled={isRunning()} class="bg-blue-600 hover:bg-blue-500 text-white text-[10px] px-3 py-1 rounded font-bold transition-all flex items-center gap-2">
                <Show when={isRunning()} fallback={<i class="fa-solid fa-play"></i>}>
                  <i class="fa-solid fa-circle-notch animate-spin"></i>
                </Show>
                {isRunning() ? 'RUNNING' : 'RUN ALL'}
             </button>
          </div>
          
          <div class="grid grid-cols-3 gap-1 text-center">
            <div class="bg-gray-200 dark:bg-gray-800 p-1 rounded">
              <div class="text-[10px] text-gray-500 uppercase">Total</div>
              <div class="text-xs font-bold">{stats().total}</div>
            </div>
            <div class="bg-green-500/10 p-1 rounded border border-green-500/20">
              <div class="text-[10px] text-green-500 uppercase">Pass</div>
              <div class="text-xs font-bold text-green-500">{stats().passed}</div>
            </div>
            <div class="bg-red-500/10 p-1 rounded border border-red-500/20">
              <div class="text-[10px] text-red-500 uppercase">Fail</div>
              <div class="text-xs font-bold text-red-500">{stats().failed}</div>
            </div>
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
        </div>
      </div>

      <div class="resize-bar-vertical" onMouseDown={() => setIsResizing(true)} />

      {/* Painel Principal: Lista de Testes (Ocupando tudo) */}
      <div class="flex-1 flex flex-col container-branch-list overflow-hidden ml-1 h-full p-0" style={{ height: `calc(100vh - 124px)` }}>
        <Show when={selectedSuite()} fallback={
          <div class="flex-1 flex flex-col items-center justify-center opacity-30">
            <i class="fa-solid fa-vials text-4xl mb-4"></i>
            <span class="italic text-sm">Selecione uma suíte para detalhar os resultados</span>
          </div>
        }>
          <div class="p-4 border-b border-gray-300 dark:border-gray-700 flex items-center justify-between bg-white dark:bg-gray-800/30">
            <h2 class="text-sm font-bold font-mono uppercase tracking-wider">
              <i class="fa-solid fa-folder-open mr-2 opacity-50"></i>
              Suíte: {selectedSuite()}
            </h2>
            <div class="text-[10px] font-mono text-gray-500 dark:text-gray-400 uppercase">
              {groupedSpecs()[selectedSuite()!].tests.length} Testes Encontrados
            </div>
          </div>

          <div class="flex-1 overflow-y-auto p-4">
            <div class="grid grid-cols-1 gap-2">
              <For each={groupedSpecs()[selectedSuite()!]?.tests || []}>
                {(spec) => (
                  <div class={`flex items-center gap-4 p-3 rounded-lg border ${
                    spec.status === 'pass' 
                    ? 'bg-green-500/5 border-green-500/20' 
                    : 'bg-red-500/5 border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.1)]'
                  }`}>
                    <div class={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                      spec.status === 'pass' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                    }`}>
                      <i class={`fa-solid text-[10px] ${spec.status === 'pass' ? 'fa-check' : 'fa-xmark'}`}></i>
                    </div>
                    
                    <div class="flex-1 min-w-0" onClick={() => console.log('spec', spec)}>
                      <div class="text-xs font-bold font-mono truncate">{spec.name.split(' > ')[1]}</div>
                      <Show when={spec.status === 'fail' && spec.log.length > 0}>
                        <div class="mt-2 p-3 dark:bg-red-950/30 rounded border border-red-500/30 font-mono text-[11px] text-black dark:text-red-200">
                          <For each={spec.log}>
                            {(logLine) => (
                              <div class={`mb-1 ${logLine.includes('at ') ? 'opacity-50 text-[10px]' : 'font-bold'}`}>
                                {logLine}
                              </div>
                            )}
                          </For>
                        </div>
                      </Show>
                    </div>

                    <div class={`text-[10px] font-bold uppercase ${spec.status === 'pass' ? 'text-green-600' : 'text-red-600'}`}>
                      {spec.status === 'pass' ? 'Passed' : 'Failed'}
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
};