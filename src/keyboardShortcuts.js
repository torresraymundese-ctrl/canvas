const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function getHistoryShortcut(event) {
  if (!(event.ctrlKey || event.metaKey)) return null;
  if (event.target?.isContentEditable || EDITABLE_TAGS.has(event.target?.tagName)) return null;

  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  if (key === "y") return "redo";
  return null;
}
