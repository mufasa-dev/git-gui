import { Show, onMount } from "solid-js";
import RepositoryPage from "./pages/RepositoryPage";
import "./index.css";
import { Toaster } from "solid-toast";
import { LoadingProvider } from "./components/ui/LoadingContext";
import LoginPage from "./pages/Login";
import Titlebar from "./components/ui/Titlebar";
import { useApp } from "./context/AppContext"; // Importe seu contexto

export default function App() {
  // Pegamos o token e a função de atualização diretamente do contexto global
  const { token, updateToken } = useApp();

  onMount(() => {
    // A lógica de inicialização do token pode ficar no AppContext, 
    // mas mantemos o Dark Mode aqui se preferir.
    localStorage.theme = "dark";
    document.documentElement.classList.add("dark");
  });

  return (
    <div class="h-screen w-full flex flex-col bg-[#0d1117]">
      {/* O Titlebar agora é reativo ao token global */}
      <Titlebar />
      
      <Toaster position="bottom-right" gutter={8} />
      
      <LoadingProvider>
        {/* 
           O Show agora observa o token() do useApp(). 
           Assim que o updateToken for chamado em qualquer lugar, 
           esta tela alterna automaticamente.
        */}
        <Show 
          when={token()} 
          fallback={<LoginPage />}
        >
          <RepositoryPage />
        </Show>
      </LoadingProvider>
    </div>
  );
}