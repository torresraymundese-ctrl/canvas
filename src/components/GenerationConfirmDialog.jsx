import { useEffect, useMemo, useState } from "react";
import { CircleNotch, FilmStrip, Robot, X } from "@phosphor-icons/react";

export function GenerationConfirmDialog({ request, models, service, preferredModelId, onCancel, onConfirm, error }) {
  const role = request?.type === "video" ? "video" : "director";
  const availableModels = useMemo(() => models.filter((model) => model.role === role), [models, role]);
  const defaultModel = availableModels.find((model) => model.id === preferredModelId)
    ?? availableModels.find((model) => model.selected)
    ?? availableModels[0];
  const selectedModel = availableModels.find((model) => model.id === defaultModel?.id) ?? defaultModel;
  const [modelId, setModelId] = useState("");
  const [shotCount, setShotCount] = useState(26);
  const [ratio, setRatio] = useState("16:9");
  const [duration, setDuration] = useState(5);
  const [generateAudio, setGenerateAudio] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setModelId(defaultModel?.id ?? "");
    setSubmitting(false);
  }, [defaultModel?.id, request]);

  if (!request) return null;
  const currentModel = availableModels.find((model) => model.id === modelId) ?? selectedModel;
  const submit = async (event) => {
    event.preventDefault();
    if (!modelId) return;
    setSubmitting(true);
    try {
      await onConfirm(role === "director" ? { modelId, shotCount } : { modelId, ratio, duration, generateAudio });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="confirm-dialog-backdrop">
      <form className="confirm-dialog" onSubmit={submit}>
        <header>
          <span>{role === "director" ? <Robot size={20} weight="fill" /> : <FilmStrip size={20} weight="fill" />}</span>
          <div><strong>{role === "director" ? "确认导演拆解" : `生成镜头 ${request.shot?.id ?? ""}`}</strong><small>确认参数后才会创建任务，避免误操作产生费用。</small></div>
          <button type="button" className="icon-button" aria-label="关闭" onClick={onCancel}><X size={16} /></button>
        </header>
        <div className="confirm-dialog__body">
          <label>使用模型
            <select value={modelId} onChange={(event) => setModelId(event.target.value)} required>
              {availableModels.map((model) => <option value={model.id} key={model.id}>{model.label}</option>)}
            </select>
          </label>
          {role === "director" ? (
            <label>目标镜头数<input type="number" min="1" max="60" value={shotCount} onChange={(event) => setShotCount(Number(event.target.value))} /></label>
          ) : (
            <div className="confirm-dialog__row">
              <label>画面比例<select value={ratio} onChange={(event) => setRatio(event.target.value)}>{(currentModel?.ratios ?? ["16:9", "9:16", "1:1"]).map((value) => <option key={value}>{value}</option>)}</select></label>
              <label>视频时长<select value={duration} onChange={(event) => setDuration(Number(event.target.value))}>{(currentModel?.durations ?? [5, 10]).map((value) => <option value={value} key={value}>{value} 秒</option>)}</select></label>
            </div>
          )}
          {role === "video" && <label className="confirm-audio"><input type="checkbox" checked={generateAudio} onChange={(event) => setGenerateAudio(event.target.checked)} />生成同步对白、环境音和音效</label>}
          {role === "video" && <p className="confirm-dialog__prompt">{request.shot?.prompt}</p>}
          {service?.executionMode === "live" && <p className="confirm-dialog__live-warning">当前为火山引擎真实模式，确认后将调用模型并产生实际费用。</p>}
          {service?.executionMode !== "live" && <p className="confirm-dialog__mock-note">当前为模拟测试模式，不会产生模型费用。</p>}
          {error && <p className="confirm-dialog__error">{error}</p>}
          {!availableModels.length && <p className="confirm-dialog__error">模型列表尚未加载，请确认本地服务已经启动。</p>}
        </div>
        <footer>
          <button type="button" className="secondary-button" onClick={onCancel}>取消</button>
          <button className="confirm-button" disabled={submitting || !modelId}>{submitting && <CircleNotch className="spin" size={14} />}{submitting ? "正在提交" : "确认并创建任务"}</button>
        </footer>
      </form>
    </div>
  );
}
