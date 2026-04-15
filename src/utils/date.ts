export function formatRelativeDate(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return "agora mesmo";
  }

  const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

  const minutes = Math.floor(diffInSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return formatDate(dateStr);
  } else if (days >= 1) {
    return rtf.format(-days, "day");
  } else if (hours >= 1) {
    return rtf.format(-hours, "hour");
  } else {
    return rtf.format(-minutes, "minute");
  }
}

export function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  const options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };
  return date.toLocaleString("pt-BR", options); // ou "en-US"
}

export const getRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const s = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (s < 3600) return `${Math.floor(s / 60)}m atrás`;
    if (s < 86400) return `${Math.floor(s / 3600)}h atrás`;
    if (s < 604800) return `${Math.floor(s / 86400)}d atrás`;

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Meses começam em 0
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
  return `${minutes.toFixed(1)}m`;
};