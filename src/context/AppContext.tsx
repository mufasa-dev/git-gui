import { createSignal, createContext, useContext, JSX, createMemo } from "solid-js";
import * as i18n from "@solid-primitives/i18n";
import { dict, Locale } from "../i18n";

type AppTranslator = i18n.ChainedTranslator<typeof dict.pt>;

interface AppContextProps {
  t: () => AppTranslator; // Mudamos para um Accessor (função)
  locale: () => Locale;
  setLocale: (l: Locale) => void;
  isDark: () => boolean;
  toggleTheme: () => void;
}

const AppContext = createContext<AppContextProps>();

export function AppProvider(props: { children: JSX.Element }) {
  const [locale, setLocale] = createSignal<Locale>(
    (localStorage.getItem("lang") as Locale) || "pt"
  );

  // O createMemo garante que o tradutor seja recriado APENAS quando o locale mudar
  const t = createMemo(() => {
    const base = i18n.translator(() => dict[locale()], i18n.resolveTemplate);
    return i18n.chainedTranslator(dict[locale()], base) as AppTranslator;
  });

  const [isDark, setIsDark] = createSignal(localStorage.getItem("theme") !== "light");

  const toggleTheme = () => {
    const newDark = !isDark();
    setIsDark(newDark);
    document.documentElement.classList.toggle("dark", newDark);
    localStorage.setItem("theme", newDark ? "dark" : "light");
  };

  const updateLocale = (l: Locale) => {
    setLocale(l);
    localStorage.setItem("lang", l);
  };

  return (
    // Passamos a referência do memo 't' (sem executar aqui)
    <AppContext.Provider value={{ t, locale, setLocale: updateLocale, isDark, toggleTheme }}>
      {props.children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext)!;