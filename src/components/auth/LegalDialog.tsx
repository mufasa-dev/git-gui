import { For } from "solid-js";
import { useApp } from "../../context/AppContext";
import Dialog from "../ui/Dialog";

type LegalDialogProps = {
  open: boolean;
  type: "terms" | "privacy";
  onClose: () => void;
};

export default function LegalDialog(props: LegalDialogProps) {
  const { t } = useApp();

  // Mantemos as seções puras aqui, mas a indexação de chaves agora é dinâmica e sem ifs na UI
  const sectionsData = {
    terms: [
      {
        h: props.type === "terms" ? "1. Aceitação dos Termos" : "1. Acceptance of Terms", // Se preferir, pode mover estas seções para o JSON também!
        p: "" 
      }
    ]
  };

  // OBS: Como os textos das seções são maiores, para não inflar o JSON, 
  // buscamos direto do objeto estruturado local usando o hook interno do sistema
  const content = {
    pt: {
      terms: ["1. Aceitação dos Termos", "Ao acessar o site ou aplicativo Dev Brook, você concorda em cumprir estes termos de serviço, todas as leis e regulamentos aplicáveis.", "2. Uso de Licença", "O Dev Brook é distribuído sob licença individual ou corporativa. É proibido modificar, copiar ou tentar fazer engenharia reversa do software.", "3. Responsabilidade", "O Dev Brook não se responsabiliza por perda de dados decorrente do uso inadequado de comandos Git ou falhas de hardware do usuário."],
      privacy: ["1. Coleta de Dados", "Sua privacidade é nossa prioridade. O Dev Brook é uma ferramenta local e não envia seu código-fonte para nossos servidores.", "2. Telemetria", "Podemos coletar dados básicos de uso e performance (crash reports) para melhorar a estabilidade da aplicação, sempre de forma anônima.", "3. Segurança", "Implementamos medidas de segurança para proteger suas informações de licenciamento e conta corporativa."]
    },
    en: {
      terms: ["1. Acceptance of Terms", "By accessing Dev Brook, you agree to comply with these terms of service and all applicable laws and regulations.", "2. License Usage", "Dev Brook is distributed under individual or corporate license. Modifying, copying, or reverse engineering the software is prohibited.", "3. Responsibility", "Dev Brook is not responsible for data loss resulting from improper Git command usage or user hardware failure."],
      privacy: ["1. Data Collection", "Your privacy is our priority. Dev Brook is a local tool and does not send your source code to our servers.", "2. Telemetry", "We may collect basic usage and performance data (crash reports) to improve application stability, always anonymously.", "3. Security", "We implement security measures to protect your licensing and corporate account information."]
    }
  };

  // Fallback seguro caso precise capturar o locale ativo do sistema (ex: t('locale') ou similar)
  // Se o seu useApp expuser o locale atual, use-o aqui. Caso contrário, mapeamos direto pelas chaves do t:
  const currentSections = () => {
    // Detecta o idioma baseado em uma chave simples do seu i18n
    const isPt = t('legal').terms === "Termos de Uso";
    const langKey = isPt ? "pt" : "en";
    
    const data = content[langKey][props.type];
    // Agrupa em objetos { h, p } para o Loop
    const pairs = [];
    for (let i = 0; i < data.length; i += 2) {
      pairs.push({ h: data[i], p: data[i + 1] });
    }
    return pairs;
  };

  return (
    <Dialog
      open={props.open}
      title={props.type === "terms" ? t('legal').terms : t('legal').privacy}
      width="600px"
      onClose={props.onClose}
      bodyClass="p-0"
    >
      <div class="flex flex-col max-h-[70vh] bg-white dark:bg-[#0b0f17] rounded-b-xl transition-colors duration-300">
        
        <div class="p-6 overflow-y-auto space-y-6 max-h-[55vh] border-b border-gray-100 dark:border-white/5 style-scrollbar">
          
          <p class="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
            {t('legal').last_update}
          </p>

          <For each={currentSections()}>
            {(section) => (
              <div class="space-y-2">
                <h3 class="text-gray-800 dark:text-gray-200 font-bold text-base">
                  {section.h}
                </h3>
                <p class="text-gray-500 dark:text-gray-400 leading-relaxed text-sm">
                  {section.p}
                </p>
              </div>
            )}
          </For>
        </div>

        <div class="p-4 bg-gray-50 dark:bg-black/20 rounded-b-xl flex justify-end">
          <button
            onClick={props.onClose}
            class="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-all shadow-md"
          >
            {t('legal').got_it}
          </button>
        </div>

      </div>

      <style>{`
        .style-scrollbar::-webkit-scrollbar { width: 6px; }
        .style-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .style-scrollbar::-webkit-scrollbar-thumb { background: rgba(100, 116, 139, 0.2); border-radius: 10px; }
        .style-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(100, 116, 139, 0.4); }
      `}</style>
    </Dialog>
  );
}