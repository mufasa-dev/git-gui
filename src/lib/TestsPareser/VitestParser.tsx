import { ParsedEvent } from "../../models/ProjectType.model";

type VitestAssertion = {
  ancestorTitles?: string[];
  title?: string;
  fullName?: string;
  status?: string;
  duration?: number;
  failureMessages?: string[];
  failureMessage?: string;
};

type VitestFileResult = {
  name?: string;
  assertionResults?: VitestAssertion[];
  tests?: VitestAssertion[];
};

const statusFor = (status: string | undefined): 'pass' | 'fail' | 'skip' => {
  const normalized = status?.toLowerCase();
  if (normalized === 'passed' || normalized === 'pass') return 'pass';
  if (normalized === 'skipped' || normalized === 'pending' || normalized === 'todo') return 'skip';
  return 'fail';
};

export const parseVitestToEvents = (jsonLine: string): ParsedEvent[] => {
  try {
    const report = JSON.parse(jsonLine) as { testResults?: VitestFileResult[]; files?: VitestFileResult[] };
    const files = report.testResults || report.files || [];

    return files.flatMap((file) => {
      const assertions = file.assertionResults || file.tests || [];
      return assertions.map((assertion) => {
        const ancestors = assertion.ancestorTitles || [];
        const testName = assertion.title || assertion.fullName || 'Unnamed test';
        const name = assertion.fullName && !ancestors.length
          ? assertion.fullName
          : [...ancestors, testName].join(' > ');
        const logs = [
          ...(assertion.failureMessages || []),
          ...(assertion.failureMessage ? [assertion.failureMessage] : []),
        ].filter(Boolean);

        return {
          type: 'RESULT',
          data: {
            name,
            status: statusFor(assertion.status),
            filePath: file.name,
            duration: assertion.duration !== undefined ? `${assertion.duration}ms` : undefined,
            log: logs,
          },
        } as ParsedEvent;
      });
    });
  } catch {
    return [];
  }
};
