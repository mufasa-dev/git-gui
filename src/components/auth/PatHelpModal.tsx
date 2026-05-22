import { Show } from "solid-js";

export default function PatHelpModal(props: { isOpen: boolean; onClose: () => void }) {
    return (
        <Show when={props.isOpen}>
            <div class="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden p-6 text-left flex flex-col gap-4">
                    <div class="flex items-center justify-between border-b border-gray-100 dark:border-gray-700/60 pb-3">
                        <div class="flex items-center gap-2 text-blue-500">
                            <i class="fa-solid fa-circle-info text-lg"></i>
                            <h3 class="font-bold text-sm dark:text-white uppercase tracking-wider">Como obter o Token (PAT)?</h3>
                        </div>
                        <button 
                            onClick={props.onClose}
                            class="text-gray-400 hover:text-gray-600 dark:hover:text-white p-1 rounded-lg"
                        >
                            <i class="fa-solid fa-xmark text-sm"></i>
                        </button>
                    </div>

                    <div class="text-xs space-y-3.5 text-gray-600 dark:text-gray-300 leading-relaxed font-sans">
                        <div class="flex gap-2.5">
                            <span class="w-5 h-5 rounded-full bg-blue-500/10 text-blue-500 font-bold flex items-center justify-center shrink-0">1</span>
                            <p>Acesse o painel do <a href="https://dev.azure.com" target="_blank" class="text-blue-500 hover:underline inline-flex items-center gap-0.5">Azure DevOps <i class="fa-solid fa-arrow-up-right-from-square text-[9px]"></i></a> com sua conta.</p>
                        </div>
                        <div class="flex gap-2.5">
                            <span class="w-5 h-5 rounded-full bg-blue-500/10 text-blue-500 font-bold flex items-center justify-center shrink-0">2</span>
                            <p>No canto superior direito, clique no ícone de <span class="font-semibold text-gray-800 dark:text-gray-100">User Settings</span> (ícone de engrenagem e usuário ao lado do seu avatar).</p>
                        </div>
                        <div class="flex gap-2.5">
                            <span class="w-5 h-5 rounded-full bg-blue-500/10 text-blue-500 font-bold flex items-center justify-center shrink-0">3</span>
                            <p>Selecione <span class="font-semibold text-gray-800 dark:text-gray-100">Personal access tokens</span> e clique no botão <span class="text-blue-500 font-semibold">+ New Token</span>.</p>
                        </div>
                        <div class="flex gap-2.5">
                            <span class="w-5 h-5 rounded-full bg-blue-500/10 text-blue-500 font-bold flex items-center justify-center shrink-0">4</span>
                            <div>
                                <p>Defina as configurações obrigatórias do Token:</p>
                                <ul class="list-disc pl-4 mt-1.5 space-y-1.5 text-gray-500 dark:text-gray-400 font-mono text-[11px]">
                                    <li>
                                        <b class="text-gray-700 dark:text-gray-300">Organization:</b> Selecione a sua organização específica (Não use "All accessible organizations", pois tokens globais são revogados automaticamente pela plataforma).
                                    </li>
                                    <li>
                                        <b class="text-gray-700 dark:text-gray-300">Scopes:</b> Marque a opção <span class="text-blue-400">Custom defined</span>.
                                    </li>
                                    <li>
                                        <b class="text-gray-700 dark:text-gray-300">Code:</b> Marque a caixa <span class="text-blue-400">Read & Write</span>.
                                    </li>
                                    <li>
                                        <b class="text-gray-700 dark:text-gray-300">Project and Team:</b> Marque a caixa <span class="text-blue-400">Read</span> (necessário para que o Git River organize seus repositórios por projetos).
                                    </li>
                                </ul>
                            </div>
                        </div>
                        <div class="flex gap-2.5">
                            <span class="w-5 h-5 rounded-full bg-blue-500/10 text-blue-500 font-bold flex items-center justify-center shrink-0">5</span>
                            <p>Clique em <span class="font-semibold text-gray-800 dark:text-gray-100">Create</span> no final da página e <span class="text-yellow-500 font-semibold">copie o código gerado imediatamente</span>. Guarde-o bem, pois ele não será exibido novamente!</p>
                        </div>
                    </div>

                    <div class="mt-2 pt-3 border-t border-gray-100 dark:border-gray-700/60 flex justify-end">
                        <button 
                            onClick={props.onClose} 
                            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs transition-colors shadow-md shadow-blue-500/10"
                        >
                            ENTENDI, CONTINUAR
                        </button>
                    </div>
                </div>
            </div>
        </Show>
    );
}