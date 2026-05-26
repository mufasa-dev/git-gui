import { createResource, Show } from "solid-js";
import { useApp } from "../../context/AppContext";
import { authService } from "../../services/authService";
import PricingSection from "./PricingSection";

export default function ProfileModal() {
  const { t } = useApp();
  const token = () => authService.getToken() || "";

  // Recursos carregando em paralelo
  const [profile, { refetch: refetchProfile }] = createResource(token, authService.getMyProfile);
  const [license, { refetch: refetchLicense }] = createResource(token, authService.checkLicense);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div class="p-2">
      {/* Tratamento de erro unificado ou individual */}
      <Show when={!profile.error && !license.error} fallback={
        <div class="p-4 border border-red-200 bg-red-50 rounded text-center">
          <p class="text-red-500 text-sm font-medium">Erro ao carregar dados.</p>
          <button onClick={() => { refetchProfile(); refetchLicense(); }} class="mt-2 text-xs text-red-600 underline">
            {t('auth').try_again}
          </button>
        </div>
      }>
        
        <Show when={!profile.loading && !license.loading} fallback={<div class="animate-pulse p-10 text-center text-gray-400">{t('loading').loading}</div>}>
          
          {/* Header com Avatar */}
          <div class="flex flex-col items-center mb-6">
            <div class="w-16 h-16 bg-gradient-to-tr from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-lg mb-3">
              {profile()?.full_name?.substring(0, 2).toUpperCase() || "US"}
            </div>
            <h2 class="text-lg font-semibold dark:text-white">{profile()?.full_name}</h2>
            
            {/* Status Dinâmico baseado na Licença */}
            <div class="mt-1">
              <Show when={license()?.status === "active"} fallback={
                <Show when={license()?.status === "trialing" && !license()?.isExpired} fallback={
                  <span class="text-[10px] bg-red-500/10 text-red-500 border border-red-500/20 px-2 py-0.5 rounded-full font-bold">{t('auth').expired}</span>
                }>
                  <span class="text-[10px] bg-blue-500/10 text-blue-500 border border-blue-500/20 px-2 py-0.5 rounded-full font-bold uppercase">{t('auth').trialing}</span>
                </Show>
              }>
                <span class="text-[10px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded-full font-bold tracking-wider">✨ MEMBRO PRO</span>
              </Show>
            </div>
          </div>

          {/* Informações da Conta */}
          <div class="space-y-4 border-t border-slate-100 dark:border-slate-800 pt-4">
            <div class="flex justify-between items-center">
              <span class="text-xs font-medium text-slate-400 uppercase tracking-wider">{t('auth').email_label}</span>
              <span class="text-sm dark:text-slate-200">{profile()?.email}</span>
            </div>

            {/* Informações de Assinatura */}
            <div class="flex justify-between items-center">
              <span class="text-xs font-medium text-slate-400 uppercase tracking-wider">Status</span>
              <span class="text-sm font-medium dark:text-slate-200 capitalize">{license()?.message}</span>
            </div>

            <Show when={license()?.status === "trialing" && !license()?.isExpired}>
              <div class="flex justify-between items-center text-blue-500 bg-blue-500/5 p-2 rounded-md border border-blue-500/10">
                <span class="text-[10px] font-bold uppercase">{t('auth').expire_in}</span>
                <span class="text-xs font-bold">{formatDate(license()?.trialEndsAt)}</span>
              </div>
            </Show>

            <Show when={license()?.isExpired || (license()?.status === "trialing")}>
              <PricingSection userId={profile()?.id || ""} />
            </Show>

            <div class="flex justify-between items-center border-t border-slate-100 dark:border-slate-800 pt-3">
              <span class="text-xs font-medium text-slate-400 uppercase tracking-wider">{t('auth').user_since}</span>
              <span class="text-sm dark:text-slate-200">{formatDate(profile()?.created_at)}</span>
            </div>
          </div>
        </Show>
      </Show>
    </div>
  );
}