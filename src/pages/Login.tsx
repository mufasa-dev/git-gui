import { invoke } from "@tauri-apps/api/core";
import { createSignal } from "solid-js";

interface LoginPageProps {
  onLoginSuccess: (token: string) => void;
}

export default function LoginPage(props: LoginPageProps) {
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");

  const handleLogin = async (e: Event) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // Chamando o comando Rust com segurança
      const result: any = await invoke("login_with_supabase", { 
        email: email(), 
        password: password() 
      });

      if (result.access_token) {
        localStorage.setItem("rivers_token", result.access_token);
        props.onLoginSuccess(result.access_token);
      } else if (result.error_description) {
        setError(result.error_description);
      }
    } catch (err) {
      console.error("Erro no comando Rust:", err);
      setError("Falha na comunicação com o sistema.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="h-screen w-screen flex bg-[#0d1117] text-white">
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
            <div class="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/20">
              <span class="text-3xl font-bold text-white">R</span>
            </div>
            <div>
              <h1 class="text-3xl font-bold">RIVERS</h1>
              <p class="text-sm text-gray-400">Sync Your Flow.</p>
            </div>
          </div>

          <p class="text-sm text-gray-400 mb-6 font-medium">Login com conta:</p>

          {/* BOTÕES SOCIAIS (Mockado, estilo da imagem) */}
          <div class="flex gap-4 mb-10">
            {['github', 'gitlab', 'bitbucket'].map(provider => (
              <div class="w-16 h-16 bg-[#1a202c] border border-white/5 rounded-2xl flex items-center justify-center cursor-pointer hover:border-blue-500 transition-colors">
                <span class="text-xs text-gray-600">[{provider}]</span>
              </div>
            ))}
          </div>

          <p class="text-sm text-gray-400 mb-6 font-medium">Ou acesse sua conta Rivers:</p>

          <form onSubmit={handleLogin} class="space-y-6">
            {error() && (
              <p class="text-red-400 text-sm bg-red-950/40 p-3 rounded-lg border border-red-500/10">
                {error()}
              </p>
            )}

            <div>
              <label class="block text-sm text-gray-500 mb-1.5">E-mail</label>
              <input 
                type="email" 
                placeholder="seu@email.com"
                value={email()}
                onInput={(e) => setEmail(e.currentTarget.value)}
                class="w-full bg-[#1a202c] border border-white/5 rounded-lg px-4 py-3 text-sm outline-none focus:border-blue-500 transition-all placeholder:text-gray-700"
              />
            </div>

            <div>
              <label class="block text-sm text-gray-500 mb-1.5">Senha</label>
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