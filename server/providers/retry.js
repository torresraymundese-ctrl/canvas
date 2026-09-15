function shouldRetry(error) {
  return error?.status === undefined || error.status === 429 || error.status >= 500;
}

export async function withRetry(operation, {
  maxAttempts = 3,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  random = Math.random,
  baseDelayMs = 250,
} = {}) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || !shouldRetry(error)) throw error;
      const delay = baseDelayMs * (2 ** (attempt - 1)) + Math.floor(random() * baseDelayMs);
      await sleep(delay);
    }
  }
  throw lastError;
}
