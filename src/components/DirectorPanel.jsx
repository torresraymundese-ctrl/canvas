import { useRef, useState } from "react";
import { ArrowUp, Check, FileText, Robot, SidebarSimple, Sparkle } from "@phosphor-icons/react";

const MAX_SCRIPT_BYTES = 1_500_000;
const formatBytes = (bytes = 0) => bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;

export function DirectorPanel({ state, dispatch }) {
  const [draft, setDraft] = useState("");
  const [scriptError, setScriptError] = useState("");
  const scriptInput = useRef(null);

  const sendMessage = (event) => {
    event.preventDefault();
    if (!draft.trim()) return;
    dispatch({ type: "add-message", content: draft });
    setDraft("");
  };

  const importScript = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_SCRIPT_BYTES) {
      setScriptError("剧本文件不能超过 1.5 MB。");
      return;
    }
    try {
      const content = await file.text();
      if (!content.trim()) throw new Error("剧本内容为空。");
      dispatch({ type: "set-script", script: { name: file.name, size: file.size, content, importedAt: new Date().toISOString() } });
      setScriptError("");
    } catch (error) {
      setScriptError(error.message || "无法读取这个剧本文件。");
    }
  };

  return (
    <aside className="director-panel">
      <div className="director-panel__header">
        <div className="agent-avatar"><Robot size={22} weight="fill" /></div>
        <div><strong>导演 Agent</strong><span>{state.models.director}</span></div>
        <button className="icon-button" aria-label={state.directorPanelCollapsed ? "展开导演面板" : "收起导演面板"} title={state.directorPanelCollapsed ? "展开导演面板" : "收起导演面板"} onClick={() => dispatch({ type: "toggle-director-panel" })}><SidebarSimple size={18} /></button>
      </div>

      <section className="panel-section script-section">
        <h2>已导入剧本</h2>
        <button className="script-file" onClick={() => scriptInput.current?.click()} title="点击更换剧本">
          <span className="script-file__icon"><FileText size={20} /></span>
          <span><b>{state.script.name}</b><small>{formatBytes(state.script.size)} · 点击更换</small></span>
          <Check size={16} weight="bold" />
        </button>
        <input className="visually-hidden" ref={scriptInput} type="file" accept=".txt,.md,.json,text/plain,text/markdown,application/json" onChange={importScript} tabIndex={-1} />
        {scriptError && <p className="script-error">{scriptError}</p>}
      </section>

      <section className="panel-section summary-section">
        <h2>剧本摘要</h2>
        <p>导演 Agent 会读取当前导入的完整剧本，提取人物、场景、视觉风格，并生成可继续修改的分镜。</p>
      </section>

      <section className="message-list" aria-label="导演 Agent 消息">
        {state.messages.map((message) => (
          <article className={`agent-message agent-message--${message.author}`} key={message.id}>
            <div className="agent-message__meta"><span className="mini-avatar">{message.author === "agent" ? <Sparkle size={12} weight="fill" /> : "你"}</span><time>{message.time}</time><em>{message.status}</em></div>
            <p>{message.content}</p>
          </article>
        ))}
      </section>

      <form className="agent-composer" onSubmit={sendMessage}>
        <label htmlFor="agent-message">告诉导演 Agent 你想修改什么…</label>
        <textarea id="agent-message" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="例如：第 8 镜改成雨夜近景" rows={2} />
        <button type="submit" aria-label="发送消息" disabled={!draft.trim()}><ArrowUp size={17} weight="bold" /></button>
        <small>Enter 发送，Shift + Enter 换行</small>
      </form>
    </aside>
  );
}
