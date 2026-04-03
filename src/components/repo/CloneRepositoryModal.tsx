import { createSignal, Show } from "solid-js";
import { open } from "@tauri-apps/plugin-dialog";

export default function CloneRepositoryModal(props: { 
  isOpen: boolean, 
  onClose: () => void,
  onClone: (url: string, path: string) => Promise<void> 
}) {
  const [url, setUrl] = createSignal("");
  const [path, setPath] = createSignal("");
  const [loading, setLoading] = createSignal(false);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setLoading(true);
    try {
      await props.onClone(url(), path());
      props.onClose();
    } catch (err) {
      alert("Erro ao clonar: " + err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPath = async () => {
    const selected = await open({
        directory: true,
        multiple: false,
        title: "Selecionar local para o clone"
    });
    
    if (selected && typeof selected === "string") {
        setPath(selected);
    }
    };

  return (
    <Show when={props.isOpen}>
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div class="bg-white dark:bg-gray-900 w-full max-w-md rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden transform transition-all">
          
          <div class="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
            <h3 class="text-xl font-bold dark:text-white flex items-center gap-2">
              <i class="fa-solid fa-cloud-arrow-down text-blue-500"></i>
              Clonar Repositório
            </h3>
            <button onClick={props.onClose} class="text-gray-400 hover:text-gray-600 dark:hover:text-white">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <form onSubmit={handleSubmit} class="p-6 space-y-4">
            <div>
              <label class="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">URL do Repositório</label>
              <input 
                type="text" 
                placeholder="https://github.com/usuario/repo.git"
                class="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                value={url()}
                onInput={(e) => setUrl(e.currentTarget.value)}
                required
              />
            </div>

            <div>
              <label class="block text-xs font-bold text-gray-500 uppercase mb-1 ml-1">Diretório Local</label>
              <div class="flex gap-2">
                <input 
                  type="text" 
                  placeholder="/home/usuario/projetos/meu-repo"
                  class="flex-1 p-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  value={path()}
                  onInput={(e) => setPath(e.currentTarget.value)}
                  required
                />
                <button 
                type="button" 
                onClick={handleSelectPath}
                class="px-4 bg-gray-200 dark:bg-gray-800 rounded-xl hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
                >
                    <i class="fa-solid fa-folder-open text-gray-600 dark:text-gray-300"></i>
                </button>
              </div>
            </div>

            <div class="pt-4 flex gap-3">
              <button 
                type="button" 
                onClick={props.onClose}
                class="flex-1 py-3 font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all"
              >
                Cancelar
              </button>
              <button 
                type="submit"
                disabled={loading()}
                class="flex-1 py-3 font-bold bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none shadow-lg shadow-blue-500/20 transition-all"
              >
                {loading() ? "Clonando..." : "Iniciar Clone"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Show>
  );
}