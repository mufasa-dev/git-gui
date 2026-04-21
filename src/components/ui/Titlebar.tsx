
import { getCurrentWindow } from "@tauri-apps/api/window";
import logo from "../../assets/fork.png";

export default function Titlebar() {
  const appWindow = getCurrentWindow();

  return (
    <div 
      data-tauri-drag-region 
      class="flex justify-between items-center dark:bg-gray-800 dark:text-white h-8 select-none border-b dark:border-gray-900"
    >
      <img src={logo} class="px-2 h-7" /> <span>Trident</span>
      
      <div class="flex h-full">
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