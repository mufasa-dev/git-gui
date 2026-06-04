import { createSignal, createResource, createMemo, Show, For, createEffect } from "solid-js";
import Dialog from "../ui/Dialog"; 
import { SearchableSelect, SearchableSelectOption } from "../ui/SearchableSelect"; 
import { GitProvider } from "../../utils/gitProvider";
import { azureService } from "../../services/azure";
import { githubService } from "../../services/github";
import MarkdownEditor from "../ui/MarkdownEditor";

interface CreatePRDialogProps {
  isOpen: boolean;
  onClose: () => void;
  branches: string[];
  currentBranch: string;
  provider: GitProvider
  onCreatePR: (data: any) => Promise<void>;
}

// Interface para unificar a resposta da API de ambos os providers
interface PRValidationResult {
  hasChanges: boolean;
  alreadyExists: boolean;
  existingPrId?: string | number;
  commits: any[];
  files: any[];
}

export default function CreatePRDialog(props: CreatePRDialogProps) {
  
  // Estados de Seleção de Branches
  const [sourceBranch, setSourceBranch] = createSignal(props.currentBranch || "");
  const [targetBranch, setTargetBranch] = createSignal("main");
  const [activeTab, setActiveTab] = createSignal("overview");

  // Campos do Formulário
  const [title, setTitle] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [reviewers, setReviewers] = createSignal<string[]>([]);
  const [newReviewer, setNewReviewer] = createSignal("");

  // Chaves de controle para forçar o SearchableSelect a remontar e atualizar visualmente
  const [sourceKey, setSourceKey] = createSignal(0);
  const [targetKey, setTargetKey] = createSignal(0);

  const branchOptions = createMemo<SearchableSelectOption[]>(() => 
    props.branches.map(branch => ({ value: branch, label: branch }))
  );

  const handleInvertBranches = () => {
    const currentSource = sourceBranch();
    const currentTarget = targetBranch();
    setSourceBranch(currentTarget);
    setTargetBranch(currentSource);
    setSourceKey(prev => prev + 1);
    setTargetKey(prev => prev + 1);
  };

  // Reseta o formulário toda vez que o Dialog abre
  createEffect(() => {
    if (props.isOpen) {
      setSourceBranch(props.currentBranch || "");
      setTargetBranch("main");
      setTitle("");
      setDescription("");
      setReviewers([]);
      setActiveTab("overview");
      setSourceKey(prev => prev + 1);
      setTargetKey(prev => prev + 1);
    }
  });

  // 🎯 2. RECURSO DE VALIDAÇÃO MULTI-PROVIDER (Dispara automaticamente nas mudanças)
  const [validation] = createResource(
    () => ({ source: sourceBranch(), target: targetBranch(), provider: props.provider }),
    async ({ source, target, provider }) => {
      // Guardrail básico imediato para evitar requisição inútil se forem iguais
      if (!source || !target || source === target) return null;

      try {
        if (provider === "azure") {
          // Método da sua API/Service local que chama as rotas do Azure
          const res = await azureService.validatePullRequest(source, target);
          return res as PRValidationResult;
        } else {
          // Método que bate no wrapper do GitHub
          const res = await githubService.validatePullRequest(source, target);
          return res as PRValidationResult;
        }
      } catch (error) {
        console.error("Erro ao validar Pull Request:", error);
        return { hasChanges: false, alreadyExists: false, commits: [], files: [] };
      }
    }
  );

  // Memos lógicos baseados no resultado da API
  const isIdentical = createMemo(() => sourceBranch() === targetBranch());
  const prExists = createMemo(() => !validation.loading && validation()?.alreadyExists);
  const noChanges = createMemo(() => !validation.loading && validation() && !validation()?.hasChanges);
  
  // Só deixa prosseguir se não houver conflitos de layout e a API der sinal verde
  const canProceed = createMemo(() => {
    if (isIdentical() || validation.loading) return false;
    const data = validation();
    if (!data) return false;
    return data.hasChanges && !data.alreadyExists;
  });

  const countCommits = createMemo(() => validation()?.commits?.length || 0);
  const countFiles = createMemo(() => validation()?.files?.length || 0);

  const handleAddReviewer = (e: Event) => {
    e.preventDefault();
    if (newReviewer().trim()) {
      setReviewers([...reviewers(), newReviewer().trim()]);
      setNewReviewer("");
    }
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    if (!canProceed() || !title().trim()) return;

    await props.onCreatePR({
      title: title(),
      description: description(),
      sourceBranch: sourceBranch(),
      targetBranch: targetBranch(),
      reviewers: reviewers(),
    });
    props.onClose();
  };

  return (
    <Dialog
      open={props.isOpen}
      title="New pull request"
      width="850px"
      bodyClass="p-0 flex flex-col max-h-[85vh] overflow-hidden"
      onClose={props.onClose}
    >
      {/* 1. Seleção de Branches (Topo) */}
      <div class="p-4 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700/60 flex items-center gap-3 text-xs">
        <div class="flex flex-col gap-1 w-64">
          <span class="text-gray-500 dark:text-gray-400 font-bold ml-1">Source branch</span>
          <Show when={sourceKey() >= 0}>
            <SearchableSelect 
              options={branchOptions()}
              initialValue={sourceBranch()}
              onSelect={(val) => setSourceBranch(val)}
              placeholder="Select source branch..."
              class="w-full font-semibold"
            />
          </Show>
        </div>

        <div class="flex items-end h-full pt-5">
          <button
            type="button"
            onClick={handleInvertBranches}
            title="Invert source and target"
            class="p-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 hover:border-blue-300 dark:hover:border-blue-900 transition-all shadow-sm active:scale-95"
          >
            <i class="fa-solid fa-right-left"></i>
          </button>
        </div>

        <div class="flex flex-col gap-1 w-64">
          <span class="text-gray-500 dark:text-gray-400 font-bold ml-1">Target branch</span>
          <Show when={targetKey() >= 0}>
            <SearchableSelect 
              options={branchOptions()}
              initialValue={targetBranch()}
              onSelect={(val) => setTargetBranch(val)}
              placeholder="Select target branch..."
              class="w-full font-semibold"
            />
          </Show>
        </div>
      </div>

      {/* 2. Abas de Navegação */}
      <div class="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/40 text-xs">
        <button 
          class={`px-4 py-2.5 border-b-2 font-bold transition-colors ${activeTab() === 'overview' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
          onClick={() => setActiveTab("overview")}
        >
          Overview
        </button>
        <button 
          disabled={!canProceed()}
          class={`px-4 py-2.5 border-b-2 font-bold flex items-center gap-1.5 disabled:opacity-40 transition-colors ${activeTab() === 'files' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
          onClick={() => setActiveTab("files")}
        >
          Files <span class="bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-[10px] px-1.5 py-0.5 rounded-full">{countFiles()}</span>
        </button>
        <button 
          disabled={!canProceed()}
          class={`px-4 py-2.5 border-b-2 font-bold flex items-center gap-1.5 disabled:opacity-40 transition-colors ${activeTab() === 'commits' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
          onClick={() => setActiveTab("commits")}
        >
          Commits <span class="bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-[10px] px-1.5 py-0.5 rounded-full">{countCommits()}</span>
        </button>
      </div>

      {/* 3. Área de Conteúdo Scrollável com Mensagens Ocultando o Form */}
      <div class="flex-1 overflow-y-auto p-4 custom-scrollbar min-h-[300px] bg-white dark:bg-gray-800">
        
        {/* Loader de Validação */}
        <Show when={validation.loading}>
          <div class="flex flex-col items-center justify-center py-20 text-gray-500 dark:text-gray-400 text-xs gap-3">
            <i class="fa-solid fa-spinner fa-spin text-blue-500 text-xl"></i>
            <span>Verificando compatibilidade e histórico de alterações...</span>
          </div>
        </Show>

        {/* 🎯 ZONA DE MENSAGENS BLOQUEANTES (Esconde o formulário igual ao Azure DevOps) */}
        <Show when={!validation.loading}>
          
          <Show when={isIdentical()}>
            <div class="p-4 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800/40 rounded-xl text-yellow-800 dark:text-yellow-400 text-xs flex items-center gap-3 shadow-sm my-4">
              <i class="fa-solid fa-triangle-exclamation text-base text-yellow-500"></i>
              <div>
                <p class="font-bold">As branches não podem ser idênticas</p>
                <p class="opacity-80 mt-0.5">Selecione uma branch de origem diferente para poder comparar as diferenças.</p>
              </div>
            </div>
          </Show>

          <Show when={prExists()}>
            <div class="p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/40 rounded-xl text-blue-800 dark:text-blue-400 text-xs flex items-center justify-between shadow-sm my-4">
              <div class="flex items-center gap-3">
                <i class="fa-solid fa-circle-info text-base text-blue-500"></i>
                <div>
                  <p class="font-bold">Já existe um pull request ativo entre essas branches.</p>
                  <p class="opacity-80 mt-0.5">Você não pode criar duplicatas para o mesmo mapeamento de origem e destino.</p>
                </div>
              </div>
              <Show when={validation()?.existingPrId}>
                <button 
                  type="button" 
                  class="bg-blue-600 hover:bg-blue-500 text-white font-bold px-3 py-1.5 rounded-lg transition-colors shadow-sm whitespace-nowrap"
                  onClick={() => console.log("Navegar para o PR: ", validation()?.existingPrId)}
                >
                  Ver Pull Request #{validation()?.existingPrId}
                </button>
              </Show>
            </div>
          </Show>

          <Show when={noChanges() && !isIdentical()}>
            <div class="p-12 text-center text-gray-400 dark:text-gray-500 text-xs flex flex-col items-center justify-center gap-3 my-4">
              <div class="bg-gray-100 dark:bg-gray-900 p-4 rounded-full text-gray-500 dark:text-gray-400 shadow-inner">
                <i class="fa-solid fa-code-commit text-2xl"></i>
              </div>
              <div>
                <p class="font-bold text-gray-700 dark:text-gray-300 text-sm">Nenhuma alteração encontrada</p>
                <p class="max-w-sm mx-auto opacity-80 mt-1">A branch <span class="font-mono bg-gray-150 dark:bg-gray-700 px-1 py-0.5 rounded text-blue-500">{sourceBranch()}</span> já está totalmente sincronizada com <span class="font-mono bg-gray-150 dark:bg-gray-700 px-1 py-0.5 rounded text-blue-500">{targetBranch()}</span>.</p>
              </div>
            </div>
          </Show>
        </Show>

        {/* 🎯 SINAL VERDE: Exibe os formulários originais e as Abas */}
        <Show when={canProceed()}>
          
          {/* ABA OVERVIEW */}
          <Show when={activeTab() === "overview"}>
            <form onSubmit={handleSubmit} class="grid grid-cols-3 gap-4 text-xs">
              <div class="col-span-2 flex flex-col gap-4">
                <div>
                  <label class="font-bold text-gray-600 dark:text-gray-400 block mb-1">Título</label>
                  <input 
                    type="text" 
                    placeholder="Ex: chore: ajust local properties"
                    value={title()}
                    onInput={(e) => setTitle(e.currentTarget.value)}
                    required
                    class="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg p-2 text-gray-800 dark:text-gray-100 outline-none focus:border-blue-500 transition-colors shadow-inner"
                  />
                </div>

                <div>
                  <label class="font-bold text-gray-600 dark:text-gray-400 block mb-1">Descrição</label>
                  <MarkdownEditor 
                    value={description()}
                    placeholder="Adicione os detalhes da implementação em Markdown..."
                    onInput={(val) => setDescription(val)}
                  />
                </div>
              </div>

              <div class="col-span-1 border-l border-gray-200 dark:border-gray-700 pl-4 flex flex-col gap-3">
                <div>
                  <label class="font-bold text-gray-600 dark:text-gray-400 block mb-1">Revisores</label>
                  <div class="flex gap-1.5 mb-2">
                    <input 
                      type="text" 
                      placeholder="Adicionar revisor..." 
                      value={newReviewer()}
                      onInput={(e) => setNewReviewer(e.currentTarget.value)}
                      class="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1 text-xs text-gray-800 dark:text-gray-100 outline-none"
                    />
                    <button onClick={handleAddReviewer} class="bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 px-2.5 rounded-md font-bold transition-colors">+</button>
                  </div>
                  <div class="flex flex-wrap gap-1">
                    <For each={reviewers()}>
                      {(r) => (
                        <span class="bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-[10px] px-2 py-0.5 rounded-full font-medium">
                          {r}
                        </span>
                      )}
                    </For>
                  </div>
                </div>
              </div>
            </form>
          </Show>

          {/* ABA FILES */}
          <Show when={activeTab() === "files"}>
            <div class="flex flex-col gap-1.5">
              <For each={validation()?.files}>
                {(file) => (
                  <div class="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-mono shadow-sm">
                    <span class="text-gray-750 dark:text-gray-300 truncate mr-2">{file.path}</span>
                    <span class="text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase">{file.status}</span>
                  </div>
                )}
              </For>
            </div>
          </Show>

          {/* ABA COMMITS */}
          <Show when={activeTab() === "commits"}>
            <div class="flex flex-col gap-2">
              <For each={validation()?.commits}>
                {(commit) => (
                  <div class="p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm flex flex-col gap-1 text-xs">
                    <div class="flex justify-between items-center font-mono">
                      <span class="text-blue-600 dark:text-blue-400 font-bold">{commit.id}</span>
                      <span class="text-gray-400 dark:text-gray-500 text-[10px]">{commit.author}</span>
                    </div>
                    <p class="text-gray-800 dark:text-gray-200 font-medium">{commit.message}</p>
                  </div>
                )}
              </For>
            </div>
          </Show>

        </Show>
      </div>

      {/* 4. Footer do Dialog */}
      <div class="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-b-xl flex justify-end gap-2 text-xs">
        <button 
          onClick={props.onClose} 
          class="px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg font-bold transition-colors"
        >
          Cancelar
        </button>
        <button 
          disabled={!canProceed() || !title().trim() || validation.loading}
          onClick={handleSubmit}
          class="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg disabled:opacity-40 disabled:hover:bg-blue-600 transition-colors shadow-sm"
        >
          Criar Pull Request
        </button>
      </div>
    </Dialog>
  );
}