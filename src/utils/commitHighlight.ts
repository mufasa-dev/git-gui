import { commitColors, TAG_MAPPING } from "./file";

type Token = { text: string; cls?: string };

const NEUTRAL = "text-gray-500 dark:text-gray-400";
const CARD = "text-blue-600 dark:text-blue-400";
const CODE = "text-pink-600 dark:text-pink-400 bg-gray-500/15 rounded-sm";
const URL_CLASS = "text-sky-600 dark:text-sky-400 underline decoration-sky-500/40";
const KEYWORD = "text-green-600 dark:text-green-400";
const PEOPLE = "text-purple-600 dark:text-purple-400";
const BREAKING = "text-red-600 dark:text-red-400";
const AUTOSQUASH = "text-fuchsia-600 dark:text-fuchsia-400 bg-fuchsia-500/15 rounded-sm";
const WIP = "text-amber-700 dark:text-amber-300 bg-amber-500/20 rounded-sm";
const BULLET = "text-sky-600 dark:text-sky-400";
const EMAIL = "text-gray-400 dark:text-gray-500";
const OVER_LIMIT = "bg-amber-400/30";

export const BODY_LINE_LIMIT = 72;

const TRAILER_KEYS = new Set([
  "breaking change", "breaking-change", "co-authored-by", "signed-off-by", "reviewed-by", "acked-by",
  "tested-by", "reported-by", "suggested-by", "helped-by", "refs", "ref", "see-also", "closes",
  "fixes", "resolves", "change-id", "cc",
]);

const CLOSING_KEYS = new Set(["closes", "fixes", "resolves", "refs", "ref", "see-also"]);

const INLINE_PATTERN = /(`[^`\n]+`)|(https?:\/\/[^\s<>()]+)|((?:[Cc]lose[sd]?|[Ff]ix(?:e[sd])?|[Rr]esolve[sd]?|CLOSES|FIXES|RESOLVES)\s*:?\s+)(?=(?:[\w.-]+\/[\w.-]+)?(?:AB)?#\d+)|((?:[\w.-]+\/[\w.-]+)?(?:AB)?#\d+)|\b([A-Z][A-Z0-9]+-\d+)\b/g;

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function inlineTokens(text: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  INLINE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = INLINE_PATTERN.exec(text)) !== null) {
    if (match[0].length === 0) {
      INLINE_PATTERN.lastIndex++;
      continue;
    }
    if (match.index > last) tokens.push({ text: text.slice(last, match.index) });
    const cls = match[1] ? CODE : match[2] ? URL_CLASS : match[3] ? KEYWORD : CARD;
    tokens.push({ text: match[0], cls });
    last = match.index + match[0].length;
  }

  if (last < text.length) tokens.push({ text: text.slice(last) });
  return tokens;
}

function tokensToHtml(tokens: Token[]): string {
  return tokens
    .map(token => token.cls
      ? `<span class="${token.cls}">${escapeHtml(token.text)}</span>`
      : escapeHtml(token.text))
    .join("");
}

function applyLineLimit(tokens: Token[], limit: number): Token[] {
  const result: Token[] = [];
  let column = 0;
  for (const token of tokens) {
    const start = column;
    const end = column + token.text.length;
    column = end;
    if (end <= limit) {
      result.push(token);
    } else if (start >= limit) {
      result.push({ text: token.text, cls: `${token.cls ?? ""} ${OVER_LIMIT}`.trim() });
    } else {
      const cut = limit - start;
      result.push({ text: token.text.slice(0, cut), cls: token.cls });
      result.push({ text: token.text.slice(cut), cls: `${token.cls ?? ""} ${OVER_LIMIT}`.trim() });
    }
  }
  return result;
}

export type TitleAnalysis = {
  html: string;
  autosquash: string | null;
  wip: boolean;
  type: string | null;
  scope: string | null;
  breaking: boolean;
  description: string;
};

export function analyzeCommitTitle(raw: string): TitleAnalysis {
  const tokens: Token[] = [];
  let rest = raw;
  let autosquash: string | null = null;
  let wip = false;

  for (;;) {
    const prefix = rest.match(/^(\s*(?:fixup|squash|amend)!\s*)/i);
    if (!prefix) break;
    autosquash = autosquash ?? prefix[1].trim();
    tokens.push({ text: prefix[1], cls: AUTOSQUASH });
    rest = rest.slice(prefix[1].length);
  }

  const wipMatch = rest.match(/^(\s*\[?wip\]?(?=[\s:]|$):?\s*)/i);
  if (wipMatch) {
    wip = true;
    tokens.push({ text: wipMatch[1], cls: WIP });
    rest = rest.slice(wipMatch[1].length);
  }

  let type: string | null = null;
  let scope: string | null = null;
  let breaking = false;
  const conventional = rest.match(/^(\s*)([\w-]+)(\([^)]*\))?(!)?(\s*:)/);
  if (conventional) {
    type = conventional[2];
    scope = conventional[3] ? conventional[3].slice(1, -1) : null;
    breaking = Boolean(conventional[4]);
    const lower = type.toLowerCase();
    const color = commitColors[TAG_MAPPING[lower] || lower] || NEUTRAL;
    if (conventional[1]) tokens.push({ text: conventional[1] });
    tokens.push({ text: conventional[2], cls: color });
    if (conventional[3]) tokens.push({ text: conventional[3], cls: NEUTRAL });
    if (conventional[4]) tokens.push({ text: conventional[4], cls: BREAKING });
    tokens.push({ text: conventional[5], cls: color });
    rest = rest.slice(conventional[0].length);
  }

  tokens.push(...inlineTokens(rest));

  return {
    html: tokensToHtml(tokens),
    autosquash,
    wip,
    type,
    scope,
    breaking,
    description: rest.trim(),
  };
}

export type BodyAnalysis = {
  html: string;
  longLines: number;
  hasBreakingTrailer: boolean;
};

export function analyzeCommitBody(text: string): BodyAnalysis {
  let longLines = 0;
  let hasBreakingTrailer = false;

  const lines = text.split("\n").map(line => {
    let tokens: Token[];
    const trailer = line.match(/^([A-Za-z][A-Za-z-]*(?: [A-Za-z]+)?)(:\s?|\s#)(.*)$/);
    const key = trailer?.[1].toLowerCase();

    if (trailer && key && TRAILER_KEYS.has(key)) {
      const isBreaking = key.startsWith("breaking");
      if (isBreaking) hasBreakingTrailer = true;
      const keyClass = isBreaking ? BREAKING : key.endsWith("-by") ? PEOPLE : CLOSING_KEYS.has(key) ? KEYWORD : NEUTRAL;
      const hashSeparator = trailer[2].includes("#");
      tokens = [{ text: trailer[1], cls: keyClass }, { text: hashSeparator ? trailer[2].replace("#", "") : trailer[2], cls: keyClass }];
      if (hashSeparator) {
        tokens.push(...inlineTokens(`#${trailer[3]}`));
      } else if (key.endsWith("-by")) {
        const person = trailer[3].match(/^(.*?)(<[^>]*>?)(.*)$/);
        if (person) {
          tokens.push({ text: person[1] }, { text: person[2], cls: EMAIL }, { text: person[3] });
        } else {
          tokens.push({ text: trailer[3] });
        }
      } else {
        tokens.push(...inlineTokens(trailer[3]));
      }
    } else {
      const bullet = line.match(/^(\s*)([-*•]|\d+[.)])(\s+)/);
      if (bullet) {
        tokens = [
          { text: bullet[1] },
          { text: bullet[2], cls: BULLET },
          { text: bullet[3] },
          ...inlineTokens(line.slice(bullet[0].length)),
        ];
      } else {
        tokens = inlineTokens(line);
      }
    }

    if (line.length > BODY_LINE_LIMIT) longLines++;
    return tokensToHtml(applyLineLimit(tokens.filter(token => token.text), BODY_LINE_LIMIT));
  });

  const html = lines.join("\n") + (text.endsWith("\n") ? "​" : "");
  return { html, longLines, hasBreakingTrailer };
}

const NON_IMPERATIVE_EXCEPTIONS = new Set([
  "need", "embed", "feed", "seed", "speed", "bleed", "shed", "breed", "proceed", "exceed", "succeed",
  "string", "bring", "thing", "ring", "king", "spring", "ping", "sing", "sting", "swing", "wing", "nothing",
  "something", "everything", "anything", "padding", "heading", "setting", "settings", "mapping", "routing",
  "logging", "caching", "testing", "tracking", "styling", "rendering", "loading", "pricing", "onboarding",
  "nada", "cada", "fado", "lado", "dado", "dados", "estado", "estados", "resultado", "resultados", "mercado",
  "cuidado", "chamada", "camada", "entrada", "saida", "saída", "rodada", "jornada", "partida", "vida", "medida",
  "unidade", "comida", "senha", "ida", "ainda", "lida", "valida",
]);

export function nonImperativeWord(description: string): string | null {
  const word = (description.match(/^[A-Za-zÀ-ÿ]+/)?.[0] ?? "");
  const lower = word.toLowerCase();
  if (lower.length < 4 || NON_IMPERATIVE_EXCEPTIONS.has(lower)) return null;
  if (/[^e]ed$/.test(lower) || /ied$/.test(lower)) return word;
  if (lower.length > 5 && /ing$/.test(lower)) return word;
  if (lower.length > 5 && /(ado|ada|ido|ida|ados|adas|idos|idas)$/.test(lower)) return word;
  return null;
}
