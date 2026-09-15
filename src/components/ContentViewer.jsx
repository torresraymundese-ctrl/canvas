import { useEffect, useState } from "react";
import { Check, FilmStrip, Waveform, X } from "@phosphor-icons/react";

import { getViewerContent } from "../canvasFeatures.js";
import { getActiveJobForTarget } from "../jobState.js";

export function ContentViewer({ node, jobs = [], onGenerateShot, onSetShotConfirmed, onClose }) {
  const content = getViewerContent(node);
  const [activeImage, setActiveImage] = useState(0);

  useEffect(() => {
    setActiveImage(0);
  }, [node?.id]);

  useEffect(() => {
    const closeOnEscape = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  if (!content) return null;

  return (
    <div className="content-viewer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="content-viewer" role="dialog" aria-modal="true" aria-label={`${content.title}内容查看器`}>
        <header>
          <div>
            <span className="content-viewer__icon"><FilmStrip size={18} weight="fill" /></span>
            <div><strong>{content.title}</strong>{content.eyebrow && <small>{content.eyebrow}</small>}</div>
          </div>
          <button className="icon-button" aria-label="关闭内容查看器" onClick={onClose}><X size={17} /></button>
        </header>
        <div className="content-viewer__body">
          <ViewerBody
            content={content}
            activeImage={activeImage}
            setActiveImage={setActiveImage}
            jobs={jobs}
            onGenerateShot={onGenerateShot}
            onSetShotConfirmed={onSetShotConfirmed}
          />
        </div>
        <footer><span><Check size={14} weight="bold" /> 内容已加载</span><small>按 Esc 关闭</small></footer>
      </section>
    </div>
  );
}

function ViewerBody({ content, activeImage, setActiveImage, jobs, onGenerateShot, onSetShotConfirmed }) {
  if (content.mediaType === "audio") {
    return (
      <div className="viewer-audio">
        <Waveform size={88} weight="duotone" />
        <audio key={content.src} controls autoPlay src={content.src}>当前浏览器不支持音频播放。</audio>
      </div>
    );
  }

  if (content.mediaType === "video") {
    return (
      <div className="viewer-video">
        <video key={content.src} controls autoPlay muted loop playsInline preload="metadata" poster={content.poster}>
          <source src={content.src} type="video/mp4" />
          当前浏览器不支持视频播放。
        </video>
        <p>这是本地测试视频。接入 Seedance 后，这里会直接播放任务返回的视频文件。</p>
      </div>
    );
  }

  if (content.mediaType === "gallery") {
    const images = content.images ?? [];
    return (
      <div className="viewer-gallery">
        <div className="viewer-gallery__main"><img src={images[activeImage]} alt={`${content.title} ${activeImage + 1}`} /></div>
        <div className="viewer-gallery__thumbs">
          {images.map((image, index) => (
            <button className={index === activeImage ? "is-active" : ""} key={image} onClick={() => setActiveImage(index)}>
              <img src={image} alt={`查看第 ${index + 1} 张`} />
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (content.mediaType === "storyboard") {
    return (
      <div className="viewer-storyboard">
        {content.shots.map((shot, index) => {
          const activeJob = getActiveJobForTarget(jobs, { nodeId: "video", shotId: shot.id });
          const isConfirmed = shot.confirmed === true;
          return (
            <article key={shot.id ?? shot.name}>
              {shot.videoUrl
                ? <video controls preload="metadata" poster={shot.image} src={shot.videoUrl} />
                : <img src={shot.image} alt={shot.name} />}
              <div>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{shot.name}</strong>
                <p>{shot.note}</p>
                {shot.prompt && <p className="shot-prompt">{shot.prompt}</p>}
                {onGenerateShot && (
                  <>
                    <label className="shot-confirm"><input type="checkbox" checked={isConfirmed} onChange={(event) => onSetShotConfirmed?.(shot.id, event.target.checked)} />确认该镜头提示词</label>
                    <button className="shot-generate-button" disabled={Boolean(activeJob) || !isConfirmed} onClick={() => onGenerateShot(shot)}>{activeJob ? "正在生成…" : shot.videoUrl ? "重新生成视频" : "生成视频"}</button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
    );
  }

  if (content.mediaType === "timeline") {
    return <ol className="viewer-timeline">{content.steps.map((step, index) => <li key={step}><span>{index + 1}</span><p>{step}</p></li>)}</ol>;
  }

  return <pre className="viewer-document">{content.body}</pre>;
}
