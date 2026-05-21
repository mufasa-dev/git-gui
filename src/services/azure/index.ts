import { open } from "@tauri-apps/plugin-shell";
import { load } from "@tauri-apps/plugin-store";

// Use o Client ID gerado no seu próprio Tenant da Azure
const AZURE_CLIENT_ID = import.meta.env.VITE_AZURE_CLIENT_ID; 
// Escopo fixo universal da API pública do Azure DevOps
const AZURE_SCOPE = "499b84ac-1321-427f-aa17-267ca6975798/.default offline_access";

async function getAuthStore() {
  return await load("auth.bin");
}

export const azureService = {
  async getToken(): Promise<string | null> {
    try {
      const store = await getAuthStore();
      const tokenData = await store.get<any>("azure_token");
      if (!tokenData) return null;
      return typeof tokenData === 'string' ? tokenData : tokenData.value;
    } catch {
      return null;
    }
  },

  // Passo 1 do Device Flow: Requisita os códigos de pareamento
  async requestDeviceCode() {
    const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/devicecode", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: AZURE_CLIENT_ID,
        scope: AZURE_SCOPE,
      }),
    });

    if (!res.ok) throw new Error("Falha ao obter código de dispositivo da Azure");
    return await res.json(); 
    // Retorna: { device_code, user_code, verification_uri, interval, expires_in }
  },

  // Passo 2 do Device Flow: Fica perguntando se o usuário já colou o código no navegador
  async pollForToken(deviceCode: string, interval: number): Promise<any> {
    return new Promise((resolve, reject) => {
      const checkToken = async () => {
        try {
          const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              grant_type: "urn:ietf:params:oauth:grant-type:device_code",
              client_id: AZURE_CLIENT_ID,
              device_code: deviceCode,
            }),
          });

          const data = await res.json();

          if (res.ok && data.access_token) {
            const store = await getAuthStore();
            await store.set("azure_token", data.access_token);
            await store.save();
            resolve(data);
          } else if (data.error === "authorization_pending") {
            // Usuário ainda não digitou. Tenta novamente após o intervalo definido
            setTimeout(checkToken, interval * 1000);
          } else {
            reject(new Error(data.error_description || "Erro na autenticação"));
          }
        } catch (err) {
          reject(err);
        }
      };

      // Inicia a primeira checagem
      setTimeout(checkToken, interval * 1000);
    });
  },

  async getCurrentUser() {
    const token = await this.getToken();
    if (!token) return null;

    // Rota da API de perfis do Azure DevOps
    const res = await fetch("https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.1", {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.ok) {
      const data = await res.json();
      return {
        login: data.emailAddress,
        name: data.displayName,
        avatar_url: `https://app.vssps.visualstudio.com/_apis/public/profile/profiles/${data.id}/avatar`,
        provider: 'azure'
      };
    }
    return null;
  },

  async logout() {
    const store = await getAuthStore();
    await store.delete("azure_token");
    await store.save();
  }
};