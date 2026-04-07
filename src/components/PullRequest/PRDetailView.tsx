import { createResource, Show, For, createSignal } from "solid-js";
import { githubService } from "../../services/github";
import MarkdownViewer from "../ui/MarkdownViewer";

export default function PRDetailView(props: { pr: any, owner: string, repoName: string }) {
  const [comment, setComment] = createSignal("");
  
  const [details] = createResource(
    () => ({ owner: props.owner, name: props.repoName, number: props.pr.number }),
    async (p) => await githubService.getPullRequestDescription(p.owner, p.name, p.number)
  );

  // Cálculo da largura da barra de progresso
  const additionsWidth = () => {
    const total = (details()?.additions || 0) + (details()?.deletions || 0);
    return total === 0 ? 50 : (details()?.additions / total) * 100;
  };

  return (
    <div class="flex flex-col h-full select-text">
      {/* HEADER ESTILO TRIDENT */}
      <header class="p-6 border-b border-gray-700">
        <div class="flex items-center justify-between mb-2">
          <h1 class="text-2xl font-black text-white tracking-tight">
            {props.pr.title} <span class="text-gray-600 ml-2 font-mono text-lg">#{props.pr.number}</span>
          </h1>
          <span class="px-3 py-1 rounded-full bg-purple-500/10 text-purple-400 text-[10px] font-black uppercase tracking-widest border border-purple-500/20">
            {props.pr.state}
          </span>
        </div>
        
        <div class="flex items-center gap-3 mt-4">
          <div class="w-8 h-8 rounded-full bg-gray-700 overflow-hidden border border-gray-600">
            <img src={props.pr.author?.avatarUrl} alt="" />
          </div>
          <div class="text-xs">
            <span class="font-bold text-white">{props.pr.author?.login}</span>
            <span class="text-gray-500 mx-2">→</span>
            <span class="font-mono text-blue-400">main</span>
            <span class="text-gray-600 ml-3 uppercase text-[9px] font-black">4h atrás</span>
          </div>
        </div>

        {/* ACTIONS BAR */}
        <div class="flex gap-2 mt-6">
          <button class="bg-[#3b5998] hover:bg-[#4b69a8] text-white px-4 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all">
            <i class="fa-solid fa-check"></i> Approve
          </button>
          <button class="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 border border-gray-700">
            <i class="fa-solid fa-file-pen"></i> Request Changes
          </button>
          <button class="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 border border-gray-700">
            <i class="fa-solid fa-comment"></i> Comment
          </button>
        </div>
      </header>

      {/* CONTEÚDO PRINCIPAL COM SIDEBAR DE METADADOS */}
      <div class="flex flex-1 overflow-hidden">
        
        {/* COLUNA DA ESQUERDA: DISCUSSÃO E TIMELINE */}
        <div class="flex-1 overflow-y-auto custom-scrollbar p-8">
          <div class="max-w-4xl space-y-8">
            
            {/* TABS NAVEGAÇÃO INTERNA */}
            <nav class="flex gap-6 border-b border-gray-800 mb-8">
              {['Visão Geral', 'Files', 'Commits', 'Checks'].map(tab => (
                <button class={`pb-2 text-[11px] font-black uppercase tracking-widest border-b-2 transition-all ${tab === 'Visão Geral' ? 'border-blue-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
                  {tab}
                </button>
              ))}
            </nav>

            {/* BARRA DE PROGRESSO DE ARQUIVOS (DIFF) */}
            <div class="bg-[#161622] border border-gray-800 rounded-xl p-4">
              <div class="flex justify-between items-end mb-3">
                <span class="text-lg font-black text-white">
                  {details()?.changedFiles || 0} <span class="text-xs text-gray-500 font-bold uppercase ml-1 tracking-tighter">arquivos</span>
                </span>
                <div class="flex gap-4 font-mono font-bold">
                  <span class="text-green-500">+{details()?.additions || 0}</span>
                  <span class="text-red-500">-{details()?.deletions || 0}</span>
                </div>
              </div>
              <div class="h-2 w-full bg-gray-800 rounded-full overflow-hidden flex">
                <div class="h-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]" style={{ width: `${additionsWidth()}%` }}></div>
                <div class="h-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]" style={{ width: `${100 - additionsWidth()}%` }}></div>
              </div>
            </div>

            {/* TIMELINE ESTILO CHAT */}
            <div class="space-y-6">
              <h3 class="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Linha do Tempo</h3>
              
              <div class="relative border-l-2 border-gray-800 ml-4 pl-8 space-y-8">
                {/* Evento: PR Aberto */}
                <div class="relative">
                  <div class="absolute -left-[37px] top-0 w-[10px] h-[10px] rounded-full bg-blue-500 border-4 border-[#1e1e2e]"></div>
                  <p class="text-xs font-bold text-gray-400">Pull request aberto por <span class="text-white">mufasa-dev</span> <span class="ml-4 opacity-30 font-mono tracking-tighter">10:18</span></p>
                </div>

                {/* Bloco de Comentário Estilo Imagem */}
                <div class="bg-[#252539] border border-gray-700/50 rounded-xl overflow-hidden">
                   <div class="p-4 flex gap-4">
                      <div class="w-10 h-10 rounded-lg bg-pink-400 flex-shrink-0"></div>
                      <div class="flex-1">
                         <div class="flex justify-between items-center mb-2">
                            <span class="text-xs font-black text-white">Bruno Ribeiro <span class="text-[9px] text-gray-500 font-normal ml-2">há 1h</span></span>
                            <span class="text-[10px] text-gray-500 font-mono tracking-tighter">10:18</span>
                         </div>
                         <div class="bg-[#1a1a2e] p-3 rounded-lg border border-gray-800 text-xs text-gray-300 leading-relaxed">
                            Isso aqui pode ser refatorado para usar o novo service de context menu.
                         </div>
                         <div class="flex gap-4 mt-3 text-[10px] font-black uppercase text-gray-500">
                            <button class="hover:text-blue-400"><i class="fa-solid fa-reply mr-1"></i> Responder</button>
                            <button class="hover:text-pink-400"><i class="fa-solid fa-heart mr-1"></i> Curtir</button>
                         </div>
                      </div>
                   </div>
                </div>
              </div>
            </div>

            {/* INPUT DE COMENTÁRIO ESTILO TIMELINE */}
            <div class="ml-12 bg-[#252539] border border-gray-700/50 rounded-xl p-4 flex gap-4">
                <div class="w-8 h-8 rounded-full bg-gray-600 flex-shrink-0 border border-gray-500"></div>
                <div class="flex-1 relative">
                    <textarea 
                        placeholder="Escreva um comentário..."
                        value={comment()}
                        onInput={(e) => setComment(e.currentTarget.value)}
                        class="w-full bg-[#1a1a2e] border border-gray-800 rounded-lg p-3 text-xs outline-none focus:border-blue-500/50 min-h-[80px] resize-none"
                    ></textarea>
                    <button class="absolute bottom-3 right-3 bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded text-[10px] font-black uppercase tracking-widest transition-colors">
                        Enviar
                    </button>
                </div>
            </div>
          </div>
        </div>

        {/* COLUNA DA DIREITA: METADADOS (REVIEWS/PARTICIPANTES) */}
        <aside class="w-64 border-l border-gray-800/50 p-6 space-y-10 bg-[#1a1a2e]/50">
          
          {/* Section: Reviewers */}
          <div>
            <div class="flex justify-between items-center mb-4 text-[10px] font-black uppercase text-gray-500 tracking-widest">
              <span>Reviewers</span>
              <i class="fa-solid fa-gear hover:text-gray-300 cursor-pointer text-[12px]"></i>
            </div>
            <div class="space-y-4">
              <div class="flex items-center justify-between group">
                <div class="flex items-center gap-3">
                  <div class="w-7 h-7 rounded-full bg-pink-400"></div>
                  <span class="text-xs font-bold text-gray-300">Bruno Ribeiro</span>
                </div>
                <i class="fa-solid fa-circle-check text-green-500 text-[10px]"></i>
              </div>
              <div class="flex items-center justify-between group opacity-60">
                <div class="flex items-center gap-3">
                  <div class="w-7 h-7 rounded-full bg-yellow-600"></div>
                  <span class="text-xs font-bold text-gray-300">Amanda</span>
                </div>
                <div class="flex gap-1">
                   <div class="w-1 h-1 rounded-full bg-gray-400 animate-pulse"></div>
                   <div class="w-1 h-1 rounded-full bg-gray-400 animate-pulse delay-75"></div>
                </div>
              </div>
            </div>
          </div>

          {/* Section: Participants */}
          <div>
            <div class="flex justify-between items-center mb-4 text-[10px] font-black uppercase text-gray-500 tracking-widest">
              <span>Participantes</span>
              <i class="fa-solid fa-users text-[12px]"></i>
            </div>
            <div class="space-y-3">
              <For each={details()?.participants?.nodes}>
                {(p: any) => (
                  <div class="flex items-center gap-3">
                    <img src={p.avatarUrl} class="w-6 h-6 rounded-full border border-gray-700" title={p.login} />
                    <span class="text-[11px] font-medium text-gray-400">{p.login}</span>
                  </div>
                )}
              </For>
            </div>
          </div>

        </aside>
      </div>
    </div>
  );
}