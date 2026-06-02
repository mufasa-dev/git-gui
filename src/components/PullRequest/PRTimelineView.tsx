import { createMemo, createResource, createSignal, For, Match, Show, Switch } from "solid-js";
import { githubService } from "../../services/github";
import MarkdownViewer from "../ui/MarkdownViewer";
import { getRelativeTime } from "../../utils/date";
import MarkdownEditor from "../ui/MarkdownEditor";
import CommitMessage from "../ui/CommitMessage";
import { useLoading } from "../ui/LoadingContext";
import { getEmojiChar } from "../../utils/emoji";
import ConfirmModal from "../ui/ConfirmModal";
import { useApp } from "../../context/AppContext";
import { GitProvider } from "../../utils/gitProvider";
import { azureService } from "../../services/azure";

type PRTimelineViewProps = {
    owner: string;
    repo: string;
    pr: any;
    details: any;
    currentUserAvatar: string;
    provider: GitProvider;
    selectCommit: (hash: string) => void;
    openUserProfile: (name: string, email: string, login: string) => void;
};

export default function PRTimelineView(props: PRTimelineViewProps) {
    const [commentText, setCommentText] = createSignal("");
    const { showLoading, hideLoading } = useLoading();
    const [confirmData, setConfirmData] = createSignal<{ id: string } | null>(null);
    const [replyTargetId, setReplyTargetId] = createSignal<string | null>(null);
    const [replyText, setReplyText] = createSignal("");
    const { t, locale } = useApp();
    
    const [timeline, { refetch }] = createResource(
        () => ({ owner: props.owner, name: props.repo, number: props.pr.number, provider: props.provider }),
        async (params) => {
            if (params.provider === 'azure') {
                const azureThreads = await azureService.getPRThreads(params.owner, params.name, params.number);
                const normalizedTimeline: any[] = [];

                azureThreads.forEach((thread: any) => {
                    if (!thread.comments || thread.comments.length === 0) return;

                    const firstComment = thread.comments[0];
                    const content = firstComment.content || "";
                    
                    // Extrai o tipo da thread caso venha no formato de objeto do Azure ($value)
                    const threadType = thread.properties?.CodeReviewThreadType?.$value || thread.properties?.CodeReviewThreadType || "";

                    // 🚀 1. MAPEAMENTO DE INTERAÇÕES DE SISTEMA DO AZURE DEVOPS
                    if (firstComment.commentType === "system" || threadType === "System" || threadType === "ReviewersUpdate" || threadType === "VoteUpdate") {
                        
                        // Identifica o autor real a partir do conteúdo do texto se o autor original for o TFS
                        let authorName = firstComment.author?.displayName || "Azure Reviewer";
                        
                        if (authorName.includes("Microsoft.VisualStudio.Services.TFS") && content) {
                            const keywords = [
                                " voted", " approved", " waiting", " rejected", 
                                " reset", " joined", " changed", " closed", 
                                " abandoned", " reopened", " reactivated", " completed"
                            ];
                            
                            for (const keyword of keywords) {
                                if (content.includes(keyword)) {
                                    authorName = content.split(keyword)[0].trim();
                                    break;
                                }
                            }
                        }

                        // Votos de Revisores e Entradas de Reviewers -> Mapeia para PullRequestReview
                        if (content.includes("voted") || threadType === "VoteUpdate" || threadType === "ReviewersUpdate") {
                            let reviewState = "COMMENTED";
                            const voteValue = thread.properties?.CodeReviewVoteResult?.$value;
                            
                            if (content.includes("approved with suggestions") || voteValue === "5") reviewState = "APPROVED_WITH_SUGGESTIONS";
                            else if (content.includes("approved") || voteValue === "10") reviewState = "APPROVED";
                            else if (content.includes("waiting for the author") || content.includes("waiting for author") || voteValue === "-5") reviewState = "CHANGES_REQUESTED";
                            else if (content.includes("rejected") || voteValue === "-10") reviewState = "REJECTED";
                            else if (content.includes("reset their vote") || content.includes("joined as a reviewer")) reviewState = "PENDING";

                            normalizedTimeline.push({
                                __typename: 'PullRequestReview',
                                id: thread.id.toString(),
                                createdAt: firstComment.publishedDate,
                                state: reviewState,
                                author: {
                                    login: authorName,
                                    avatarUrl: firstComment.author?.imageUrl || ""
                                }
                            });
                            return;
                        }

                        // PR Fechado / Abandonado -> Mapeia para ClosedEvent
                        if (content.includes("closed") || content.includes("abandoned")) {
                            normalizedTimeline.push({
                                __typename: 'ClosedEvent',
                                id: thread.id.toString(),
                                createdAt: firstComment.publishedDate,
                                actor: {
                                    login: authorName,
                                    avatarUrl: firstComment.author?.imageUrl || ""
                                }
                            });
                            return;
                        }

                        // PR Reativado -> Mapeia para ReopenedEvent
                        if (content.includes("reopened") || content.includes("reactivated")) {
                            normalizedTimeline.push({
                                __typename: 'ReopenedEvent',
                                id: thread.id.toString(),
                                createdAt: firstComment.publishedDate,
                                actor: {
                                    login: authorName, 
                                    avatarUrl: firstComment.author?.imageUrl || ""
                                }
                            });
                            return;
                        }

                        // PR Completado / Merged -> Mapeia para MergedEvent
                        if (content.includes("completed the pull request") || content.includes("merged")) {
                            normalizedTimeline.push({
                                __typename: 'MergedEvent',
                                id: thread.id.toString(),
                                createdAt: firstComment.publishedDate,
                                actor: {
                                    login: authorName,
                                    avatarUrl: firstComment.author?.imageUrl || ""
                                }
                            });
                            return;
                        }
                    }

                    // 🚀 2. CASO DE COMENTÁRIOS DE USUÁRIOS (Conversas unificadas sem o loop duplicado!)
                    const validComments = thread.comments.filter((c: any) => c.commentType !== "system" && c.content && !c.isDeleted);

                    if (validComments.length > 0) {
                        // PEGAMOS APENAS O PRIMEIRO como o nó "Pai" da Thread
                        const parentComment = validComments[0];
                        
                        // MAPEAMOS OS SEGUINTES APENAS COMO REPLIES
                        const replies = validComments.slice(1).map((reply: any) => ({
                            id: reply.id.toString(),
                            createdAt: reply.publishedDate,
                            bodyHTML: reply.content,
                            isMinimized: false,
                            author: {
                                login: reply.author?.displayName || "Azure User",
                                avatarUrl: reply.author?.imageUrl || "",
                                name: reply.author?.displayName || "",
                                email: reply.author?.uniqueName || ""
                            }
                        }));

                        // Único push controlado por objeto de Thread
                        normalizedTimeline.push({
                            __typename: 'IssueComment',
                            id: parentComment.id.toString(), 
                            threadId: thread.id.toString(), 
                            createdAt: parentComment.publishedDate,
                            bodyHTML: parentComment.content, 
                            isMinimized: false,
                            minimizedReason: "",
                            author: {
                                login: parentComment.author?.displayName || "Azure User",
                                avatarUrl: parentComment.author?.imageUrl || "",
                                name: parentComment.author?.displayName || "",
                                email: parentComment.author?.uniqueName || ""
                            },
                            reactionGroups: [], 
                            replies: replies    
                        });
                    }
                });

                // Injeta os commits vindos dos detalhes da Azure (mantendo a ordenação cronológica)
                if (props.details?.commits) {
                    props.details.commits.forEach((c: any) => {
                        normalizedTimeline.push({
                            __typename: 'PullRequestCommit',
                            id: c.commitId,
                            createdAt: c.author?.date, 
                            commit: {
                                oid: c.commitId,
                                message: c.comment,
                                committedDate: c.author?.date
                            }
                        });
                    });
                }

                // 🚀 3. HIGIENIZAÇÃO DE IDs E REMOÇÃO COMPLETA DE DUPLICATAS
                const seenUniqueIds = new Set<string>();
                const filteredTimeline = normalizedTimeline.filter((item) => {
                    if (item.__typename === 'IssueComment') {
                        // Gera uma chave composta única "IDdaThread_IDdoComentario" (Ex: "2_1")
                        const uniqueKey = `${item.threadId}_${item.id}`;
                        if (seenUniqueIds.has(uniqueKey)) return false;
                        
                        seenUniqueIds.add(uniqueKey);
                        item.id = uniqueKey; // Atualiza o ID interno com a chave única
                        return true;
                    }

                    // Para eventos normais do sistema
                    const eventKey = `${item.__typename}_${item.id}`;
                    if (seenUniqueIds.has(eventKey)) return false;
                    
                    seenUniqueIds.add(eventKey);
                    return true;
                });

                console.log("Timeline Definitiva Sem Duplicatas:", filteredTimeline);

                // Ordena tudo cronologicamente antes de retornar para o Resource
                return filteredTimeline.sort((a, b) => 
                    new Date(a.createdAt || a.commit?.committedDate).getTime() - 
                    new Date(b.createdAt || b.commit?.committedDate).getTime()
                );
            }

            return await githubService.getPRTimeline(params.owner, params.name, params.number);
        }
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
            if (props.provider === 'azure') {
                await azureService.addPRComment(props.owner, props.repo, props.pr.number, commentText());
            } else {
                await githubService.addComment(props.pr.id, commentText());
            }
            hideLoading();
            setCommentText("");
            refetch();
        } catch (err) {
            hideLoading();
            console.error("Falha ao comentar:", err);
        }
    };

    const onReact = async (subjectId: string, content: string, hasReacted: boolean) => {
        if (props.provider === 'azure') return; 
        
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

    const handleSaveReply = async (threadId: string, parentCommentId: string) => {
        if (!replyText().trim()) return;

        try {
            showLoading("Enviando resposta...");
            if (props.provider === 'azure') {
                // Na Azure passamos o ID da Thread original para emendar o comentário abaixo dela
                await azureService.addPRCommentReply?.(props.owner, props.repo, props.pr.number, threadId, replyText());
            } else {
                // No GitHub criamos um fluxo padrão ou citação (ajuste conforme seu service se necessário)
                await githubService.addComment(props.pr.id, replyText());
            }
            hideLoading();
            setReplyText("");
            setReplyTargetId(null);
            refetch();
        } catch (err) {
            hideLoading();
            console.error("Falha ao responder:", err);
        }
    };

    const handleHide = async (id: string) => {
        try {
            showLoading("Escondendo comentário...");
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

    const executeDelete = async () => {
        const data = confirmData();
        if (!data) return;

        try {
            setConfirmData(null);
            showLoading("Deletando comentário...");
            if (props.provider === 'azure') {
                await azureService.deletePRComment(props.owner, props.repo, props.pr.number, data.id);
            } else {
                await githubService.deleteComment(data.id);
            }
            hideLoading();
            refetch();
        } catch (err) {
            hideLoading();
            console.error("Erro ao deletar:", err);
        }
    };

    return (
        <div class="flex flex-1 flex-col w-full bg-white dark:bg-gray-800 rounded-b-xl border border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden">
            <div class="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-8 relative">
                
                {/* BARRA DE PROGRESSO */}
                <div class="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50 rounded-xl p-5">
                    <div class="flex justify-between items-end mb-3">
                        <span class="text-lg font-black text-gray-900 dark:text-white">
                            {props.details?.changedFiles || 0} <span class="text-[10px] text-gray-400 font-black uppercase ml-1 tracking-widest">{t('file').files} </span>
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

                {/* TIMELINE */}
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
                                                    <span class="text-[9px] text-gray-400 font-normal ml-2 lowercase">{getRelativeTime(props.pr.createdAt, t, locale())}</span>
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
                                            <div class="font-mono text-sm font-bold text-gray-500 dark:text-gray-400 flex items-center 
                                                      mt-1 hover:text-blue-500 dark:hover:text-blue-500 hover:underline cursor-pointer transition-colors"
                                                    onClick={() => props.selectCommit(item.commit.oid)}>
                                                <span>{t('git').commit}</span>
                                                <CommitMessage message={item.commit.message} class="text-sm text-gray-600 dark:text-gray-300 ml-1" />
                                            </div>
                                            <span class="opacity-30 font-mono text-[10px]">{new Date(item.commit.committedDate).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                        </div>
                                    </div>
                                </Show>

                                {/* EVENTO DE FECHAMENTO */}
                                <Show when={item.__typename === 'ClosedEvent'}>
                                    <div class="relative flex items-center gap-3 py-2">
                                        <div class="absolute -left-[44px] w-[30px] h-[30px] rounded-full bg-red-500 flex items-center justify-center border-4 border-white dark:border-gray-800 z-10">
                                            <i class="fa-solid fa-circle-xmark text-[10px] text-white"></i>
                                        </div>
                                        <img src={item.actor.avatarUrl} class="w-8 h-8 rounded-full border border-gray-700" />
                                        <p class="text-gray-500 dark:text-gray-400">
                                            <span class="font-bold text-gray-900 dark:text-white">{item.actor.login}</span> 
                                            <span class="ml-1">{t('pr').close_this_pr}</span>
                                            <span class="ml-2 text-[10px] opacity-60">{getRelativeTime(item.createdAt, t, locale())}</span>
                                        </p>
                                    </div>
                                </Show>

                                {/* EVENTO DE REABERTURA */}
                                <Show when={item.__typename === 'ReopenedEvent'}>
                                    <div class="relative flex items-center gap-3 py-2">
                                        <div class="absolute -left-[44px] w-[30px] h-[30px] rounded-full bg-green-500 flex items-center justify-center border-4 border-white dark:border-gray-800 z-10">
                                            <i class="fa-solid fa-circle-dot text-[10px] text-white"></i>
                                        </div>
                                        <img src={item.actor.avatarUrl} class="w-8 h-8 rounded-full border border-gray-700" />
                                        <p class="text-gray-500 dark:text-gray-400">
                                            <span class="font-bold text-gray-900 dark:text-white">{item.actor.login}</span> 
                                            <span class="ml-1">{t('pr').reopen_this_pr}</span>
                                            <span class="ml-2 text-[10px] opacity-60">{getRelativeTime(item.createdAt, t, locale())}</span>
                                        </p>
                                    </div>
                                </Show>

                                {/* EVENTO DE MERGE */}
                                <Show when={item.__typename === 'MergedEvent'}>
                                    <div class="relative flex items-center gap-3 py-2">
                                        <div class="absolute -left-[44px] w-[30px] h-[30px] rounded-full bg-purple-600 flex items-center justify-center border-4 border-white dark:border-gray-800 z-10">
                                            <i class="fa-solid fa-code-merge text-[10px] text-white"></i>
                                        </div>
                                        <img src={item.actor.avatarUrl} class="w-8 h-8 rounded-full border border-gray-700" />
                                        <p class="text-gray-500 dark:text-gray-400 text-sm">
                                            <span class="font-bold text-gray-900 dark:text-white">{item.actor.login}</span> 
                                            <span class="ml-1 text-purple-500 font-semibold">mesclou</span> este pull request
                                            <span class="ml-2 text-[10px] opacity-60">{getRelativeTime(item.createdAt, t, locale())}</span>
                                        </p>
                                    </div>
                                </Show>

                                {/* EVENTO DE REVIEW (VOTOS DA AZURE / REVIEW DO GITHUB) */}
                                <Show when={item.__typename === 'PullRequestReview'}>
                                    <div class="relative flex items-center gap-3 py-2">
                                        <Switch>
                                            <Match when={item.state === 'APPROVED'}>
                                                <div class="absolute -left-[44px] w-[30px] h-[30px] rounded-full bg-green-500 flex items-center justify-center border-4 border-white dark:border-gray-800 z-10">
                                                    <i class="fa-solid fa-check text-[10px] text-white"></i>
                                                </div>
                                            </Match>
                                            <Match when={item.state === 'APPROVED_WITH_SUGGESTIONS'}>
                                                <div class="absolute -left-[44px] w-[30px] h-[30px] rounded-full bg-emerald-600 flex items-center justify-center border-4 border-white dark:border-gray-800 z-10">
                                                    <i class="fa-solid fa-comment-medical text-[10px] text-white"></i>
                                                </div>
                                            </Match>
                                            <Match when={item.state === 'CHANGES_REQUESTED'}>
                                                <div class="absolute -left-[44px] w-[30px] h-[30px] rounded-full bg-amber-500 flex items-center justify-center border-4 border-white dark:border-gray-800 z-10">
                                                    <i class="fa-solid fa-clock text-[10px] text-white"></i>
                                                </div>
                                            </Match>
                                            <Match when={item.state === 'REJECTED'}>
                                                <div class="absolute -left-[44px] w-[30px] h-[30px] rounded-full bg-red-500 flex items-center justify-center border-4 border-white dark:border-gray-800 z-10">
                                                    <i class="fa-solid fa-ban text-[10px] text-white"></i>
                                                </div>
                                            </Match>
                                            <Match when={item.state === 'PENDING'}>
                                                <div class="absolute -left-[44px] w-[30px] h-[30px] rounded-full bg-gray-500 flex items-center justify-center border-4 border-white dark:border-gray-800 z-10">
                                                    <i class="fa-solid fa-user-plus text-[10px] text-white"></i>
                                                </div>
                                            </Match>
                                        </Switch>
                                        
                                        <img src={item.author.avatarUrl} class="w-8 h-8 rounded-full border border-gray-700" />
                                        <p class="text-gray-500 dark:text-gray-400 text-sm">
                                            <span class="font-bold text-gray-900 dark:text-white">{item.author.login}</span> 
                                            <span class="ml-1">
                                                <Switch fallback={"entrou como revisor ou alterou seu voto"}>
                                                    <Match when={item.state === 'APPROVED'}><span class="text-green-500 font-semibold">aprovou</span> as alterações</Match>
                                                    <Match when={item.state === 'APPROVED_WITH_SUGGESTIONS'}><span class="text-emerald-500 font-semibold">aprovou com sugestões</span></Match>
                                                    <Match when={item.state === 'CHANGES_REQUESTED'}><span class="text-amber-500 font-semibold">solicitou aguardar pelo autor</span></Match>
                                                    <Match when={item.state === 'REJECTED'}><span class="text-red-500 font-semibold">rejeitou</span> as alterações</Match>
                                                    <Match when={item.state === 'PENDING'}><span class="text-gray-400 font-semibold">entrou na revisão / resetou voto</span></Match>
                                                </Switch>
                                            </span>
                                            <span class="ml-2 text-[10px] opacity-60">{getRelativeTime(item.createdAt, t, locale())}</span>
                                        </p>
                                    </div>
                                </Show>

                                {/* CARD DE COMENTÁRIO (AGRUPADO COM RESPOSTAS ESTILO AZURE) */}
                                <Show when={item.__typename === 'IssueComment'}>
                                    <Show 
                                        when={!item.isMinimized} 
                                        fallback={
                                            <div class="ml-4 p-2 bg-gray-100 dark:bg-gray-800/50 rounded-lg text-[10px] text-gray-500 italic border border-dashed border-gray-300 dark:border-gray-700 mr-4">
                                                <i class="fa-solid fa-eye-slash mr-2"></i>
                                                {t('pr').comment_hided} ({item.minimizedReason})
                                            </div>
                                        }
                                    >
                                    <div class="relative">
                                        {/* Marcador na Timeline Principal */}
                                        <div class="absolute -left-[35px] top-4 w-[12px] h-[12px] rounded-full bg-gray-400 border-4 border-gray-200 dark:border-gray-600"></div>
                                        
                                        {/* Bloco Unificado da Thread */}
                                        <div class="bg-gray-50 dark:bg-gray-800/30 border border-gray-200 dark:border-gray-700/50 rounded-xl shadow-lg mr-4 overflow-hidden">
                                            
                                            {/* 1. COMENTÁRIO PAI */}
                                            <div class="p-5 flex gap-4">
                                                <img src={item.author.avatarUrl} class="w-10 h-10 rounded-full border border-gray-700 cursor-pointer" 
                                                    onClick={() => props.openUserProfile(item.author.name, item.author.email, item.author.login)} />
                                                <div class="flex-1">
                                                    <div class="flex justify-between items-center mb-2">
                                                        <div class="flex items-center gap-2">
                                                            <span class="text-sm font-black text-gray-900 dark:text-white">{item.author.login}</span>
                                                            <span class="text-[9px] text-gray-400 font-normal lowercase">{getRelativeTime(item.createdAt, t, locale())}</span>
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
                                                                <div class="invisible opacity-0 group-hover:visible group-hover:opacity-100 absolute top-full right-0 pt-1 transition-all z-[60] min-w-[160px]">
                                                                    <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl overflow-hidden py-1">
                                                                        <button class="w-full text-left px-4 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2 text-gray-700 dark:text-gray-300">
                                                                            <i class="fa-regular fa-copy opacity-60"></i> {t('pr').copy_link}
                                                                        </button>
                                                                        <button class="w-full text-left px-4 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2 text-gray-700 dark:text-gray-300">
                                                                            <i class="fa-solid fa-quote-left opacity-60"></i> {t('pr').quote_reply}
                                                                        </button>
                                                                        <div class="h-[1px] bg-gray-200 dark:bg-gray-700 my-1"></div>
                                                                        <button onClick={() => handleEdit(item)} class="w-full text-left px-4 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2 text-gray-700 dark:text-gray-300">
                                                                            <i class="fa-regular fa-pen-to-square opacity-60"></i> {t('common').edit}
                                                                        </button>
                                                                        <button onClick={() => handleHide(item.id)} class="w-full text-left px-4 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2 text-gray-700 dark:text-gray-300">
                                                                            <i class="fa-solid fa-eye-slash opacity-60"></i> Ocultar
                                                                        </button>
                                                                        <button onClick={() => requestDelete(item.id)} class="w-full text-left px-4 py-2 text-xs hover:bg-red-500/10 text-red-500 flex items-center gap-2">
                                                                            <i class="fa-regular fa-trash-can opacity-60"></i> {t('common').delete}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div class="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                                                        <MarkdownViewer content={item.bodyHTML} />
                                                    </div>

                                                    {/* REAÇÕES E BOTOES DO PAI */}
                                                    <div class="flex items-center gap-4 mt-4 text-[9px] font-black uppercase tracking-widest text-gray-400">
                                                        <button 
                                                            onClick={() => { setReplyTargetId(item.id); setReplyText(""); }}
                                                            class="hover:text-blue-500 transition-colors flex items-center gap-1"
                                                        >
                                                            <i class="fa-solid fa-reply"></i> {t('pr').answer}
                                                        </button>
                                                        
                                                        {/* CONTAINER DE REAÇÕES */}
                                                        <div class="flex items-center gap-2">
                                                            <div class="group relative flex items-center">
                                                                <button class="hover:text-gray-600 dark:hover:text-white transition-colors flex items-center justify-center bg-gray-100 dark:bg-gray-700/50 w-7 h-7 rounded-full">
                                                                    <i class="fa-regular fa-face-smile text-xs"></i>
                                                                </button>
                                                                <div class="invisible opacity-0 group-hover:visible group-hover:opacity-100 absolute bottom-full left-0 pb-2 transition-all duration-200 z-50">
                                                                    <div class="flex gap-1 p-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl">
                                                                        <For each={['THUMBS_UP', 'THUMBS_DOWN', 'LAUGH', 'HOORAY', 'CONFUSED', 'HEART', 'ROCKET', 'EYES']}>
                                                                            {(emoji) => {
                                                                                const myReaction = item.reactionGroups?.find((g: any) => g.content === emoji);
                                                                                const alreadyReacted = myReaction?.viewerHasReacted || false;
                                                                                return (
                                                                                    <button onClick={() => onReact(item.id, emoji, alreadyReacted)} class={`text-lg hover:bg-gray-100 dark:hover:bg-gray-700 w-8 h-8 flex items-center justify-center rounded-lg transition-all ${alreadyReacted ? 'bg-blue-100 dark:bg-blue-900/50' : ''}`}>
                                                                                        {getEmojiChar(emoji)}
                                                                                    </button>
                                                                                );
                                                                            }}
                                                                        </For>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div class="flex items-center gap-1.5">
                                                                <For each={item.reactionGroups}>
                                                                    {(group: any) => (
                                                                        <Show when={group.users.totalCount > 0}>
                                                                            <button onClick={() => onReact(item.id, group.content, group.viewerHasReacted)} class={`flex items-center gap-1.5 px-2 py-1 rounded-full border text-[10px] font-bold transition-all ${group.viewerHasReacted ? 'bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-900/40 dark:border-blue-500' : 'bg-gray-50 border-gray-200 text-gray-500 dark:bg-gray-800/50 dark:border-gray-700 hover:border-gray-500'}`}>
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

                                            {/* 2. REPOSTAS (REPLIES) EM CASCATA */}
                                            <Show when={item.replies && item.replies.length > 0}>
                                                <div class="bg-gray-100/40 dark:bg-gray-900/20 border-t border-gray-200/60 dark:border-gray-700/40 pl-12 pr-5 py-4 space-y-5">
                                                    <For each={item.replies}>
                                                        {(reply) => (
                                                            <div class="flex gap-4 text-sm border-b border-gray-100 dark:border-gray-800/40 pb-4 last:border-b-0 last:pb-0">
                                                                <img src={reply.author.avatarUrl} class="w-8 h-8 rounded-full border border-gray-700" />
                                                                <div class="flex-1">
                                                                    <div class="flex justify-between items-center mb-1">
                                                                        <div class="flex items-center gap-2">
                                                                            <span class="text-xs font-bold text-gray-900 dark:text-white">{reply.author.login}</span>
                                                                            <span class="text-[9px] text-gray-400 lowercase">{getRelativeTime(reply.createdAt, t, locale())}</span>
                                                                        </div>
                                                                        <span class="text-[9px] text-gray-400 font-mono">
                                                                            {new Date(reply.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                                        </span>
                                                                    </div>
                                                                    <div class="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                                                                        <MarkdownViewer content={reply.bodyHTML} />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </For>
                                                </div>
                                            </Show>

                                            {/* 3. EDITOR DE RESPOSTA INTERNO NO COMENTÁRIO */}
                                            <div class="border-t border-gray-200 dark:border-gray-700/60 p-4 bg-gray-50/50 dark:bg-gray-900/40 flex gap-3 items-start">
                                                <img src={props.currentUserAvatar} class="w-8 h-8 rounded-full border border-gray-600 mt-1" />
                                                <div class="flex-1">
                                                    <Show 
                                                        when={replyTargetId() === item.id} 
                                                        fallback={
                                                            <div 
                                                                onClick={() => { setReplyTargetId(item.id); setReplyText(""); }}
                                                                class="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-2 text-xs text-gray-400 cursor-text hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
                                                            >
                                                                Escreva uma resposta...
                                                            </div>
                                                        }
                                                    >
                                                        <div class="space-y-2">
                                                            <MarkdownEditor 
                                                                value={replyText()} 
                                                                onInput={setReplyText} 
                                                                placeholder="Escreva uma resposta..." 
                                                            />
                                                            <div class="flex justify-end gap-2 text-xs font-bold">
                                                                <button 
                                                                    onClick={() => setReplyTargetId(null)}
                                                                    class="px-3 py-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-white transition-colors"
                                                                >
                                                                    Cancelar
                                                                </button>
                                                                <button 
                                                                    onClick={() => handleSaveReply(item.threadId, item.id)}
                                                                    disabled={!replyText().trim()}
                                                                    class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-40 transition-opacity"
                                                                >
                                                                    Responder
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </Show>
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

                {/* EDITOR DE NOVO COMENTÁRIO */}
                <div class="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
                    <MarkdownEditor 
                        value={commentText()} 
                        onInput={setCommentText} 
                        placeholder={t('pr').leave_a_comment + '...'}
                    />
                    <div class="flex justify-end mt-2">
                        <button 
                            onClick={handleSaveComment}
                            disabled={!commentText().trim()}
                            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-sm transition-colors disabled:opacity-50"
                        >
                            {t('pr').comment}
                        </button>
                    </div>
                </div>

            </div>

            {/* CONFIRMAÇÃO DE DELETAR */}
            <Show when={confirmData()}>
                <ConfirmModal 
                    isOpen={confirmData() !== null}
                    title={t('pr').delete_comment}
                    message={t('pr').confirm_delete_comment}
                    confirmText={t('common').delete}
                    isDanger={true}
                    onConfirm={executeDelete}
                    onCancel={() => setConfirmData(null)}
                />
            </Show>
        </div>
    );
}