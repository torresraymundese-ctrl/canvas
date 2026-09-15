import {
  ArrowSquareOut,
  Check,
  FileText,
  GitBranch,
  Planet,
  Play,
  Robot,
  UsersThree,
  VideoCamera,
} from "@phosphor-icons/react";
import { Handle, Position } from "@xyflow/react";

const icons = {
  script: FileText,
  story: GitBranch,
  world: Planet,
  characters: UsersThree,
  storyboard: Robot,
  video: VideoCamera,
};

const statusLabels = {
  complete: "已完成",
  approval: "待确认",
  waiting: "等待中",
  ready: "准备就绪",
  running: "生成中",
};

export function ZoneNode({ data }) {
  return (
    <div className={`zone-title zone-title--${data.tone}`}>
      <span />
      {data.label}
    </div>
  );
}

export function WorkflowNode({ data, selected }) {
  const Icon = icons[data.kind];
  const status = data.status ?? "waiting";

  return (
    <article className={`workflow-node workflow-node--${data.kind} status-${status} ${selected ? "is-selected" : ""}`}>
      <Handle className="node-handle" type="target" position={Position.Left} />
      <div className="workflow-node__header">
        <span className="node-icon"><Icon size={18} weight="fill" /></span>
        <strong>{data.title}</strong>
        <em className={`status-chip status-chip--${status}`}>
          {status === "complete" && <Check size={10} weight="bold" />}
          {statusLabels[status]}
        </em>
      </div>

      <NodeVisual data={data} />

      <div className="workflow-node__footer">
        {data.model && <span className="node-model">{data.model}</span>}
        <p>{data.subtitle}</p>
        <span className="node-open-indicator"><ArrowSquareOut size={11} /> 点击查看</span>
      </div>
      <Handle className="node-handle" type="source" position={Position.Right} />
    </article>
  );
}

function NodeVisual({ data }) {
  if (data.kind === "script") {
    return (
      <div className="document-visual">
        <FileText size={54} weight="duotone" />
        <span>26 场 · 8,420 字</span>
      </div>
    );
  }

  if (data.kind === "story") {
    return (
      <div className="story-visual">
        <GitBranch size={62} weight="duotone" />
        <ul><li>发现遗骸</li><li>家族阻拦</li><li>春神苏醒</li></ul>
      </div>
    );
  }

  if (data.kind === "video") {
    return (
      <div className="video-visual">
        <img src={data.images[0]} alt="雨夜古寺视频预览" />
        <span className="play-button"><Play size={21} weight="fill" /></span>
      </div>
    );
  }

  if (data.kind === "storyboard") {
    const captions = ["春祭开场", "遗骸出现", "家族对峙", "春神苏醒"];
    return (
      <div className="storyboard-strip">
        {data.images.map((image, index) => (
          <figure key={`shot-${index}`}>
            <img src={image} alt="" />
            <figcaption><b>{String(index + 1).padStart(2, "0")}</b><span>{captions[index]}</span></figcaption>
          </figure>
        ))}
      </div>
    );
  }

  return (
    <div className={`media-grid media-grid--${data.kind}`}>
      {data.images.map((image, index) => (
        <img key={`${data.kind}-${index}`} src={image} alt="" />
      ))}
    </div>
  );
}
