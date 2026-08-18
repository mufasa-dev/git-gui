import { For, Show } from "solid-js";
import { highlightCode } from "../../utils/highlight";
import { useApp } from "../../context/AppContext";

type Props = {
    content: string;
    fileName: string;
    hasMore?: boolean;
    isLoadingMore?: boolean;
    onLoadMore?: () => void;
};

export default function CodePreviewer(props: Props) {
    const { t } = useApp();

    const allLines = () => {
        if (!props.content) return [];
        const lines = props.content.split("\n");
        return props.content.endsWith("\n") ? lines.slice(0, -1) : lines;
    };

    const canLoadMore = () => Boolean(props.hasMore && props.onLoadMore);

    return (
        <div class="h-full flex flex-col min-w-0 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md overflow-hidden">
            <div class="code-viewport overflow-auto flex-1 font-mono text-sm">
                <table class="w-full border-collapse table-fixed">
                    <tbody>
                        <For each={allLines()}>
                            {(line, index) => (
                                <tr class="hover:bg-gray-100 dark:hover:bg-white/5 transition-colors group">
                                    <td class="w-12 min-w-[3rem] text-right px-3 text-gray-400 select-none border-r border-gray-200 dark:border-gray-800 text-[11px] bg-gray-50/50 dark:bg-gray-900/20">
                                        {index() + 1}
                                    </td>
                                    <td
                                        class="px-4 whitespace-pre select-text leading-6 text-left"
                                        innerHTML={highlightCode(line, props.fileName)}
                                    />
                                </tr>
                            )}
                        </For>
                    </tbody>
                </table>

                <Show when={canLoadMore()}>
                    <div class="p-4 bg-yellow-100 dark:bg-yellow-900/10 text-yellow-700 dark:text-yellow-500 text-xs text-center border-t dark:border-gray-800 flex flex-col items-center gap-2">
                        <div>
                            <i class="fa-solid fa-triangle-exclamation mr-2"></i>
                            {t('file').big_file} ({allLines().length} {t('file').lines}).
                        </div>
                        <button
                            class="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 disabled:cursor-wait"
                            disabled={props.isLoadingMore}
                            onClick={() => props.onLoadMore?.()}
                        >
                            <Show when={props.isLoadingMore} fallback={t('file').load_next_page}>
                                <i class="fa-solid fa-spinner animate-spin mr-2"></i>{t('file').loading_page}
                            </Show>
                        </button>
                    </div>
                </Show>
            </div>
        </div>
    );
}
