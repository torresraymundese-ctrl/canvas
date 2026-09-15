import { AppError } from "../errors.js";

export async function fetchWithTimeout(fetchImpl, url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error?.name !== "AbortError") throw error;
    const timeoutError = new AppError("ARK_REQUEST_TIMEOUT", "火山方舟请求超时，请稍后重试。", 504);
    timeoutError.status = 504;
    throw timeoutError;
  } finally {
    clearTimeout(timer);
  }
}
