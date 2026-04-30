import { invoke } from "@tauri-apps/api/core";
import { createSignal } from "solid-js";
import { useApp } from "../context/AppContext";
import logoImg from "../assets/fork.png";

interface LoginPageProps {
  onLoginSuccess: (token: string) => void;
}

export default function LoginPage(props: LoginPageProps) {
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const { t } = useApp();

  const handleLogin = async (e: Event) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const result: any = await invoke("login_with_supabase", { email: email(), password: password() });
      localStorage.setItem("brook_token", result.access_token);
      props.onLoginSuccess(result.access_token);
    } catch (err: any) {
      setError(err); 
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="h-screen w-full flex bg-[#0d1117] text-white">
      {/* LADO ESQUERDO: IMAGEM/ARTE DO RIO DE DADOS (50%) */}
      {/* Você pode usar uma imagem real ou um fundo gradiente profundo aqui */}
      <div class="w-1/2 h-full bg-cover bg-center border-r border-white/10" 
           style="background-image: url('/src/assets/rivers_bg_galaxy.png');">
        {/* Placeholder para a arte */}
        <div class="w-full h-full flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <p class="text-xs text-gray-500">[Arte do Rio Cósmico Aqui]</p>
        </div>
      </div>

      {/* LADO DIREITO: FORMULÁRIO DE LOGIN (50%) */}
      <div class="w-1/2 h-full flex items-center justify-center p-16">
        <div class="w-full max-w-[420px]">
          
          {/* LOGO E TÍTULO (Estilo Git River) */}
          <div class="flex items-center gap-4 mb-10">
            <div class="relative flex-shrink-0">
                <div class="absolute -inset-4 bg-gradient-to-r from-blue-600 to-cyan-400 rounded-full blur-xl opacity-20 group-hover:opacity-60 group-hover:blur-2xl transition-all duration-500 group-hover:duration-300 will-change-[filter]"></div>
                <img src={logoImg} alt="Git Trident Logo" class="relative h-32 w-auto drop-shadow-2xl transform-gpu will-change-transform transition-transform duration-500 group-hover:scale-110" />
            </div>
            <div>
              <h1 class="text-6xl font-black tracking-tighter leading-none select-none">
                  <span class="text-gray-900 dark:text-white">Dev</span>
                  <span class="bg-clip-text text-transparent bg-gradient-to-br from-blue-600 to-blue-400 dark:from-blue-400 dark:to-cyan-300 ml-2">Brook</span>
              </h1>
              <div class="flex items-center gap-3 mt-2">
                  <div class="h-[1px] w-8 bg-blue-500/50"></div>
                  <p class="text-sm font-medium uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">Visual Terminal</p>
              </div>
            </div>
          </div>

          <form onSubmit={handleLogin} class="space-y-6">
            {error() && (
              <p class="text-red-400 text-sm bg-red-950/40 p-3 rounded-lg border border-red-500/10">
                {error()}
              </p>
            )}

            <div>
              <label class="block text-sm text-gray-500 mb-1.5">{t('auth').email_label}</label>
              <input 
                type="email" 
                placeholder="seu@email.com"
                value={email()}
                onInput={(e) => setEmail(e.currentTarget.value)}
                class="w-full bg-[#1a202c] border border-white/5 rounded-lg px-4 py-3 text-sm outline-none focus:border-blue-500 transition-all placeholder:text-gray-700"
              />
            </div>

            <div>
              <label class="block text-sm text-gray-500 mb-1.5">{t('auth').password_label}</label>
              <input 
                type="password" 
                placeholder="••••••••"
                value={password()}
                onInput={(e) => setPassword(e.currentTarget.value)}
                class="w-full bg-[#1a202c] border border-white/5 rounded-lg px-4 py-3 text-sm outline-none focus:border-blue-500 transition-all placeholder:text-gray-700"
              />
            </div>

            <button 
              type="submit"
              disabled={loading()}
              class="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-medium py-3 rounded-xl transition-colors mt-4 text-sm"
            >
              {loading() ? "Autenticando..." : "Entrar"}
            </button>
          </form>
          
          <p class="text-center text-xs text-gray-600 mt-10">
            Esqueceu sua senha? <span class="text-blue-400 cursor-pointer">Crie uma conta</span>
          </p>
        </div>
      </div>
    </div>
  );
}