import { For, Show, createMemo, createSignal } from "solid-js";
import { highlightCode } from "../../utils/highlight";
import { getExtension } from "../../utils/file";
import { useApp } from "../../context/AppContext";

type Props = {
  content: string;
  fileName: string;
};

export default function CodePreviewer(props: Props) {
    const MAX_INITIAL_LINES = 1500;

    const extension = createMemo(() => getExtension(props.fileName));
    const [showFullFile, setShowFullFile] = createSignal(false);
    const { t } = useApp();

    const allLines = createMemo(() => {
        if (!props.content) return [];
        return props.content.split("\n");
    });

    const visibleLines = createMemo(() => {
        if (showFullFile()) return allLines();
        
        return allLines().slice(0, MAX_INITIAL_LINES);
    });

    const isLargeFile = createMemo(() => allLines().length > MAX_INITIAL_LINES);

    return (
        <div class="h-full flex flex-col min-w-0 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md overflow-hidden">
            <div class="code-viewport overflow-auto flex-1 font-mono text-sm">
                <table class="w-full border-collapse table-fixed">
                    <tbody>
                        <For each={visibleLines()}>
                            {(line, index) => (
                                <tr class="hover:bg-gray-100 dark:hover:bg-white/5 transition-colors group">
                                    <td class="w-12 min-w-[3rem] text-right px-3 text-gray-400 select-none border-r border-gray-200 dark:border-gray-800 text-[11px] bg-gray-50/50 dark:bg-gray-900/20">
                                        {index() + 1}
                                    </td>
                                    <td 
                                        class="px-4 whitespace-pre select-text leading-6 text-left"
                                        innerHTML={highlightCode(line, props.fileName)}
                                    >
                                    </td>
                                </tr>
                            )}
                        </For>
                    </tbody>
                </table>

                {/* Mostra o aviso apenas se for um arquivo grande e ainda não foi expandido */}
                <Show when={isLargeFile() && !showFullFile()}>
                    <div class="p-4 bg-yellow-100 dark:bg-yellow-900/10 text-yellow-700 dark:text-yellow-500 text-xs text-center border-t dark:border-gray-800">
                        <i class="fa-solid fa-triangle-exclamation mr-2"></i>
                        Arquivo grande ({allLines().length} {t('file').lines}). Exibindo apenas as primeiras {MAX_INITIAL_LINES}.
                        <button 
                            class="ml-2 underline font-bold hover:text-yellow-800 dark:hover:text-yellow-300 transition-colors" 
                            onClick={() => setShowFullFile(true)}
                        >
                            Carregar arquivo completo (pode travar)
                        </button>
                    </div>
                </Show>

                {/* Feedback visual de que o arquivo está completo (opcional) */}
                <Show when={showFullFile() && isLargeFile()}>
                    <div class="p-2 text-center text-[10px] text-gray-400 italic opacity-50">
                        Fim do arquivo
                    </div>
                </Show>
            </div>
        </div>
    );
}