import { createSignal, For, Show } from "solid-js";
import logoImg from "../assets/fork.png";

interface Provider {
  id: string;
  name: string;
  icon: string;
  status: "connected" | "disconnected";
  user?: { name: string; avatar: string };
}

export default function WelcomeScreen() {
  // Simulação de estado de login (isso viria do seu Auth Service)
  const [providers, setProviders] = createSignal<Provider[]>([
    { 
      id: "github", name: "GitHub", icon: "fa-brands fa-github", 
      status: "connected", user: { name: "Bruno Ribeiro", avatar: "https://github.com/bruno.png" } 
    },
    { id: "gitlab", name: "GitLab", icon: "fa-brands fa-gitlab", status: "disconnected" },
    { id: "azure", name: "Azure DevOps", icon: "fa-brands fa-windows", status: "disconnected" },
  ]);

  return (
    <div class="h-full w-full flex flex-col items-center justify-center p-8 bg-gray-50 dark:bg-[#0d1117] transition-colors overflow-y-auto">
      
      {/* Branding */}
      <div class="text-center mb-12">
        <img src={logoImg} alt="Git Trident Logo" class="w-24 h-24 mx-auto mb-4" />
        <h1 class="text-4xl font-black text-gray-900 dark:text-white tracking-tight">
          Git <span class="text-blue-500">Trident</span>
        </h1>
        <p class="text-gray-500 dark:text-gray-400 mt-2 font-medium">
          Seu terminal visual e hub de projetos multi-provedor.
        </p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-12 w-full max-w-4xl">
        
        {/* Coluna 1: Ações Rápidas (Locais) */}
        <div class="space-y-6">
          <h2 class="text-sm font-bold text-gray-400 uppercase tracking-widest px-1">Ações Rápidas</h2>
          
          <button class="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-blue-500 dark:hover:border-blue-500 transition-all group shadow-sm">
            <div class="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600">
              <i class="fa-solid fa-cloud-arrow-down text-xl"></i>
            </div>
            <div class="text-left">
              <div class="font-bold text-gray-900 dark:text-white">Clonar Repositório</div>
              <div class="text-xs text-gray-500">Baixar um projeto remoto para sua máquina</div>
            </div>
          </button>

          <button class="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-green-500 dark:hover:border-green-500 transition-all group shadow-sm">
            <div class="w-12 h-12 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600">
              <i class="fa-solid fa-folder-open text-xl"></i>
            </div>
            <div class="text-left">
              <div class="font-bold text-gray-900 dark:text-white">Abrir Repositório Local</div>
              <div class="text-xs text-gray-500">Navegar em um projeto já existente</div>
            </div>
          </button>
        </div>

        {/* Coluna 2: Conexões (Cloud) */}
        <div class="space-y-6">
          <h2 class="text-sm font-bold text-gray-400 uppercase tracking-widest px-1">Conexões de Provedor</h2>
          
          <div class="space-y-3">
            <For each={providers()}>
              {(provider) => (
                <div class="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col gap-3 shadow-sm">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                      <i class={`${provider.icon} text-2xl text-gray-700 dark:text-gray-300`}></i>
                      <div>
                        <div class="text-sm font-bold dark:text-white">{provider.name}</div>
                        <div class={`text-[10px] font-bold uppercase ${provider.status === 'connected' ? 'text-green-500' : 'text-gray-400'}`}>
                          {provider.status === 'connected' ? `Conectado como ${provider.user?.name}` : 'Desconectado'}
                        </div>
                      </div>
                    </div>
                    
                    <Show when={provider.status === "connected"}>
                      <img src={provider.user?.avatar} class="w-8 h-8 rounded-full border border-gray-200 dark:border-gray-700" />
                    </Show>
                  </div>

                  <Show 
                    when={provider.status === "connected"} 
                    fallback={
                      <button class="w-full py-2 text-xs font-bold rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-blue-500 hover:text-white transition-colors">
                        Conectar ao {provider.name}
                      </button>
                    }
                  >
                    <button class="w-full py-2 text-xs font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                      Ver Meus Projetos
                    </button>
                  </Show>
                </div>
              )}
            </For>
          </div>

          <button class="w-full text-xs text-gray-500 dark:text-gray-400 hover:text-blue-500 transition-colors flex items-center justify-center gap-2">
            <i class="fa-solid fa-plus text-[10px]"></i>
            Adicionar Outro Provedor
          </button>
        </div>

      </div>

      <footer class="mt-20 text-gray-400 text-[11px] font-mono">
        v1.0.4-beta | Desenvolvido por Bruno Ribeiro
      </footer>
    </div>
  );
}