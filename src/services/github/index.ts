import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import { listen } from "@tauri-apps/api/event";
import { load } from "@tauri-apps/plugin-store";
import { ADD_PR_COMMENT, ADD_REACTION, APROVE_PR, DELETE_PR_COMMENT, FOLLOWERS_QUERY, FOLLOWING_QUERY, GET_FILE_CONTENT_QUERY, GET_PR_CHECKS_QUERY, GET_PR_COMMITS_QUERY, GET_PR_FILES_QUERY, GET_PR_TIMELINE_QUERY, HIDE_PR_COMMENT, MERGE_PR, PR_DESCRIPTION_QUERY, PROFILE_GRAPHQL_QUERY, REMOVE_REACTION, REPO_PULL_REQUESTS_QUERY } from "./queries";
import { PRValidationResult } from "../../models/PR.model";
import { WorkItem } from "../../models/WorkItem";

const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = import.meta.env.VITE_GITHUB_CLIENT_SECRET;

async function getAuthStore() {
  return await load("auth.bin");
}

export const githubService = {

  async getToken(): Promise<string | null> {
    try {
      const store = await getAuthStore();
      const tokenData = await store.get<any>("github_token");
      
      if (!tokenData) return null;
      
      const token = typeof tokenData === 'string' ? tokenData : tokenData.value;
      return token ? token.trim() : null;
    } catch (e) {
      return null;
    }
  },

  async login() {
    const rootUrl = `https://github.com/login/oauth/authorize`;
    const options = {
      client_id: GITHUB_CLIENT_ID,
      redirect_uri: "dev-brook://auth",
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

  async openInBrowser(username: string) {
    await open(`https://github.com/` + username);
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

  async getPRTimeline(owner: string, name: string, number: number) {
    const data = await this.fetchGraphQL(GET_PR_TIMELINE_QUERY, { owner, name, number });
    return data.repository.pullRequest.timelineItems.nodes;
  },

  async approvePullRequest(pullRequestId: string, body: string = "Approved via Dev Brook") {
    try {
      return await this.fetchGraphQL(APROVE_PR, { prId: pullRequestId, body });
    } catch (error) {
      console.error("Erro ao aprovar PR:", error);
      throw error;
    }
  },

  async mergePullRequest(pullRequestId: string) {
    try {
      return await this.fetchGraphQL(MERGE_PR, { prId: pullRequestId });
    } catch (error) {
      console.error("Erro ao fazer merge do PR:", error);
      throw error;
    }
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

  async addComment(prId: string, body: string) {
    return await this.fetchGraphQL(ADD_PR_COMMENT, { subjectId: prId, body });
  },

  async deleteComment(id: string) {
      return await this.fetchGraphQL(DELETE_PR_COMMENT, { id });
  },

  async addReaction(subjectId: string, content: string) {
    return await this.fetchGraphQL(ADD_REACTION, { subjectId, content });
  },

  async removeReaction(subjectId: string, content: string) {
    return await this.fetchGraphQL(REMOVE_REACTION, { subjectId, content });
  },

  async minimizeComment(subjectId: string, reason: string = "OUTDATED") {
    return await this.fetchGraphQL(HIDE_PR_COMMENT, { subjectId, reason });
  },

  async validatePullRequest(owner: string, repo: string, source: string, target: string): Promise<PRValidationResult> {
    try {
      const token = await this.getToken();
      if (!token) throw new Error("Token não encontrado");

      // 🎯 URL Oficial do GitHub para listar PRs abertos filtrando head e base
      // O GitHub espera o head no formato "owner:branch" ou apenas "branch"
      const prUrl = `https://api.github.com/repos/${owner}/${repo}/pulls?head=${encodeURIComponent(source)}&base=${encodeURIComponent(target)}&state=open`;

      const prResponse = await window.fetch(prUrl, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github.v3+json' }
      });

      if (!prResponse.ok) throw new Error(`Erro ao buscar PRs no GitHub: ${prResponse.status}`);
      const prsData = await prResponse.json();

      if (prsData && prsData.length > 0) {
        return {
          hasChanges: true,
          alreadyExists: true,
          existingPrId: prsData[0].number,
          commits: [],
          files: []
        };
      }

      // 🎯 URL Oficial do GitHub para comparar as duas branches (base...head)
      const compareUrl = `https://api.github.com/repos/${owner}/${repo}/compare/${encodeURIComponent(target)}...${encodeURIComponent(source)}`;

      const compareResponse = await window.fetch(compareUrl, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github.v3+json' }
      });

      if (!compareResponse.ok) throw new Error(`Erro ao comparar branches no GitHub: ${compareResponse.status}`);
      const compareData = await compareResponse.json();

      return {
        hasChanges: compareData.commits && compareData.commits.length > 0,
        alreadyExists: false,
        commits: (compareData.commits || []).map((c: any) => ({
          id: c.sha.substring(0, 7),
          message: c.commit.message.split('\n')[0],
          author: c.commit.author?.name || "Unknown"
        })),
        files: (compareData.files || []).map((f: any) => ({
          path: f.filename,
          status: f.status === "removed" ? "deleted" : f.status === "added" ? "added" : "modified"
        }))
      };

    } catch (error) {
      console.error("Erro na validação do GitHub Service:", error);
      throw error;
    }
  },

  async createPullRequest(
    owner: string,
    repo: string,
    data: {
      title: string;
      description: string;
      sourceBranch: string;
      targetBranch: string;
      reviewers: string[];
    }
  ): Promise<any> {
    try {
      const token = await this.getToken();
      if (!token) throw new Error("Token não encontrado");

      const url = `https://api.github.com/repos/${owner}/${repo}/pulls`;

      // 1. Cria o Pull Request básico
      const response = await window.fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: data.title,
          body: data.description,
          head: data.sourceBranch, // Origem
          base: data.targetBranch  // Destino
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erro ao criar Pull Request no GitHub (${response.status}): ${errorText}`);
      }

      const prResult = await response.json();

      // 2. Se houver revisores adicionados no formulário, associa-os ao PR recém-criado
      if (data.reviewers && data.reviewers.length > 0) {
        const reviewersUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${prResult.number}/requested_reviewers`;
        
        await window.fetch(reviewersUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            reviewers: data.reviewers // Array de logins do GitHub (ex: ["brunoribeiro96"])
          })
        });
      }

      return prResult;
    } catch (error) {
      console.error("Erro na service GitHub (createPullRequest):", error);
      throw error;
    }
  },

  async getUnifiedIssue(owner: string, repo: string, issueNumber: number): Promise<WorkItem> {
    const token = await this.getToken();
    if (!token) throw new Error("Token não encontrado");

    const response = await window.fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) throw new Error("Erro ao buscar issue no GitHub");
    const data = await response.json();

    return {
      id: data.id.toString(),
      number: data.number,
      title: data.title,
      description: data.body || "",
      state: data.state, // open ou closed
      stateColor: data.state === "open" ? "bg-green-500/10 text-green-500 border-green-500/20" : "bg-purple-500/10 text-purple-500 border-purple-500/20",
      provider: "github",
      author: {
        name: data.user?.login || "unknown",
        avatarUrl: data.user?.avatar_url
      },
      tags: [],
      comments: [], // Comentários serão buscados dinamicamente depois
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      htmlUrl: data.html_url,
      commentsCount: data.comments || 0,
      assignee: data.assignee ? { name: data.assignee.login, avatarUrl: data.assignee.avatar_url } : undefined
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