import { createResource, Show } from "solid-js";
import { useApp } from "../../context/AppContext";
import { UserProfile } from "../../models/User.model";
import { authService } from "../../services/authService";

export default function ProfileModal() {
  const { t } = useApp();
  const token = () => authService.getToken() || "";
  const [profile, { refetch }] = createResource<UserProfile, string>(token, authService.getMyProfile);

  return (
    <div>
      {/* 1. Verifica se houve erro primeiro */}
      <Show when={!profile.error} fallback={
        <div class="p-4 border border-red-200 bg-red-50 rounded">
          <p class="text-red-500 text-sm font-medium">
            {profile.error.toString()}
          </p>
          <button 
            onClick={() => refetch()} 
            class="mt-2 text-xs text-red-600 underline"
          >
            Tentar novamente
          </button>
        </div>
      }>
      <Show when={!profile.loading} fallback={<p>{t('common').loading}</p>}>
        <Show when={profile()} fallback={<p class="text-red-500">Erro ao carregar.</p>}>
          {/* Agora o TS sabe que profile() é UserProfile */}
          <div class="p-2">
            <Show when={!profile.loading} fallback={<div class="animate-pulse flex space-x-4">...</div>}>
              <div class="flex flex-col items-center mb-6">
                {/* Avatar Circular com iniciais */}
                <div class="w-16 h-16 bg-gradient-to-tr from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-lg mb-3">
                  {profile()?.full_name?.substring(0, 2).toUpperCase() || "US"}
                </div>
                <h2 class="text-lg font-semibold dark:text-white">{profile()?.full_name}</h2>
                
                {/* Badge VIP/Free mais elegante */}
                <Show 
                  when={profile()?.is_vip} 
                  fallback={<span class="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full mt-1 border border-slate-200 dark:border-slate-700">Plano Free</span>}
                >
                  <span class="text-[10px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded-full mt-1 font-bold flex items-center gap-1">
                    ✨ MEMBRO VIP
                  </span>
                </Show>
              </div>

              <div class="space-y-4 border-t border-slate-100 dark:border-slate-800 pt-4">
                <div class="flex justify-between items-center">
                  <span class="text-xs font-medium text-slate-400 uppercase tracking-wider">{t('auth').email_label}</span>
                  <span class="text-sm dark:text-slate-200">{profile()?.email}</span>
                </div>

                <div class="flex justify-between items-center">
                  <span class="text-xs font-medium text-slate-400 uppercase tracking-wider">Membro desde</span>
                  <span class="text-sm dark:text-slate-200">
                    {profile()?.created_at ? new Date(profile()!.created_at).toLocaleDateString() : "-"}
                  </span>
                </div>
              </div>

              {/* Botão de Ação (Opcional) */}
              <button class="w-full mt-6 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-sm transition-colors">
                Editar Perfil
              </button>
            </Show>
          </div>
        </Show>
      </Show>
      </Show>
    </div>
  );
}