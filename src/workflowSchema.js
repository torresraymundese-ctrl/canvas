const freeNodeContracts = {
  text: { outputType: "text", accepts: ["*"] },
  image: { outputType: "image", accepts: ["text", "image", "asset"] },
  video: { outputType: "video", accepts: ["text", "image", "storyboard", "asset"] },
  composite: { outputType: "video", accepts: ["video", "image", "audio"] },
  director: { outputType: "plan", accepts: ["*"] },
  audio: { outputType: "audio", accepts: ["text", "audio", "asset"] },
  script: { outputType: "script-analysis", accepts: ["text"] },
  assets: { outputType: "asset", accepts: ["*"] },
  history: { outputType: "asset", accepts: ["*"] },
};

export function getFreeNodeContract(kind, viewer) {
  if (kind !== "upload") return freeNodeContracts[kind] ?? freeNodeContracts.text;
  const outputType = viewer?.mediaType === "gallery"
    ? "image"
    : viewer?.mediaType === "document"
      ? "text"
      : viewer?.mediaType ?? "asset";
  return { outputType, accepts: ["*"] };
}

export function getNodeContract(node) {
  return {
    outputType: node?.data?.outputType ?? "*",
    accepts: Array.isArray(node?.data?.accepts) && node.data.accepts.length > 0
      ? node.data.accepts
      : ["*"],
  };
}

export function wouldCreateCycle(connection, edges) {
  const adjacency = new Map();
  for (const edge of edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    adjacency.get(edge.source).push(edge.target);
  }

  const stack = [connection.target];
  const visited = new Set();
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === connection.source) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    stack.push(...(adjacency.get(current) ?? []));
  }
  return false;
}

export function validateConnection(connection, nodes, edges) {
  const source = nodes.find((node) => node.id === connection.source);
  const target = nodes.find((node) => node.id === connection.target);
  if (!source || !target) {
    return { valid: false, code: "missing-node", message: "连接端点不存在" };
  }
  if (connection.source === connection.target) {
    return { valid: false, code: "self-link", message: "节点不能连接到自身" };
  }
  if (edges.some((edge) => edge.source === connection.source && edge.target === connection.target)) {
    return { valid: false, code: "duplicate", message: "这两个节点已经连接" };
  }
  if (wouldCreateCycle(connection, edges)) {
    return { valid: false, code: "cycle", message: "连接会形成循环依赖" };
  }

  const sourceContract = getNodeContract(source);
  const targetContract = getNodeContract(target);
  const acceptsSource = sourceContract.outputType === "*"
    || targetContract.accepts.includes("*")
    || targetContract.accepts.includes(sourceContract.outputType);
  if (!acceptsSource) {
    return {
      valid: false,
      code: "type-mismatch",
      message: `目标节点不接受 ${sourceContract.outputType} 类型`,
    };
  }

  return { valid: true, code: "valid", message: "可以连接" };
}
