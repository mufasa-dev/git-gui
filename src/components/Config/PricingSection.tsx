import { createResource, For, Show } from "solid-js";
import { authService } from "../../services/authService";
import { useApp } from "../../context/AppContext"; // Importado para usar o i18n

export default function PricingSection(props: { userId: string }) {
  const { t } = useApp(); // Hook do i18n
  const [plans] = createResource(authService.getPlans);

  const handleSubscribe = async () => {
    try {
      await authService.openCheckout(props.userId);
    } catch (err) {
      console.error("Falha ao abrir checkout:", err);
    }
  };

  // 1. Tratativa para trocar "mês" por "ano" se for anual
  const getBillingPeriod = (planName: string) => {
    const isAnnual = planName.toLowerCase().includes("annual");
    return isAnnual ? "ano" : "mês";
  };

  // 2. Função para traduzir o nome do plano com base no i18n
  const getTranslatedPlanName = (planName: string) => {
    const nameLower = planName.toLowerCase();
    
    if (nameLower.includes("annual")) {
      return t('auth').plan_annual || "Dev Brook Annual Subscription"; 
    }
    if (nameLower.includes("monthly")) {
      return t('auth').plan_monthly || "Dev Brook Monthly Subscription";
    }
    
    return planName; // Fallback caso venha outro nome da API
  };

  return (
    <div class="mt-8 space-y-4">
      <h3 class="text-sm font-bold text-slate-400 uppercase tracking-[0.2em] mb-4">
        {t('auth').plans_available}
      </h3>
      
      <Show when={!plans.loading} fallback={<div class="animate-pulse text-slate-500 text-xs">{t('loading').offers}</div>}>
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
                <div class="group relative p-4 rounded-xl bg-gray-100 dark:bg-slate-900/50 border dark:border-slate-800 hover:border-blue-500/50 transition-all duration-300">
                  <div class="flex justify-between items-start">
                    <div>
                      {/* Nome traduzido via i18n */}
                      <h4 class="text-gray-800 dark:text-white font-bold text-lg">
                        {getTranslatedPlanName(plan.name)}
                      </h4>
                      <p class="text-xs text-slate-400 mt-1">
                        {plan.description || ''}
                      </p>
                    </div>
                    <div class="text-right">
                      <span class="text-xl font-black text-gray-800 dark:text-white">
                        {displayPrice}
                      </span>
                      {/* Sulfixo dinâmico: / mês ou / ano */}
                      <span class="text-[10px] block text-slate-500 uppercase">
                        / {getBillingPeriod(plan.name)}
                      </span>
                    </div>
                  </div>

                  <button 
                    onClick={() => handleSubscribe()}
                    class="w-full mt-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white text-xs font-black uppercase tracking-widest rounded-lg transition-all transform active:scale-[0.98] shadow-lg shadow-blue-500/10"
                  >
                    {t('auth').sign_now}
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