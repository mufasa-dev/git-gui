/**
 * Utilitários (sem dependências de editor) para ler e resolver conflitos de merge
 * em um texto com marcadores `<<<<<<< / ||||||| / ======= / >>>>>>>`.
 */

export type ConflictChoice = "current" | "incoming" | "both" | "both-incoming-first";

export type TextSegment = {
  kind: "text";
  /** Linha (1-based) onde o trecho começa no arquivo. */
  startLine: number;
  lines: string[];
};

export type ConflictSegment = {
  kind: "conflict";
  /** Número sequencial do conflito no arquivo (1, 2, 3...). */
  id: number;
  /** Linhas (1-based) dos marcadores `<<<<<<<` e `>>>>>>>`. */
  startLine: number;
  endLine: number;
  current: string[];
  incoming: string[];
  /** Nome que vem depois do marcador (ex.: HEAD, MASTER). */
  currentLabel: string;
  incomingLabel: string;
  /** Linhas originais do bloco, com marcadores. */
  raw: string[];
};

export type Segment = TextSegment | ConflictSegment;

export type LineKind = "" | "marker" | "current" | "base" | "incoming";

const markerLabel = (line: string) => line.slice(7).trim();

/** Divide o texto em trechos normais e blocos de conflito. */
export function parseSegments(text: string): Segment[] {
  const lines = text.split("\n");
  const segments: Segment[] = [];
  let buffer: string[] = [];
  let bufferStart = 1;
  let conflictId = 0;

  const flush = () => {
    if (buffer.length > 0) segments.push({ kind: "text", startLine: bufferStart, lines: buffer });
    buffer = [];
  };

  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.startsWith("<<<<<<<")) {
      if (buffer.length === 0) bufferStart = index + 1;
      buffer.push(line);
      index++;
      continue;
    }

    let baseIndex = -1;
    let sepIndex = -1;
    let endIndex = -1;
    for (let cursor = index + 1; cursor < lines.length; cursor++) {
      const candidate = lines[cursor];
      if (sepIndex === -1) {
        if (candidate.startsWith("<<<<<<<")) break; // início sem separador: não é um bloco válido
        if (baseIndex === -1 && candidate.startsWith("|||||||")) baseIndex = cursor;
        else if (candidate.startsWith("=======")) sepIndex = cursor;
      } else if (candidate.startsWith(">>>>>>>")) {
        endIndex = cursor;
        break;
      }
    }

    if (sepIndex === -1 || endIndex === -1) {
      if (buffer.length === 0) bufferStart = index + 1;
      buffer.push(line);
      index++;
      continue;
    }

    flush();
    conflictId++;
    segments.push({
      kind: "conflict",
      id: conflictId,
      startLine: index + 1,
      endLine: endIndex + 1,
      current: lines.slice(index + 1, baseIndex === -1 ? sepIndex : baseIndex),
      incoming: lines.slice(sepIndex + 1, endIndex),
      currentLabel: markerLabel(line),
      incomingLabel: markerLabel(lines[endIndex]),
      raw: lines.slice(index, endIndex + 1),
    });
    index = endIndex + 1;
  }

  flush();
  return segments;
}

export function segmentText(segment: Segment): string {
  return (segment.kind === "text" ? segment.lines : segment.raw).join("\n");
}

export function segmentsToText(segments: Segment[]): string {
  return segments.map(segmentText).join("\n");
}

export function resolutionLines(conflict: ConflictSegment, choice: ConflictChoice): string[] {
  switch (choice) {
    case "current": return conflict.current;
    case "incoming": return conflict.incoming;
    case "both": return [...conflict.current, ...conflict.incoming];
    case "both-incoming-first": return [...conflict.incoming, ...conflict.current];
  }
}

/** Troca um bloco de conflito pelas linhas escolhidas (lista vazia remove o bloco). */
export function resolveConflictInText(text: string, conflictId: number, lines: string[]): string {
  const segments = parseSegments(text);
  const parts: string[] = [];
  for (const segment of segments) {
    if (segment.kind === "conflict" && segment.id === conflictId) {
      if (lines.length > 0) parts.push(lines.join("\n"));
    } else {
      parts.push(segmentText(segment));
    }
  }
  return parts.join("\n");
}

/** Resolve todos os conflitos com a mesma escolha. */
export function resolveAllInText(text: string, choice: ConflictChoice): string {
  const parts: string[] = [];
  for (const segment of parseSegments(text)) {
    if (segment.kind === "conflict") {
      const lines = resolutionLines(segment, choice);
      if (lines.length > 0) parts.push(lines.join("\n"));
    } else {
      parts.push(segmentText(segment));
    }
  }
  return parts.join("\n");
}

/** Classifica cada linha do texto (para colorir o modo texto). */
export function lineKinds(text: string): LineKind[] {
  const kinds: LineKind[] = [];
  for (const segment of parseSegments(text)) {
    if (segment.kind === "text") {
      segment.lines.forEach(() => kinds.push(""));
      continue;
    }
    let section: LineKind = "current";
    segment.raw.forEach((line, index) => {
      if (index === 0 || index === segment.raw.length - 1) {
        kinds.push("marker");
      } else if (line.startsWith("|||||||") && section === "current") {
        kinds.push("marker");
        section = "base";
      } else if (line.startsWith("=======") && section !== "incoming") {
        kinds.push("marker");
        section = "incoming";
      } else {
        kinds.push(section);
      }
    });
  }
  return kinds;
}

export function hasConflictMarkers(text: string): boolean {
  return parseSegments(text).some((segment) => segment.kind === "conflict") || /^<{7}( |$)/m.test(text);
}
