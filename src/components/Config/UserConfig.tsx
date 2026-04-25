import { createSignal, createEffect, Show, For } from "solid-js";
import { useLoading } from "../ui/LoadingContext";
import { getGitConfig, setGitConfig, configPullMode } from "../../services/gitService"; 
import Dialog from "../ui/Dialog";
import { getGravatarUrl } from "../../services/gravatarService";
import { openBrowser } from "../../services/openService";
import { notify } from "../../utils/notifications";
import { useApp } from "../../context/AppContext";

interface UserConfigModalProps {
  repoPath: string;
  isOpen: boolean;
  onClose: () => void;
  refreshBranches?: (path: string) => Promise<void>;
}

export default function UserConfigModal(props: UserConfigModalProps) {
  const { showLoading, hideLoading } = useLoading();
  
  const [activeTab, setActiveTab] = createSignal<"user" | "merge">("user");
  const [currentMode, setCurrentMode] = createSignal<"merge" | "rebase" | "ff" | null>(null);
  
  const [name, setName] = createSignal("");
  const [email, setEmail] = createSignal("");

  const { t } = useApp();

  createEffect(async () => {
    if (props.isOpen && props.repoPath) {
      try {
        const currentName = await getGitConfig(props.repoPath, "user.name");
        const currentEmail = await getGitConfig(props.repoPath, "user.email");
        setName(currentName || "");
        setEmail(currentEmail || "");
        setCurrentMode(await getCurrentPullMode());
      } catch (e) {
        console.error("Erro ao carregar config", e);
      }
    }
  });

  const getCurrentPullMode = async (): Promise<"merge" | "rebase" | "ff"> => {
    try {
      // Verifica se rebase está ativo
      const isRebase = await getGitConfig(props.repoPath, "pull.rebase");
      if (isRebase === "true") return "rebase";

      // Verifica se está em modo fast-forward only
      const isFF = await getGitConfig(props.repoPath, "pull.ff");
      if (isFF === "only") return "ff";

      // Padrão do Git é merge
      return "merge";
    } catch {
      return "merge";
    }
  }

  const handleSaveUser = async () => {
    showLoading("Salvando perfil...");
    try {
      await setGitConfig(props.repoPath, "user.name", name());
      await setGitConfig(props.repoPath, "user.email", email());
      notify.success("Sucesso", "Perfil atualizado localmente.");
      props.onClose();
    } catch (err) {
      notify.error("Erro", "Falha ao salvar: " + err);
    } finally {
      hideLoading();
    }
  };

  const handleMergeChoice = async (mode: "merge" | "rebase" | "ff") => {
    if (mode === currentMode()) return;

    showLoading(`Alterando para ${mode}...`);
    try {
      await configPullMode(props.repoPath, mode);
      setCurrentMode(mode);
      notify.success("Configuração", "Estratégia de pull atualizada!");
    } catch (err: any) {
      notify.error("Erro", err.message);
    } finally {
      hideLoading();
    }
  };

  const getButtonStyle = (mode: "merge" | "rebase" | "ff") => {
    const isActive = currentMode() === mode;
    return {
      container: `flex flex-col items-start p-3 text-left border rounded-lg transition-all relative ${
        isActive 
          ? "border-blue-500 bg-blue-50/50 dark:bg-blue-900/20 cursor-default" 
          : "border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 cursor-pointer active:scale-[0.98]"
      }`,
      label: isActive ? "text-blue-600 dark:text-blue-400" : "text-gray-800 dark:text-gray-100"
    };
  };

  return (
    <Dialog 
      open={props.isOpen} 
      onClose={props.onClose} 
      title="Configurações do Repositório"
      bodyClass="p-0"
      width={'600px'}
    >
      {/* HEADER DAS ABAS */}
      <div class="flex bg-gray-200 dark:bg-gray-900 px-1 pt-1">
        <button 
          onClick={() => setActiveTab("user")}
          class={`px-4 py-2 text-sm font-medium transition-colors rounded-t-xl ${
            activeTab() === "user" 
            ? "dark:text-white dark:bg-gray-800" 
            : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          👤 Perfil do Usuário
        </button>
        <button 
          onClick={() => setActiveTab("merge")}
          class={`px-4 py-2 text-sm font-medium transition-colors rounded-t-xl ${
            activeTab() === "merge" 
            ? "dark:text-white dark:bg-gray-800" 
            : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          🔀 Estratégia de Merge
        </button>
      </div>

      <div>
        {/* CONTEÚDO: USUÁRIO */}
        <Show when={activeTab() === "user"}>
          <div class="flex animate-in fade-in duration-200 p-4">
            <div class="flex flex-col items-center pr-8 pt-2">
              <div class="relative group">
                <img
                  src={getGravatarUrl(email(), 120)}
                  alt={name()}
                  class="w-[120px] h-[120px] rounded-xl shadow-md border border-gray-200 dark:border-gray-700"
                />
                <button
                  onClick={() => openBrowser("https://pt.gravatar.com/")} 
                  class="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity rounded-xl"
                >
                  Alterar Foto
                </button>
              </div>
              <button
                onClick={() => openBrowser("https://pt.gravatar.com/")}
                class="mt-3 text-[10px] text-blue-500 hover:underline flex items-center gap-1"
              >
                <span>via Gravatar</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
              </button>
            </div>

            <div class="flex-1 space-y-4">
              <div>
                <label class="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{t('common').name}</label>
                <input 
                  type="text" 
                  value={name()}
                  onInput={(e) => setName(e.currentTarget.value)}
                  class="w-full p-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md focus:ring-2 ring-blue-500/20 outline-none dark:text-white text-sm"
                />
              </div>
              <div>
                <label class="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{t('auth').email_label}</label>
                <input 
                  type="email" 
                  value={email()}
                  onInput={(e) => setEmail(e.currentTarget.value)}
                  class="w-full p-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md focus:ring-2 ring-blue-500/20 outline-none dark:text-white text-sm"
                />
              </div>
              <p class="text-[10px] text-amber-600 dark:text-amber-500/80">
                * Configurações salvas apenas neste repositório (--local).
              </p>
              <div class="pt-4 flex justify-end gap-2">
                 <button onClick={props.onClose} class="px-4 py-1.5 text-sm text-gray-500 hover:text-black dark:hover:text-white">{t('common').close}</button>
                 <button onClick={handleSaveUser} class="px-6 py-1.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors">{t('auth').save_profile}</button>
              </div>
            </div>
          </div>
        </Show>

        {/* CONTEÚDO: MERGE */}
        <Show when={activeTab() === "merge"}>
          <div class="space-y-4 animate-in slide-in-from-right-2 duration-200 p-4">
            <div class="">
                <p>
                    Escolha como o Git deve se comportar ao fazer um <strong>Pull</strong> quando houver divergências.
                </p>
            </div>

            <div class="grid gap-3">
              <For each={[
                { id: 'merge', icon: '🔀', title: 'Merge', desc: 'Combina histórias com um commit de merge.' },
                { id: 'rebase', icon: '♻️', title: 'Rebase', desc: 'Mantém histórico linear movendo seus commits.' },
                { id: 'ff', icon: '⚡', title: 'Fast-Forward Only', desc: 'Recusa o pull se houver divergência.' }
              ] as const}>
                {(item) => (
                  <button
                    disabled={currentMode() === item.id}
                    onClick={() => handleMergeChoice(item.id)}
                    class={getButtonStyle(item.id).container}
                  >
                    <div class="flex justify-between w-full">
                      <span class={`font-bold text-sm ${getButtonStyle(item.id).label}`}>
                        {item.icon} {item.title}
                      </span>
                      <Show when={currentMode() === item.id}>
                        <span class="text-[10px] bg-blue-500 text-white px-2 py-0.5 rounded-full uppercase tracking-tighter">
                          Ativo
                        </span>
                      </Show>
                    </div>
                    <span class="text-xs text-gray-500 dark:text-gray-400 mt-1">{item.desc}</span>
                  </button>
                )}
              </For>
            </div>
          </div>
        </Show>
      </div>
    </Dialog>
  );
}