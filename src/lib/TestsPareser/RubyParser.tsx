import { ParsedEvent } from "../../models/ProjectType.model";

type RSpecExample = {
  description?: string;
  full_description?: string;
  status?: string;
  file_path?: string;
  run_time?: number;
  exception?: {
    message?: string;
    backtrace?: string[];
  };
};

const rubyStatus = (status: string | undefined): 'pass' | 'fail' | 'skip' => {
  const normalized = status?.toLowerCase();
  if (normalized === 'passed' || normalized === 'pass') return 'pass';
  if (normalized === 'pending' || normalized === 'skipped') return 'skip';
  return 'fail';
};

export const parseRubyJsonToEvents = (jsonLine: string): ParsedEvent[] => {
  try {
    const report = JSON.parse(jsonLine) as { examples?: RSpecExample[] };
    return (report.examples || []).map((example) => {
      const fullName = example.full_description || example.description || 'Unnamed test';
      const testName = example.description || fullName;
      const suite = fullName.endsWith(testName)
        ? fullName.slice(0, -testName.length).trim() || 'RSpec'
        : 'RSpec';
      const exception = example.exception;
      const log = [
        ...(exception?.message ? [exception.message] : []),
        ...(exception?.backtrace || []),
      ];

      return {
        type: 'RESULT',
        data: {
          name: `${suite} > ${testName}`,
          status: rubyStatus(example.status),
          filePath: example.file_path,
          duration: example.run_time !== undefined ? `${(example.run_time * 1000).toFixed(2)}ms` : undefined,
          log,
        },
      } as ParsedEvent;
    });
  } catch {
    return [];
  }
};

export const rubyParser = (line: string): ParsedEvent => {
  const match = line.match(/^\s*([A-Za-z0-9_:]+)#([A-Za-z0-9_!?]+)\s*=.*?=\s*([.FES])\s*$/);
  if (!match) return { type: 'LOG' };

  const suite = match[1].split('::').pop() || 'Minitest';
  const status = match[3];
  return {
    type: 'RESULT',
    data: {
      name: `${suite} > ${match[2]}`,
      status: status === '.' ? 'pass' : status === 'S' ? 'skip' : 'fail',
      log: status === '.' || status === 'S' ? [] : [line.trim()],
    },
  };
};
