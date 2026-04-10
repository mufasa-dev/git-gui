import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { githubService } from "../../services/github";
import MarkdownViewer from "../ui/MarkdownViewer";
import { getRelativeTime } from "../../utils/date";
import MarkdownEditor from "../ui/MarkdownEditor";
import CommitMessage from "../ui/CommitMessage";
import { useLoading } from "../ui/LoadingContext";
import { getEmojiChar } from "../../utils/emoji";

type PRTimelineViewProps = {
    owner: string;
    repo: string;
    pr: any;
    details: any;
    currentUserAvatar: string;
    selectCommit: (hash: string) => void;
    openUserProfile: (name: string, email: string, login: string) => void;
};

export default function PRTimelineView(props: PRTimelineViewProps) {
    const [commentText, setCommentText] = createSignal("");
    const { showLoading, hideLoading } = useLoading();
    
    const [timeline, { refetch }] = createResource(
        () => ({ owner: props.owner, name: props.repo, number: props.pr.number }),
        async (params) => await githubService.getPRTimeline(params.owner, params.name, params.number)
    );

    const additionsWidth = createMemo(() => {
        const add = props.details?.additions || 0;
        const del = props.details?.deletions || 0;
        if (add + del === 0) return 50;
        return (add / (add + del)) * 100;
    });

    const handleSaveComment = async () => {
        if (!commentText()) return;

        try {
            showLoading("Salvando comentário...");
            await githubService.addComment(props.pr.id, commentText());
            hideLoading();
            setCommentText("");
            refetch();
        } catch (err) {
            hideLoading();
            console.error("Falha ao comentar:", err);
        }
    };

    const onReact = async (subjectId: string, content: string) => {
        try {
            showLoading("Salvando reação...");
            await githubService.addReaction(subjectId, content);
            hideLoading();
            setCommentText("");
            refetch();
        } catch (err) {
            hideLoading();
            console.error("Falha ao comentar:", err);
        }
    };

    return (
        <div class="flex flex-1 flex-col w-full bg-white dark:bg-gray-800 rounded-b-xl border border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden">
            {/* A div interna que terá o scroll */}
            <div class="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-8 relative">
                {/* BARRA DE PROGRESSO (DADOS REAIS) */}
                <div class="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50 rounded-xl p-5">
                    <div class="flex justify-between items-end mb-3">
                        <span class="text-lg font-black text-gray-900 dark:text-white">
                            {props.details?.changedFiles || 0} <span class="text-[10px] text-gray-400 font-black uppercase ml-1 tracking-widest">arquivos</span>
                        </span>
                        <div class="flex gap-4 font-mono font-bold text-xs">
                            <span class="text-green-500">+{props.details?.additions || 0}</span>
                            <span class="text-red-500">-{props.details?.deletions || 0}</span>
                        </div>
                    </div>
                    <div class="h-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden flex">
                        <div class="h-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)] transition-all" style={{ width: `${additionsWidth()}%` }}></div>
                        <div class="h-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)] transition-all" style={{ width: `${100 - additionsWidth()}%` }}></div>
                    </div>
                </div>

                {/* TIMELINE REFEITA COM MAP DOS DADOS */}
                <div class="space-y-6">
                    <h3 class="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Linha do Tempo</h3>
                    
                    <div class="relative border-l-2 border-gray-200 dark:border-gray-600 ml-4 pl-8 space-y-8">

                        <Show when={props.details && props.details.body}>
                            <div class="relative">
                                <div class="absolute -left-[35px] top-4 w-[12px] h-[12px] rounded-full bg-gray-400 border-4 border-gray-200 dark:border-gray-600"></div>
                                <div class="bg-gray-50 dark:bg-gray-800/30 border border-gray-200 dark:border-gray-700/50 rounded-xl overflow-hidden shadow-sm mr-4">
                                    <div class="p-5 flex gap-4">
                                        <img src={props.pr.author?.avatarUrl} class="w-10 h-10 rounded-full border border-gray-700 cursor-pointer" 
                                            onClick={() => {props.openUserProfile(props.details.author.name, props.details.author.email, props.details.author.login)}} />
                                        <div class="flex-1">
                                            <div class="flex justify-between items-center mb-2">
                                                <span class="text-sm font-black text-gray-900 dark:text-white">
                                                    {props.details.author.login} 
                                                    <span class="text-[9px] text-gray-400 font-normal ml-2 lowercase">{getRelativeTime(props.pr.createdAt)}</span>
                                                </span>
                                                <span class="text-[10px] text-gray-400 font-mono">
                                                {new Date(props.pr.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                </span>
                                            </div>
                                            <div class="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                                                <MarkdownViewer content={props.details.body} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </Show>
                    
                        <For each={timeline()}>
                            {(item) => (
                            <>
                                {/* EVENTO DE COMMIT */}
                                <Show when={item.__typename === 'PullRequestCommit'}>
                                    <div class="relative">
                                        <div class="absolute -left-[35px] top-1 w-[12px] h-[12px] rounded-full bg-blue-500 border-4 border-gray-200 dark:border-gray-600"></div>
                                        <div class="flex justify-between items-center pr-4">
                                            <p class="font-mono text-sm font-bold text-gray-500 dark:text-gray-400 flex items-center 
                                                      mt-1 hover:text-blue-500 dark:hover:text-blue-500 hover:underline cursor-pointer  transition-colors"
                                                    onClick={() => props.selectCommit(item.commit.oid)}>
                                                <span>Commit</span>
                                                <CommitMessage message={item.commit.message} class="text-sm text-gray-600 dark:text-gray-300 ml-1" />
                                            </p>
                                            <span class="opacity-30 font-mono text-[10px]">{new Date(item.commit.committedDate).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                        </div>
                                    </div>
                                </Show>

                                {/* CARD DE COMENTÁRIO (ESTILIZADO COMO O SEU) */}
                                <Show when={item.__typename === 'IssueComment'}>
                                    <div class="relative">
                                        <div class="absolute -left-[35px] top-4 w-[12px] h-[12px] rounded-full bg-gray-400 border-4 border-gray-200 dark:border-gray-600"></div>
                                        <div class="bg-gray-50 dark:bg-gray-800/30 border border-gray-200 dark:border-gray-700/50 rounded-xl overflow-hidden shadow-sm mr-4">
                                            <div class="p-5 flex gap-4">
                                                <img src={item.author.avatarUrl} class="w-10 h-10 rounded-full border border-gray-700 cursor-pointer" 
                                                    onClick={() => props.openUserProfile(item.author.name, item.author.email, item.author.login)} />
                                                <div class="flex-1">
                                                    <div class="flex justify-between items-center mb-2">
                                                        <span class="text-sm font-black text-gray-900 dark:text-white">
                                                        {item.author.login} 
                                                        <span class="text-[9px] text-gray-400 font-normal ml-2 lowercase">{getRelativeTime(item.createdAt)}</span>
                                                        </span>
                                                        <span class="text-[10px] text-gray-400 font-mono">
                                                        {new Date(item.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                        </span>
                                                    </div>
                                                    <div class="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                                                        <MarkdownViewer content={item.bodyHTML} />
                                                    </div>

                                                    {/* BOTÕES DE AÇÃO */}
                                                    <div class="flex items-center gap-4 mt-4 text-[9px] font-black uppercase tracking-widest text-gray-400">
                                                        <button class="hover:text-blue-500 transition-colors flex items-center">
                                                            <i class="fa-solid fa-reply mr-1"></i> Responder
                                                        </button>
                                                        
                                                        {/* CONTAINER DAS REAÇÕES + BOTÃO REAGIR */}
                                                        <div class="flex items-center gap-2">
                                                            
                                                            {/* BOTÃO REAGIR (COM TOOLTIP) */}
                                                            <div class="group relative flex items-center">
                                                                <button 
                                                                    class="hover:text-gray-600 dark:hover:text-white transition-colors flex items-center justify-center bg-gray-100 dark:bg-gray-700/50 w-7 h-7 rounded-full"
                                                                >
                                                                    <i class="fa-regular fa-face-smile text-xs"></i>
                                                                </button>

                                                                {/* TOOLTIP CORRIGIDO (COM ÁREA DE PONTE) */}
                                                                <div class="invisible opacity-0 group-hover:visible group-hover:opacity-100 absolute bottom-full left-0 pb-2 transition-all duration-200 z-50">
                                                                    <div class="flex gap-1 p-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl">
                                                                        <For each={['THUMBS_UP', 'THUMBS_DOWN', 'LAUGH', 'HOORAY', 'CONFUSED', 'HEART', 'ROCKET', 'EYES']}>
                                                                            {(emoji) => (
                                                                                <button 
                                                                                    onClick={() => onReact(item.id, emoji)}
                                                                                    class="text-lg hover:bg-gray-100 dark:hover:bg-gray-700 w-8 h-8 flex items-center justify-center rounded-lg transition-transform hover:scale-125"
                                                                                >
                                                                                    {getEmojiChar(emoji)}
                                                                                </button>
                                                                            )}
                                                                        </For>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* LISTA DE BADGES LADO A LADO */}
                                                            <div class="flex items-center gap-1.5">
                                                                
                                                                <For each={item.reactionGroups}>
                                                                    {(group: any) => (
                                                                        <Show when={group.users?.totalCount > 0}>
                                                                            <button
                                                                                onClick={() => onReact(item.id, group.content)}
                                                                                class={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold transition-all
                                                                                    ${group.viewerHasReacted 
                                                                                        ? 'bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-900/40 dark:border-blue-500' 
                                                                                        : 'bg-gray-50 border-gray-200 text-gray-500 dark:bg-gray-800/50 dark:border-gray-700 hover:border-gray-500'}`}
                                                                            >
                                                                                <span class="text-xs">{getEmojiChar(group.content)}</span>
                                                                                <span>{group.users.totalCount}</span>
                                                                            </button>
                                                                        </Show>
                                                                    )}
                                                                </For>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </Show>
                            </>
                            )}
                        </For>
                    </div>
                </div>

                {/* INPUT DE COMENTÁRIO (MANTIDO) */}
                <div class="p-4 flex gap-4">
                    <img src={props.currentUserAvatar} class="w-12 h-12 mt-1 rounded-full border dark:border-gray-700 shadow-sm" />
                    <div class="flex-1 relative">
                        <MarkdownEditor 
                            value={commentText()} 
                            onInput={setCommentText}
                            placeholder="Deixe um comentário..."
                        >
                            <button 
                                disabled={!commentText()}
                                onClick={handleSaveComment}
                                class="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all active:scale-95"
                            >
                                Comment
                            </button>
                        </MarkdownEditor>
                    </div>
                </div>
            </div>
        </div>
  );
}