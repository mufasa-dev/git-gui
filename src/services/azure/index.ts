import { load } from "@tauri-apps/plugin-store";
import { fetch } from "@tauri-apps/plugin-http";
import { UnifiedPR } from "../../models/PR.model";

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
          
          const url = `https://dev.azure.com/${cleanOrg}/_apis/projects?api-version=7.0`;

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
                  display_name: "Azure Developer"
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
      return null; 
    }
  },

  async getUserProjects(): Promise<any[]> {
    try {
      const store = await getAuthStore();
      const token = await store.get<string>("azure_token");
      const org = await store.get<string>("azure_org");

      if (!token || !org) return [];

      const credentials = btoa(`:${token.trim()}`);
      const url = `https://dev.azure.com/${org}/_apis/projects?api-version=7.0`;

      const response = await window.fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Accept': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        return (data.value || []).map((proj: any) => ({
          id: proj.id,
          name: proj.name,
          description: proj.description || "Sem descrição disponível.",
          isProject: true
        }));
      }
      return [];
    } catch (error) {
      console.error("Falha ao buscar projetos do Azure:", error);
      return [];
    }
  },

  async getProjectRepositories(projectName: string): Promise<any[]> {
    try {
      const store = await getAuthStore();
      const token = await store.get<string>("azure_token");
      const org = await store.get<string>("azure_org");

      if (!token || !org) return [];

      const credentials = btoa(`:${token.trim()}`);
      const url = `https://dev.azure.com/${org}/${encodeURIComponent(projectName)}/_apis/git/repositories?api-version=7.0`;

      const response = await window.fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Accept': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        return (data.value || []).map((repo: any) => {
          let cleanUrl = repo.remoteUrl || "";
          if (cleanUrl.includes("@dev.azure.com")) {
            cleanUrl = cleanUrl.replace(/https:\/\/.*@dev\.azure\.com/, "https://dev.azure.com");
          }

          return {
            name: repo.name,
            description: ``,
            language: 'Azure Git',
            private: true,
            html_url: cleanUrl,
            updated_at: null
          };
        });
      }
      return [];
    } catch (error) {
      console.error(`Falha ao buscar repositórios do projeto ${projectName}:`, error);
      return [];
    }
  },

  async getRepoPullRequests(organization: string, repoName: string, state: string): Promise<UnifiedPR[]> {
    try {
      const token = await this.getToken();
      if (!token) return [];
      const credentials = btoa(`:${token.trim()}`);
      
      let statusParam = "active";
      if (state === "MERGED") statusParam = "completed";
      if (state === "CLOSED") statusParam = "abandoned";

      const url = `https://dev.azure.com/${organization}/${encodeURIComponent(repoName)}/_apis/git/repositories/${encodeURIComponent(repoName)}/pullrequests?searchCriteria.status=${statusParam}&api-version=7.0`;

      const response = await window.fetch(url, {
        headers: { 
          'Authorization': `Basic ${credentials}`, 
          'Accept': 'application/json' 
        }
      });

      if (!response.ok) {
        console.error("Erro na resposta do Azure:", response.status);
        return [];
      }
      
      const data = await response.json();

      return (data.value || []).map((pr: any) => ({
        id: pr.pullRequestId.toString(),
        number: pr.pullRequestId,
        title: pr.title,
        state: pr.status === 'active' ? 'OPEN' : (pr.status === 'completed' ? 'MERGED' : 'CLOSED'),
        createdAt: pr.creationDate,
        author: {
          login: pr.createdBy.uniqueName,
          name: pr.createdBy.displayName,
          avatarUrl: pr.createdBy._links?.avatar?.href || ""
        },
        headRefName: pr.sourceRefName.replace("refs/heads/", ""),
        baseRefName: pr.targetRefName.replace("refs/heads/", ""),
        comments: { totalCount: 0 }
      }));
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  async getPullRequestDescription(organization: string, repoName: string, prNumber: number): Promise<Partial<UnifiedPR & { mergeable: string, reviewers: any[] }>> {
    try {
      const token = await this.getToken();
      if (!token) return {};
      const credentials = btoa(`:${token.trim()}`);
      
      const url = `https://dev.azure.com/${organization}/${encodeURIComponent(repoName)}/_apis/git/repositories/${encodeURIComponent(repoName)}/pullrequests/${prNumber}?api-version=7.0`;
      
      const response = await window.fetch(url, {
        headers: { 'Authorization': `Basic ${credentials}`, 'Accept': 'application/json' }
      });

      if (!response.ok) {
        console.error("Erro ao buscar descrição do PR no Azure:", response.status);
        return {};
      }
      
      const pr = await response.json();

      const reviewers = (pr.reviewers || []).map((rev: any) => {
        let state = "PENDING";
        if (rev.vote === 10) state = "APPROVED";
        if (rev.vote === 5) state = "APPROVED";
        if (rev.vote === -5) state = "CHANGES_REQUESTED";
        if (rev.vote === -10) state = "CHANGES_REQUESTED";

        return {
          login: rev.uniqueName,
          name: rev.displayName,
          avatarUrl: rev._links?.avatar?.href || "",
          state: state
        };
      });

      return {
        mergeable: pr.mergeStatus === 'conflicts' ? 'CONFLICTING' : 'MERGEABLE',
        reviewers: reviewers
      } as any;
    } catch (e) {
      console.error(e);
      return {};
    }
  },

  async approvePullRequest(organization: string, repoName: string, prNumber: number): Promise<boolean> {
    const token = await this.getToken();
    if (!token) return false;
    const credentials = btoa(`:${token.trim()}`);
    
    const url = `https://dev.azure.com/${organization}/_apis/git/repositories/${repoName}/pullrequests/${prNumber}/reviewers/me?api-version=7.0`;
    const response = await window.fetch(url, {
      method: 'PUT',
      headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ vote: 10 })
    });
    return response.ok;
  },

  async mergePullRequest(organization: string, repoName: string, prNumber: number): Promise<boolean> {
    try {
      const token = await this.getToken();
      if (!token) return false;
      const credentials = btoa(`:${token.trim()}`);
      
      const url = `https://dev.azure.com/${organization}/${encodeURIComponent(repoName)}/_apis/git/repositories/${encodeURIComponent(repoName)}/pullrequests/${prNumber}?api-version=7.0`;
      
      console.log("Iniciando processo de Merge/Complete na Azure:", url);

      // Precisamos pegar o status atual para mandar o lastMergeSourceCommitId protetor
      const prRes = await window.fetch(url, { 
        headers: { 'Authorization': `Basic ${credentials}`, 'Accept': 'application/json' } 
      });
      
      if (!prRes.ok) {
        console.error("Erro ao obter metadados do PR para Merge:", prRes.status);
        return false;
      }

      const prData = await prRes.json();

      // Executa o PATCH enviando as opções de completude exigidas pela Azure
      const response = await window.fetch(url, {
        method: 'PATCH',
        headers: { 
          'Authorization': `Basic ${credentials}`, 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({
          status: "completed",
          completionOptions: {
            deleteSourceBranch: false,
            mergeCommitMessage: `Merged via Dev Brook - PR #${prNumber}`,
            squashMerge: false
          },
          lastMergeSourceCommitId: prData.lastMergeSourceCommitId
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Erro ao fechar/completar o PR na Azure:", errorData.message || response.statusText);
        return false;
      }

      return response.ok;
    } catch (error) {
      console.error("Falha catastrófica ao executar merge na Azure:", error);
      return false;
    }
  },

  // Busca todas as Threads de Comentários do PR da Azure
  async getPRThreads(organization: string, repoName: string, prNumber: number): Promise<any[]> {
    try {
      const token = await this.getToken();
      if (!token) return [];
      const credentials = btoa(`:${token.trim()}`);

      const url = `https://dev.azure.com/${organization}/${encodeURIComponent(repoName)}/_apis/git/repositories/${encodeURIComponent(repoName)}/pullRequests/${prNumber}/threads?api-version=7.0`;

      const response = await window.fetch(url, {
        method: "GET",
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) return [];
      const data = await response.json();
      return data.value || [];
    } catch (error) {
      console.error("Erro ao buscar threads da Azure:", error);
      return [];
    }
  },

  // Cria um novo comentário (Nova Thread) no PR do Azure
  async addPRComment(organization: string, repoName: string, prNumber: number, text: string): Promise<boolean> {
    try {
      const token = await this.getToken();
      if (!token) return false;
      const credentials = btoa(`:${token.trim()}`);

      const url = `https://dev.azure.com/${organization}/${encodeURIComponent(repoName)}/_apis/git/repositories/${encodeURIComponent(repoName)}/pullRequests/${prNumber}/threads?api-version=7.0`;

      const response = await window.fetch(url, {
        method: "POST",
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          comments: [
            {
              parentCommentId: 0,
              content: text,
              commentType: "text"
            }
          ],
          status: "active"
        })
      });

      return response.ok;
    } catch (error) {
      console.error("Erro ao salvar comentário na Azure:", error);
      return false;
    }
  },

  // Deleta/Remove um comentário existente na Azure
  // Nota: Na Azure, os comentários pertencem a uma thread. Passamos o prNumber e o commentId enviado pelo normalizador.
  async deletePRComment(organization: string, repoName: string, prNumber: number, commentId: string): Promise<boolean> {
    try {
      const token = await this.getToken();
      if (!token) return false;
      const credentials = btoa(`:${token.trim()}`);

      // Para deletar sem precisar reconstruir a árvore de threads na UI, a REST API do Azure 
      // permite atualizar o status do comentário para "deleted" (Soft Delete nativo da Azure)
      // ou remover diretamente se mapearmos a rota exata. Vamos atualizar a propriedade de deleção.
      const threadsUrl = `https://dev.azure.com/${organization}/${encodeURIComponent(repoName)}/_apis/git/repositories/${encodeURIComponent(repoName)}/pullRequests/${prNumber}/threads?api-version=7.0`;
      
      const threadsRes = await window.fetch(threadsUrl, { headers: { 'Authorization': `Basic ${credentials}` } });
      const threadsData = await threadsRes.json();

      // Encontra qual thread possui o ID do comentário desejado
      let targetThreadId: number | null = null;
      (threadsData.value || []).forEach((t: any) => {
        if (t.comments?.some((c: any) => c.id.toString() === commentId)) {
          targetThreadId = t.id;
        }
      });

      if (targetThreadId === null) return false;

      const deleteUrl = `https://dev.azure.com/${organization}/${encodeURIComponent(repoName)}/_apis/git/repositories/${encodeURIComponent(repoName)}/pullRequests/${prNumber}/threads/${targetThreadId}/comments/${commentId}?api-version=7.0`;

      const response = await window.fetch(deleteUrl, {
        method: "DELETE",
        headers: {
          'Authorization': `Basic ${credentials}`
        }
      });

      return response.ok;
    } catch (error) {
      console.error("Erro ao deletar comentário na Azure:", error);
      return false;
    }
  },

  async getPRChanges(organization: string, repoName: string, prNumber: number): Promise<any[]> {
    try {
      const token = await this.getToken();
      if (!token) return [];
      const credentials = btoa(`:${token.trim()}`);

      // Rota oficial da Azure para pegar as mudanças da iteração 1 do PR
      const url = `https://dev.azure.com/${organization}/${encodeURIComponent(repoName)}/_apis/git/repositories/${encodeURIComponent(repoName)}/pullRequests/${prNumber}/iterations/1/changes?api-version=7.0`;

      console.log("Chamando URL CORRETA de Iterations/Changes:", url);

      const response = await window.fetch(url, {
        headers: { 
          'Authorization': `Basic ${credentials}`, 
          'Accept': 'application/json' 
        }
      });

      if (!response.ok) {
        console.error("Erro ao buscar alterações na Azure:", response.status, response.statusText);
        return [];
      }
      
      const data = await response.json();

      // No controller de iterações, a Azure retorna um array chamado 'changeEntries'
      return (data.changeEntries || []).map((entry: any) => {
        const path = entry.item?.path || "";
        return {
          // Remove a barra inicial caso exista para manter compatibilidade com seu FileIcon
          path: path.startsWith('/') ? path.substring(1) : path, 
          // Mapeia o peso visual aproximado pelas flags da Azure
          additions: entry.changeType === 'add' || entry.changeType === 'edit' ? 1 : 0,
          deletions: entry.changeType === 'delete' || entry.changeType === 'edit' ? 1 : 0
        };
      });
    } catch (error) {
      console.error("Erro ao carregar arquivos alterados da Azure:", error);
      return [];
    }
  },

  // Baixa os blocos de conteúdo e formata como uma string Unified Diff padrão do Git
  async getPRFileDiffText(organization: string, repoName: string, prNumber: number, filePath: string): Promise<string> {
    try {
      const token = await this.getToken();
      if (!token) return "";
      const credentials = btoa(`:${token.trim()}`);

      // 1. Buscamos a iteração para pegar o ID exato do Commit correspondente a este PR
      const iterationUrl = `https://dev.azure.com/${organization}/${encodeURIComponent(repoName)}/_apis/git/repositories/${encodeURIComponent(repoName)}/pullRequests/${prNumber}/iterations/1?api-version=7.0`;

      const iterationResponse = await window.fetch(iterationUrl, {
        headers: { 'Authorization': `Basic ${credentials}`, 'Accept': 'application/json' }
      });

      if (!iterationResponse.ok) {
        console.error("Erro ao buscar dados da iteração na Azure:", iterationResponse.status);
        return "";
      }
      
      const iterationData = await iterationResponse.json();
      
      // Captura o hash do commit gerado na iteração do PR (ex: "60e7a06576c88...")
      const commitId = iterationData.sourceRefCommit?.commitId;
      if (!commitId) {
        console.error("Não foi possível encontrar o Commit ID da iteração.");
        return "";
      }

      // 2. Agora batemos na API de Items montando a URL do zero de forma limpa,
      // apontando cirurgicamente para o Commit onde o arquivo foi adicionado/alterado
      const cleanedPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
      const itemUrl = `https://dev.azure.com/${organization}/${encodeURIComponent(repoName)}/_apis/git/repositories/${encodeURIComponent(repoName)}/items?path=${encodeURIComponent(cleanedPath)}&versionDescriptor.versionType=commit&versionDescriptor.version=${commitId}&includeContent=true&api-version=7.0`;

      console.log("Buscando arquivo de forma limpa via Commit ID:", itemUrl);

      const contentResponse = await window.fetch(itemUrl, {
        headers: { 'Authorization': `Basic ${credentials}` }
      });

      if (!contentResponse.ok) {
        console.error("Erro ao baixar conteúdo do arquivo por Commit na Azure:", contentResponse.status);
        return "";
      }

      const contentText = await contentResponse.text();

      // Monta o cabeçalho fake de diff unificado para o seu DiffViewer
      return [
        `diff --git a/${filePath} b/${filePath}`,
        `new file mode 100644`,
        `--- a/${filePath}`,
        `+++ b/${filePath}`,
        `@@ -0,0 +1,1 @@`,
        contentText.split('\n').map(line => `+${line}`).join('\n')
      ].join('\n');

    } catch (error) {
      console.error("Erro ao estruturar bloco diff na Azure:", error);
      return "";
    }
  },

  async getPRCommits(organization: string, repoName: string, prNumber: number): Promise<any[]> {
    try {
      const token = await this.getToken();
      if (!token) return [];
      const credentials = btoa(`:${token.trim()}`);

      const url = `https://dev.azure.com/${organization}/${encodeURIComponent(repoName)}/_apis/git/repositories/${encodeURIComponent(repoName)}/pullRequests/${prNumber}/commits?api-version=7.0`;

      const response = await window.fetch(url, {
        headers: { 
          'Authorization': `Basic ${credentials}`, 
          'Accept': 'application/json' 
        }
      });

      if (!response.ok) {
        console.error("Erro ao carregar commits do PR na Azure:", response.status);
        return [];
      }

      const data = await response.json();

      return (data.value || []).map((c: any) => {
        const authorName = c.author?.name || "Azure Developer";
        const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(authorName)}&background=0D8ABC&color=fff`;

        return {
          oid: c.commitId,
          abbreviatedOid: c.commitId ? c.commitId.substring(0, 7) : "",
          message: c.comment || "",
          committedDate: c.author?.date || new Date().toISOString(),
          author: {
            name: authorName,
            avatarUrl: fallbackAvatar,
            user: {
              login: c.author?.email || authorName
            }
          }
        };
      });
    } catch (error) {
      console.error("Erro ao buscar commits na Azure:", error);
      return [];
    }
  },

  // Votar/Dar feedback no Pull Request (Aprove, Reject, etc)
  async votePullRequest(organization: string, repoName: string, prNumber: number, voteValue: number): Promise<any> {
    try {
      const token = await this.getToken();
      if (!token) return null;
      const credentials = btoa(`:${token.trim()}`);

      const connectionUrl = `https://dev.azure.com/${organization}/_apis/connectionData?api-version=7.0-preview`;
      
      console.log("Buscando dados de conexão em:", connectionUrl);
      
      const connResponse = await window.fetch(connectionUrl, {
        headers: { 'Authorization': `Basic ${credentials}`, 'Accept': 'application/json' }
      });

      if (!connResponse.ok) {
        throw new Error("Não foi possível determinar a identidade do usuário logado na Azure.");
      }

      const connData = await connResponse.json();
      const userUniqueId = connData.authenticatedUser?.id;

      if (!userUniqueId) {
        throw new Error("GUID do usuário não encontrado nos dados de conexão.");
      }

      const url = `https://dev.azure.com/${organization}/${encodeURIComponent(repoName)}/_apis/git/repositories/${encodeURIComponent(repoName)}/pullRequests/${prNumber}/reviewers/${userUniqueId}?api-version=7.0`;

      console.log(`Enviando voto (${voteValue}) para o revisor GUID: ${userUniqueId}`);

      const response = await window.fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          vote: voteValue
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Erro HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Erro na service Azure (votePullRequest):", error);
      throw error;
    }
  },

  // Abandonar Pull Request (Abandon)
  async abandonPullRequest(organization: string, repoName: string, prNumber: number): Promise<any> {
    try {
      const token = await this.getToken();
      if (!token) return null;
      const credentials = btoa(`:${token.trim()}`);

      const url = `https://dev.azure.com/${organization}/${encodeURIComponent(repoName)}/_apis/git/repositories/${encodeURIComponent(repoName)}/pullRequests/${prNumber}?api-version=7.0`;

      const response = await window.fetch(url, {
        method: 'PATCH',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: 'abandoned' // Altera o status do PR para abandonado
        })
      });

      if (!response.ok) {
        throw new Error(`Erro ao abandonar PR: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Erro na service Azure (abandonPullRequest):", error);
      throw error;
    }
  },

  // Transformar em Draft ou reativar PR
  async updatePullRequestStatus(organization: string, repoName: string, prNumber: number, isDraft: boolean): Promise<any> {
    try {
      const token = await this.getToken();
      if (!token) return null;
      const credentials = btoa(`:${token.trim()}`);

      const url = `https://dev.azure.com/${organization}/${encodeURIComponent(repoName)}/_apis/git/repositories/${encodeURIComponent(repoName)}/pullRequests/${prNumber}?api-version=7.0`;

      const response = await window.fetch(url, {
        method: 'PATCH',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          isDraft: isDraft // true para transformar em rascunho, false para publicar
        })
      });

      if (!response.ok) {
        throw new Error(`Erro ao alterar propriedade Draft do PR: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Erro na service Azure (updatePullRequestStatus):", error);
      throw error;
    }
  },

  async logout() {
    const store = await getAuthStore();
    await store.delete("azure_token");
    await store.delete("azure_org");
    await store.save();
  }
};