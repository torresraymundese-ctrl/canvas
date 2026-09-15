import {
  FileText,
  ImageSquare,
  Robot,
  Scissors,
  Stack,
  TextT,
  VideoCamera,
  Waveform,
} from "@phosphor-icons/react";
import { Handle, Position } from "@xyflow/react";

const icons = {
  text: TextT,
  image: ImageSquare,
  video: VideoCamera,
  composite: Scissors,
  director: Robot,
  audio: Waveform,
  script: FileText,
  assets: Stack,
  upload: ImageSquare,
  history: Stack,
};

export function FreeNode({ data, selected }) {
  const Icon = icons[data.freeKind] ?? TextT;
  const showsPreview = Boolean(data.preview);

  return (
    <article className={`free-node free-node--${data.freeKind}${selected ? " is-selected" : ""}`}>
      <Handle className="node-handle" type="target" position={Position.Left} />
      <header>
        <span><Icon size={18} weight="fill" /></span>
        <strong>{data.title}</strong>
        {data.badge && <em>{data.badge}</em>}
      </header>
      <div className={`free-node__body${showsPreview ? " has-preview" : ""}`}>
        {showsPreview ? <img src={data.preview} alt="" /> : <Icon size={30} weight="duotone" />}
        <p>{data.summary}</p>
      </div>
      <footer>单击查看内容</footer>
      <Handle className="node-handle" type="source" position={Position.Right} />
    </article>
  );
}
