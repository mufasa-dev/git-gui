import { createResource, For, Show } from "solid-js";
import { authService } from "../../services/authService";

export default function PricingSection(props: { userId: string }) {
  const [plans] = createResource(authService.getPlans);

  const handleSubscribe = async () => {
    try {
      await authService.openCheckout(props.userId);
    } catch (err) {
      console.error("Falha ao abrir checkout:", err);
    }
  };

  return (
    <div class="mt-8 space-y-4">
      <h3 class="text-sm font-bold text-slate-400 uppercase tracking-[0.2em] mb-4">Planos Disponíveis</h3>
      
      <Show when={!plans.loading} fallback={<div class="animate-pulse text-slate-500 text-xs">Carregando ofertas...</div>}>
        <div class="grid grid-cols-1 gap-4">
          <For each={plans()}>
            {(plan) => {
              // Busca o preço em BRL, se não achar, pega o primeiro disponível
              const price = plan.prices.find((p: any) => p.price_currency === 'brl') || plan.prices[0];
              const displayPrice = (price.price_amount / 100).toLocaleString('pt-BR', {
                style: 'currency',
                currency: price.price_currency.toUpperCase(),
              });

              return (
                <div class="group relative p-4 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-blue-500/50 transition-all duration-300">
                  <div class="flex justify-between items-start">
                    <div>
                      <h4 class="text-white font-bold text-lg">{plan.name}</h4>
                      <p class="text-xs text-slate-400 mt-1">{plan.description || 'Acesso total aos recursos premium.'}</p>
                    </div>
                    <div class="text-right">
                      <span class="text-xl font-black text-white">{displayPrice}</span>
                      <span class="text-[10px] block text-slate-500 uppercase">/ mês</span>
                    </div>
                  </div>

                  <button 
                    onClick={() => handleSubscribe()}
                    class="w-full mt-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white text-xs font-black uppercase tracking-widest rounded-lg transition-all transform active:scale-[0.98] shadow-lg shadow-blue-500/10"
                  >
                    Assinar Agora
                  </button>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}