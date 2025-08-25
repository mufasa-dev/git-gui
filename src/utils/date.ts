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
