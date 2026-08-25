import { For, Show, createMemo, createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { parseLogLines, highlightLogLine, LogLineParsed } from "../../utils/logHighlight";
import { useApp } from "../../context/AppContext";

type LogPreviewerProps = {
  content: string;
};

export default function LogPreviewer(props: LogPreviewerProps) {
  const MAX_INITIAL_ITEMS = 2000;
  const [showFullLog, setShowFullLog] = createSignal(false);
  const { t } = useApp();

  // Cria uma store reativa a partir do parse dos logs
  const [store, setStore] = createStore<{ items: LogLineParsed[] }>({ items: [] });

  // Sincroniza e faz o parse do conteúdo quando props mudarem
  createMemo(() => {
    setStore("items", parseLogLines(props.content));
  });

  const visibleItems = createMemo(() => {
    if (showFullLog()) return store.items;
    return store.items.slice(0, MAX_INITIAL_ITEMS);
  });

  const isLargeLog = createMemo(() => store.items.length > MAX_INITIAL_ITEMS);

  // Alterna o estado aberto/fechado do grupo clicado
  const toggleGroup = (groupId: string) => {
    setStore("items", (item) => item.id === groupId, "isGroupClosed", (closed) => !closed);
  };

  return (
    <div class="h-full flex flex-col min-w-0 overflow-hidden shadow-2xl">
      <div class="overflow-auto flex-1 font-mono text-[12px] leading-6 custom-scrollbar">
        <table class="w-full border-collapse table-fixed">
          <tbody>
            <For each={visibleItems()}>
              {(item) => (
                <>
                  {/* RENDERIZAÇÃO CASO SEJA UM CABEÇALHO DE GRUPO */}
                  <Show when={item.type === 'group_header'}>
                    <tr 
                      onClick={() => toggleGroup(item.id)}
                      class="bg-gray-900/40 hover:bg-white/5 cursor-pointer transition-colors border-y border-gray-900/30 select-none group/hdr text-gray-300"
                    >
                      <td class="w-12 min-w-[3rem] text-right px-3 text-gray-600 border-r border-gray-900 text-[10px] bg-gray-900/60 font-black">
                        {item.originalIndex}
                      </td>
                      <td class="px-4 font-bold flex items-center gap-2 text-gray-300 group-hover/hdr:text-white">
                        <i class={`fa-solid fa-caret-right text-[11px] text-gray-500 transition-transform ${
                          !item.isGroupClosed ? 'rotate-90 text-blue-400' : ''
                        }`}></i>
                        <span>{item.text}</span>
                      </td>
                    </tr>

                    {/* SUB-LINHAS DO GRUPO (Renderiza recursivamente apenas se o grupo não estiver fechado) */}
                    <Show when={!item.isGroupClosed}>
                      <For each={item.childLines}>
                        {(subLine) => (
                          <tr class="hover:bg-white/5 transition-colors group bg-gray-900/10">
                            <td class="w-12 min-w-[3rem] text-right px-3 text-gray-600 select-none border-r border-gray-900 text-[10px] bg-gray-900/20">
                              {subLine.originalIndex}
                            </td>
                            <td 
                              class="px-8 whitespace-pre select-text text-left break-all opacity-90"
                              innerHTML={highlightLogLine(subLine.text)}
                            ></td>
                          </tr>
                        )}
                      </For>
                    </Show>
                  </Show>

                  {/* RENDERIZAÇÃO DE LINHA NORMAL FORA DE GRUPOS */}
                  <Show when={item.type === 'normal'}>
                    <tr class="hover:bg-white/5 transition-colors group">
                      <td class="w-12 min-w-[3rem] text-right px-3 text-gray-600 select-none border-r border-gray-900 text-[10px] bg-gray-900/40">
                        {item.originalIndex}
                      </td>
                      <td 
                        class="px-4 whitespace-pre select-text text-left break-all"
                        innerHTML={highlightLogLine(item.text)}
                      ></td>
                    </tr>
                  </Show>
                </>
              )}
            </For>
          </tbody>
        </table>

        {/* Alerta de Log Extenso */}
        <Show when={isLargeLog() && !showFullLog()}>
          <div class="p-4 bg-amber-950/20 text-amber-500 text-xs text-center border-t border-amber-900/30">
            <i class="fa-solid fa-triangle-exclamation mr-2"></i>
            {t('pipeline').extensive_log.replace("{{lines}}", String(store.items.length))}
            <button 
              class="ml-2 underline font-bold hover:text-amber-400 transition-colors" 
              onClick={() => setShowFullLog(true)}
            >
              {t('pipeline').load_all}
            </button>
          </div>
        </Show>
      </div>
    </div>
  );
}