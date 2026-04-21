import { createSignal, Show, onMount } from "solid-js";
import RepositoryPage from "./pages/RepositoryPage";
import "./index.css";
import { Toaster } from "solid-toast";
import { LoadingProvider } from "./components/ui/LoadingContext";
import LoginPage from "./pages/Login";

export default function App() {
  const [token, setToken] = createSignal<string | null>(null);

  onMount(() => {
    const savedToken = localStorage.getItem("rivers_token");
    if (savedToken) setToken(savedToken);

    // Lógica do Dark Mode (Manter o fundo bem escuro)
    localStorage.theme = "dark"; // Forçar dark mode para o estilo da imagem
    document.documentElement.classList.add("dark");
  });

  return (
    <div class="h-screen w-screen flex flex-col">
      <Toaster position="bottom-right" gutter={8} />
      
      <LoadingProvider>
        {/* Só mostra a aplicação principal se houver token */}
        <Show 
          when={token()} 
          fallback={<LoginPage onLoginSuccess={(t: any) => setToken(t)} />}
        >
          <RepositoryPage />
        </Show>
      </LoadingProvider>
    </div>
  );
}