import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import { listen } from "@tauri-apps/api/event";
import { load } from "@tauri-apps/plugin-store";
import { ADD_PR_COMMENT, ADD_REACTION, APROVE_PR, DELETE_PR_COMMENT, FOLLOWERS_QUERY, FOLLOWING_QUERY, GET_FILE_CONTENT_QUERY, GET_PR_CHECKS_QUERY, GET_PR_COMMITS_QUERY, GET_PR_FILES_QUERY, GET_PR_TIMELINE_QUERY, HIDE_PR_COMMENT, MERGE_PR, PR_DESCRIPTION_QUERY, PROFILE_GRAPHQL_QUERY, REMOVE_REACTION, REPO_PULL_REQUESTS_QUERY } from "./queries";
import { PRValidationResult } from "../../models/PR.model";
import { CardComment, WorkItem } from "../../models/WorkItem";

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

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    };

    try {
      const [issueRes, timelineRes] = await Promise.all([
        window.fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`, { headers }),
        window.fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/timeline`, { headers })
      ]);

      if (!issueRes.ok) throw new Error("Erro ao buscar issue no GitHub");
      
      const data = await issueRes.json();
      let timelineData: Array<any> = [];
      if (timelineRes.ok) timelineData = await timelineRes.json();
      console.log('data', data)
      const tags = (data.labels || []).map((label: any) => label.name);
      const relatedReferences: Array<{ id: string; type: "Parent" | "Child" }> = [];
      const commitsHashes: string[] = [];

      if (data.sub_issues_summary && data.sub_issues_summary.total > 0) {
        try {
          const subIssuesRes = await window.fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/sub_issues`, { headers });
          if (subIssuesRes.ok) {
            const subIssuesData = await subIssuesRes.json();
            // subIssuesData é um array contendo as issues filhas conectadas
            (subIssuesData || []).forEach((sub: any) => {
              const subId = sub.number?.toString();
              if (subId && !relatedReferences.some(r => r.id === subId)) {
                relatedReferences.push({ id: subId, type: "Child" });
              }
            });
          }
        } catch (subErr) {
          console.warn("Erro ao buscar sub_issues dedicado no GitHub:", subErr);
        }
      }

      // 🎯 3. CAPTURA DIRETA DO PARENT (Se este card for o filho)
      if (data.parent_issue_url) {
        const parentId = data.parent_issue_url.split("/").pop();
        if (parentId && !isNaN(Number(parentId))) {
          relatedReferences.push({ id: parentId, type: "Parent" });
        }
      }

      // 🎯 4. VARRENDO A TIMELINE PARA COMMITS E INTERCONEXÕES ADICIONAIS
      timelineData.forEach((event: any) => {
        if (event.event === "referenced" && event.commit_id) {
          if (!commitsHashes.includes(event.commit_id)) {
            commitsHashes.push(event.commit_id);
          }
        }

        // Casos alternativos de parent adicionado via log
        if (event.event === "parent_issue_added" && event.parent_issue) {
          const parentId = event.parent_issue.number?.toString();
          if (parentId && !relatedReferences.some(r => r.id === parentId)) {
            relatedReferences.push({ id: parentId, type: "Parent" });
          }
        }

        // Links cruzados entre repositórios/mencionados por fora
        if (event.event === "cross-referenced" && event.source?.issue) {
          const linkedId = event.source.issue.number.toString();
          if (linkedId !== issueNumber.toString()) {
            if (!relatedReferences.some(r => r.id === linkedId)) {
              relatedReferences.push({ id: linkedId, type: "Child" });
            }
          }
        }
      });

      // Fallback clássico por texto no body (Markdown checklists)
      const bodyText = data.body || "";
      const childRegex = /(?:-\s*\[[x\s]\]\s*#(\d+))/gi;
      let match: any;
      while ((match = childRegex.exec(bodyText)) !== null) {
        if (match[1] && !relatedReferences.some(r => r.id === match[1])) {
          relatedReferences.push({ id: match[1], type: "Child" });
        }
      }

      const state = data.state; 
      const stateColor = state === "open" ? "bg-green-500/10 text-green-500 border-green-500/20" : "bg-purple-500/10 text-purple-500 border-purple-500/20";

      const comments = await this.getGitHubComments(owner, repo, issueNumber);

      return {
        id: data.id.toString(),
        number: data.number,
        title: data.title,
        description: bodyText,
        state: state === "open" ? "Active" : "Done",
        stateColor: stateColor,
        provider: "github",
        tags: tags,
        comments: comments, 
        tasksReferences: relatedReferences.filter(r => r.type === "Child").map(r => r.id),
        relatedReferences: relatedReferences, 
        commitsReferences: commitsHashes,
        priority: undefined,
        effort: undefined,
        areaPath: repo,
        iterationPath: data.milestone ? data.milestone.title : "No Milestone",
        author: {
          name: data.user?.login || "unknown",
          email: '',
          avatarUrl: data.user?.avatar_url
        },
        subIssues: {
          total: data.sub_issues_summary?.total || 0,
          completed: data.sub_issues_summary?.completed || 0,
          percent: data.sub_issues_summary?.percent_completed || 0
        },
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        htmlUrl: data.html_url,
        commentsCount: data.comments || 0,
        assignee: data.assignee ? { 
          name: data.assignee.login, 
          avatarUrl: data.assignee.avatar_url 
        } : undefined
      };
    } catch (error) {
      console.error("Erro ao unificar dados do GitHub:", error);
      throw error;
    }
  },

  async getIssueHistory(owner: string, repo: string, issueNumber: number): Promise<Array<any>> {
    const token = await this.getToken();
    if (!token) return [];

    const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/timeline`;

    try {
      const response = await window.fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) return [];
      const timelineData = await response.json();
      console.log('timeline', timelineData)
      // Mapeia os eventos do GitHub para o padrão estruturado da Azure
      const mappedUpdates = timelineData
        .map((event: any, index: number) => {
          const cleanedChanges: Array<{ type: string; field: string; value: any }> = [];
          
          // Captura do usuário que realizou a ação
          const actor = event.actor || event.user;
          const userName = actor?.login || "Sistema";
          const userAvatar = actor?.avatar_url || null;
          const eventDate = new Date(event.created_at || event.updated_at || new Date());

          // 🎯 1. MAPEAMENTO DE ALTERAÇÃO DE ESTADO
          if (event.event === "closed") {
            cleanedChanges.push({ type: "state", field: "State", value: "Closed" });
          } else if (event.event === "reopened") {
            cleanedChanges.push({ type: "state", field: "State", value: "Open" });
          }

          // 🎯 2. MAPEAMENTO DE ATRIBUIÇÃO (Assignee)
          else if (event.event === "assigned") {
            cleanedChanges.push({ type: "assignee", field: "Assigned_To", value: event.assignee?.login || "Ninguém" });
          }

          // 🎯 3. MAPEAMENTO DE TAGS (Labels)
          else if (event.event === "labeled") {
            cleanedChanges.push({ type: "tags", field: "Tags", value: event.label?.name || "" });
          }

          // 🎯 4. MAPEAMENTO DE COMENTÁRIOS
          else if (event.event === "commented") {
            cleanedChanges.push({ type: "comment", field: "Comment", value: event.body || "" });
          }

          // 🎯 5. MAPEAMENTO DE COMMITS VINCULADOS
          else if (event.event === "referenced" && event.commit_id) {
            const shortHash = event.commit_id.substring(0, 7);
            cleanedChanges.push({
              type: "commit_link",
              field: "Links",
              value: {
                id: shortHash,
                fullHash: event.commit_id,
                title: ""
              }
            });
          }

          // 🎯 6. MAPEAMENTO DE RELACIONAMENTOS (Parent / Child)
          else if (event.event === "parent_issue_added") {
            const parentId = event.parent_issue?.number?.toString() || "ID";
            cleanedChanges.push({
              type: "task_link",
              field: "Tasks_Links",
              value: {
                id: parentId,
                title: ""
              }
            });
          }

          // Ignora eventos puramente internos do GitHub que não geram mudanças visuais na UI
          if (cleanedChanges.length === 0) return null;

          // 🎯 7. GERAÇÃO INTELIGENTE DAS CHAVES DE TRADUÇÃO (Igual à Azure)
          let eventKey = "board.changed_to";
          let eventParams: any = {};
          
          const primary = cleanedChanges[0];
          if (primary.type === "state") {
            eventKey = "board.changed_state";
            eventParams = { value: primary.value };
          } else if (primary.type === "tags") {
            eventKey = "board.changed_tag";
          } else if (primary.type === "comment") {
            eventKey = "board.added_comment";
          } else if (primary.type === "commit_link") {
            eventKey = "board.linked_commit";
          } else if (primary.type === "task_link") {
            eventKey = "board.added_link_child";
          } else if (primary.type === "assignee") {
            eventKey = "board.assigned_to";
            eventParams = { user: primary.value };
          }

          return {
            id: event.id || `gh-${index}`,
            rev: index + 1,
            user: userName,
            avatar: userAvatar,
            date: eventDate,
            translation: {
              key: eventKey,
              params: eventParams
            },
            changes: cleanedChanges
          };
        })
        .filter(Boolean); // Remove os eventos ignorados (null)

      console.log("Histórico de atualizações mapeado do GitHub:", mappedUpdates);
      
      // Inverte a ordem para deixar os eventos mais recentes no topo
      return mappedUpdates.reverse();
    } catch (error) {
      console.error("Erro no parse do histórico do GitHub:", error);
      return [];
    }
  },

  async getCommitDetails(owner: string, repo: string, commitHash: string): Promise<{ id: string, message: string }> {
    const token = await this.getToken();
    if (!token) return { id: commitHash, message: "Mudança vinculada no GitHub" };

    const url = `https://api.github.com/repos/${owner}/${repo}/commits/${commitHash}`;

    try {
      const response = await window.fetch(url, {
        headers: { 
          'Authorization': `Bearer ${token}`, 
          'Accept': 'application/vnd.github.v3+json' 
        }
      });
      if (!response.ok) return { id: commitHash, message: "Mudança vinculada no GitHub" };
      const data = await response.json();
      
      return {
        id: commitHash,
        message: data.commit?.message || "Commit associado"
      };
    } catch {
      return { id: commitHash, message: "Mudança vinculada no GitHub" };
    }
  },

  async getTasksDetails(owner: string, repo: string, ids: string[]): Promise<Array<{ id: string, title: string }>> {
    if (!ids || ids.length === 0) return [];
    const token = await this.getToken();
    if (!token) return [];

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    };

    try {
      const promises = ids.map(async (id) => {
        try {
          const response = await window.fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${id}`, { headers });
          if (!response.ok) return null;
          
          const data = await response.json();
          return {
            id: id.toString(),
            title: data.title || "Sub-task sem título"
          };
        } catch {
          return null;
        }
      });

      const results = await Promise.all(promises);
      
      return results.filter((item): item is { id: string; title: string } => item !== null);
    } catch (error) {
      console.error("Erro ao buscar detalhes das tasks no GitHub:", error);
      return [];
    }
  },

  async getGitHubComments(owner: string, repo: string, issueNumber: number): Promise<CardComment[]> {
    const token = await this.getToken();
    if (!token) return [];

    const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`;

    try {
      const response = await window.fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) return [];
      const data = await response.json();

      // Mapeia os dados exatamente para o mesmo formato CardComment da Azure
      return (data || []).map((c: any) => ({
        id: c.id,
        author: {
          name: c.user?.login || "GitHub User",
          avatarUrl: c.user?.avatar_url
        },
        text: c.body || "", // O GitHub devolve o corpo em Markdown/texto no campo 'body'
        createdAt: c.created_at
      }));
    } catch {
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