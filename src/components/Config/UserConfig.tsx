import { createSignal, createEffect } from "solid-js";
import { useLoading } from "../ui/LoadingContext";
import { getGitConfig, setGitConfig } from "../../services/gitService"; 
import Dialog from "../ui/Dialog"; // Ajuste o path conforme sua estrutura
import { getGravatarUrl } from "../../services/gravatarService";
import { openBrowser } from "../../services/openService";

interface UserConfigModalProps {
  repoPath: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function UserConfigModal(props: UserConfigModalProps) {
  const { showLoading, hideLoading } = useLoading();
  const [name, setName] = createSignal("");
  const [email, setEmail] = createSignal("");

  // Carrega os dados atuais quando o modal abre
  createEffect(async () => {
    if (props.isOpen && props.repoPath) {
      try {
        const currentName = await getGitConfig(props.repoPath, "user.name");
        const currentEmail = await getGitConfig(props.repoPath, "user.email");
        setName(currentName || "");
        setEmail(currentEmail || "");
      } catch (e) {
        console.error("Erro ao carregar config", e);
      }
    }
  });

  const handleSave = async () => {
    showLoading("Salvando configurações locais...");
    try {
      await setGitConfig(props.repoPath, "user.name", name());
      await setGitConfig(props.repoPath, "user.email", email());
      props.onClose();
    } catch (err) {
      alert("Erro ao salvar: " + err);
    } finally {
      hideLoading();
    }
  };

  return (
    <Dialog 
      open={props.isOpen} 
      onClose={props.onClose} 
      title="Configuração do Repositório"
      width={550}
    >
      <div class="flex">
        <div class="flex flex-col items-center pr-6 pt-2">
          <div class="relative group">
            <img
              src={getGravatarUrl(email(), 100)}
              alt={name()}
              class="w-[100px] h-[100px] rounded-lg shadow-sm border border-gray-200 dark:border-gray-700"
            />
            <button
              onClick={() => openBrowser("https://pt.gravatar.com/")} 
              class="absolute inset-0 flex items-center justify-center bg-black/40 text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity rounded-lg"
            >
              Alterar Foto
            </button>
          </div>
          
          <button
            onClick={() => openBrowser("https://pt.gravatar.com/")}
            class="mt-2 text-[10px] text-blue-500 hover:underline flex items-center gap-1"
          >
            <span>via Gravatar</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
          </button>
        </div>
        <div class="space-y-4 flex-1">
          <div>
            <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">
              Nome do Usuário
            </label>
            <input 
              type="text" 
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              placeholder="Ex: Seu Nome"
              class="w-full p-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded focus:ring-1 ring-blue-500 outline-none dark:text-white text-sm"
            />
          </div>

          <div>
            <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">
              E-mail
            </label>
            <input 
              type="email" 
              value={email()}
              onInput={(e) => setEmail(e.currentTarget.value)}
              placeholder="email@exemplo.com"
              class="w-full p-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded focus:ring-1 ring-blue-500 outline-none dark:text-white text-sm"
            />
          </div>
          
          <p class="text-[10px] text-gray-400 italic mt-2">
            * Estas configurações serão aplicadas apenas localmente (<code class="bg-gray-100 dark:bg-gray-700 px-1 rounded">--local</code>).
          </p>

          <div class="mt-6 flex justify-end gap-2">
            <button 
              onClick={props.onClose}
              class="px-4 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            >
              Cancelar
            </button>
            <button 
              onClick={handleSave}
              class="px-4 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded shadow-sm active:scale-95 transition-all"
            >
              Salvar
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}