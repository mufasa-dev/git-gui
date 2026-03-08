import { createSignal, createEffect } from "solid-js";
import { useLoading } from "../ui/LoadingContext";
import { getGitConfig, setGitConfig } from "../../services/gitService"; 
import Dialog from "../ui/Dialog"; // Ajuste o path conforme sua estrutura
import { getGravatarUrl } from "../../services/gravatarService";

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
        <div class="pr-4 pt-2">
          <img
            src={getGravatarUrl(email(), 80)}
            alt={name()}
            class="w-[100px] h-[100px] rounded flex-2"
          />
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