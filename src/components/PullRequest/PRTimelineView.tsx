import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { githubService } from "../../services/github";
import MarkdownViewer from "../ui/MarkdownViewer";
import { getRelativeTime } from "../../utils/date";
import MarkdownEditor from "../ui/MarkdownEditor";
import CommitMessage from "../ui/CommitMessage";
import { useLoading } from "../ui/LoadingContext";
import { getEmojiChar } from "../../utils/emoji";
import ConfirmModal from "../ui/ConfirmModal";

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
    const [confirmData, setConfirmData] = createSignal<{ id: string } | null>(null);
    
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

    const onReact = async (subjectId: string, content: string, hasReacted: boolean) => {
        try {
            showLoading(hasReacted ? "Removendo..." : "Reagindo...");
            
            if (hasReacted) {
                await githubService.removeReaction(subjectId, content);
            } else {
                await githubService.addReaction(subjectId, content);
            }

            hideLoading();
            refetch(); 
        } catch (err) {
            hideLoading();
            console.error("Erro ao processar reação:", err);
        }
    };

    const handleEdit = (item: any) => {
        console.log("Editando:", item.id);
    };

    const handleHide = async (id: string) => {
        try {
            showLoading("Escondendo comentário...");
            // Usando 'OUTDATED' como padrão, similar ao comportamento de 'Hide' rápido
            await githubService.minimizeComment(id, "OUTDATED");
            hideLoading();
            refetch();
        } catch (err) {
            hideLoading();
            console.error("Erro ao esconder:", err);
        }
    };

    const requestDelete = (id: string) => {
        setConfirmData({ id });
    };

    // 3. Função que executa após a confirmação real
    const executeDelete = async () => {
        const data = confirmData();
        if (!data) return;

        try {
            setConfirmData(null); // Fecha a modal
            showLoading("Deletando comentário...");
            await githubService.deleteComment(data.id);
            hideLoading();
            refetch();
        } catch (err) {
            hideLoading();
            console.error("Erro ao deletar:", err);
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

                                <Show when={item.__typename === 'ClosedEvent'}>
                                    <div class="relative flex items-center gap-3 py-2">
                                        {/* Ícone de Fechado (Vermelho) */}
                                        <div class="absolute -left-[44px] w-[30px] h-[30px] rounded-full bg-red-500 flex items-center justify-center border-4 border-white dark:border-gray-800 z-10">
                                            <i class="fa-solid fa-circle-xmark text-[10px] text-white"></i>
                                        </div>
                                        
                                        <img src={item.actor.avatarUrl} class="w-8 h-8 rounded-full border border-gray-700" />
                                        <p class="text-gray-500 dark:text-gray-400">
                                            <span class="font-bold text-gray-900 dark:text-white">{item.actor.login}</span> 
                                            <span class="ml-1">fechou este commit</span>
                                            <span class="ml-2 text-[10px] opacity-60">{getRelativeTime(item.createdAt)}</span>
                                        </p>
                                    </div>
                                </Show>

                                {/* EVENTO DE REABERTURA (REOPENED) */}
                                <Show when={item.__typename === 'ReopenedEvent'}>
                                    <div class="relative flex items-center gap-3 py-2">
                                        {/* Ícone de Reaberto (Verde) */}
                                        <div class="absolute -left-[44px] w-[30px] h-[30px] rounded-full bg-green-500 flex items-center justify-center border-4 border-white dark:border-gray-800 z-10">
                                            <i class="fa-solid fa-circle-dot text-[10px] text-white"></i>
                                        </div>
                                        
                                        <img src={item.actor.avatarUrl} class="w-8 h-8 rounded-full border border-gray-700" />
                                        <p class="text-gray-500 dark:text-gray-400">
                                            <span class="font-bold text-gray-900 dark:text-white">{item.actor.login}</span> 
                                            <span class="ml-1">reabriu este commit</span>
                                            <span class="ml-2 text-[10px] opacity-60">{getRelativeTime(item.createdAt)}</span>
                                        </p>
                                    </div>
                                </Show>

                                {/* CARD DE COMENTÁRIO (ESTILIZADO COMO O SEU) */}
                                <Show when={item.__typename === 'IssueComment'}>
                                    <Show 
                                        when={!item.isMinimized} 
                                        fallback={
                                            <div class="ml-4 p-2 bg-gray-100 dark:bg-gray-800/50 rounded-lg text-[10px] text-gray-500 italic border border-dashed border-gray-300 dark:border-gray-700 mr-4">
                                                <i class="fa-solid fa-eye-slash mr-2"></i>
                                                Este comentário foi escondido ({item.minimizedReason})
                                            </div>
                                        }
                                    >
                                    <div class="relative">
                                        <div class="absolute -left-[35px] top-4 w-[12px] h-[12px] rounded-full bg-gray-400 border-4 border-gray-200 dark:border-gray-600"></div>
                                        <div class="bg-gray-50 dark:bg-gray-800/30 border border-gray-200 dark:border-gray-700/50 rounded-xl shadow-lg mr-4">
                                            <div class="p-5 flex gap-4">
                                                <img src={item.author.avatarUrl} class="w-10 h-10 rounded-full border border-gray-700 cursor-pointer" 
                                                    onClick={() => props.openUserProfile(item.author.name, item.author.email, item.author.login)} />
                                                <div class="flex-1">
                                                    <div class="flex justify-between items-center mb-2">
                                                        <div class="flex items-center gap-2">
                                                            <span class="text-sm font-black text-gray-900 dark:text-white">
                                                                {item.author.login} 
                                                            </span>
                                                            <span class="text-[9px] text-gray-400 font-normal lowercase">
                                                                {getRelativeTime(item.createdAt)}
                                                            </span>
                                                            
                                                            {/* BADGES OPCIONAIS (Owner/Author) */}
                                                            <Show when={item.author.login === props.pr.author?.login}>
                                                                <span class="px-1.5 py-0.5 border border-gray-600 rounded-full text-[8px] text-gray-400 font-bold uppercase tracking-tighter">Author</span>
                                                            </Show>
                                                        </div>

                                                        <div class="flex items-center gap-3">
                                                            <span class="text-[10px] text-gray-400 font-mono">
                                                                {new Date(item.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                            </span>

                                                            {/* MENU DROPDOWN (TRÊS PONTINHOS) */}
                                                            <div class="group relative">
                                                                <button class="p-1 hover:bg-gray-700/50 rounded-md transition-colors text-gray-400 hover:text-white">
                                                                    <i class="fa-solid fa-ellipsis"></i>
                                                                </button>

                                                                {/* DROPDOWN MENU - Usando a mesma técnica de bridge (pt-2) */}
                                                                <div class="invisible opacity-0 group-hover:visible group-hover:opacity-100 absolute top-full right-0 pt-1 transition-all z-[60] min-w-[160px]">
                                                                    <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl overflow-hidden py-1">
                                                                        <button class="w-full text-left px-4 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2 text-gray-700 dark:text-gray-300">
                                                                            <i class="fa-regular fa-copy opacity-60"></i> Copiar link
                                                                        </button>
                                                                        <button class="w-full text-left px-4 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2 text-gray-700 dark:text-gray-300">
                                                                            <i class="fa-solid fa-quote-left opacity-60"></i> Quote reply
                                                                        </button>
                                                                        
                                                                        <div class="h-[1px] bg-gray-200 dark:bg-gray-700 my-1"></div>
                                                                        
                                                                        <button 
                                                                            onClick={() => handleEdit(item)}
                                                                            class="w-full text-left px-4 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2 text-gray-700 dark:text-gray-300"
                                                                        >
                                                                            <i class="fa-regular fa-pen-to-square opacity-60"></i> Editar
                                                                        </button>
                                                                        <button onClick={() => handleHide(item.id)} 
                                                                            class="w-full text-left px-4 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2 text-gray-700 dark:text-gray-300">
                                                                            <i class="fa-regular fa-eye-slash opacity-60"></i> Esconder
                                                                        </button>
                                                                        <button 
                                                                            onClick={() => requestDelete(item.id)}
                                                                            class="w-full text-left px-4 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2 text-red-500 font-bold"
                                                                        >
                                                                            <i class="fa-regular fa-trash-can"></i> Deletar
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
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
                                                                            {(emoji) => {
                                                                                // Verifica se este emoji específico já foi marcado por você
                                                                                const myReaction = item.reactionGroups?.find((g: any) => g.content === emoji);
                                                                                const alreadyReacted = myReaction?.viewerHasReacted || false;

                                                                                return (
                                                                                    <button 
                                                                                        onClick={() => onReact(item.id, emoji, alreadyReacted)}
                                                                                        class={`text-lg hover:bg-gray-100 dark:hover:bg-gray-700 w-8 h-8 flex items-center justify-center rounded-lg transition-all 
                                                                                                ${alreadyReacted ? 'bg-blue-100 dark:bg-blue-900/50' : ''}`}
                                                                                    >
                                                                                        {getEmojiChar(emoji)}
                                                                                    </button>
                                                                                );
                                                                            }}
                                                                        </For>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* LISTA DE BADGES LADO A LADO */}
                                                            <div class="flex items-center gap-1.5">
                                                                <For each={item.reactionGroups}>
                                                                    {(group: any) => (
                                                                        <Show when={group.users.totalCount > 0}>
                                                                            <button
                                                                                onClick={() => onReact(item.id, group.content, group.viewerHasReacted)}
                                                                                class={`flex items-center gap-1.5 px-2 py-1 rounded-full border text-[10px] font-bold transition-all
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

                <ConfirmModal 
                    isOpen={confirmData() !== null}
                    title="Deletar Comentário"
                    message="Tem certeza que deseja remover este comentário? Esta ação não pode ser desfeita."
                    confirmText="Deletar"
                    isDanger={true}
                    onConfirm={executeDelete}
                    onCancel={() => setConfirmData(null)}
                />
            </div>
        </div>
  );
}