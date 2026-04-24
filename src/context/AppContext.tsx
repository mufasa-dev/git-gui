import { createSignal, createContext, useContext, JSX } from "solid-js";
import * as i18n from "@solid-primitives/i18n";
import { dict, Locale } from "../i18n";

interface AppContextProps {
  // Voltamos para o tipo Translator padrão
  t: i18n.Translator<typeof dict.pt>;
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

  // Criamos o tradutor reativo simples
  const t = i18n.translator(() => dict[locale()]);

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
    <AppContext.Provider value={{ t, locale, setLocale: updateLocale, isDark, toggleTheme }}>
      {props.children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext)!;