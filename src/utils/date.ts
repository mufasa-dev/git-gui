type Translator = any; 

export function formatRelativeDate(dateStr: string, t: any, locale: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return t("date").just_now;
  }

  const minutes = Math.floor(diffInSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return formatDate(dateStr, locale);
  } else if (hours >= 1) {
    return t("date").hours_ago.replace("{{count}}", String(hours));
  } else {
    return t("date").minutes_ago.replace("{{count}}", String(minutes));
  }
}

export function formatDate(dateStr: string, locale: string) {
  const date = new Date(dateStr);
  
  // Mapeamento simples para garantir que o Intl entenda o código do idioma
  const localeMap: Record<string, string> = {
    "pt": "pt-BR",
    "en": "en-US",
    "it": "it-IT",
    "jp": "ja-JP"
  };

  const currentLocale = localeMap[locale] || locale;

  const options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };

  return date.toLocaleString(currentLocale, options);
}

export const getRelativeTime = (dateStr: string, t: Translator) => {
    const date = new Date(dateStr);
    const now = new Date();
    const s = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (s < 3600) return t("date").minutes_ago.replace("{{count}}", String(Math.floor(s / 60)));
    if (s < 86400) return t("date").hours_ago.replace("{{count}}", String(Math.floor(s / 3600)));
    if (s < 604800) return t("date").days_ago.replace("{{count}}", String(Math.floor(s / 86400)));

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${day}/${month}/${year} ${hours}:${minutes}`;
};

export const formatDuration = (msStr: string | undefined) => {
  if (!msStr) return '';
  const ms = parseInt(msStr);
  if (isNaN(ms)) return msStr;

  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = seconds / 60;
  // 'm' de minutos é universal no Git, mas se quiser traduzir, teria que passar o 't' aqui também.
  return `${minutes.toFixed(1)}m`;
};