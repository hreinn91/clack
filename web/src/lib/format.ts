/** Shows a path relative to a base directory when it is inside it. */
export function relativeTo(path: string, base: string | undefined): string {
  if (!base) return path;
  if (path === base) return '.';
  return path.startsWith(base + '/') ? path.slice(base.length + 1) : path;
}

export function ago(timestamp: number): string {
  const seconds = Math.max(0, (Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'now';
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.floor(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.floor(hours)}h`;
  const days = hours / 24;
  if (days < 30) return `${Math.floor(days)}d`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
