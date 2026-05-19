import { createSignal, Show } from "solid-js";
import { useApp } from "../context/AppContext";
import logoImg from "../assets/fork.png";
import { authService } from "../services/authService";
import FeaturesCarousel from "../components/ui/FeaturesCarousel";
import LegalDialog from "../components/auth/LegalDialog";

export default function LoginPage() {
  const [isRegister, setIsRegister] = createSignal(false);
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [fullName, setFullName] = createSignal("");
  const [showPassword, setShowPassword] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [legalOpen, setLegalOpen] = createSignal(false);
  const [legalType, setLegalType] = createSignal<"terms" | "privacy">("terms");
  const [accepted, setAccepted] = createSignal(false);
  const { t, locale, updateToken } = useApp();

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
          full_name: fullName(),
          lang: locale()
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

  const openLegal = (type: "terms" | "privacy") => {
    setLegalType(type);
    setLegalOpen(true);
  };

  return (
    <div class="w-full flex bg-[#080b10] dark:bg-[#070a0e] text-gray-800 dark:text-white transition-colors duration-300 overflow-hidden" style={"height: calc(100vh - 30px);"}>
      {/* LADO ESQUERDO */}
      <div class="hidden md:flex w-1/2 h-full relative items-center justify-center overflow-hidden bg-[#f4f5f6] dark:bg-[#090d12] transition-colors duration-300">
        
        {/* 🌌 Efeito "Aura Glow" Adaptativo: Azul suave no dark, e um reflexo ciano ultra discreto no light */}
        <div class="absolute w-[70%] h-[60%] rounded-full bg-blue-500/5 dark:bg-blue-500/10 blur-[120px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
        <div class="absolute w-[40%] h-[40%] rounded-full bg-cyan-500/5 dark:bg-cyan-500/5 blur-[80px] top-1/3 left-1/2 -translate-x-1/2 pointer-events-none"></div>

        {/* Conteúdo do Carrossel */}
        <div class="relative z-10 w-full flex items-center justify-center p-8 lg:p-12">
          <FeaturesCarousel />
        </div>

        {/* Linha divisória vertical sutil */}
        <div class="absolute right-0 top-[10%] bottom-[10%] w-[1px] bg-gradient-to-b from-transparent via-gray-200 dark:via-white/10 to-transparent"></div>
      </div>

      {/* LADO DIREITO: Formulário de Autenticação */}
      <div class="w-full md:w-1/2 h-full flex items-center justify-center p-6 sm:p-12 lg:p-16 bg-white dark:bg-[#0b0f17] transition-colors duration-300">
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

          <form onSubmit={handleSubmit} class="space-y-4">
            {error() && (
              <p class="text-red-400 text-sm bg-red-950/40 p-3 rounded-lg border border-red-500/10">
                {error()}
              </p>
            )}

            {/* CAMPO NOME COMPLETO (Apenas no Registro) */}
            <Show when={isRegister()}>
              <div class="animate-in fade-in slide-in-from-top-2 duration-300">
                <label class="block text-sm text-gray-500 mb-1.5">{t('auth').full_name}</label>
                <input 
                  type="text" 
                  required
                  placeholder={t('auth').your_name}
                  value={fullName()}
                  onInput={(e) => setFullName(e.currentTarget.value)}
                  class="w-full input-text px-4 py-3"
                />
              </div>
            </Show>

            <div>
              <label class="block text-sm text-gray-500 mb-1.5">{t('auth').email_label}</label>
              <input 
                type="email" 
                required
                placeholder={t('auth').email_placeholder}
                value={email()}
                onInput={(e) => setEmail(e.currentTarget.value)}
                class="w-full input-text px-4 py-3"
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
                  class="w-full input-text px-4 py-3"
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

            <Show when={isRegister()}>
              <div class="flex items-center gap-2.5 px-1 py-1 select-none animate-in fade-in slide-in-from-top-1 duration-200">
                <input 
                  type="checkbox" 
                  id="legal-accept"
                  checked={accepted()}
                  onChange={(e) => setAccepted(e.currentTarget.checked)}
                  class="w-4 h-4 rounded border-gray-300 dark:border-white/10 bg-gray-50 dark:bg-slate-950 text-blue-600 focus:ring-blue-500/50 focus:ring-offset-0 transition-all cursor-pointer"
                />
                <label for="legal-accept" class="text-xs text-gray-500 dark:text-gray-400 cursor-pointer leading-tight">
                  {t('legal').agree_text}{" "}
                  <button 
                    type="button"
                    onClick={() => openLegal("terms")}
                    class="text-blue-600 dark:text-blue-400 font-medium hover:underline focus:outline-none inline"
                  >
                    {t('legal').terms}
                  </button>
                  {" "}{t('legal').and}{" "}
                  <button 
                    type="button"
                    onClick={() => openLegal("privacy")}
                    class="text-blue-600 dark:text-blue-400 font-medium hover:underline focus:outline-none inline"
                  >
                    {t('legal').privacy}
                  </button>.
                </label>
              </div>
            </Show>

            {/* BOTÃO DE SUBMIT: Inteligente e Reativo */}
            <button 
              type="submit" 
              disabled={loading() || (isRegister() && !accepted())}
              class={`w-full py-3 font-medium rounded-lg transition-all ${
                !isRegister() || accepted()
                  ? "bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/10 cursor-pointer" 
                  : "bg-gray-200 dark:bg-white/5 text-gray-400 dark:text-gray-600 cursor-not-allowed"
              }`}
            >
              {/* Texto do botão dinâmico de acordo com o estado da tela */}
              {isRegister() ? t('auth').create_account : t('auth').login || "Entrar"}
            </button>
          </form>
          
          <div class="text-center text-xs text-gray-600 mt-10">
            {isRegister() ? (
                <p>{t('auth').have_account} <span onClick={() => setIsRegister(false)} class="text-blue-400 cursor-pointer hover:underline ml-1">{t('auth').login_here}</span></p>
            ) : (
                <p>{t('auth').not_have_account} <span onClick={() => setIsRegister(true)} class="text-blue-400 cursor-pointer hover:underline ml-1">{t('auth').create_now}</span></p>
            )}
          </div>
        </div>
      </div>
      <LegalDialog 
        open={legalOpen()} 
        type={legalType()} 
        onClose={() => setLegalOpen(false)} 
      />
    </div>
  );
}