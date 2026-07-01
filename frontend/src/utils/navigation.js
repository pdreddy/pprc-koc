export function normalizePath(path = '/') {
  return (path || '/').replace(/\/+$/, '') || '/';
}

export function samePath(currentPath, targetPath) {
  return normalizePath(currentPath) === normalizePath(targetPath);
}
