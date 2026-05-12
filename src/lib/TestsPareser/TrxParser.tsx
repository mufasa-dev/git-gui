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
    const className = fullClassName.split('.').pop() || "Geral";
    const testName = result.getAttribute("testName") || "";

    return {
      type: 'RESULT',
      data: {
        name: `${className} > ${testName}`,
        status: result.getAttribute("outcome") === "Passed" ? 'pass' : 'fail',
        duration: result.getAttribute("duration") || "0",
        log: [] // Opcional: extrair erros aqui se desejar
      }
    };
  });
};