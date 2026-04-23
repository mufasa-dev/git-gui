import pt from "./locales/pt.json";
import en from "./locales/en.json";
import it from "./locales/it.json";
import jp from "./locales/jp.json";

export const dict = { pt, en, it, jp };

export type Locale = keyof typeof dict;

// Dica: Se quiser tipagem forte para não esquecer de traduzir algo em um idioma:
export type RawDict = typeof pt;