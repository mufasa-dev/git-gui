
import { getCurrentWindow } from "@tauri-apps/api/window";
import logo from "../../assets/fork.png";
import { createSignal } from "solid-js";

export default function Titlebar() {

  const [dark, setDark] = createSignal(localStorage.getItem("theme") == "dark");

  const appWindow = getCurrentWindow();

  const toggleDark = () => {
    const newDark = !dark();
    setDark(newDark);
    
    if (newDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }

    window.dispatchEvent(new CustomEvent("theme-changed", { detail: { theme: newDark ? "dark" : "light" } }));
  };
  
  return (
    <div 
      data-tauri-drag-region 
      class="flex justify-between items-center dark:bg-gray-800 dark:text-white h-8 select-none border-b dark:border-gray-900"
    >
      <img src={logo} class="px-2 h-7" />
      
      <div class="flex h-full">
        <button
          class="inline-flex justify-center items-center w-12 h-full hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
          onClick={toggleDark}
        >
          <i class={dark() ? 'fa-regular fa-sun' : 'fa fa-moon'}/>
        </button>
        <button 
          onClick={() => appWindow.minimize()}
          class="inline-flex justify-center items-center w-12 h-full hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
        >
          <i class="fa-solid fa-window-minimize"></i>
        </button>
        
        <button 
          onClick={() => appWindow.toggleMaximize()}
          class="inline-flex justify-center items-center w-12 h-full hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
        >
          <i class="fa-regular fa-window-restore"></i>
        </button>

        <button 
          onClick={() => appWindow.close()}
          class="inline-flex justify-center items-center w-12 h-full hover:bg-red-600 transition-colors"
        >
          <i class="fa fa-times"></i>
        </button>
      </div>
    </div>
  );
};