import { createEffect, createMemo, createSignal, For, onCleanup, Show, untrack } from "solid-js";
import { Repo } from "../../models/Repo.model";
import { AmendInfo, applyPatchToIndex, commit, createGitattributes, discard_changes, getAmendDiff, getAmendInfo, getDiff, ignoreFile, LineEndingChanges, listAmendChanges, listLineEndingChanges, normalizeLineEndings, removeFromAmend, stageFiles, unstageFiles } from "../../services/gitService";
import ConfirmModal from "../ui/ConfirmModal";
import { FolderTreeView } from "../ui/FolderTreeview";
import { ChangeListView } from "../ui/ChangeListView";
import LocalChangesSettingsModal from "./LocalChangesSettingsModal";
import { useRepoContext } from "../../context/RepoContext";
import DiffViewer from "../ui/DiffViewer";
import LocalChangeEditor from "./LocalChangeEditor";
import { LocalChange } from "../../models/LocalChanges.model";
import ContextMenu, { ContextMenuItem } from "../ui/ContextMenu";
import { openVsCodeDiff } from "../../services/openService";
import { Diff } from "../../models/Diff.model";
import { notify } from "../../utils/notifications";
import { useLoading } from "../ui/LoadingContext";
import { useApp } from "../../context/AppContext";
import { generateCommitSuggestion } from "../../services/aiService";
import { PREVIEW_MAX_BYTES } from "../../utils/file";
import AIKeyModal from "../ai/AIKeyModal";
import { AIConfig } from "../../models/AI.model";

// Largura da lista de arquivos compartilhada entre abas (sobrevive à remontagem).
const [sidebarWidth, setSidebarWidth] = createSignal(300);

export function LocalChanges(props: { repo: Repo; }) {
  const minWidth = 200;
  const maxWidth = 600;

  const [changes, setChanges] = createSignal<LocalChange[]>([]);
  const [selected, setSelected] = createSignal<string[]>([]);
  const [fileSelected, setFileSelected] = createSignal<string>("");
  const [stagedPreparedSelected, setStagedPreparedSelected] = createSignal<string[]>([]);
  const [isResizing, setIsResizing] = createSignal(false);
  const [startX, setStartX] = createSignal(0);
  const [startWidth, setStartWidth] = createSignal(0);
  const [commitMessage, setCommitMessage] = createSignal("");
  const [commitDescription, setCommitDescription] = createSignal("");
  const [commitAmend, setCommitAmend] = createSignal(false);
  const [amendInfo, setAmendInfo] = createSignal<AmendInfo | null>(null);
  const [amendChanges, setAmendChanges] = createSignal<LocalChange[]>([]);
  const [amendLoading, setAmendLoading] = createSignal(false);
  const [amendWarnings, setAmendWarnings] = createSignal<string[] | null>(null);
  let amendSavedDraft: { message: string; description: string } | null = null;
  let amendRequestId = 0;
  const [eolChanges, setEolChanges] = createSignal<LineEndingChanges>({ files: [], hasGitattributes: true });
  const [eolBusy, setEolBusy] = createSignal(false);
  let eolRequestId = 0;
  let lastRepoPath: string | undefined;
  let diffRequestId = 0;
  const { refreshBranches, refreshLocalChanges, commitDrafts, updateCommitDraft, clearCommitDraft } = useRepoContext();
  const [diff, setDiff] = createSignal<Diff>({diff: ""});
  const [menuVisible, setMenuVisible] = createSignal(false);
  const [menuPos, setMenuPos] = createSignal({ x: 0, y: 0 });
  const { showLoading, hideLoading } = useLoading();
  const [isMerging, setIsMerging] = createSignal(false);
  const [isVisualizingStaged, setIsVisualizingStaged] = createSignal(false);
  const [menuItems, setMenuItems] = createSignal<ContextMenuItem[]>([]);
  const [contextTarget, setContextTarget] = createSignal<{ path: string; staged: boolean } | null>(null);
  const [isGeneratingAI, setIsGeneratingAI] = createSignal(false);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [aiKeyModalOpen, setAiKeyModalOpen] = createSignal(false);

  const saveCommitDraft = (message: string, description: string) => {
    if (untrack(commitAmend)) return;
    updateCommitDraft(props.repo.path, { message, description });
  };
  const [viewMode, setViewMode] = createSignal<"tree" | "list">(
    localStorage.getItem("local-changes-view-mode") === "list" ? "list" : "tree"
  );
  const { t, aiConfig, updateAIConfig } = useApp();

  const summaryDiff = (change: LocalChange): Diff => ({
    diff: "",
    size: change.size,
    lineCount: change.lineCount,
    isBinary: change.isBinary,
    isPreviewable: false,
    truncated: change.size !== undefined && change.size > PREVIEW_MAX_BYTES,
    hasConflict: change.status === "conflicted",
    reason: change.isBinary ? "binary" : "unsupported_or_large",
    newFile: change.path,
  });

  const changeSignature = (items: LocalChange[]) => items.map(item => [
    item.path,
    item.status,
    item.staged,
    item.size,
    item.isBinary,
    item.isPreviewable,
  ].join("|")).join("\u0000");

  const syncChanges = async (res: LocalChange[]) => {
    if (isMerging()) return;

    const previousChanges = changes();
    const viewingStaged = isVisualizingStaged();
    const findSelected = (items: LocalChange[], path: string) =>
      items.find(change => change.path === path && change.staged === viewingStaged)
      ?? items.find(change => change.path === path);
    const previousSelectedChange = findSelected(previousChanges, fileSelected());
    const listChanged = changeSignature(res) !== changeSignature(previousChanges);

    if (listChanged) {
      setChanges(res);
    }

    const currentPaths = res.map(c => c.path);
    const amendActive = untrack(commitAmend);
    setSelected(prev => prev.filter(p => currentPaths.includes(p)));
    if (!amendActive) setStagedPreparedSelected(prev => prev.filter(p => currentPaths.includes(p)));

    const selectedPath = fileSelected();
    if (amendActive && viewingStaged) return;
    if (selectedPath) {
      const fileExists = findSelected(res, selectedPath);
      if (fileExists) {
        const selectedChangeChanged = !previousSelectedChange
          || changeSignature([previousSelectedChange]) !== changeSignature([fileExists]);
        if (!selectedChangeChanged) return;

        const currentDiffRequestId = ++diffRequestId;
        const newDiff = fileExists.isPreviewable === false
          ? summaryDiff(fileExists)
          : await getDiff(props.repo.path, selectedPath, viewingStaged, fileExists.status);
        if (currentDiffRequestId === diffRequestId && fileSelected() === selectedPath && isVisualizingStaged() === viewingStaged
          && (newDiff.diff !== diff().diff || newDiff.reason !== diff().reason || newDiff.truncated !== diff().truncated)) {
          setDiff(newDiff);
        }
      } else {
        diffRequestId++;
        setFileSelected("");
        setDiff({diff: ""});
      }
    }
  };

  const loadChanges = async () => {
    await refreshLocalChanges(props.repo.path);
  };

  createEffect(() => {
    const newPath = props.repo.path;
    const localChanges = props.repo.localChanges ?? [];
    if (!newPath) return;

    if (newPath !== lastRepoPath) {
      setChanges([]);
      setSelected([]);
      setStagedPreparedSelected([]);
      setFileSelected("");
      setDiff({diff: ""});

      amendRequestId++;
      amendSavedDraft = null;
      setCommitAmend(false);
      setAmendInfo(null);
      setAmendChanges([]);
      setAmendWarnings(null);

      const draft = commitDrafts()[newPath] ?? { message: "", description: "" };
      setCommitMessage(draft.message);
      setCommitDescription(draft.description);
      lastRepoPath = newPath;
    }

    void syncChanges(localChanges);
    void refreshEolChanges();
    if (untrack(commitAmend)) void refreshAmendChanges();
  });


  const startResize = (e: MouseEvent) => {
    setIsResizing(true);
    setStartX(e.clientX);
    setStartWidth(sidebarWidth());
  };
  const stopResize = () => setIsResizing(false);
  const onMouseMove = (e: MouseEvent) => {
    if (!isResizing()) return;
    const deltaX = e.clientX - startX();
    let newWidth = startWidth() + deltaX;
    if (newWidth < minWidth) newWidth = minWidth;
    if (newWidth > maxWidth) newWidth = maxWidth;
    setSidebarWidth(newWidth);
  };

  const normalStaged = () => changes().filter((c) => c.staged && c.status !== "untracked");
  const staged = () => (commitAmend() ? amendChanges() : normalStaged());

  const refreshAmendChanges = async () => {
    const requestId = ++amendRequestId;
    try {
      const list = await listAmendChanges(props.repo.path);
      if (requestId !== amendRequestId || !commitAmend()) return;

      const previousSignature = changeSignature(amendChanges());
      setAmendChanges(list);
      setStagedPreparedSelected(prev => prev.filter(path => list.some(change => change.path === path)));

      const selectedPath = fileSelected();
      if (selectedPath && isVisualizingStaged()) {
        if (!list.some(change => change.path === selectedPath)) {
          setFileSelected("");
          clearDiff();
        } else if (changeSignature(list) !== previousSignature) {
          void loadDiff(true);
        }
      }
    } catch (error) {
      if (requestId === amendRequestId) notify.error(t('error').error, String(error));
    }
  };

  const leaveStagedView = () => {
    setStagedPreparedSelected([]);
    if (isVisualizingStaged()) {
      setFileSelected("");
      clearDiff();
    }
  };

  const exitAmend = (restoreDraft: boolean) => {
    amendRequestId++;
    setCommitAmend(false);
    setAmendInfo(null);
    setAmendChanges([]);
    leaveStagedView();
    if (restoreDraft && amendSavedDraft) {
      setCommitMessage(amendSavedDraft.message);
      setCommitDescription(amendSavedDraft.description);
    }
    amendSavedDraft = null;
  };

  const toggleAmend = async (checked: boolean) => {
    if (!checked) {
      exitAmend(true);
      return;
    }

    setAmendLoading(true);
    try {
      const info = await getAmendInfo(props.repo.path);
      if (!info.hasHead) {
        notify.error(t('git').amend, t('amend').no_commits);
        return;
      }
      if (info.operationInProgress) {
        notify.error(t('git').amend, t('amend').operation_in_progress.replace('{{op}}', info.operationInProgress));
        return;
      }

      amendSavedDraft = { message: commitMessage(), description: commitDescription() };
      setAmendInfo(info);
      setCommitAmend(true);
      setCommitMessage(info.subject ?? "");
      setCommitDescription(info.body ?? "");
      leaveStagedView();
      await refreshAmendChanges();
    } catch (error) {
      notify.error(t('error').error, String(error));
    } finally {
      setAmendLoading(false);
    }
  };
  const unstaged = () => changes().filter((c) => !c.staged || c.status == "untracked");

  const toggleItem = (path: string, _select: boolean, _isFile: boolean) => {
    if (path === fileSelected() && !isVisualizingStaged()) {
      clearDiff();
      setFileSelected("");
      setSelected((prev) => prev.filter((p) => p !== path));
      return;
    }

    setIsVisualizingStaged(false);
    setFileSelected(path);
    setSelected((prev) => (prev.includes(path) ? prev : [...prev, path]));
    void loadDiff(false);
  };

  const toggleItems = (paths: string[], select: boolean) => {
    setSelected((prev) => {
      if (!select) return prev.filter((path) => !paths.includes(path));
      const selectedPaths = new Set(prev);
      paths.forEach((path) => selectedPaths.add(path));
      return [...selectedPaths];
    });
  };

  const toggleStagedItems = (paths: string[], select: boolean) => {
    setStagedPreparedSelected((prev) => {
      if (!select) return prev.filter((path) => !paths.includes(path));
      const selectedPaths = new Set(prev);
      paths.forEach((path) => selectedPaths.add(path));
      return [...selectedPaths];
    });
  };

  const toggleStagedItem = (path: string, select: boolean, isFile?: boolean) => {
    setStagedPreparedSelected((prev) => {
      if (select) {
        return prev.includes(path) ? prev : [...prev, path];
      } else {
        return prev.filter((p) => p !== path);
      }
    });

    if (!isFile) return;

    if (path === fileSelected() && isVisualizingStaged()) {
      if (!select) {
        setFileSelected("");
        clearDiff();
      }
      return;
    }

    setStagedPreparedSelected((prev) => (prev.includes(path) ? prev : [...prev, path]));
    setIsVisualizingStaged(true);
    setFileSelected(path);
    void loadDiff(true);
  };

  const openSelectedInVsCode = async (filePath: string) => {
    try {
      await openVsCodeDiff(props.repo.path, filePath);
    } catch (error) {
      notify.error(t('error').error, String(error));
    }
  };

  const updateViewMode = (mode: "tree" | "list") => {
    setViewMode(mode);
    localStorage.setItem("local-changes-view-mode", mode);
  };

  const ignoreSelectedFile = async (filePath: string) => {
    try {
      await ignoreFile(props.repo.path, filePath);
      notify.success(t('git').ignore_file, t('git').file_ignored);
      setSelected((prev) => prev.filter((path) => path !== filePath));
      setStagedPreparedSelected((prev) => prev.filter((path) => path !== filePath));
      if (fileSelected() === filePath) {
        setFileSelected("");
        clearDiff();
      }
      await loadChanges();
    } catch (error) {
      notify.error(t('error').error, String(error));
    }
  };

  const showContextMenu = (e: MouseEvent, item: any = null) => {
    e.preventDefault();
    setContextTarget(item?.path ? { path: item.path, staged: !!item.staged } : null);

    let items = []
    if (item && item.path) {
      if (!item.staged) {
        items.push({ label: t('git').prepare, action: () => prepare([item.path]) });
      }
      else {
        items.push({ label: t('git').undo, action: () => unstage([item.path]) });
      }

      items.push({
        label: t('branch').open_diff_vscode,
        hr: true,
        action: () => openSelectedInVsCode(item.path),
      });
      items.push({
        label: t('git').ignore_file,
        action: () => ignoreSelectedFile(item.path),
      });
    }
    items.push({ label: t('git').prepare_all, action: () => prepareAll() });
    items.push({
      label: t('branch').discart_changes,
      action: () => discard(item?.path ? [item.path] : selected()),
    });

    setMenuItems(items);
    setMenuPos({ x: e.clientX, y: e.clientY });
    setMenuVisible(true);
  };

  const hideContextMenu = () => {
    setMenuVisible(false);
    setContextTarget(null);
  };

  const contextPathFor = (staged: boolean) => {
    const target = contextTarget();
    return menuVisible() && target && target.staged === staged ? target.path : null;
  };

  document.addEventListener("click", hideContextMenu);
  onCleanup(() => document.removeEventListener("click", hideContextMenu));

  const loadDiff = async (staged: boolean) => {
    const requestId = ++diffRequestId;
    const selectedPath = fileSelected();
    const amendView = staged && commitAmend();
    const change = amendView
      ? amendChanges().find(item => item.path === selectedPath)
      : changes().find(item => item.path === selectedPath && item.staged === staged)
        ?? changes().find(item => item.path === selectedPath);

    if (!change) {
      clearDiff();
      return;
    }

    if (change.isPreviewable === false) {
      setDiff(summaryDiff(change));
      return;
    }

    try {
      const result = amendView
        ? await getAmendDiff(props.repo.path, selectedPath)
        : await getDiff(props.repo.path, selectedPath, staged, change.status);
      if (requestId === diffRequestId && fileSelected() === selectedPath && isVisualizingStaged() === staged) {
        setDiff(result);
      }
    } catch (error) {
      if (requestId !== diffRequestId) return;
      console.error("Erro ao carregar diff:", error);
      notify.error(t('error').load_file, String(error));
    }
  }

  const prepare = async (paths: string[]) => {
    await stageFiles(props.repo.path, paths);
    setSelected([]);
    clearDiff();
    setFileSelected("");
    await loadChanges();
  }

  const refreshEolChanges = async () => {
    const requestId = ++eolRequestId;
    const repoPath = props.repo.path;
    const hasModified = (props.repo.localChanges ?? []).some(change => !change.staged && change.status === "modified");
    if (!hasModified) {
      setEolChanges({ files: [], hasGitattributes: true });
      return;
    }
    try {
      const result = await listLineEndingChanges(repoPath);
      if (requestId === eolRequestId && repoPath === props.repo.path) setEolChanges(result);
    } catch {
      if (requestId === eolRequestId) setEolChanges({ files: [], hasGitattributes: true });
    }
  };

  const normalizeEol = async (files: string[]) => {
    if (files.length === 0 || eolBusy()) return;
    setEolBusy(true);
    try {
      const count = await normalizeLineEndings(props.repo.path, files);
      notify.success(t('eol').title, t('eol').normalized.replace('{{count}}', String(count)));
      await loadChanges();
      if (fileSelected()) await loadDiff(isVisualizingStaged());
    } catch (error) {
      notify.error(t('error').error, String(error));
    } finally {
      setEolBusy(false);
    }
  };

  const addGitattributes = async () => {
    try {
      await createGitattributes(props.repo.path);
      notify.success(t('eol').title, t('eol').gitattributes_created);
      await loadChanges();
      await refreshEolChanges();
    } catch (error) {
      notify.error(t('error').error, String(error));
    }
  };

  const changeSide = (path: string, stagedSide: boolean) => {
    if (stagedSide && commitAmend()) return amendChanges().some(change => change.path === path);
    return changes().some(change => change.path === path && (stagedSide
      ? change.staged && change.status !== "untracked"
      : !change.staged || change.status === "untracked"));
  };

  const applyHunk = async (patch: string, reverse: boolean) => {
    const path = fileSelected();
    try {
      await applyPatchToIndex(props.repo.path, patch, reverse);
    } catch (error) {
      notify.error(t('hunk').error, String(error));
      return;
    }
    await loadChanges();
    if (commitAmend()) await refreshAmendChanges();
    if (!path || fileSelected() !== path) return;

    let view = isVisualizingStaged();
    if (!changeSide(path, view) && changeSide(path, !view)) {
      view = !view;
      setIsVisualizingStaged(view);
    }
    if (!changeSide(path, view)) {
      setFileSelected("");
      clearDiff();
      return;
    }
    await loadDiff(view);
  };

  const hunkActionFor = () => {
    const status = selectedStatus();
    if (!fileSelected() || status === "untracked" || status === "conflicted") return undefined;
    return isVisualizingStaged() ? "unstage" as const : "stage" as const;
  };

  const titleLength = () => commitMessage().trim().length;
  const titleIssues = createMemo(() => {
    const title = commitMessage().trim();
    const issues: { level: "error" | "warn"; text: string }[] = [];
    if (title.length > 72) issues.push({ level: "error", text: t('commit_msg').too_long.replace('{{count}}', String(title.length)) });
    else if (title.length > 50) issues.push({ level: "warn", text: t('commit_msg').long }); 
    if (title.endsWith(".")) issues.push({ level: "warn", text: t('commit_msg').trailing_period });
    return issues;
  });

  const prepareAll = async () => {
    const allPaths = changes().map(c => c.path);
    await stageFiles(props.repo.path, allPaths);
    setSelected(allPaths);
    clearDiff();
    setFileSelected("");
    await loadChanges();
  };

  // Executa de fato a chamada à IA e aplica a sugestão nos campos de commit.
  const runAIGeneration = async (config: AIConfig) => {
    try {
      setIsGeneratingAI(true);
      const [suggestedTitle, suggestedDescription] = await generateCommitSuggestion(props.repo.path, config);

      // Alimenta os inputs da sua tela automaticamente
      setCommitMessage(suggestedTitle);
      setCommitDescription(suggestedDescription);
      saveCommitDraft(suggestedTitle, suggestedDescription);
      notify.success("Sucesso", "Sugestão de commit aplicada!");
    } catch (err) {
      console.error(err);
      notify.error("Erro na IA", String(err));
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const handleAIGenerate = async () => {
    if (staged().length === 0) {
      notify.error("Ops!", "Você precisa preparar (stage) alguns arquivos antes de pedir ajuda à IA.");
      return;
    }
    const config = aiConfig();
    if (!config) {
      // Sem chave de IA configurada: abre o modal para escolher a IA (Gemini, GPT ou Claude) e informar a chave.
      setAiKeyModalOpen(true);
      return;
    }

    await runAIGeneration(config);
  };

  // Chamado ao confirmar o modal de configuração de IA: salva a chave para a
  // sessão (mesmo mecanismo usado pela tela de IA) e já gera a sugestão.
  const handleAIKeyConfirm = async (config: AIConfig) => {
    updateAIConfig(config);
    setAiKeyModalOpen(false);
    await runAIGeneration(config);
  };

  const unstage = async (paths: string[]) => {
    const targets = paths.length > 0 ? paths : staged().map(change => change.path);
    if (targets.length === 0) return;
    try {
      if (commitAmend()) await removeFromAmend(props.repo.path, targets);
      else await unstageFiles(props.repo.path, targets);
    } catch (error) {
      notify.error(t('error').error, String(error));
      return;
    }
    setSelected([]);
    setStagedPreparedSelected([]);
    clearDiff();
    setFileSelected("");
    await loadChanges();
    if (commitAmend()) await refreshAmendChanges();
  }

  const discard = async (paths: string[]) => {
    if (paths.length === 0) return;

    try {
      await discard_changes(props.repo.path, paths);
      setSelected([]);
      setStagedPreparedSelected([]);
      setFileSelected("");
      clearDiff();
      await loadChanges();
    } catch (error) {
      notify.error(t('error').error, String(error));
    }
  }

  const fullCommitMessage = (message: string, description: string) => {
    const title = message.trim();
    const body = description.trim();
    return body ? `${title}\n\n${body}` : title;
  };

  const handleCommit = async () => {
    if (!commitMessage().trim()) {
      notify.error('Ops!', t('commits').enter_commit_message);
      return;
    }

    if (!commitAmend()) {
      await runCommit(false);
      return;
    }

    let info: AmendInfo;
    try {
      info = await getAmendInfo(props.repo.path);
    } catch (error) {
      notify.error(t('error').error, String(error));
      return;
    }
    if (!info.hasHead) {
      notify.error(t('git').amend, t('amend').no_commits);
      return;
    }
    if (info.operationInProgress) {
      notify.error(t('git').amend, t('amend').operation_in_progress.replace('{{op}}', info.operationInProgress));
      return;
    }
    if (info.hash !== amendInfo()?.hash) {
      notify.error(t('git').amend, t('amend').head_changed);
      exitAmend(true);
      return;
    }
    setAmendInfo(info);

    if (amendChanges().length === 0) {
      notify.error(t('git').amend, t('amend').empty_commit);
      return;
    }

    const sameMessage = fullCommitMessage(commitMessage(), commitDescription())
      === fullCommitMessage(info.subject ?? "", info.body ?? "");
    if (normalStaged().length === 0 && sameMessage) {
      notify.error(t('git').amend, t('amend').nothing_changed);
      return;
    }

    const warnings: string[] = [];
    if (info.pushed) warnings.push(t('amend').pushed_warning.replace('{{upstream}}', info.upstream || 'remoto'));
    if (info.isMerge) warnings.push(t('amend').merge_warning);
    if (info.isCurrentUser === false) warnings.push(t('amend').author_warning.replace('{{author}}', info.authorName || info.authorEmail || ''));

    if (warnings.length > 0) {
      setAmendWarnings(warnings);
      return;
    }

    await runCommit(true);
  };

  const runCommit = async (amend: boolean) => {
    try {
      showLoading("Realizando commit...");
      await commit(props.repo.path, commitMessage(), commitDescription(), amend);
      if (amend) {
        exitAmend(true);
        notify.success(t('git').amend, t('amend').success);
      } else {
        setCommitMessage("");
        setCommitDescription("");
        clearCommitDraft(props.repo.path);
      }
      clearDiff();
      await refreshBranches(props.repo.path);
    } catch (err) {
      console.error("Erro no commit:", err);
      notify.error(t('error').error, `${t('error').load_commits}: ${err}`);
    } finally {
      hideLoading();
    }
  };

  const clearDiff = () => setDiff({diff: ""});

  // Status do arquivo aberto no diff (usado para saber se a imagem é nova/apagada).
  const selectedStatus = () => {
    const selectedPath = fileSelected();
    if (!selectedPath) return undefined;
    const staged = isVisualizingStaged();
    if (staged && commitAmend()) return amendChanges().find(item => item.path === selectedPath)?.status;
    return (changes().find(item => item.path === selectedPath && item.staged === staged)
      ?? changes().find(item => item.path === selectedPath))?.status;
  };  

  return (
    <div class="flex h-full min-w-0 flex-1 select-none pt-2 mr-1"
      onMouseMove={onMouseMove}
      onMouseUp={stopResize}
      onMouseLeave={stopResize}>
      <div class="container-branch-list mb-2 shrink-0 overflow-auto border-r py-3 px-0" style={{ width: `${sidebarWidth()}px` }}>
        <div style={{"height": "40px"}} class="flex flex-col">
          <div class="border-y border-gray-300 bg-gray-100 dark:bg-gray-800 dark:border-gray-700 px-4 py-1 mb-3 flex items-center" onContextMenu={showContextMenu}>
            <b>{t('file').updates}</b>
            <button
              class="ml-auto px-2 py-1 text-gray-500 hover:text-blue-500"
              title={t('git').settings}
              aria-label={t('git').settings}
              onClick={() => setSettingsOpen(true)}
            >
              <i class="fa-solid fa-gear"></i>
            </button>
            <button class="px-3 py-1 text-sm bg-blue-500 text-white rounded-lg disabled:opacity-50"
              disabled={selected().length === 0}
              onClick={() => prepare(selected())}>
              {t('git').prepare}
            </button>
          </div>
          <Show when={eolChanges().files.length > 0}>
            <div class="mx-3 mb-2 rounded-lg border border-sky-300 bg-sky-50 px-2.5 py-1.5 text-[11px] text-sky-800 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-200">
              <div class="flex items-start gap-1.5">
                <i class="fa-solid fa-arrow-turn-down mt-0.5"></i>
                <span title={eolChanges().files.join("\n")}>{t('eol').banner.replace('{{count}}', String(eolChanges().files.length))}</span>
              </div>
              <div class="mt-1.5 flex flex-wrap gap-1.5">
                <button class="rounded-md bg-sky-600 px-2 py-0.5 font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
                  disabled={eolBusy()} onClick={() => normalizeEol(eolChanges().files)}>
                  <i class={`fa-solid mr-1 ${eolBusy() ? "fa-spinner animate-spin" : "fa-wand-magic"}`}></i>{t('eol').normalize_all}
                </button>
                <Show when={!eolChanges().hasGitattributes}>
                  <button class="rounded-md border border-sky-400 px-2 py-0.5 font-semibold hover:bg-sky-500/10"
                    title={t('eol').gitattributes_hint} onClick={addGitattributes}>
                    {t('eol').create_gitattributes}
                  </button>
                </Show>
              </div>
            </div>
          </Show>
          {unstaged().length === 0 && <div class="px-4 text-center text-gray-400">{t('git').no_changes}</div>}
          <Show when={viewMode() === "tree"} fallback={
            <ChangeListView
              items={unstaged()}
              selected={selected()}
              staged={false}
              contextPath={contextPathFor(false)}
              onToggle={toggleItem}
              onContextMenu={showContextMenu}
              onDbClick={(items: string[]) => prepare(items)}
            />
          }>
            <FolderTreeView items={unstaged()} selectMode="multi"
              selected={selected()} staged={false} showStatus={true} contextPath={contextPathFor(false)}
              onToggle={toggleItem} onToggleMany={toggleItems} onContextMenu={showContextMenu}
              onDbClick={(items: string[]) => prepare(items)}
            />
          </Show>

          <div class="border-y border-gray-300 bg-gray-100 dark:bg-gray-800 dark:border-gray-700 px-4 py-1 flex items-center mt-2 mb-3">
            <b class="mr-1">{t('git').prepared}</b>
            <Show when={commitAmend()}>
              <span class="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-600 dark:text-amber-300">amend</span>
            </Show>
            <button class="ml-auto px-3 py-1 text-sm bg-green-500 text-white rounded-lg disabled:opacity-50" 
              disabled={staged().length === 0}
              title={commitAmend() ? t('amend').remove_hint : undefined}
              onclick={() => unstage(stagedPreparedSelected())}>
              {t('git').undo}
            </button>
          </div>

          <Show when={commitAmend() && amendInfo()}>
            {(info) => (
              <div class="mx-3 mb-2 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                <div class="flex min-w-0 items-center gap-1.5">
                  <i class="fa-solid fa-code-commit shrink-0"></i>
                  <span class="shrink-0 font-mono">{(info().hash || "").slice(0, 7)}</span>
                  <span class="min-w-0 truncate" title={info().subject}>{info().subject}</span>
                </div>
                <div class="mt-0.5 opacity-80">{t('amend').banner}</div>
                <Show when={info().pushed}>
                  <div class="mt-1 flex items-center gap-1 font-semibold text-red-600 dark:text-red-400">
                    <i class="fa-solid fa-triangle-exclamation"></i>{t('amend').pushed_badge}
                  </div>
                </Show>
              </div>
            )}
          </Show>
          
          <Show when={viewMode() === "tree"} fallback={
            <ChangeListView
              items={staged()}
              selected={stagedPreparedSelected()}
              staged={true}
              contextPath={contextPathFor(true)}
              onToggle={toggleStagedItem}
              onContextMenu={showContextMenu}
              onDbClick={(items: string[]) => unstage(items)}
            />
          }>
            <FolderTreeView items={staged()} showStatus={true}
              selected={stagedPreparedSelected()} staged={true} selectMode="multi" contextPath={contextPathFor(true)}
              onToggle={toggleStagedItem} onToggleMany={toggleStagedItems} onContextMenu={showContextMenu}
              onDbClick={(items: string[]) => unstage(items)}
            />
          </Show>
        </div>
      </div>

      {/* Barra de resize */}
      <div
        class="resize-bar-vertical"
        onMouseDown={startResize}
      ></div>

      <div class="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        <div class="flex-1 overflow-hidden container-branch-list min-w-0 border border-gray-300 dark:border-gray-700 !p-0">
          <LocalChangeEditor
            repoPath={props.repo.path}
            file={fileSelected()}
            diff={diff()}
            isStaged={isVisualizingStaged()}
            status={selectedStatus()}
            disabled={isMerging()}
            onSaved={async () => {
              await loadChanges();
              await loadDiff(isVisualizingStaged());
            }}
          >
            <DiffViewer diff={diff()} class="h-full" file={fileSelected()}
              path={props.repo.path} isStaged={isVisualizingStaged()} status={selectedStatus()}
              hunkAction={hunkActionFor()}
              onHunkAction={applyHunk}
              onNormalizeEol={() => normalizeEol([fileSelected()])}
              onMergeStatusChange={(open) => setIsMerging(open)}
              onSaveSuccess={(filePath: string) => {
                setIsMerging(false);
                prepare([filePath]);
                loadChanges();
              }} />
          </LocalChangeEditor>
        </div>
        <div class="mt-2 container-branch-list mb-2">
          <div class="flex gap-2 items-center w-full">
            <div class="relative flex-1">
              <input type="text" class="w-full input-text mt-0 pr-20" placeholder={t('commits').commit_message}
                value={commitMessage()} disabled={isGeneratingAI()}
                onInput={(e) => {
                  const message = e.currentTarget.value;
                  setCommitMessage(message);
                  saveCommitDraft(message, commitDescription());
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    void handleCommit();
                  }
                }}
              />
              <Show when={titleLength() > 0}>
                <div class="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5 text-[11px] font-mono">
                  <Show when={titleIssues().length > 0}>
                    <span class="group relative flex cursor-help items-center">
                      <i class="fa-solid fa-circle-exclamation"
                        classList={{
                          "text-red-500": titleIssues().some(issue => issue.level === "error"),
                          "text-amber-500": !titleIssues().some(issue => issue.level === "error"),
                        }}></i>
                      <span class="pointer-events-none absolute bottom-full right-0 z-50 mb-2 hidden w-max max-w-[280px] flex-col gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 font-sans text-xs text-gray-700 shadow-lg group-hover:flex dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
                        <For each={titleIssues()}>
                          {(issue) => <span>{issue.text}</span>}
                        </For>
                      </span>
                    </span>
                  </Show>
                  <span class="pointer-events-none"
                    classList={{
                      "text-gray-400": titleLength() <= 50,
                      "text-amber-500": titleLength() > 50 && titleLength() <= 72,
                      "text-red-500 font-bold": titleLength() > 72,
                    }}>
                    {titleLength()}/72
                  </span>
                </div>
              </Show>
            </div>
            
            <button 
              class="px-3 py-2 bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500 
                    border border-gray-300 dark:border-gray-900 text-gray-700 dark:text-white
                    rounded-lg transition-colors flex items-center justify-center disabled:opacity-40"
              title="Sugerir mensagem com IA"
              onClick={handleAIGenerate}
              disabled={isGeneratingAI() || staged().length === 0}
            >
              <Show when={isGeneratingAI()} fallback={<i class="fa fa-wand-magic-sparkles"></i>}>
                <i class="fa fa-spinner animate-spin"></i>
              </Show>
            </button>
          </div>

          <textarea 
            class="w-full mt-2 input-text min-h-[20px] max-h-[200px] resize-y py-2 custom-scrollbar" 
            placeholder={t('common').description}
            value={commitDescription()}
            onInput={(e) => {
              const description = e.currentTarget.value;
              setCommitDescription(description);
              saveCommitDraft(commitMessage(), description);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void handleCommit();
              }
            }}
            rows="2" disabled={isGeneratingAI()}
          />

          <div class="flex mt-2">
            <div>
              <input
                type="checkbox" id="amend" name="amend"
                checked={commitAmend()} disabled={amendLoading() || isGeneratingAI()}
                onChange={async (e) => {
                  const input = e.currentTarget;
                  await toggleAmend(input.checked);
                  input.checked = commitAmend();
                }}
              />
              <label for="amend" class="ml-1">{t('git').amend}</label>
            </div>
            <button class="pl-2 pr-4 py-1 bg-blue-600 ml-auto text-white rounded-xl" onClick={handleCommit}
              disabled={staged().length === 0 || !commitMessage().trim() || isGeneratingAI() || amendLoading()}>
              <i class="fa fa-check"></i> {t('git').commit}
            </button>
          </div>
        </div>
      </div>
      <LocalChangesSettingsModal
        open={settingsOpen()}
        viewMode={viewMode()}
        onViewModeChange={updateViewMode}
        onClose={() => setSettingsOpen(false)}
        t={t}
      />
      <ConfirmModal
        isOpen={amendWarnings() !== null}
        title={t('amend').confirm_title}
        message={(amendWarnings() ?? []).join(" ")}
        confirmText={t('amend').confirm}
        isDanger={true}
        onConfirm={() => {
          setAmendWarnings(null);
          void runCommit(true);
        }}
        onCancel={() => setAmendWarnings(null)}
      />
      <AIKeyModal
        open={aiKeyModalOpen()}
        onClose={() => setAiKeyModalOpen(false)}
        onConfirm={handleAIKeyConfirm}
      />
      <Show when={menuVisible()}>
        <ContextMenu
          name={''}
          items={menuItems()}
          position={menuPos()}
          onClose={hideContextMenu}
        />
      </Show>
    </div>
  );
}
