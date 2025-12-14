export function validateMindmap(node) {
  if (!node || !node.id || !node.text || !Array.isArray(node.children)) return false;

  for (const child of node.children) {
    if (!validateMindmap(child)) return false;
  }
  return true;
}
