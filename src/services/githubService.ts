import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import { listen } from "@tauri-apps/api/event";
import { load } from "@tauri-apps/plugin-store";

const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = import.meta.env.VITE_GITHUB_CLIENT_SECRET;

async function getAuthStore() {
  // 'auth.bin' é o nome do arquivo. O Tauri v2 gerencia o rid internamente com o objeto retornado por load()
  return await load("auth.bin");
}

export const githubService = {

  async getToken(): Promise<string | null> {
    try {
      const store = await getAuthStore();
      const token = await store.get<any>("github_token");
      
      if (!token) return null;
      return typeof token === 'string' ? token : token.value;
    } catch (e) {
      return null;
    }
  },

  async login() {
    const rootUrl = `https://github.com/login/oauth/authorize`;
    const options = {
      client_id: GITHUB_CLIENT_ID,
      redirect_uri: "git-trident://auth",
      scope: "repo user",
    };

    const qs = new URLSearchParams(options);
    await open(`${rootUrl}?${qs.toString()}`);

    return new Promise((resolve, reject) => {
      const unlisten = listen("oauth-callback", async (event: any) => {
        const url = event.payload as string;
        const code = new URL(url).searchParams.get("code");

        if (code) {
          try {
            const result: any = await invoke("exchange_code_for_token", {
              code,
              clientId: GITHUB_CLIENT_ID,
              clientSecret: GITHUB_CLIENT_SECRET
            });
            
            // USO CORRETO DO STORE NA V2:
            const store = await getAuthStore();
            await store.set("github_token", result.token);
            await store.save(); // Importante salvar no disco!
            
            resolve(result);
          } catch (err) {
            reject(err);
          }
        }
        unlisten.then(f => f());
      });
    });
  },

  async getCurrentUser() {
    try {
      const store = await getAuthStore();
      const token = await store.get<{ value: string }>("github_token");

      const tokenValue = typeof token === 'string' ? token : (token as any)?.value;

      if (!tokenValue) return null;

      const res = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${tokenValue}` }
      });

      if (res.ok) {
          const data = await res.json();
          return { 
              ...data, 
              provider: 'github' 
          };
      }
      
      return null;
    } catch (e) {
      console.error("Erro ao ler token", e);
      return null;
    }
  },
  
  async getExtraProfileData(username: string) {
    const token = await this.getToken(); // Sua lógica de pegar o token
    const headers = { Authorization: `Bearer ${token}` };

    const [orgsRes, readmeRes] = await Promise.all([
      fetch(`https://api.github.com/users/${username}/orgs`, { headers }),
      // O README geralmente fica no repositório com o mesmo nome do usuário
      fetch(`https://api.github.com/repos/${username}/${username}/contents/README.md`, { 
        headers: { ...headers, Accept: "application/vnd.github.raw" } 
      })
    ]);

    return {
      orgs: orgsRes.ok ? await orgsRes.json() : [],
      readme: readmeRes.ok ? await readmeRes.text() : null
    };
  },

  async getUserRepositories() {
    const token = await this.getToken();
    if (!token) return [];

    try {
      const res = await fetch("https://api.github.com/user/repos?sort=updated&per_page=100", {
        headers: { 
          Authorization: `Bearer ${token}`,
          "Accept": "application/vnd.github.v3+json"
        }
      });

      if (!res.ok) throw new Error("Falha ao buscar repositórios");
      
      const data = await res.json();
      return data.map((repo: any) => ({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        html_url: repo.html_url,
        private: repo.private,
        description: repo.description,
        language: repo.language,
        stargazers_count: repo.stargazers_count,
        updated_at: repo.updated_at, 
      }));
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  async logout() {
    const store = await getAuthStore();
    await store.delete("github_token");
    await store.save();
  }
};

listen("oauth-callback", (event) => {
  console.log("EVENTO OAUTH RECEBIDO NO FRONT:", event.payload);
});