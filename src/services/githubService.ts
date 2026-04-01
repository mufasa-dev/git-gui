import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import { listen } from "@tauri-apps/api/event";
import { load } from "@tauri-apps/plugin-store";

const GITHUB_CLIENT_ID = "Ov23liCQYZsoi4mj7n12";
// O Secret idealmente deve ficar apenas no Rust por segurança, 
// mas passaremos aqui se você optar por manter a lógica flexível no TS.
const GITHUB_CLIENT_SECRET = "2120c273cf18d94c05a2e36f736d44ab726803a6"; 

async function getAuthStore() {
  // 'auth.bin' é o nome do arquivo. O Tauri v2 gerencia o rid internamente com o objeto retornado por load()
  return await load("auth.bin");
}

export const githubService = {
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

      // No Tauri v2, às vezes o retorno é um objeto { value: ... } ou a string direta
      const tokenValue = typeof token === 'string' ? token : (token as any)?.value;

      if (!tokenValue) return null;

      const res = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${tokenValue}` }
      });

      return res.ok ? await res.json() : null;
    } catch (e) {
      console.error("Erro ao ler token", e);
      return null;
    }
  },

  async logout() {
    const store = await getAuthStore();
    await store.delete("github_token");
    await store.save();
    window.location.reload();
  }
};

listen("oauth-callback", (event) => {
  console.log("EVENTO OAUTH RECEBIDO NO FRONT:", event.payload);
});