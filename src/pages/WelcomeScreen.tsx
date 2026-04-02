import { createResource, For, Show, createSignal } from "solid-js";
import { githubService } from "../services/githubService";
import logoImg from "../assets/fork.png";

export default function WelcomeScreen() {
  // Lista de provedores suportados
  const providersList = [
    { id: 'github', name: 'GitHub', icon: 'fa-brands fa-github' },
    { id: 'gitlab', name: 'GitLab', icon: 'fa-brands fa-gitlab' },
    { id: 'azure', name: 'Azure DevOps', icon: 'fa-solid fa-cloud' }
  ];

  return (
    <div class="h-full w-full flex flex-col items-center justify-center p-8 bg-gray-50 dark:bg-[#0d1117] transition-colors overflow-y-auto">
      
      {/* Logo e Branding (Sempre visível) */}
      <div class="flex items-center gap-6 mb-8 group">
        {/* Container do Logo com efeito de brilho no hover */}
        <div class="relative">
            <div class="absolute -inset-1 bg-gradient-to-r from-blue-600 to-cyan-400 rounded-full blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
            <img 
            src={logoImg} 
            alt="Git Trident Logo" 
            class="relative h-28 w-auto drop-shadow-2xl transform transition-transform duration-500 group-hover:scale-105" 
            />
        </div>

        {/* Texto da Marca */}
        <div class="flex flex-col justify-center">
            <h1 class="text-6xl font-black tracking-tighter leading-none select-none">
            <span class="text-gray-900 dark:text-white">Git</span>
            <span class="bg-clip-text text-transparent bg-gradient-to-br from-blue-600 to-blue-400 dark:from-blue-400 dark:to-cyan-300 ml-2">
                Trident
            </span>
            </h1>
            
            {/* Subtítulo com linha decorativa */}
            <div class="flex items-center gap-3 mt-2">
            <div class="h-[1px] w-8 bg-blue-500/50"></div>
            <p class="text-sm font-medium uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">
                Visual Terminal
            </p>
            </div>
        </div>
        </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-12 w-full max-w-4xl">
        
        {/* Coluna 1: Ações Locais */}
        <div class="space-y-6">
          <h2 class="text-sm font-bold text-gray-400 uppercase tracking-widest px-1">Ações Rápidas</h2>
          <LocalActions />
        </div>

        {/* Coluna 2: Conexões de Nuvem (Lógica Dinâmica) */}
        <div class="space-y-6">
          <h2 class="text-sm font-bold text-gray-400 uppercase tracking-widest px-1">Conexões de Provedor</h2>
          <div class="space-y-3">
            <For each={providersList}>
              {(provider) => <ProviderCard provider={provider} />}
            </For>
          </div>
          
          <button class="w-full text-[10px] uppercase font-bold text-gray-400 hover:text-blue-500 transition-colors py-2 border border-dashed border-gray-300 dark:border-gray-700 rounded-xl">
             + Adicionar Outro Provedor
          </button>
        </div>
      </div>

      <footer class="mt-20 text-gray-400 text-[11px] font-mono opacity-50">
        v1.0.4-beta | Git Trident Open Engine
      </footer>
    </div>
  );
}

// --- SUB-COMPONENTES ---

function ProviderCard(props: { provider: any }) {
  const [userData, { refetch, mutate }] = createResource(async () => {
    if (props.provider.id === 'github') {
      return await githubService.getCurrentUser();
    }
    return null; 
  });

  const handleLogin = async () => {
    if (props.provider.id === 'github') {
      await githubService.login();
      refetch(); // Atualiza o card sem recarregar a página inteira
    }
  };

  const handleLogout = async () => {
    if (props.provider.id === 'github') {
        await githubService.logout();
        
        mutate(null);
        refetch();
    }
  };

  return (
    <div class="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm flex flex-col gap-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class={`w-10 h-10 rounded-lg flex items-center justify-center text-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300`}>
            <i class={props.provider.icon}></i>
          </div>
          <div>
            <div class="text-sm font-bold dark:text-white">{props.provider.name}</div>
            <Show when={userData()} fallback={<span class="text-[10px] text-gray-400 font-bold uppercase">Desconectado</span>}>
               <span class="text-[10px] text-green-500 font-bold uppercase">Conectado</span>
            </Show>
          </div>
        </div>

        <Show when={userData()}>
          <img src={userData().avatar_url} class="w-8 h-8 rounded-full border-2 border-blue-500" />
        </Show>
      </div>

      <Show 
        when={userData()} 
        fallback={
          <button 
            onClick={handleLogin}
            class="w-full py-2 text-xs font-bold rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-blue-600 hover:text-white transition-all"
          >
            Conectar Conta
          </button>
        }
      >
        <div class="flex gap-2">
            <button class="flex-1 py-1 text-xs font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                Ver Meus Projetos
            </button>
            <button 
                onClick={handleLogout}
                title="Sair da conta"
                class="px-3 py-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors border border-gray-200 dark:border-gray-800 active:scale-95"
            >
                <i class="fa-solid fa-right-from-bracket text-xs"></i>
            </button>
        </div>
      </Show>
    </div>
  );
}

function LocalActions() {
    return (
        <div class="space-y-4">
            <button class="w-full flex items-center gap-4 p-5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:shadow-md transition-all group">
                <i class="fa-solid fa-download text-2xl text-blue-500"></i>
                <div class="text-left">
                    <div class="font-bold dark:text-white group-hover:text-blue-500 transition-colors">Clonar Repositório</div>
                    <p class="text-xs text-gray-500">Baixar de uma URL remota</p>
                </div>
            </button>

            <button class="w-full flex items-center gap-4 p-5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:shadow-md transition-all group">
                <i class="fa-solid fa-folder-open text-2xl text-green-500"></i>
                <div class="text-left">
                    <div class="font-bold dark:text-white group-hover:text-green-500 transition-colors">Abrir Repositório Local</div>
                    <p class="text-xs text-gray-500">Selecionar pasta no computador</p>
                </div>
            </button>
        </div>
    );
}