import { createResource, Show } from "solid-js";
import { useApp } from "../../context/AppContext";
import { UserProfile } from "../../models/User.model";
import { authService } from "../../services/authService";

export default function ProfileModal() {
  const { t } = useApp();
  
  // Recupera o token do storage (ajuste conforme onde você salva)
  const token = () => localStorage.getItem("access_token") || "";

  // Tipamos o Resource: <TipoDoRetorno, TipoDoArgumento>
  const [profile] = createResource<UserProfile, string>(token, authService.getMyProfile);

  return (
    <div class="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-md">
      <h1 class="text-xl font-bold mb-4">{t('auth').user_profile}</h1>

      <Show when={!profile.loading} fallback={<p>Carregando...</p>}>
        <Show when={profile()} fallback={<p class="text-red-500">Erro ao carregar.</p>}>
          {/* Agora o TS sabe que profile() é UserProfile */}
          <div class="space-y-3">
            <div class="flex flex-col">
              <span class="text-[10px] font-bold text-gray-400 uppercase">{t('common').name}</span>
              <span class="text-sm dark:text-white">
                {profile()?.full_name || "N/A"}
              </span>
            </div>

            <div class="flex flex-col">
              <span class="text-[10px] font-bold text-gray-400 uppercase">{t('auth').email_label}</span>
              <span class="text-sm dark:text-white">{profile()?.email}</span>
            </div>

            <div class="flex items-center gap-2">
              <Show 
                when={profile()?.is_vip} 
                fallback={<span class="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">Free</span>}
              >
                <span class="text-xs bg-yellow-500/20 text-yellow-600 px-2 py-1 rounded font-bold">
                  👑 VIP
                </span>
              </Show>
            </div>
          </div>
        </Show>
      </Show>
    </div>
  );
}