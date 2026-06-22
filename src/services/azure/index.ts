import { load } from "@tauri-apps/plugin-store";
import { fetch } from "@tauri-apps/plugin-http";
import { UnifiedPR } from "../../models/PR.model";
import { UnifiedPipelineRun } from "../../models/Pipeline.model";
import { invoke } from "@tauri-apps/api/core";

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

  // 1. Busca os Projetos da Organização
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
          isProject: true // Flag para a UI saber que é um projeto, não um repo
        }));
      }
      return [];
    } catch (error) {
      console.error("Falha ao buscar projetos do Azure:", error);
      return [];
    }
  },

  // 2. Busca os Repositórios de um Projeto Específico (E limpa a URL de clone)
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
          
          // Transforma "https://user@dev.azure.com/..." em "https://dev.azure.com/..."
          let cleanUrl = repo.remoteUrl || "";
          if (cleanUrl.includes("@dev.azure.com")) {
            cleanUrl = cleanUrl.replace(/https:\/\/.*@dev\.azure\.com/, "https://dev.azure.com");
          }

          return {
            name: repo.name,
            description: ``,
            language: 'Azure Git',
            private: true,
            html_url: cleanUrl, // URL perfeita e limpa para o Git clonar sem erro!
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

  // Pull requests
  async getRepoPullRequests(organization: string, repoName: string, state: string): Promise<UnifiedPR[]> {
    try {
      const token = await this.getToken();
      if (!token) return [];
      const credentials = btoa(`:${token.trim()}`);
      
      let statusParam = "active";
      if (state === "MERGED") statusParam = "completed";
      if (state === "CLOSED") statusParam = "abandoned";

      // 🛠️ Injetamos o escopo do projeto {repoName} antes de /_apis/
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
        comments: { totalCount: 0 } // Azure trata comentários em threads separadas, mapeado como 0 inicialmente
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

      // Mapeia os revisores do Azure para o formato esperado pelo seu reviewersList()
      const reviewers = (pr.reviewers || []).map((rev: any) => {
        let state = "PENDING";
        if (rev.vote === 10) state = "APPROVED";
        if (rev.vote === 5) state = "APPROVED"; // Aprovado com sugestões
        if (rev.vote === -5) state = "CHANGES_REQUESTED"; // Esperando autor
        if (rev.vote === -10) state = "CHANGES_REQUESTED"; // Rejeitado

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
    
    // No Azure, você se aprova dando um "voto" positivo (10 = Approved)
    const url = `https://dev.azure.com/${organization}/_apis/git/repositories/${repoName}/pullrequests/${prNumber}/reviewers/me?api-version=7.0`;
    const response = await window.fetch(url, {
      method: 'PUT',
      headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ vote: 10 })
    });
    return response.ok;
  },

  async mergePullRequest(organization: string, repoName: string, prNumber: number): Promise<boolean> {
    const token = await this.getToken();
    if (!token) return false;
    const credentials = btoa(`:${token.trim()}`);
    
    const url = `https://dev.azure.com/${organization}/_apis/git/repositories/${repoName}/pullrequests/${prNumber}?api-version=7.0`;
    
    // Precisamos pegar o status atual para mandar o lastMergeSourceCommitId protetor
    const prRes = await window.fetch(url, { headers: { 'Authorization': `Basic ${credentials}` } });
    const prData = await prRes.json();

    const response = await window.fetch(url, {
      method: 'PATCH',
      headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: "completed",
        completionOptions: {
          deleteSourceBranch: false,
          mergeCommitMessage: "Merged via Dev Brook",
          squashMerge: false
        },
        lastMergeSourceCommitId: prData.lastMergeSourceCommitId
      })
    });
    return response.ok;
  },

  async getPipelineRuns(organization: string, project: string, repoPath: string): Promise<UnifiedPipelineRun[]> {
    try {
      const token = await this.getToken();
      if (!token) return [];
      const credentials = btoa(`:${token.trim()}`);
      
      // Voltamos para a URL leve padrão
      const url = `https://dev.azure.com/${organization}/${encodeURIComponent(project)}/_apis/build/builds?top=15&api-version=7.0`;
      
      const response = await window.fetch(url, {
        headers: { 
          'Authorization': `Basic ${credentials}`, 
          'Accept': 'application/json' 
        }
      });

      if (!response.ok) {
        console.error("Erro ao buscar pipelines no Azure:", response.status);
        return [];
      }
      
      const data = await response.json();
      const builds = data.value || [];

      // 1. Extrai todos os SHAs únicos da lista de runs
      const shas: string[] = builds
        .map((b: any) => b.sourceVersion)
        .filter((sha: string | undefined) => sha && sha.trim().length > 0);

      // 2. Busca as mensagens em lote diretamente no repositório local usando o Rust
      let localCommitsMap: Record<string, string> = {};
      try {
        if (repoPath) {
          localCommitsMap = await invoke("get_multiple_commits_subjects", { path: repoPath, hashes: shas });
        }
      } catch (err) {
        console.warn("Falha ao buscar commits locais via Rust:", err);
      }

      // 3. Monta o mapeamento final com estratégia de Fallback
      const mappedRuns = await Promise.all(builds.map(async (build: any) => {
        const sha = build.sourceVersion || "";
        let commitMessage = "";

        // Estratégia 1: Tenta ler o mapa local retornado pelo Rust
        if (sha && localCommitsMap[sha]) {
          commitMessage = localCommitsMap[sha];
        } 
        // Estratégia 2: Se não achou local, faz o Fallback seguro via API individual do Azure
        else if (sha && build.repository?.id && build.repository?.type === "TfsGit") {
          try {
            const commitUrl = `https://dev.azure.com/${organization}/${encodeURIComponent(project)}/_apis/git/repositories/${build.repository.id}/commits/${sha}?api-version=7.0`;
            const commitRes = await window.fetch(commitUrl, {
              headers: { 'Authorization': `Basic ${credentials}`, 'Accept': 'application/json' }
            });
            if (commitRes.ok) {
              const commitData = await commitRes.json();
              commitMessage = commitData.comment || "";
            }
          } catch (apiErr) {
            console.error(`Erro no fallback do commit ${sha}:`, apiErr);
          }
        }

        // Estratégia 3: Último fallback (Gatilhos automáticos)
        if (!commitMessage && build.triggerInfo) {
          commitMessage = build.triggerInfo["ci.message"] || "";
        }

        return {
          id: build.id,
          number: build.buildNumber,
          name: build.definition?.name || "Pipeline",
          status: build.status,       
          result: build.result,       
          url: build._links?.web?.href || "",
          trigger: build.reason,      
          startTime: build.startTime,
          finishTime: build.finishTime,
          sourceBranch: build.sourceBranch?.replace('refs/heads/', '') || "",
          commitId: sha.substring(0, 7),
          commitMessage: commitMessage,
          requestedFor: build.requestedFor
        };
      }));

      return mappedRuns;
    } catch (e) {
      console.error("Erro na request de pipelines do Azure:", e);
      return [];
    }
  },

  async getPipelineRunDetails(organization: string, project: string, buildId: number): Promise<any> {
    try {
      const token = await this.getToken();
      if (!token) return null;
      const credentials = btoa(`:${token.trim()}`);
      
      const url = `https://dev.azure.com/${organization}/${encodeURIComponent(project)}/_apis/build/builds/${buildId}?api-version=7.0`;
      
      const response = await window.fetch(url, {
        headers: { 'Authorization': `Basic ${credentials}`, 'Accept': 'application/json' }
      });

      if (!response.ok) return null;
      const build = await response.json();
      console.log('build', build)
      return {
        id: build.id,
        definitionId: build.definition?.id,
        number: build.buildNumber,
        name: build.definition?.name || "Pipeline",
        status: build.status,
        result: build.result,
        url: build._links?.web?.href || "",
        trigger: build.reason === 'individualCI' ? 'Individual CI' : build.reason,
        startTime: build.startTime,
        finishTime: build.finishTime,
        sourceBranch: build.sourceBranch?.replace('refs/heads/', '') || "",
        logs: build.logs,
        author: {
          name: build.requestedFor?.displayName || "Desconhecido",
          avatarUrl: build.requestedFor?._links?.avatar?.href || ""
        },
        commit: {
          id: build.sourceVersion?.substring(0, 7) || "",
          fullId: build.sourceVersion || "",
          message: build.triggerInfo?.['ci.message'] || "Disparado por alteração de código"
        }
      };
    } catch (e) {
      console.error("Erro ao buscar detalhes da pipeline no Azure:", e);
      return null;
    }
  },

  async getPipelineRunChanges(organization: string, project: string, buildId: number): Promise<any[]> {
    try {
      const token = await this.getToken();
      if (!token) return [];
      const credentials = btoa(`:${token.trim()}`);
      
      const url = `https://dev.azure.com/${organization}/${encodeURIComponent(project)}/_apis/build/builds/${buildId}/changes?api-version=7.0`;
      
      const response = await window.fetch(url, {
        headers: { 
          'Authorization': `Basic ${credentials}`, 
          'Accept': 'application/json' 
        }
      });

      if (!response.ok) return [];
      const data = await response.json();

      if (!data.value || !Array.isArray(data.value)) return [];

      return data.value.map((change: any) => {
        const rawMessage = change.message || "Sem mensagem de commit";
        const shortMessage = rawMessage.split('\n')[0];

        return {
          id: change.id,
          commitId: change.id,
          message: shortMessage,
          timestamp: change.timestamp || null,
          author: {
            name: change.author?.displayName || change.author?.uniqueName || "Autor Desconhecido",
            imageUrl: change.author?._links?.avatar?.href || null
          }
        };
      });

    } catch (e) {
      console.error(`Erro ao buscar alterações do build #${buildId} no Azure:`, e);
      return [];
    }
  },

  async getPipelineRunTimeline(organization: string, project: string, buildId: number): Promise<any[]> {
    try {
      const token = await this.getToken();
      if (!token) return [];
      const credentials = btoa(`:${token.trim()}`);
      
      const url = `https://dev.azure.com/${organization}/${encodeURIComponent(project)}/_apis/build/builds/${buildId}/timeline?api-version=7.0`;
      
      const response = await window.fetch(url, {
        headers: { 'Authorization': `Basic ${credentials}`, 'Accept': 'application/json' }
      });

      if (!response.ok) return [];
      const data = await response.json();
      const records = data.records || [];

      const filteredRecords = records.filter((rec: any) => {
        const type = rec.type;
        const name = rec.name?.toLowerCase() || "";
        
        if (type === 'Checkpoint' || type === 'Phase') return false;
        if (name === '__default') return false;
        
        return true;
      });

      return filteredRecords.sort((a: any, b: any) => {
        const timeA = a.startTime ? new Date(a.startTime).getTime() : 0;
        const timeB = b.startTime ? new Date(b.startTime).getTime() : 0;
        return timeA - timeB;
      });
    } catch (e) {
      console.error("Erro ao buscar timeline da pipeline no Azure:", e);
      return [];
    }
  },

  async getTaskLogText(logUrl: string): Promise<string> {
    try {
      const token = await this.getToken();
      if (!token) return "";
      const credentials = btoa(`:${token.trim()}`);
      
      const response = await window.fetch(logUrl, {
        headers: { 'Authorization': `Basic ${credentials}`, 'Accept': 'text/plain' }
      });

      if (!response.ok) return "Não foi possível carregar os logs desta etapa.";
      return await response.text();
    } catch (e) {
      console.error("Erro ao buscar texto do log no Azure:", e);
      return "Erro ao conectar com o servidor de logs.";
    }
  },

  async triggerPipelineRun(
    owner: string, 
    project: string, 
    pipelineId: string | number, 
    branch: string = "main",
    agentPoolName?: string,
    enableDiagnostics: boolean = false
  ) {
    try {
      const token = await this.getToken();
      if (!token) return null;
      const credentials = btoa(`:${token.trim()}`);

      const targetPipelineId = Number(pipelineId);
      
      if (isNaN(targetPipelineId) || targetPipelineId === 0) {
        throw new Error(`O método triggerPipelineRun exige um ID numérico válido. Recebido: "${pipelineId}"`);
      }

      const cleanBranch = branch.startsWith("refs/") ? branch : `refs/heads/${branch}`;
      const url = `https://dev.azure.com/${owner}/${encodeURIComponent(project)}/_apis/build/builds?api-version=7.0`;

      const payload: any = {
        definition: {
          id: targetPipelineId
        },
        sourceBranch: cleanBranch,
        templateParameters: {},
        variables: {}
      };

      if (enableDiagnostics) {
        payload.variables["system.debug"] = {
          value: "true",
          allowOverride: true
        };
      }

      if (agentPoolName) {
        payload.queue = {
          name: agentPoolName
        };
      }

      const response = await window.fetch(url, {
        method: "POST",
        headers: { 
          'Authorization': `Basic ${credentials}`, 
          'Content-Type': 'application/json',
          'Accept': 'application/json' 
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Erro ao disparar pipeline no Azure: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Erro em triggerPipelineRun (Azure):", error);
      throw error;
    }
  },

  async rerunFailedJobs(owner: string, project: string, runId: string | number) {
    try {
      const token = await this.getToken();
      if (!token) return null;
      const credentials = btoa(`:${token.trim()}`);

      const targetRunId = Number(runId);
      if (isNaN(targetRunId) || targetRunId === 0) {
        throw new Error(`O método rerunFailedJobs exige um ID de run válido. Recebido: "${runId}"`);
      }

      // No Azure DevOps, reexecutar falhas em pipelines modernos mapeia uma alteração de estado no build (Retry)
      const url = `https://dev.azure.com/${owner}/${encodeURIComponent(project)}/_apis/build/builds/${targetRunId}?api-version=7.0`;

      const response = await window.fetch(url, {
        method: "PATCH", // Atualiza o estado da execução existente
        headers: { 
          'Authorization': `Basic ${credentials}`, 
          'Content-Type': 'application/json',
          'Accept': 'application/json' 
        },
        body: JSON.stringify({
          status: "Cancelling"
        })
      });

      const retryUrl = `https://dev.azure.com/${owner}/${encodeURIComponent(project)}/_apis/build/builds?buildId=${targetRunId}&api-version=7.0`;
      
      const retryResponse = await window.fetch(retryUrl, {
        method: "POST",
        headers: { 
          'Authorization': `Basic ${credentials}`, 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      if (!retryResponse.ok) {
        const errorData = await retryResponse.json().catch(() => ({}));
        throw new Error(errorData.message || `Erro ao reexecutar run no Azure: ${retryResponse.statusText}`);
      }

      return await retryResponse.json();
    } catch (error) {
      console.error("Erro em rerunFailedJobs (Azure):", error);
      throw error;
    }
  },

  async deletePipelineRun(owner: string, project: string, runId: string | number) {
    try {
      const token = await this.getToken();
      if (!token) return null;
      const credentials = btoa(`:${token?.trim()}`);

      const targetRunId = Number(runId);
      if (isNaN(targetRunId) || targetRunId === 0) {
        throw new Error(`O método deletePipelineRun exige um ID de run válido. Recebido: "${runId}"`);
      }

      const url = `https://dev.azure.com/${owner}/${encodeURIComponent(project)}/_apis/build/builds/${targetRunId}?api-version=7.0`;

      const response = await window.fetch(url, {
        method: "DELETE",
        headers: { 
          'Authorization': `Basic ${credentials}`, 
          'Accept': 'application/json' 
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Erro ao deletar run no Azure: ${response.statusText}`);
      }

      return { success: true };
    } catch (error) {
      console.error("Erro em deletePipelineRun (Azure):", error);
      throw error;
    }
  },

  async getAgentPools(owner: string, project: string) {
    try {
      const store = await getAuthStore();
      const token = await store.get<string>("azure_token");
      if (!token) return [];

      // Chama o backend Rust diretamente, eliminando o erro de CORS do navegador
      const jsonString = await invoke<string>("fetch_azure_queues", { 
        owner, 
        project, 
        token 
      });
      
      const data = JSON.parse(jsonString);

      if (data.value && Array.isArray(data.value)) {
        return data.value.map((queue: any) => ({
          id: queue.pool?.id || queue.id,
          name: queue.pool?.name || queue.name,
          isHosted: queue.pool?.isHosted
        }));
      }

      return [];
    } catch (error) {
      console.error("Erro em getAgentPools via Backend Rust:", error);
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