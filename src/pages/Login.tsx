import { createSignal, Show } from "solid-js";
import { useApp } from "../context/AppContext";
import logoImg from "../assets/fork.png";
import { authService } from "../services/authService";

export default function LoginPage() {
  const [isRegister, setIsRegister] = createSignal(false);
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [fullName, setFullName] = createSignal("");
  const [showPassword, setShowPassword] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const { t, updateToken } = useApp();

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      let result;
      
      if (isRegister()) {
        result = await authService.register({ 
          email: email(), 
          password: password(), 
          full_name: fullName() 
        });
      } else {
        result = await authService.login({ 
          email: email(), 
          password: password() 
        });
      }

      if (result.access_token) {
        localStorage.setItem("brook_token", result.access_token);
        updateToken(result.access_token);
      }
    } catch (err: any) {
      setError(err); 
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="h-screen w-full flex bg-[#0d1117] text-white">
      {/* LADO ESQUERDO */}
      <div class="w-1/2 h-full bg-cover bg-center border-r border-white/10" 
           style="background-image: url('/src/assets/rivers_bg_galaxy.png');">
           <div class="w-full h-full flex items-center justify-center bg-black/40 backdrop-blur-sm">
             <p class="text-xs text-gray-500 font-mono tracking-widest uppercase">The flow starts here</p>
           </div>
      </div>

      {/* LADO DIREITO */}
      <div class="w-1/2 h-full flex items-center justify-center p-16">
        <div class="w-full max-w-[420px]">
          
          {/* LOGO SECTION */}
          <div class="flex items-center gap-4 mb-10">
            <div class="relative flex-shrink-0">
                <div class="absolute -inset-4 bg-gradient-to-r from-blue-600 to-cyan-400 rounded-full blur-xl opacity-20 transition-all duration-500"></div>
                <img src={logoImg} alt="Logo" class="relative h-32 w-auto drop-shadow-2xl" />
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

          <h2 class="text-xl font-semibold mb-6">
            {isRegister() ? "Crie sua conta no Brook" : "Bem-vindo de volta"}
          </h2>

          <form onSubmit={handleSubmit} class="space-y-4">
            {error() && (
              <p class="text-red-400 text-sm bg-red-950/40 p-3 rounded-lg border border-red-500/10">
                {error()}
              </p>
            )}

            {/* CAMPO NOME COMPLETO (Apenas no Registro) */}
            <Show when={isRegister()}>
              <div class="animate-in fade-in slide-in-from-top-2 duration-300">
                <label class="block text-sm text-gray-500 mb-1.5">Nome Completo</label>
                <input 
                  type="text" 
                  required
                  placeholder="Seu nome"
                  value={fullName()}
                  onInput={(e) => setFullName(e.currentTarget.value)}
                  class="w-full bg-[#1a202c] border border-white/5 rounded-lg px-4 py-3 text-sm outline-none focus:border-blue-500 transition-all"
                />
              </div>
            </Show>

            <div>
              <label class="block text-sm text-gray-500 mb-1.5">{t('auth').email_label}</label>
              <input 
                type="email" 
                required
                placeholder="exemplo@gmail.com"
                value={email()}
                onInput={(e) => setEmail(e.currentTarget.value)}
                class="w-full bg-[#1a202c] border border-white/5 rounded-lg px-4 py-3 text-sm outline-none focus:border-blue-500 transition-all"
              />
            </div>

            <div>
              <label class="block text-sm text-gray-500 mb-1.5">{t('auth').password_label}</label>
              <div class="relative">
                <input 
                  type={showPassword() ? "text" : "password"} 
                  required
                  placeholder="••••••••"
                  value={password()}
                  onInput={(e) => setPassword(e.currentTarget.value)}
                  class="w-full bg-[#1a202c] border border-white/5 rounded-lg px-4 py-3 pr-11 text-sm outline-none focus:border-blue-500 transition-all"
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword())}
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-blue-400 transition-colors p-1"
                >
                  <i class={`fa-solid ${showPassword() ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                </button>
              </div>
            </div>

            <button 
              type="submit"
              disabled={loading()}
              class="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-medium py-3 rounded-xl transition-all active:scale-[0.98] mt-4 text-sm"
            >
              {loading() ? "Processando..." : (isRegister() ? "Criar Conta" : "Entrar")}
            </button>
          </form>
          
          <div class="text-center text-xs text-gray-600 mt-10">
            {isRegister() ? (
                <p>Já tem uma conta? <span onClick={() => setIsRegister(false)} class="text-blue-400 cursor-pointer hover:underline ml-1">Faça login</span></p>
            ) : (
                <p>Não tem uma conta? <span onClick={() => setIsRegister(true)} class="text-blue-400 cursor-pointer hover:underline ml-1">Crie agora</span></p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}