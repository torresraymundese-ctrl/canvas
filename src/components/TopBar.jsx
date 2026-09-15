import { ArrowLeft, ArrowClockwise, ArrowCounterClockwise, CaretDown, CircleNotch, CloudCheck, FilmSlate, ListChecks, MagicWand, WarningCircle } from "@phosphor-icons/react";

export function TopBar({ state, dispatch, history, activeJobCount = 0, serviceStatus = "checking", onToggleTaskCenter, onRequestDirectorRun }) {
  const isRunning = activeJobCount > 0;
  const isSaving = state.saveStatus === "saving";
  const saveLabel = state.saveStatus === "error" ? "保存失败" : isSaving ? "正在保存…" : "已保存到本机";
  const SaveIcon = state.saveStatus === "error" ? WarningCircle : isSaving ? CircleNotch : CloudCheck;

  return (
    <header className="topbar">
      <div className="topbar__identity">
        <button className="icon-button icon-button--ghost" aria-label="返回项目列表"><ArrowLeft size={19} weight="bold" /></button>
        <div className="brand-mark" aria-label="导演台"><FilmSlate size={21} weight="fill" /></div>
        <strong className="brand-name">导演台</strong><span className="topbar__divider" />
        <button className="project-switcher">春神遗骸 / 第1集 <CaretDown size={14} weight="bold" /></button>
        <span className={`autosave is-${state.saveStatus}`} title={state.savedAt ? `上次保存：${new Date(state.savedAt).toLocaleString("zh-CN")}` : saveLabel}><SaveIcon className={isSaving ? "spin" : ""} size={15} /> {saveLabel}</span>
      </div>

      <div className="mode-switch" aria-label="画布模式">
        <button className={state.mode === "director" ? "is-active" : ""} onClick={() => dispatch({ type: "set-mode", mode: "director" })}>导演模式</button>
        <button className={state.mode === "manual" ? "is-active" : ""} onClick={() => dispatch({ type: "set-mode", mode: "manual" })}>手动模式</button>
      </div>

      <div className="topbar__actions">
        <div className="budget-meter" aria-label={`预算已使用 ${state.spentBudget} 元，共 ${state.totalBudget} 元`}><CircleNotch size={31} weight="bold" /><span><b>¥{state.spentBudget}</b> / ¥{state.totalBudget}</span></div>
        <button className={`icon-button task-center-button is-${serviceStatus}`} aria-label="打开任务中心" title="任务中心" onClick={onToggleTaskCenter}>
          <ListChecks size={19} />{activeJobCount > 0 && <em>{activeJobCount}</em>}
        </button>
        <div className="history-actions">
          <button className="icon-button" aria-label="撤销" title="撤销（Ctrl/Cmd+Z）" disabled={!history.canUndo} onClick={history.undo}><ArrowCounterClockwise size={18} /></button>
          <button className="icon-button" aria-label="重做" title="重做（Ctrl/Cmd+Shift+Z）" disabled={!history.canRedo} onClick={history.redo}><ArrowClockwise size={18} /></button>
        </div>
        <button className={`run-button ${isRunning ? "is-running" : ""}`} onClick={onRequestDirectorRun} disabled={isRunning}>
          {isRunning ? <CircleNotch className="spin" size={18} weight="bold" /> : <MagicWand size={18} weight="fill" />}{isRunning ? "任务生成中" : "自动生成整集"}
        </button>
      </div>
    </header>
  );
}
