import { load } from "@tauri-apps/plugin-store";
import { fetch } from "@tauri-apps/plugin-http";

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

  async loginWithPAT(token: string, organization: string): Promise<{ success: boolean; login?: string; display_name?: string }> {
      try {
          const cleanOrg = organization.trim();
          const credentials = btoa(`:${token.trim()}`);
          
          // Voltamos para a URL direta que funcionava, mas agora dinâmica!
          const url = `https://dev.azure.com/${cleanOrg}/_apis/projects?api-version=7.0`;

          // Usando o window.fetch nativo que herda o contexto correto da WebView
          const response = await window.fetch(url, {
              method: 'GET',
              headers: {
                  'Authorization': `Basic ${credentials}`,
                  'Accept': 'application/json',
                  'Cache-Control': 'no-cache' 
              }
          });

          if (response.ok) {
              const store = await getAuthStore();
              await store.set("azure_token", token.trim());
              await store.set("azure_org", cleanOrg); 
              await store.save();

              return {
                  success: true,
                  login: cleanOrg,
                  display_name: "Azure Developer" // Nome padrão amigável
              };
          }

          console.error("Erro na resposta do Azure DevOps:", response.status);
          return { success: false };
      } catch (error) {
          console.error("Falha ao validar PAT via Web API:", error);
          return { success: false };
      }
  },

  async getUserAvatar(token: string, organization: string): Promise<string | null> {
    try {
      const cleanOrg = organization.trim();
      const credentials = btoa(`:${token.trim()}`);
      const url = `https://dev.azure.com/${cleanOrg}/_apis/connectiondata?api-version=7.0`;

      const response = await window.fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Accept': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        return data.authenticatedUser?.imageUrl || null;
      }
      return null;
    } catch (error) {
      // Se der qualquer erro de CORS ou escopo no avatar, retorna null para usar o fallback local do projeto
      return null; 
    }
  },

  async logout() {
    const store = await getAuthStore();
    await store.delete("azure_token");
    await store.delete("azure_org");
    await store.save();
  }
};