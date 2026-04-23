import { createSignal, For, Show } from "solid-js";
import FileIcon from "./FileIcon"; // Ajuste o caminho
import { useApp } from "../../context/AppContext";
import { Locale } from "../../i18n";

export function LanguageSelector() {
  const { locale, setLocale } = useApp();
  const [isOpen, setIsOpen] = createSignal(false);

  // Mapeamento para o seu FileIcon encontrar a bandeira
  const flagMap: Record<Locale, string> = {
    pt: "pt.json",
    en: "en.json",
    it: "it.json",
    jp: "jp.json"
  };

  const languages: { id: Locale; label: string }[] = [
    { id: "pt", label: "Português" },
    { id: "en", label: "English" },
    { id: "it", label: "Italiano" },
    { id: "jp", label: "日本語" }
  ];

  return (
    <div class="relative inline-block text-left">
      {/* Botão Principal */}
      <button
        onClick={() => setIsOpen(!isOpen())}
        class="flex items-center gap-2 px-2 h-6 hover:bg-gray-700 rounded transition-colors text-[10px] uppercase font-bold text-gray-300"
      >
        <FileIcon fileName={flagMap[locale()]} size={14} />
        <span>{locale()}</span>
        <i class={`fa-solid fa-chevron-down text-[8px] transition-transform ${isOpen() ? 'rotate-180' : ''}`} />
      </button>

      {/* Menu de Opções */}
      <Show when={isOpen()}>
        <div 
          class="absolute left-0 mt-1 w-32 bg-[#1a202c] border border-white/10 rounded-md shadow-xl z-[100] py-1"
          onMouseLeave={() => setIsOpen(false)}
        >
          <For each={languages}>
            {(lang) => (
              <button
                onClick={() => {
                  setLocale(lang.id);
                  setIsOpen(false);
                }}
                class="w-full flex items-center gap-3 px-3 py-2 text-xs hover:bg-blue-600/20 text-gray-300 hover:text-white transition-colors"
              >
                <FileIcon fileName={flagMap[lang.id]} size={16} />
                <span>{lang.label}</span>
                <Show when={locale() === lang.id}>
                  <i class="fa-solid fa-check ml-auto text-blue-500 text-[10px]" />
                </Show>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}