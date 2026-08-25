export interface LogLineParsed {
  id: string;
  originalIndex: number;
  type: 'normal' | 'group_header';
  text: string;
  isGroupClosed?: boolean;
  childLines?: LogLineParsed[];
}

export function removeLogTimestamp(line: string): string {
  const timestampRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\s?/;
  return line.replace(timestampRegex, "");
}

function linkify(text: string): string {
  if (!text) return text;

  let formatted = text.replace(
    /\[(.*?)\]\((https?:\/\/[^\s)]+)\)/g, 
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="underline text-sky-400 hover:text-sky-300 transition-colors cursor-pointer font-bold">$1</a>'
  );

  const rawUrlRegex = /(?<!href=")(https?:\/\/[^\s<)]+)/g;
  formatted = formatted.replace(
    rawUrlRegex, 
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="underline text-sky-400 hover:text-sky-300 transition-colors cursor-pointer">$1</a>'
  );

  return formatted;
}

/**
 * Aplica estilos HTML baseados nos padrões de log do Azure DevOps
 */
export function highlightLogLine(escaped: string): string {
  if (!escaped) return "&nbsp;";

  // 1. ERROS (Padrão Azure: ##[error]...)
  if (escaped.startsWith("##[error]")) {
    const content = escaped.replace("##[error]", "");
    return `<span class="text-rose-500 font-bold bg-rose-500/5 dark:bg-rose-500/10 block w-full">${linkify(content)}</span>`;
  }

  // 2. WARNINGS (Padrão Azure: ##[warning]...)
  if (escaped.startsWith("##[warning]")) {
    const content = escaped.replace("##[warning]", "");
    return `<span class="text-amber-500 font-bold bg-amber-500/5 block w-full">${linkify(content)}</span>`;
  }

  // 3. SECTIONS (Padrão Azure: ##[section]...)
  if (escaped.startsWith("##[section]")) {
    const content = escaped.replace("##[section]", "");
    return `<span class="text-emerald-500 dark:text-emerald-400 font-bold">${linkify(content)}</span>`;
  }

  // 4. LINHAS DE DIVISÃO (Muitos ==== ou ----)
  if (/^[=\-_]{5,}/.test(escaped)) {
    return `<span class="text-gray-500 dark:text-gray-600 select-none">${escaped}</span>`;
  }

  // 5. COMANDOS EXECUTADOS (Padrão Azure: ##[command]...)
  if (escaped.startsWith("##[command]")) {
    const content = escaped.replace("##[command]", "");
    return `<span class="text-sky-400 dark:text-sky-400 font-semibold">${linkify(content)}</span>`;
  }

  // Retorno padrão para texto comum (com links processados)
  return `<span class="text-gray-300 dark:text-gray-200">${linkify(escaped)}</span>`;
}

/**
 * Transforma a string bruta de logs em uma árvore estruturada com suporte a grupos
 */
export function parseLogLines(rawContent: string): LogLineParsed[] {
  if (!rawContent) return [];
  
  const rawLines = rawContent.split("\n");
  const result: LogLineParsed[] = [];
  
  let currentGroup: LogLineParsed | null = null;
  let lineCounter = 1;

  for (let i = 0; i < rawLines.length; i++) {
    let clean = removeLogTimestamp(rawLines[i])
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt\"");

    if (clean.startsWith("##[group]")) {
      const headerText = clean.replace("##[group]", "");
      currentGroup = {
        id: `group-${i}`,
        originalIndex: lineCounter++,
        type: 'group_header',
        text: headerText,
        isGroupClosed: true,
        childLines: []
      };
      result.push(currentGroup);
      continue;
    }

    if (clean.startsWith("##[endgroup]")) {
      currentGroup = null;
      continue;
    }

    const lineObj: LogLineParsed = {
      id: `line-${i}`,
      originalIndex: lineCounter++,
      type: 'normal',
      text: clean
    };

    if (currentGroup) {
      currentGroup.childLines?.push(lineObj);
    } else {
      result.push(lineObj);
    }
  }

  return result;
}