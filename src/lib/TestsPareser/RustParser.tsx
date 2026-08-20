import { ParsedEvent } from "../../models/ProjectType.model";

export const rustParser = (line: string): ParsedEvent => {
  const match = line.match(/^test\s+(.+?)\s+\.\.\.\s+(ok|FAILED|ignored)$/i);
  if (!match) return { type: 'LOG' };

  const fullName = match[1].trim();
  const parts = fullName.split('::');
  const testName = parts.pop() || fullName;
  const suite = parts.join('::') || 'Rust';
  const result = match[2].toLowerCase();

  return {
    type: 'RESULT',
    data: {
      name: `${suite} > ${testName}`,
      status: result === 'ok' ? 'pass' : result === 'ignored' ? 'skip' : 'fail',
      log: result === 'failed' ? [line] : [],
    },
  };
};
