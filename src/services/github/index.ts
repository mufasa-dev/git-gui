import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import { listen } from "@tauri-apps/api/event";
import { load } from "@tauri-apps/plugin-store";
import { FOLLOWERS_QUERY, FOLLOWING_QUERY, GET_FILE_CONTENT_QUERY, GET_PR_CHECKS_QUERY, GET_PR_COMMITS_QUERY, GET_PR_FILES_QUERY, PR_DESCRIPTION_QUERY, PROFILE_GRAPHQL_QUERY, REPO_PULL_REQUESTS_QUERY } from "./queries";

const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = import.meta.env.VITE_GITHUB_CLIENT_SECRET;

async function getAuthStore() {
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
  
  async fetchGraphQL(query: string, variables: Record<string, any> = {}) {
    const token = await this.getToken();
    if (!token) return null;

    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) throw new Error("Erro na requisição GraphQL");
    const json = await res.json();
    return json.data;
  },

  async getFullUserData(username: string) {
    const token = await this.getToken();
    const headers = { Authorization: `Bearer ${token}` };

    try {
      // 1. GraphQL para Metadados e Calendário
      const gqlPromise = fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ 
          query: PROFILE_GRAPHQL_QUERY, 
          variables: { username } 
        }),
      }).then(res => res.json());

      // 2. REST para Organizações e README (Mais simples para esses casos específicos)
      const orgsPromise = fetch(`https://api.github.com/users/${username}/orgs`, { headers }).then(res => res.json());
      const readmePromise = fetch(`https://api.github.com/repos/${username}/${username}/contents/README.md`, {
        headers: { ...headers, Accept: "application/vnd.github.raw" }
      }).then(res => res.ok ? res.text() : null);

      const [gqlData, orgs, readme] = await Promise.all([gqlPromise, orgsPromise, readmePromise]);

      const user = gqlData.data.user;

      return {
        login: user.login,
        name: user.name,
        bio: user.bio,
        location: user.location,
        company: user.company,
        avatar_url: user.avatarUrl,
        followers: user.followers.totalCount,
        following: user.following.totalCount,
        calendar: user.contributionsCollection.contributionCalendar,
        orgs: Array.isArray(orgs) ? orgs : [],
        readme: readme, // Retorna o texto bruto do MD
      };
    } catch (e) {
      console.error("Erro ao consolidar perfil:", e);
      return null;
    }
  },

  async getUserRepositories() {
    const token = await this.getToken();
    const res = await fetch("https://api.github.com/user/repos?sort=updated&per_page=100", {
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.ok ? await res.json() : [];
  },

  async getFollowers(username: string, cursor: string | null = null) {
    try {
      const data = await this.fetchGraphQL(FOLLOWERS_QUERY, { username, cursor });
      return {
        users: data.user.followers.nodes,
        pageInfo: data.user.followers.pageInfo
      };
    } catch (e) {
      console.error("Erro ao buscar seguidores:", e);
      return { users: [], pageInfo: { hasNextPage: false } };
    }
  },

  async getFollowing(username: string, cursor: string | null = null) {
    try {
      const data = await this.fetchGraphQL(FOLLOWING_QUERY, { username, cursor });
      return {
        users: data.user.following.nodes,
        pageInfo: data.user.following.pageInfo
      };
    } catch (e) {
      console.error("Erro ao buscar seguindo:", e);
      return { users: [], pageInfo: { hasNextPage: false } };
    }
  },
  
  async getRepoPullRequests(owner: string, name: string, state: string) {
    const states = state === "MERGED" ? ["MERGED", "CLOSED"] : ["OPEN"];
    const data = await this.fetchGraphQL(REPO_PULL_REQUESTS_QUERY, { owner, name, states });
    return data.repository.pullRequests.nodes;
  },

  async getPullRequestDescription(owner: string, name: string, number: number) {
    const data = await this.fetchGraphQL(PR_DESCRIPTION_QUERY, { owner, name, number });
    return data.repository.pullRequest;
  },

  async getPRFiles(owner: string, name: string, number: number) {
    const res = await this.fetchGraphQL(GET_PR_FILES_QUERY, { owner, name, number });
    return res.repository.pullRequest.files.nodes;
  },

  async getFileContent(owner: string, name: string, expression: string) {
    const res = await this.fetchGraphQL(GET_FILE_CONTENT_QUERY, { owner, name, expression });
    return res.repository.object?.text;
  },

  async getPRFileDiff(owner: string, repo: string, prNumber: number) {
    const token = await this.getToken();
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3.diff',
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    if (!response.ok) throw new Error("Falha ao buscar diff do PR");
    return await response.text();
  },

  async getPRCommits(owner: string, name: string, number: number) {
    const data = await this.fetchGraphQL(GET_PR_COMMITS_QUERY, { owner, name, number });
    return data.repository.pullRequest.commits.nodes.map((n: any) => n.commit);
  },

  async getPRChecks(owner: string, name: string, number: number) {
    const data = await this.fetchGraphQL(GET_PR_CHECKS_QUERY, { owner, name, number });
    const commit = data.repository.pullRequest.commits.nodes[0]?.commit;
    return {
      state: commit?.statusCheckRollup?.state,
      contexts: commit?.statusCheckRollup?.contexts?.nodes || []
    };
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