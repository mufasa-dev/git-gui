import { createSignal, createResource, createMemo, Show, For } from "solid-js";
import Dialog from "../ui/Dialog";

interface CreatePRDialogProps {
  isOpen: boolean;
  onClose: () => void;
  branches: string[];
  currentBranch: string;
  onCreatePR: (data: any) => Promise<void>;
}

export default function CreatePRDialog(props: CreatePRDialogProps) {
  // Estados de Seleção de Branches
  const [sourceBranch, setSourceBranch] = createSignal(props.currentBranch || "");
  const [targetBranch, setTargetBranch] = createSignal("main");
  const [activeTab, setActiveTab] = createSignal("overview"); // overview, files, commits

  // Campos do Formulário
  const [title, setTitle] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [reviewers, setReviewers] = createSignal<string[]>([]);
  const [newReviewer, setNewReviewer] = createSignal("");

  // Recurso para Validar a Comparação entre Branches
  const [comparison] = createResource(
    () => ({ source: sourceBranch(), target: targetBranch() }),
    async ({ source, target }) => {
      if (!source || !target || source === target) return null;

      // Aqui você conecta com seu Tauri invoke ou requisição de API
      return {
        hasChanges: true, 
        alreadyExists: false, 
        commits: [{ id: "sha123", message: "feat: add validation logic", author: "Bruno" }],
        files: [{ path: "src/components/CreatePRDialog.tsx", status: "added" }]
      };
    }
  );

  // Memos auxiliares para as travas da UI
  const canProceed = createMemo(() => {
    const data = comparison();
    if (!data) return false;
    return data.hasChanges && !data.alreadyExists;
  });

  const countCommits = createMemo(() => comparison()?.commits?.length || 0);
  const countFiles = createMemo(() => comparison()?.files?.length || 0);

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
      bodyClass="p-0 flex flex-col max-h-[80vh] overflow-hidden" // Remove padding padrão para as abas encostarem na borda
      onClose={props.onClose}
    >
      {/* 1. Seleção de Branches (Topo) */}
      <div class="p-4 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700/60 flex items-center gap-3 text-xs">
        <div class="flex items-center gap-2 bg-white dark:bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 shadow-sm">
          <span class="text-gray-500 dark:text-gray-400 font-medium">source:</span>
          <select 
            value={sourceBranch()} 
            onChange={(e) => setSourceBranch(e.currentTarget.value)}
            class="bg-transparent text-gray-800 dark:text-gray-200 focus:outline-none cursor-pointer font-semibold"
          >
            <For each={props.branches}>{(b) => <option value={b} class="bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200">{b}</option>}</For>
          </select>
        </div>

        <span class="text-gray-400 dark:text-gray-500 font-bold">into</span>

        <div class="flex items-center gap-2 bg-white dark:bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 shadow-sm">
          <span class="text-gray-500 dark:text-gray-400 font-medium">target:</span>
          <select 
            value={targetBranch()} 
            onChange={(e) => setTargetBranch(e.currentTarget.value)}
            class="bg-transparent text-gray-800 dark:text-gray-200 focus:outline-none cursor-pointer font-semibold"
          >
            <For each={props.branches}>{(b) => <option value={b} class="bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200">{b}</option>}</For>
          </select>
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

      {/* 3. Área de Conteúdo Scrollável */}
      <div class="flex-1 overflow-y-auto p-4 custom-scrollbar min-h-[250px]">
        
        {/* Loader de Validação */}
        <Show when={comparison.loading}>
          <div class="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400 text-xs gap-2">
            <i class="fa-solid fa-spinner fa-spin text-blue-500 text-base"></i>
            <span>Checking compatibility and target path changes...</span>
          </div>
        </Show>

        {/* Mensagens de Guardrail (Erro/Aviso) */}
        <Show when={!comparison.loading && comparison()}>
          <Show when={sourceBranch() === targetBranch()}>
            <div class="p-3 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800/50 rounded-xl text-yellow-700 dark:text-yellow-400 text-xs flex items-center gap-2">
              <i class="fa-solid fa-triangle-exclamation"></i>
              Source and target branches cannot be identical.
            </div>
          </Show>

          <Show when={comparison()?.alreadyExists}>
            <div class="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-xl text-red-700 dark:text-red-400 text-xs flex items-center gap-2">
              <i class="fa-solid fa-circle-exclamation"></i>
              An active pull request already exists for this branch layout.
            </div>
          </Show>

          <Show when={canProceed() && !comparison()?.hasChanges}>
            <div class="p-8 text-center text-gray-400 dark:text-gray-500 text-xs flex flex-col items-center justify-center gap-2">
              <i class="fa-solid fa-code-commit text-xl"></i>
              <span>There are no distinct changes to merge between these branches.</span>
            </div>
          </Show>
        </Show>

        {/* Formulários e Abas Ativas */}
        <Show when={canProceed() && !comparison.loading}>
          
          {/* ABA OVERVIEW */}
          <Show when={activeTab() === "overview"}>
            <form onSubmit={handleSubmit} class="grid grid-cols-3 gap-4 text-xs">
              
              {/* Form de Input */}
              <div class="col-span-2 flex flex-col gap-3">
                <div>
                  <label class="font-bold text-gray-600 dark:text-gray-400 block mb-1">Title</label>
                  <input 
                    type="text" 
                    placeholder="e.g., chore: ajust local properties"
                    value={title()}
                    onInput={(e) => setTitle(e.currentTarget.value)}
                    required
                    class="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg p-2 text-gray-800 dark:text-gray-100 outline-none focus:border-blue-500 dark:focus:border-blue-500 transition-colors shadow-inner"
                  />
                </div>

                <div>
                  <label class="font-bold text-gray-600 dark:text-gray-400 block mb-1">Description</label>
                  <textarea 
                    rows="5"
                    placeholder="Added a draft of the demonstration code..."
                    value={description()}
                    onInput={(e) => setDescription(e.currentTarget.value)}
                    class="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg p-2 text-gray-800 dark:text-gray-100 outline-none focus:border-blue-500 dark:focus:border-blue-500 transition-colors font-mono shadow-inner"
                  />
                </div>
              </div>

              {/* Sidebar do Formulário (Reviewers / Meta) */}
              <div class="col-span-1 border-l border-gray-200 dark:border-gray-700 pl-4 flex flex-col gap-3">
                <div>
                  <label class="font-bold text-gray-600 dark:text-gray-400 block mb-1">Reviewers</label>
                  <div class="flex gap-1.5 mb-2">
                    <input 
                      type="text" 
                      placeholder="Add reviewer..." 
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
              <For each={comparison()?.files}>
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
              <For each={comparison()?.commits}>
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
          Cancel
        </button>
        <button 
          disabled={!canProceed() || !title().trim() || comparison.loading}
          onClick={handleSubmit}
          class="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg disabled:opacity-40 disabled:hover:bg-blue-600 transition-colors shadow-sm"
        >
          Create
        </button>
      </div>
    </Dialog>
  );
}