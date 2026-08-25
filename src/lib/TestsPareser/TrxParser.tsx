import { ParsedEvent } from "../../models/ProjectType.model";

export const parseTrxToEvents = (xmlString: string): ParsedEvent[] => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "text/xml");
  const testResults = xmlDoc.getElementsByTagName("UnitTestResult");
  const testDefinitions = Array.from(xmlDoc.getElementsByTagName("UnitTest"));

  return Array.from(testResults).map(result => {
    const testId = result.getAttribute("testId");
    const definition = testDefinitions.find(d => d.getAttribute("id") === testId);
    const testMethod = definition?.getElementsByTagName("TestMethod")[0];
    
    const fullClassName = testMethod?.getAttribute("className") || "";
    const methodName = testMethod?.getAttribute("name") || "";
    const className = fullClassName.split('.').pop() || "Geral";
    const testName = result.getAttribute("testName") || "";
    const executionName = fullClassName && methodName
      ? `${fullClassName}.${methodName}`
      : methodName || undefined;

    return {
      type: 'RESULT',
      data: {
        name: `${className} > ${testName}`,
        status: result.getAttribute("outcome") === "Passed"
          ? 'pass'
          : ['NotExecuted', 'Skipped', 'Pending'].includes(result.getAttribute("outcome") || '')
            ? 'skip'
            : 'fail',
        duration: result.getAttribute("duration") || "0",
        resultId: testId || undefined,
        executionName,
        log: [] // Opcional: extrair erros aqui se desejar
      }
    };
  });
};