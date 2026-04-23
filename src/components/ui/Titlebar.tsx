import { getCurrentWindow } from "@tauri-apps/api/window";
import logo from "../../assets/fork.png";
import { createSignal, Show, onMount, onCleanup } from "solid-js";
import { useApp } from "../../context/AppContext";
import { LanguageSelector } from "./LanguageSelector";

export default function Titlebar() {
  const [dark, setDark] = createSignal(localStorage.getItem("theme") == "dark");
  const [showAccountMenu, setShowAccountMenu] = createSignal(false);
  const { t } = useApp();
  
  const appWindow = getCurrentWindow();

  const handleLogout = () => {
    // 1. Limpa os dados de autenticação (JWT, user info, etc)
    localStorage.removeItem("token"); 
    localStorage.removeItem("user_data");

    // 2. Redirecionar para a tela de login
    // Se você usa solid-app-router: useNavigate()("/login")
    // Ou via window location para um reset completo:
    window.location.href = "/login";
  };

  const toggleDark = () => {
    const newDark = !dark();
    setDark(newDark);
    const theme = newDark ? "dark" : "light";
    document.documentElement.classList.toggle("dark", newDark);
    localStorage.setItem("theme", theme);
    window.dispatchEvent(new CustomEvent("theme-changed", { detail: { theme } }));
  };

  // Fechar o menu ao clicar fora
  let menuRef: HTMLDivElement | undefined;
  const clickOutside = (e: any) => {
    if (menuRef && !menuRef.contains(e.target)) setShowAccountMenu(false);
  };
  onMount(() => document.addEventListener("click", clickOutside));
  onCleanup(() => document.removeEventListener("click", clickOutside));

  return (
    <div 
      data-tauri-drag-region 
      class="flex justify-between items-center dark:bg-gray-800 dark:text-white h-8 select-none border-b dark:border-gray-900 relative"
    >
      <div class="flex items-center h-full">
        <img src={logo} class="px-2 h-7" />
        <span class="text-xs font-semibold opacity-70">Rivers</span>
      </div>
      
      <div class="flex h-full items-center">
        <LanguageSelector />
        {/* Botão de Conta / Dropdown */}
        <div class="relative h-full" ref={menuRef}>
          <button
            onClick={() => setShowAccountMenu(!showAccountMenu())}
            class="px-3 h-full hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors flex items-center gap-2 text-xs"
          >
            <i class="fa-solid fa-circle-user text-sm"></i>
          </button>

          <Show when={showAccountMenu()}>
            <div class="absolute right-0 mt-0 w-48 bg-white dark:bg-gray-800 border dark:border-gray-700 shadow-lg rounded-b-md py-1 z-50">
              <div class="px-4 py-2 border-b dark:border-gray-700 text-[10px] uppercase tracking-wider opacity-50 font-bold">
                Minha Conta
              </div>
              <button 
                class="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                onClick={() => {/* Abrir Configurações */}}
              >
                <i class="fa-solid fa-gear opacity-70"></i> Configurações
              </button>
              <button 
                onClick={handleLogout}
                class="w-full text-left px-4 py-2 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 flex items-center gap-2"
              >
                <i class="fa-solid fa-right-from-bracket"></i> {t().auth.logout()}
              </button>
            </div>
          </Show>
        </div>

        <div class="h-4 w-[1px] bg-gray-400 dark:bg-gray-600 mx-1"></div>

        {/* Botões de Controle Existentes */}
        <button
          class="inline-flex justify-center items-center w-10 h-full hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
          onClick={toggleDark}
        >
          <i class={dark() ? 'fa-regular fa-sun' : 'fa fa-moon'}/>
        </button>
        
        <button 
          onClick={() => appWindow.minimize()}
          class="inline-flex justify-center items-center w-10 h-full hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
        >
          <i class="fa-solid fa-window-minimize text-[10px]"></i>
        </button>
        
        <button 
          onClick={() => appWindow.toggleMaximize()}
          class="inline-flex justify-center items-center w-10 h-full hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
        >
          <i class="fa-regular fa-window-restore text-[10px]"></i>
        </button>

        <button 
          onClick={() => appWindow.close()}
          class="inline-flex justify-center items-center w-12 h-full hover:bg-red-600 hover:text-white transition-colors"
        >
          <i class="fa fa-times"></i>
        </button>
      </div>
    </div>
  );
}