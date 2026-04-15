import { Show } from "solid-js";
import { Portal } from "solid-js/web";

type ConfirmModalProps = {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
    confirmText?: string;
    cancelText?: string;
    isDanger?: boolean;
};

export default function ConfirmModal(props: ConfirmModalProps) {
    return (
        <Show when={props.isOpen}>
            <Portal>
                {/* Backdrop com desfoque */}
                <div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    
                    {/* Card da Modal */}
                    <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 w-full max-w-sm rounded-xl shadow-2xl overflow-hidden transform animate-in zoom-in-95 duration-200">
                        <div class="p-6">
                            <h3 class="text-lg font-black text-gray-900 dark:text-white mb-2">
                                {props.title}
                            </h3>
                            <p class="text-sm text-gray-500 dark:text-gray-400">
                                {props.message}
                            </p>
                        </div>

                        <div class="flex border-t border-gray-100 dark:border-gray-700">
                            <button 
                                onClick={props.onCancel}
                                class="flex-1 px-4 py-3 text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                                {props.cancelText || 'Cancelar'}
                            </button>
                            <button 
                                onClick={props.onConfirm}
                                class={`flex-1 px-4 py-3 text-xs font-bold uppercase tracking-widest text-white transition-all
                                    ${props.isDanger ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'}`}
                            >
                                {props.confirmText || 'Confirmar'}
                            </button>
                        </div>
                    </div>
                </div>
            </Portal>
        </Show>
    );
}