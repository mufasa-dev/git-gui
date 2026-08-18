import { For, Show, createMemo } from "solid-js";
import { highlightCode } from "../../utils/highlight";
import { PREVIEW_MAX_LINES } from "../../utils/file";
import { useApp } from "../../context/AppContext";

type Props = {
  content: string;
  fileName: string;
};

export default function CodePreviewer(props: Props) {
    const { t } = useApp();

    const allLines = createMemo(() => {
        if (!props.content) return [];
        return props.content.split("\n");
    });

    const visibleLines = createMemo(() => {
        return allLines().slice(0, PREVIEW_MAX_LINES);
    });

    const isLargeFile = createMemo(() => allLines().length > PREVIEW_MAX_LINES);

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

                <Show when={isLargeFile()}>
                    <div class="p-4 bg-yellow-100 dark:bg-yellow-900/10 text-yellow-700 dark:text-yellow-500 text-xs text-center border-t dark:border-gray-800">
                        <i class="fa-solid fa-triangle-exclamation mr-2"></i>
                        {t('file').big_file} ({allLines().length} {t('file').lines}). {t('file').showing_first} {PREVIEW_MAX_LINES} {t('file').lines}.
                    </div>
                </Show>
            </div>
        </div>
    );
}