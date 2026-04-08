import { createResource, For, Show } from "solid-js";
import { githubService } from "../../services/github";

interface PRCommitsViewProps {
  owner: string;
  repoName: string;
  prNumber: number;
}

export default function PRCommitsView(props: PRCommitsViewProps) {
  const [commits] = createResource(
    () => ({ owner: props.owner, name: props.repoName, number: props.prNumber }),
    async (params) => await githubService.getPRCommits(params.owner, params.name, params.number)
  );

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div class="flex flex-col h-full bg-white dark:bg-gray-800 rounded-b-xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-2xl overflow-y-auto custom-scrollbar">
      <div class="p-4 border-b border-gray-300 dark:border-gray-700">
        <h3 class="text-sm font-bold text-gray-200 uppercase tracking-wider">
          Commits ({commits()?.length || 0})
        </h3>
      </div>

      <div class="flex-1 overflow-y-auto">
        <Show when={!commits.loading} fallback={
          <div class="p-10 text-center text-gray-500 animate-pulse text-xs">Carregando commits...</div>
        }>
          <div class="divide-y divide-gray-700">
            <For each={commits()}>
              {(commit) => (
                <div class="group flex items-start gap-4 p-4 hover:bg-gray-700/30 transition-colors">
                  {/* Avatar do Autor */}
                  <img 
                    src={commit.author.avatarUrl} 
                    alt={commit.author.user?.login || commit.author.name} 
                    class="w-8 h-8 rounded-full border border-gray-700 mt-1"
                  />

                  <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between gap-2 mb-1">
                      <span class="text-xs font-bold text-gray-300 truncate">
                        {commit.message.split('\n')[0]}
                      </span>
                      <span class="text-[10px] font-mono text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded border border-blue-400/20">
                        {commit.abbreviatedOid}
                      </span>
                    </div>

                    <div class="flex items-center gap-2 text-[10px] text-gray-500">
                      <span class="font-bold text-gray-400">
                        {commit.author.user?.login || commit.author.name}
                      </span>
                      <span>•</span>
                      <span>{formatDate(commit.committedDate)}</span>
                    </div>
                    
                    {/* Se houver descrição longa no commit */}
                    <Show when={commit.message.split('\n').length > 1}>
                       <p class="mt-2 text-[11px] text-gray-600 line-clamp-2 italic">
                         {commit.message.split('\n').slice(1).join(' ')}
                       </p>
                    </Show>
                  </div>

                  {/* Botão de ação (opcional) */}
                  <button class="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-gray-700 rounded transition-all">
                    <i class="fa-solid fa-code text-gray-400 text-[10px]"></i>
                  </button>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}