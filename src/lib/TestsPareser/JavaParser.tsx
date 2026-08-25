import { ParsedEvent } from "../../models/ProjectType.model";

const textContent = (element: Element | undefined): string[] =>
  element?.textContent?.trim() ? [element.textContent.trim()] : [];

export const parseJavaXmlToEvents = (xmlString: string): ParsedEvent[] => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "text/xml");
  if (xmlDoc.getElementsByTagName("parsererror").length > 0) return [];

  return Array.from(xmlDoc.getElementsByTagName("testcase")).map((testCase) => {
    const fullClassName = testCase.getAttribute("classname") || "Java";
    const suite = fullClassName.split('.').pop() || "Java";
    const testName = testCase.getAttribute("name") || "Unnamed test";
    const failure = testCase.getElementsByTagName("failure")[0];
    const error = testCase.getElementsByTagName("error")[0];
    const skipped = testCase.getElementsByTagName("skipped").length > 0;
    const duration = Number(testCase.getAttribute("time"));
    const log = [
      ...textContent(failure),
      ...textContent(error),
      ...textContent(testCase.getElementsByTagName("system-err")[0]),
    ];

    return {
      type: 'RESULT',
      data: {
        name: `${suite} > ${testName}`,
        status: skipped ? 'skip' : failure || error ? 'fail' : 'pass',
        duration: Number.isFinite(duration) ? `${(duration * 1000).toFixed(2)}ms` : undefined,
        log,
      },
    } as ParsedEvent;
  });
};
