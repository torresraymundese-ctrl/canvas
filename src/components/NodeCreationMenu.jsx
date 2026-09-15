import {
  CaretRight,
  ClockCounterClockwise,
  FileText,
  ImageSquare,
  Robot,
  Scissors,
  Stack,
  TextT,
  UploadSimple,
  VideoCamera,
  Waveform,
} from "@phosphor-icons/react";

import { nodeCreationOptions } from "../canvasFeatures.js";

const icons = {
  text: TextT,
  image: ImageSquare,
  video: VideoCamera,
  composite: Scissors,
  director: Robot,
  audio: Waveform,
  script: FileText,
  assets: Stack,
};

export function NodeCreationMenu({ position, onAdd, onUpload, onHistory }) {
  return (
    <section
      className="node-creation-menu"
      style={{ left: position.x, top: position.y }}
      role="menu"
      aria-label="添加节点"
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <h2>添加节点</h2>
      <div className="node-creation-menu__items">
        {nodeCreationOptions.map((option) => {
          const Icon = icons[option.id];
          return (
            <button key={option.id} role="menuitem" onClick={() => onAdd(option.id)}>
              <Icon size={19} />
              <span>{option.label}</span>
              {option.badge && <em className={`menu-badge menu-badge--${option.badge.toLowerCase()}`}>{option.badge}</em>}
              {option.nested && <CaretRight className="menu-caret" size={14} />}
            </button>
          );
        })}
      </div>
      <h3>添加资源</h3>
      <div className="node-creation-menu__items node-creation-menu__resources">
        <button role="menuitem" onClick={onUpload}><UploadSimple size={19} /><span>上传</span></button>
        <button role="menuitem" onClick={onHistory}><ClockCounterClockwise size={19} /><span>从生成历史选择</span></button>
      </div>
    </section>
  );
}
