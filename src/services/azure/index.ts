import { load } from "@tauri-apps/plugin-store";
import { fetch } from "@tauri-apps/plugin-http";
import { PRValidationResult, UnifiedPR } from "../../models/PR.model";
import { CardComment, WorkItem } from "../../models/WorkItem";

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
      if (state === "ABANDONED" || state === "CLOSED") statusParam = "abandoned";

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
        state: pr.status === 'active' ? 'OPEN' : (pr.status === 'completed' ? 'MERGED' : 'ABANDONED'),
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

  async addPRCommentLike(organization: string, repoName: string, prNumber: number, threadId: string, commentId: string): Promise<boolean> {
    try {
      const token = await this.getToken();
      if (!token) return false;
      const credentials = btoa(`:${token.trim()}`);

      // Rota de POST para registrar o Like do usuário autenticado
      const url = `https://dev.azure.com/${organization}/${encodeURIComponent(repoName)}/_apis/git/repositories/${encodeURIComponent(repoName)}/pullRequests/${prNumber}/threads/${threadId}/comments/${commentId}/likes?api-version=7.0`;

      const response = await window.fetch(url, {
        method: "POST",
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json'
        }
      });

      return response.ok;
    } catch (error) {
      console.error(`Erro ao adicionar Like no comentário ${commentId} da thread ${threadId}:`, error);
      return false;
    }
  },

  async removePRCommentLike(organization: string, repoName: string, prNumber: number, threadId: string, commentId: string): Promise<boolean> {
      try {
        const token = await this.getToken();
        if (!token) return false;
        const credentials = btoa(`:${token.trim()}`);

        // Rota de DELETE para remover o Like do usuário autenticado
        const url = `https://dev.azure.com/${organization}/${encodeURIComponent(repoName)}/_apis/git/repositories/${encodeURIComponent(repoName)}/pullRequests/${prNumber}/threads/${threadId}/comments/${commentId}/likes?api-version=7.0`;

        const response = await window.fetch(url, {
          method: "DELETE",
          headers: {
            'Authorization': `Basic ${credentials}`
          }
        });

        return response.ok;
      } catch (error) {
        console.error(`Erro ao remover Like no comentário ${commentId} da thread ${threadId}:`, error);
        return false;
      }
  },

  async getFileContent(organization: string, repoName: string, filePath: string, version: string): Promise<string> {
    try {
        const token = await this.getToken();
        if (!token) return "";
        const credentials = btoa(`:${token.trim()}`);

        const cleanPath = filePath.replace(/^\//, '');
        const url = `https://dev.azure.com/${organization}/${encodeURIComponent(repoName)}/_apis/git/repositories/${encodeURIComponent(repoName)}/items?path=${encodeURIComponent(cleanPath)}&versionDescriptor.version=${encodeURIComponent(version)}&versionDescriptor.versionType=branch&$format=text&api-version=7.0`;

        const response = await window.fetch(url, {
            method: "GET",
            headers: {
                'Authorization': `Basic ${credentials}`
            }
        });

        if (!response.ok) return "";
        
        const rawText = await response.text();
        
        if (rawText.startsWith('"')) {
            try {
                return JSON.parse(rawText);
            } catch {
                return rawText;
            }
        }
        
        return rawText;
    } catch (error) {
        console.error("Erro ao buscar conteúdo do arquivo:", error);
        return "";
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

  async mergePullRequest(
    organization: string, 
    repoName: string, 
    prNumber: number,
    options: { mergeStrategy: string; deleteSourceBranch: boolean; completeWorkItems: boolean; }
  ): Promise<boolean> {
    try {
      const token = await this.getToken();
      if (!token) return false;
      const credentials = btoa(`:${token.trim()}`);
      
      const targetUrl = `https://dev.azure.com/${organization}/${encodeURIComponent(repoName)}/_apis/git/repositories/${encodeURIComponent(repoName)}/pullrequests/${prNumber}?api-version=7.0`;
      
      const prRes = await window.fetch(targetUrl, { 
        headers: { 'Authorization': `Basic ${credentials}`, 'Accept': 'application/json' } 
      });
      
      if (!prRes.ok) return false;
      const prData = await prRes.json();

      const projectId = prData.repository?.project?.id || repoName;
      const repositoryId = prData.repository?.id || repoName;

      const mergeUrl = `https://dev.azure.com/${organization}/${projectId}/_apis/git/repositories/${repositoryId}/pullrequests/${prNumber}?api-version=7.0`;

      // Payload dinâmico montado a partir das escolhas feitas no modal
      const response = await window.fetch(mergeUrl, {
        method: 'PATCH',
        headers: { 
          'Authorization': `Basic ${credentials}`, 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({
          status: "completed",
          lastMergeSourceCommitId: prData.lastMergeSourceCommit?.commitId,
          completionOptions: {
            deleteSourceBranch: options.deleteSourceBranch,
            completeWorkItems: options.completeWorkItems,
            mergeStrategy: options.mergeStrategy, 
            mergeCommitMessage: `Merged pull request ${prNumber}: ${prData.title}`
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Erro no PATCH de Merge");
      }

      const finalData = await response.json();
      return finalData.status === "completed";
    } catch (error) {
      console.error("Falha ao fechar PR na Azure:", error);
      throw error;
    }
  },

  async reactivatePullRequest(organization: string, repoName: string, prNumber: number): Promise<boolean> {
    try {
      const token = await this.getToken();
      if (!token) return false;
      const credentials = btoa(`:${token.trim()}`);

      const url = `https://dev.azure.com/${organization}/${encodeURIComponent(repoName)}/_apis/git/repositories/${encodeURIComponent(repoName)}/pullrequests/${prNumber}?api-version=7.0`;

      const response = await window.fetch(url, {
        method: 'PATCH',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: "active"
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Erro ao reativar PR");
      }

      const data = await response.json();
      return data.status === "active";
    } catch (error) {
      console.error("Falha ao reativar PR na Azure:", error);
      throw error;
    }
  },

  async deleteRef(organization: string, repoName: string, branchName: string): Promise<boolean> {
    try {
      const token = await this.getToken();
      if (!token) return false;
      const credentials = btoa(`:${token.trim()}`);

      // Primeiro pegamos o ObjectId atual (SHA) da ponta da branch para poder deletá-la com segurança
      const getUrl = `https://dev.azure.com/${organization}/${encodeURIComponent(repoName)}/_apis/git/repositories/${encodeURIComponent(repoName)}/refs?filter=heads/${encodeURIComponent(branchName)}&api-version=7.0`;
      const res = await window.fetch(getUrl, {
        headers: { 'Authorization': `Basic ${credentials}`, 'Accept': 'application/json' }
      });
      
      if (!res.ok) return false;
      const resData = await res.json();
      const oldObjectId = resData.value?.[0]?.objectId;

      if (!oldObjectId) throw new Error("Não foi possível encontrar o hash da branch remota.");

      const url = `https://dev.azure.com/${organization}/${encodeURIComponent(repoName)}/_apis/git/repositories/${encodeURIComponent(repoName)}/refs?api-version=7.0`;
      
      const response = await window.fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([{
          name: `refs/heads/${branchName}`,
          oldObjectId: oldObjectId,
          newObjectId: "0000000000000000000000000000000000000000"
        }])
      });

      return response.ok;
    } catch (error) {
      console.error("Falha ao deletar ref/branch na Azure:", error);
      throw error;
    }
  },

  async getPRThreads(organization: string, repoName: string, prNumber: number) {
    try {
        const token = await this.getToken();
        if (!token) return [];
        const credentials = btoa(`:${token.trim()}`);

        const url = `https://dev.azure.com/${organization}/${encodeURIComponent(repoName)}/_apis/git/repositories/${encodeURIComponent(repoName)}/pullRequests/${prNumber}/threads?api-version=7.0`;
        
        const response = await window.fetch(url, {
            method: "GET",
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/json'
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

  async addPRCommentReply(organization: string, repoName: string, prNumber: number, threadId: string, text: string): Promise<boolean> {
    try {
      const token = await this.getToken();
      if (!token) return false;
      const credentials = btoa(`:${token.trim()}`);

      const url = `https://dev.azure.com/${organization}/${encodeURIComponent(repoName)}/_apis/git/repositories/${encodeURIComponent(repoName)}/pullRequests/${prNumber}/threads/${threadId}/comments?api-version=7.0`;

      const response = await window.fetch(url, {
        method: "POST",
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: text,
          commentType: "text"
        })
      });

      return response.ok;
    } catch (error) {
      console.error(`Erro ao responder a thread ${threadId} na Azure:`, error);
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

  async validatePullRequest(organization: string, repoName: string, source: string, target: string): Promise<PRValidationResult> {
    try {
      const token = await this.getToken(); // Seu método interno de buscar token
      if (!token) throw new Error("Token não encontrado");
      const credentials = btoa(`:${token.trim()}`);

      // 🎯 URL Oficial do Azure para listar PRs ativos cruzando as duas branches
      // Note que o Azure espera refs completas (ex: refs/heads/master)
      const sourceRef = source.startsWith("refs/") ? source : `refs/heads/${source}`;
      const targetRef = target.startsWith("refs/") ? target : `refs/heads/${target}`;
      
      const prUrl = `https://dev.azure.com/${organization}/${encodeURIComponent(repoName)}/_apis/git/repositories/${encodeURIComponent(repoName)}/pullRequests?searchCriteria.sourceRefName=${encodeURIComponent(sourceRef)}&searchCriteria.targetRefName=${encodeURIComponent(targetRef)}&searchCriteria.status=active&api-version=7.0`;

      const prResponse = await window.fetch(prUrl, {
        method: 'GET',
        headers: { 'Authorization': `Basic ${credentials}` }
      });

      if (!prResponse.ok) throw new Error(`Erro ao buscar PRs no Azure: ${prResponse.status}`);
      const prsData = await prResponse.json();

      // Se já existir um PR ativo idêntico
      if (prsData.value && prsData.value.length > 0) {
        return {
          hasChanges: true,
          alreadyExists: true,
          existingPrId: prsData.value[0].pullRequestId,
          commits: [],
          files: []
        };
      }

      const diffUrl = `https://dev.azure.com/${organization}/${encodeURIComponent(repoName)}/_apis/git/repositories/${encodeURIComponent(repoName)}/diffs/commits?baseVersion=${encodeURIComponent(target)}&baseVersionType=branch&targetVersion=${encodeURIComponent(source)}&targetVersionType=branch&api-version=7.0`;

      const diffResponse = await window.fetch(diffUrl, {
        method: 'GET',
        headers: { 'Authorization': `Basic ${credentials}` }
      });

      if (!diffResponse.ok) throw new Error(`Erro ao buscar diff no Azure: ${diffResponse.status}`);
      const diffData = await diffResponse.json();

      let commitList: any[] = [];
      
      if (diffData.aheadCount > 0) {
        try {
          const cleanSource = source.replace("refs/heads/", "").replace("refs/", "");

          const commitsUrl = `https://dev.azure.com/${organization}/${encodeURIComponent(repoName)}/_apis/git/repositories/${encodeURIComponent(repoName)}/commits?searchCriteria.itemVersion.version=${encodeURIComponent(cleanSource)}&searchCriteria.itemVersion.versionType=branch&searchCriteria.$top=${diffData.aheadCount}&api-version=7.0`;
          
          const commitsResponse = await window.fetch(commitsUrl, {
            method: 'GET',
            headers: { 'Authorization': `Basic ${credentials}` }
          });
          
          if (commitsResponse.ok) {
            const commitsData = await commitsResponse.json();
            commitList = commitsData.value || [];
          } else {
            console.error(`Erro ao buscar commits (Status ${commitsResponse.status})`);
          }
        } catch (e) {
          console.error("Erro ao buscar detalhes dos commits do Azure:", e);
        }
      }

      return {
        hasChanges: (diffData.aheadCount && diffData.aheadCount > 0) || (diffData.changes && diffData.changes.length > 0),
        
        alreadyExists: false,
        
        commits: commitList.map((c: any) => ({
          id: c.commitId.substring(0, 7),
          message: c.comment,
          author: c.author?.name || "Unknown"
        })),
        
        files: (diffData.changes || [])
          .filter((f: any) => f.item && !f.item.isFolder) 
          .map((f: any) => ({
            path: f.item.path,
            status: f.changeType === "add" ? "added" : f.changeType === "delete" ? "deleted" : "modified"
          }))
      };

    } catch (error) {
      console.error("Erro na validação do Azure Service:", error);
      throw error;
    }
  },

  async createPullRequest(
    organization: string,
    repoName: string,
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
      const credentials = btoa(`:${token.trim()}`);

      // O Azure exige o escopo completo das refs
      const sourceRef = data.sourceBranch.startsWith("refs/") ? data.sourceBranch : `refs/heads/${data.sourceBranch}`;
      const targetRef = data.targetBranch.startsWith("refs/") ? data.targetBranch : `refs/heads/${data.targetBranch}`;

      const url = `https://dev.azure.com/${organization}/${encodeURIComponent(repoName)}/_apis/git/repositories/${encodeURIComponent(repoName)}/pullRequests?api-version=7.0`;

      // Mapeia os revisores para o formato que o Azure espera (Reviewer ID)
      // Nota: Se você estiver passando apenas strings de texto/e-mail, o Azure pode exigir que você busque o ID do GUID do usuário antes.
      const mappedReviewers = data.reviewers.map(reviewerId => ({
        id: reviewerId 
      }));

      const body = {
        title: data.title,
        description: data.description,
        sourceRefName: sourceRef,
        targetRefName: targetRef,
        // Se seu app lida com IDs de revisores, descomente a linha abaixo:
        // reviewers: mappedReviewers
      };

      const response = await window.fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erro ao criar Pull Request no Azure (${response.status}): ${errorText}`);
      }

      return await response.json(); // Retorna o objeto do PR criado (contendo ID, URL, etc.)
    } catch (error) {
      console.error("Erro na service Azure (createPullRequest):", error);
      throw error;
    }
  },

  async getAvatarBase64(avatarUrl: string): Promise<string> {
    try {
      const token = await this.getToken();
      if (!token) return "";
      
      const store = await getAuthStore();
      const org = await store.get<string>("azure_org") || "brunoribeiro96";
      const credentials = btoa(`:${token.trim()}`);

      let targetUrl = avatarUrl;

      if (avatarUrl.includes("GraphProfile/MemberAvatars")) {
        const parts = avatarUrl.split('/');
        let avatarId = parts[parts.length - 1]; // ex: "msa.NWY4NjJlN2Mt..."
        avatarId = avatarId.replace("msa.", "");

        try {
          // 🚀 Decodifica o Base64 da Azure para descobrir o GUID real (ex: 5f862e7c-6fad-...)
          const rawGuid = atob(avatarId);
          
          // Monta a rota direta de renderização de imagem da sua organização usando o GUID real
          targetUrl = `https://dev.azure.com/${org}/_api/_common/identityImage?id=${rawGuid}`;
        } catch (e) {
          console.error("Erro ao decodificar GUID do avatar:", e);
          // Fallback caso a string não esteja em base64 perfeito, tenta usar a URL original
        }
      }

      // Executa o fetch via plugin nativo do Tauri (ignora CORS)
      const response = await fetch(targetUrl, {
        method: "GET",
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Accept': 'image/*'
        }
      });

      if (!response.ok) {
        console.warn(`Erro ao baixar imagem do avatar na Azure. Status: ${response.status}`);
        return "";
      }

      const buffer = await response.arrayBuffer();
      return this.arrayBufferToBase64(buffer, response.headers.get("content-type"));

    } catch (error) {
      console.error("Falha crítica ao carregar avatar na service:", error);
      return "";
    }
  },

  // Método auxiliar (mantenha se já adicionou no passo anterior)
  arrayBufferToBase64(buffer: ArrayBuffer, contentType: string | null): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return `data:${contentType || "image/jpeg"};base64,${btoa(binary)}`;
  },

  async getUnifiedWorkItem(organization: string, project: string, workItemId: number): Promise<WorkItem | null> {
    const token = await this.getToken();
    if (!token) return null;
    
    const credentials = btoa(`:${token.trim()}`);

    const url = `https://dev.azure.com/${organization}/${encodeURIComponent(project)}/_apis/wit/workitems/${workItemId}?api-version=7.0&$expand=all`;
    
    const response = await window.fetch(url, {
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Accept': 'application/json'
      }
    });
    if (!response.ok) throw new Error("Erro ao buscar card no Azure");
    
    const data = await response.json();
    const fields = data.fields;

    console.log("Dados brutos do Work Item da Azure:", data);

    // 🎯 1. MAPEAMENTO REAL DE TAGS (Separando por ponto e vírgula)
    const tagsString = fields["System.Tags"] || "";
    const tags = tagsString ? tagsString.split(";").map((t: string) => t.trim()) : [];

    // 🎯 2. BUSCANDO COMENTÁRIOS REAIS DA TIMELINE
    const comments = await this.getAzureComments(organization, project, workItemId);

    // 🎯 3. EXTRAINDO TASKS E COMMITS REAIS DO ARRAY DE RELATIONS
    const relations = data.relations || [];
    
    const tasksIds = relations
    .filter((rel: any) => rel.rel === "System.LinkTypes.Hierarchy-Forward")
    .map((rel: any) => {
      return rel.url.split("/").pop(); // Extrai o ID "2" da URL fornecida
    });

  const commitsHashes = relations
    .filter((rel: any) => rel.rel === "ArtifactLink" && rel.url.toLowerCase().includes("git/commit"))
    .map((rel: any) => {
      // Decodifica a URL: vstfs:///Git/Commit/...%2f[commitHash]
      const decodedUrl = decodeURIComponent(rel.url);
      return decodedUrl.split("/").pop() || "";
    });

    // Cores baseadas no estado atual vindas do seu fields
    const state = fields["System.State"] || "To Do";
    let stateColor = "bg-gray-500/10 text-gray-500 border-gray-500/20";
    if (state === "Active" || state === "Doing") stateColor = "bg-blue-500/10 text-blue-500 border-blue-500/20";
    if (state === "Done" || state === "Completed") stateColor = "bg-green-500/10 text-green-500 border-green-500/20";

    return {
      id: data.id.toString(),
      number: data.id,
      title: fields["System.Title"] || "",
      description: fields["System.Description"] || fields["System.History"] || "", 
      state: state,
      stateColor: stateColor,
      provider: "azure",
      tags: tags,
      comments: comments,
      tasksReferences: tasksIds, 
      commitsReferences: commitsHashes,
      priority: fields["Microsoft.VSTS.Common.Priority"],
      effort: fields["Microsoft.VSTS.Scheduling.Effort"] || fields["Microsoft.VSTS.Scheduling.StoryPoints"],
      areaPath: fields["System.AreaPath"] || "",
      iterationPath: fields["System.IterationPath"] || "",
      author: {
        name: fields["System.CreatedBy"]?.displayName || "Azure User",
        avatarUrl: fields["System.CreatedBy"]?._links?.avatar?.href
      },
      createdAt: fields["System.CreatedDate"],
      updatedAt: fields["System.ChangedDate"],
      commentsCount: fields["System.CommentCount"] || 0,
      assignee: fields["System.AssignedTo"] ? {
        name: fields["System.AssignedTo"].displayName,
        avatarUrl: fields["System.AssignedTo"]._links?.avatar?.href
      } : undefined
    };
  },
  
  async getTasksDetails(organization: string, project: string, ids: string[]): Promise<Array<{ id: string, title: string }>> {
    if (!ids || ids.length === 0) return [];
    const token = await this.getToken();
    if (!token) return [];
    const credentials = btoa(`:${token.trim()}`);

    // O Azure aceita uma lista de IDs separados por vírgula para buscar em lote
    const url = `https://dev.azure.com/${organization}/${encodeURIComponent(project)}/_apis/wit/workitems?ids=${ids.join(",")}&api-version=7.0&fields=System.Title`;

    try {
      const response = await window.fetch(url, {
        headers: { 'Authorization': `Basic ${credentials}`, 'Accept': 'application/json' }
      });
      if (!response.ok) return [];
      const data = await response.json();
      return (data.value || []).map((item: any) => ({
        id: item.id.toString(),
        title: item.fields["System.Title"] || "Sub-task sem título"
      }));
    } catch {
      return [];
    }
  },

  async getCommitDetails(organization: string, project: string, repoId: string, commitHash: string): Promise<{ id: string, message: string }> {
    const token = await this.getToken();
    if (!token) return { id: commitHash, message: "Mudança vinculada no Azure Repos" };
    const credentials = btoa(`:${token.trim()}`);

    // Nota: se você não tiver o ID do repositório dinâmico, pode usar o nome do projeto/repositório na rota padrão
    const url = `https://dev.azure.com/${organization}/${encodeURIComponent(project)}/_apis/git/repositories/${encodeURIComponent(project)}/commits/${commitHash}?api-version=7.0`;

    try {
      const response = await window.fetch(url, {
        headers: { 'Authorization': `Basic ${credentials}`, 'Accept': 'application/json' }
      });
      if (!response.ok) return { id: commitHash, message: "Mudança vinculada no Azure Repos" };
      const data = await response.json();
      return {
        id: commitHash,
        message: data.comment || "Commit associado"
      };
    } catch {
      return { id: commitHash, message: "Mudança vinculada no Azure Repos" };
    }
  },

  async getAzureComments(organization: string, project: string, workItemId: number): Promise<CardComment[]> {
    const token = await this.getToken();
    if (!token) return [];
    const credentials = btoa(`:${token.trim()}`);
    
    const url = `https://dev.azure.com/${organization}/${encodeURIComponent(project)}/_apis/wit/workitems/${workItemId}/comments?api-version=7.0-preview.3`;
    
    try {
      const response = await window.fetch(url, {
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Accept': 'application/json'
        }
      });
      if (!response.ok) return [];
      const data = await response.json();
      
      return (data.comments || []).map((c: any) => ({
        id: c.id,
        author: {
          name: c.createdBy?.displayName || "Azure User",
          avatarUrl: c.createdBy?._links?.avatar?.href
        },
        text: c.text || "", // O Azure retorna o texto do comentário em formato HTML/String
        createdAt: c.createdDate
      }));
    } catch {
      return [];
    }
  },

   async getWorkItemHistory(organization: string, project: string, workItemId: number): Promise<Array<any>> {
    const token = await this.getToken();
    if (!token) return [];
    const credentials = btoa(`:${token.trim()}`);

    const url = `https://dev.azure.com/${organization}/${encodeURIComponent(project)}/_apis/wit/workitems/${workItemId}/updates?api-version=7.0`;

    try {
      const response = await window.fetch(url, {
        headers: { 'Authorization': `Basic ${credentials}`, 'Accept': 'application/json' }
      });
      if (!response.ok) return [];
      const data = await response.json();

      const mappedUpdates = (data.value || []).map((update: any) => {
        const fields = update.fields || {};
        const relations = update.relations || {};
        const cleanedChanges: Array<{ type: string; field: string; value: any }> = [];

        const identity = update.revisedBy;
        const userName = identity?.displayName || identity?.name?.split("<")[0]?.trim() || "Sistema";
        const userAvatar = identity?._links?.avatar?.href || null;

        let rawDate = fields["System.ChangedDate"]?.newValue || update.revisedDate;
        
        if (!rawDate || rawDate.startsWith("9999")) {
          rawDate = fields["System.AuthorizedDate"]?.newValue || new Date().toISOString();
        }
        
        const eventDate = new Date(rawDate);

        if (fields["System.State"]) {
          cleanedChanges.push({ type: "state", field: "State", value: fields["System.State"].newValue });
        }
        if (fields["System.BoardColumn"]) {
          cleanedChanges.push({ type: "board", field: "Board Column", value: fields["System.BoardColumn"].newValue });
        }
        if (fields["System.AssignedTo"]) {
          cleanedChanges.push({ type: "assignee", field: "Assigned To", value: fields["System.AssignedTo"].newValue?.displayName || "Ninguém" });
        }
        if (fields["System.Priority"]) {
          cleanedChanges.push({ type: "planning", field: "Priority", value: fields["System.Priority"].newValue });
        }
        if (fields["Microsoft.VSTS.Common.Effort"]) {
          cleanedChanges.push({ type: "planning", field: "Effort", value: fields["Microsoft.VSTS.Common.Effort"].newValue });
        }
        if (fields["System.Tags"]) {
          cleanedChanges.push({ type: "tags", field: "Tags", value: fields["System.Tags"].newValue });
        }
        if (fields["System.History"]) {
          cleanedChanges.push({ type: "comment", field: "Comment", value: fields["System.History"].newValue });
        }

        if (relations.added) {
          relations.added.forEach((link: any) => {
            if (link.rel === "ArtifactLink" && link.url.toLowerCase().includes("git/commit")) {
              let commitHash = "Commit";
              
              try {
                const decodedUrl = decodeURIComponent(link.url);
                const urlParts = decodedUrl.split("/");
                const lastPart = urlParts[urlParts.length - 1] || "";
                if (lastPart) commitHash = lastPart;
              } catch {
                const urlParts = link.url.split("/");
                commitHash = urlParts[urlParts.length - 1] || "Commit";
              }

              const shortHash = commitHash.length > 7 ? commitHash.substring(0, 7) : commitHash;

              cleanedChanges.push({ 
                type: "commit_link", 
                field: "Links", 
                value: {
                  id: shortHash,
                  fullHash: commitHash,
                  title: ``
                }
              });
            } 
            
            else if (link.rel === "System.LinkTypes.Hierarchy-Forward") {
              const urlParts = link.url.split("/");
              const childId = urlParts[urlParts.length - 1] || "ID";

              cleanedChanges.push({ 
                type: "task_link", 
                field: "Tasks Vinculadas", 
                value: {
                  id: childId,
                  title: ""
                }
              });
            }
          });
        }

        // Geração inteligente da descrição da ação do cabeçalho
        let eventSummary = "realizou alterações";
        if (cleanedChanges.length > 0) {
          const primary = cleanedChanges[0];
          if (primary.type === "state" || primary.type === "board") eventSummary = `mudou o estado para ${primary.value}`;
          else if (primary.type === "tags") eventSummary = "alterou as Tags";
          else if (primary.type === "comment") eventSummary = "adicionou um comentário";
          else if (primary.type === "commit_link") eventSummary = "vinculou um Commit";
          else if (primary.type === "task_link") eventSummary = "adicionou um Link filho";
          else if (primary.type === "assignee") eventSummary = `atribuiu para ${primary.value}`;
        }

        return {
          id: update.id,
          rev: update.rev,
          user: userName,
          avatar: userAvatar,
          date: eventDate,
          summary: eventSummary,
          changes: cleanedChanges
        };
      });
      console.log("Histórico de atualizações mapeado da Azure:", mappedUpdates);
      // Inverte a ordem para deixar os mais novos no topo
      return mappedUpdates.reverse();
    } catch (error) {
      console.error("Erro no parse do histórico:", error);
      return [];
    }
  },

  async logout() {
    const store = await getAuthStore();
    await store.delete("azure_token");
    await store.delete("azure_org");
    await store.save();
  }
};