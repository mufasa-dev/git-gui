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
