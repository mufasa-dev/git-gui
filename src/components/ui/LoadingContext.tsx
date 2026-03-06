import { createSignal, createContext, useContext, Show, ParentComponent } from "solid-js";

// Definição do tipo para o contexto
interface LoadingContextType {
  showLoading: (message?: string) => void;
  hideLoading: () => void;
}

const LoadingContext = createContext<LoadingContextType>();

export const LoadingProvider: ParentComponent = (props) => {
  const [isVisible, setIsVisible] = createSignal(false);
  const [message, setMessage] = createSignal("Carregando...");

  const showLoading = (msg?: string) => {
    if (msg) setMessage(msg);
    setIsVisible(true);
  };

  const hideLoading = () => setIsVisible(false);

  return (
    <LoadingContext.Provider value={{ showLoading, hideLoading }}>
      {props.children}

      <Show when={isVisible()}>
        <div class="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm transition-all">
          <div class="flex flex-col items-center">
            {/* Spinner */}
            <div class="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <p class="mt-4 text-sm font-medium text-gray-700 dark:text-gray-200">
              {message()}
            </p>
          </div>
        </div>
      </Show>
    </LoadingContext.Provider>
  );
};

// Hook customizado para facilitar o uso
export function useLoading() {
  const context = useContext(LoadingContext);
  if (!context) throw new Error("useLoading deve ser usado dentro de um LoadingProvider");
  return context;
}