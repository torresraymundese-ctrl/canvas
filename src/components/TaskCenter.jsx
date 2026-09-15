import {
  ArrowClockwise,
  CheckCircle,
  CircleNotch,
  Clock,
  FilmStrip,
  Robot,
  WarningCircle,
  X,
  XCircle,
} from "@phosphor-icons/react";

import { getJobActionAvailability, sortJobs } from "../jobState.js";

const STATUS_LABELS = {
  queued: "排队中",
  running: "生成中",
  canceled_requested: "正在取消",
  succeeded: "已完成",
  failed: "失败",
  canceled: "已取消",
};

function JobIcon({ job }) {
  if (job.status === "running" || job.status === "canceled_requested") return <CircleNotch className="spin" size={18} />;
  if (job.status === "succeeded") return <CheckCircle size={18} weight="fill" />;
  if (job.status === "failed") return <WarningCircle size={18} weight="fill" />;
  if (job.status === "canceled") return <XCircle size={18} />;
  return <Clock size={18} />;
}

function formatTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function formatElapsed(job) {
  const started = Date.parse(job.createdAt);
  const finished = ["succeeded", "failed", "canceled"].includes(job.status) ? Date.parse(job.updatedAt) : Date.now();
  if (!Number.isFinite(started) || !Number.isFinite(finished)) return "未知耗时";
  const seconds = Math.max(0, Math.round((finished - started) / 1000));
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

export function TaskCenter({ open, jobs, service, error, onClose, onRetry, onCancel }) {
  if (!open) return null;
  return (
    <div className="task-center-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="task-center" aria-label="任务中心">
        <header>
          <div>
            <strong>任务中心</strong>
            <small className={`service-state is-${service.status}`}>
              {service.status === "online"
                ? `${service.executionMode === "mock" ? "模拟测试" : "火山引擎"} · 服务正常`
                : service.status === "checking" ? "正在连接本地服务" : "本地服务未连接"}
            </small>
            {service.status === "online" && <small className="credential-state">API Key：{service.credentialsConfigured ? "已配置" : "未配置（模拟模式不需要）"}</small>}
          </div>
          <button className="icon-button" aria-label="关闭任务中心" onClick={onClose}><X size={17} /></button>
        </header>

        {error && <div className="task-center__error"><WarningCircle size={16} />{error.message}</div>}
        <div className="task-list">
          {sortJobs(jobs).map((job) => {
            const actions = getJobActionAvailability(job);
            return (
              <article className={`task-card is-${job.status}`} key={job.id}>
                <div className="task-card__icon"><JobIcon job={job} /></div>
                <div className="task-card__body">
                  <div className="task-card__title">
                    {job.type === "director" ? <Robot size={14} /> : <FilmStrip size={14} />}
                    <strong>{job.type === "director" ? "导演拆解" : `镜头 ${job.input?.shotId ?? "视频"}`}</strong>
                    <em>{STATUS_LABELS[job.status] ?? job.status}</em>
                  </div>
                  <p>{job.modelId}</p>
                  <small>{formatTime(job.updatedAt)} · 耗时 {formatElapsed(job)} · 第 {job.attempt ?? 1} 次</small>
                  {(job.status === "running" || job.status === "canceled_requested") && <div className="task-progress"><i style={{ width: `${job.progress ?? 4}%` }} /></div>}
                  {job.error?.message && <div className="task-card__message">{job.error.message}</div>}
                </div>
                <div className="task-card__actions">
                  {actions.canRetry && <button onClick={() => onRetry(job.id).catch(() => {})}><ArrowClockwise size={13} />重试</button>}
                  {actions.canCancel && <button onClick={() => onCancel(job.id).catch(() => {})}>取消</button>}
                </div>
              </article>
            );
          })}
          {!jobs.length && <div className="task-list__empty"><Clock size={30} /><strong>还没有生成任务</strong><span>点击“自动生成整集”后，任务会显示在这里。</span></div>}
        </div>
      </aside>
    </div>
  );
}
