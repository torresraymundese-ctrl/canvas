import { useState } from "react";
import { ArrowCounterClockwise, Check, X } from "@phosphor-icons/react";

const nodeDetails = {
  script: { title: "剧本解析", role: "director", output: "场景清单 · 人物关系" },
  story: { title: "故事脉络", role: "director", output: "剧情结构 · 冲突节拍" },
  world: { title: "世界观设定", role: "image", output: "场景参考 · 色彩方案" },
  characters: { title: "角色定妆", role: "image", output: "角色图 · 服装设定" },
  storyboard: { title: "分镜规划", role: "director", output: "镜头脚本 · 分镜图 · 运镜建议" },
  video: { title: "视频生成", role: "video", output: "视频候选 · 任务记录" },
};

export function FloatingInspector({ state, dispatch, modelOptions }) {
  const [activeTab, setActiveTab] = useState("details");
  const [note, setNote] = useState("");
  const detail = nodeDetails[state.selectedNodeId] ?? nodeDetails.storyboard;
  const status = state.nodes[state.selectedNodeId]?.status ?? "waiting";

  if (!state.inspectorOpen) return null;

  return (
    <section className="floating-inspector" aria-label={`${detail.title}检查面板`}>
      <header>
        <div><strong>{detail.title}</strong><span className={`status-dot status-dot--${status}`} /> <em>{status === "approval" ? "待确认" : "节点详情"}</em></div>
        <button className="icon-button" aria-label="关闭检查面板" onClick={() => dispatch({ type: "close-inspector" })}><X size={16} /></button>
      </header>
      <nav className="inspector-tabs" aria-label="节点详情标签">
        <button className={activeTab === "details" ? "is-active" : ""} onClick={() => setActiveTab("details")}>详情</button>
        <button className={activeTab === "shots" ? "is-active" : ""} onClick={() => setActiveTab("shots")}>镜头列表（26）</button>
        <button className={activeTab === "settings" ? "is-active" : ""} onClick={() => setActiveTab("settings")}>参数设置</button>
      </nav>
      <div className="inspector-body">
        {activeTab === "details" && (
          <>
            <dl>
              <div><dt>状态</dt><dd>{status === "approval" ? "待确认" : "已选择"}</dd></div>
              <div><dt>输出</dt><dd>{detail.output}</dd></div>
              <div><dt>模型</dt><dd>{state.models[detail.role]}</dd></div>
              <div><dt>生成时间</dt><dd>2026-08-05 12:35</dd></div>
            </dl>
            <label className="note-field">备注<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="可在此添加备注…" rows={2} /></label>
          </>
        )}
        {activeTab === "shots" && (
          <ol className="shot-list"><li>S001 春祭开场</li><li>S002 遗骸出现</li><li>S003 家族对峙</li><li>S004 春神苏醒</li></ol>
        )}
        {activeTab === "settings" && (
          <label className="model-field">模型
            <select
              value={state.models[detail.role]}
              onChange={(event) => dispatch({ type: "set-model", role: detail.role, model: event.target.value })}
            >
              {modelOptions[detail.role].map((model) => <option key={model}>{model}</option>)}
            </select>
          </label>
        )}
      </div>
      <footer>
        <button className="secondary-button" onClick={() => dispatch({ type: "close-inspector" })}><ArrowCounterClockwise size={15} /> 返回修改</button>
        <button className="confirm-button" onClick={() => dispatch({ type: "confirm-node", nodeId: state.selectedNodeId })}><Check size={15} weight="bold" /> 确认通过</button>
      </footer>
    </section>
  );
}
