import { For } from "solid-js";
import CommitMessage from "../ui/CommitMessage";
import { getGravatarUrl } from "../../services/gravatarService";
import { Commit } from "../../models/Commit.model";
import { useApp } from "../../context/AppContext";

export default function CommitsModalList(props: { commits: Commit[] }) {
  const { t } = useApp();

  return (
    <div class="flex flex-col h-full max-h-[500px] antialiased">
      {/* Header da Lista */}
      <div class="flex items-center justify-between mb-4 p-4 border-b border-gray-300 dark:border-gray-700">
        <span class="text-xs font-bold text-gray-500 dark:text-gray-200 uppercase tracking-widest">
          {props.commits.length} {t('file').commit_history}
        </span>
      </div>

      {/* Área de Scroll */}
      <div class="flex-1 overflow-y-auto px-2 pb-2 custom-scrollbar">
        <div class="space-y-1">
          <For each={props.commits} fallback={
            <div class="py-10 text-center text-gray-500 italic text-sm">Nenhum commit encontrado.</div>
          }>
            {(commit) => (
              <div class="group flex items-start gap-3 p-2 rounded-xl hover:bg-gray-700/40 transition-colors 
                        border border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600">
                {/* Avatar / Ícone */}
                <div class="mt-1">
                  <img
                        src={getGravatarUrl(commit.email, 80)}
                        alt={commit.author}
                        class="w-[50px] h-[50px] rounded-full shadow-sm"
                    /> 
                </div>

                {/* Info do Commit */}
                <div class="flex-1 min-w-0">
                  <div class="flex items-center justify-between mb-0.5">
                    <span class="text-[11px] font-bold text-blue-400 font-mono">
                      {commit.hash.substring(0, 7)}
                    </span>
                    <span class="text-[10px] text-gray-500 dark:text-gray-200">
                      {new Date(commit.date).toLocaleString(undefined, {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        })}
                    </span>
                  </div>
                  
                  <div class="dark:text-gray-200">
                    <CommitMessage message={commit.message} />
                  </div>

                  <div class="flex items-center gap-2 mt-1">
                    <span class="text-[10px] text-gray-500 dark:text-gray-300">
                      <i class="fa-regular fa-user mr-1"></i>
                      {commit.author}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}