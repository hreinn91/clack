import type { EffortLevel } from '../../../shared/protocol';

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

const EFFORT_NAMES: Record<EffortLevel, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra High',
  max: 'Max',
};

/** "claude-fable-5-2" becomes "Fable 5.2"; dates, regions and other decoration are dropped. */
export function modelName(id: string): string {
  const core = id
    .toLowerCase()
    .replace(/[[@].*$/, '')
    .replace(/^.*claude-/, '')
    .replace(/-v\d+(:\d+)?$/, '')
    .replace(/-\d{8}$/, '');
  const parts = core.split('-').filter(Boolean);
  const words = parts.filter((part) => !/^\d+$/.test(part));
  const version = parts.filter((part) => /^\d{1,2}$/.test(part));
  if (!words.length) return id;
  const family = words.map((word) => word[0]!.toUpperCase() + word.slice(1)).join(' ');
  return version.length ? `${family} ${version.join('.')}` : family;
}

/** The name a reply is shown under: the model, then the effort it ran at, such as "Fable 5.2 High". */
export function authorName(model: string | undefined, effort: EffortLevel | null | undefined): string {
  return withEffort(model ? modelName(model) : 'Claude', effort);
}

export function withEffort(name: string, effort: EffortLevel | null | undefined): string {
  return effort ? `${name} ${EFFORT_NAMES[effort]}` : name;
}

export function clock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function fullDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'medium' });
}

/** Identifies a calendar day, for telling when a conversation crosses midnight. */
export function dayKey(timestamp: number): string {
  return new Date(timestamp).toDateString();
}

export function dayLabel(timestamp: number): string {
  const day = dayKey(timestamp);
  const now = Date.now();
  if (day === dayKey(now)) return 'Today';
  if (day === dayKey(now - 86_400_000)) return 'Yesterday';
  const sameYear = new Date(timestamp).getFullYear() === new Date(now).getFullYear();
  return new Date(timestamp).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** Up to two letters to stand in for a picture. */
export function initials(name: string): string {
  const words = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (!words.length) return '?';
  const letters = words.length > 1 ? words[0]![0]! + words[1]![0]! : words[0]![0]!;
  return letters.toUpperCase();
}

const AVATAR_COLORS = ['#e8912d', '#2b8a6e', '#1d83b8', '#d1345b', '#7c3085', '#4a8f3c', '#c2571a', '#3667c8'];

/** The same name always gets the same colour. */
export function colorFor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!;
}

/** A file size as people write it: "512 B", "3.4 KB", "12 MB". */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

const ATTACHED = 'Attached files:';

/** Adds the files attached to a message to its text, the way the shared protocol describes. */
export function withAttachments(text: string, paths: string[]): string {
  if (!paths.length) return text;
  return `${text}${text ? '\n\n' : ''}${ATTACHED}\n${paths.map((path) => `- ${path}`).join('\n')}`;
}

/** The reverse: what the person wrote, and the files they attached to it. */
export function splitAttachments(message: string): { text: string; paths: string[] } {
  const match = message.match(/(?:^|\n\n)Attached files:\n((?:- [^\n]+(?:\n|$))+)$/);
  if (!match) return { text: message, paths: [] };
  return {
    text: message.slice(0, match.index).trimEnd(),
    paths: match[1]!.split('\n').filter(Boolean).map((line) => line.slice(2)),
  };
}

export function isImagePath(path: string): boolean {
  return /\.(png|jpe?g|gif|webp)$/i.test(path);
}

/** How long until a moment, as people say it: "in 2 h 14 min", "in 3 days". */
export function until(timestamp: number, now = Date.now()): string {
  const minutes = Math.round((timestamp - now) / 60_000);
  if (minutes <= 0) return 'any moment now';
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `in ${hours} h ${minutes % 60} min` : `in ${hours} h`;
  const days = Math.floor(hours / 24);
  return hours % 24 ? `in ${days} d ${hours % 24} h` : `in ${days} ${days === 1 ? 'day' : 'days'}`;
}

/** The day and time of a moment, short: "today 14:30", "Sun 02:00". */
export function when(timestamp: number): string {
  const date = new Date(timestamp);
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (dayKey(timestamp) === dayKey(Date.now())) return `today ${time}`;
  return `${date.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`;
}

/** A token count, short: "20.7k", "1M". */
export function tokens(count: number): string {
  if (count < 1000) return String(count);
  if (count < 1_000_000) return `${(count / 1000).toFixed(count < 100_000 ? 1 : 0)}k`;
  return `${+(count / 1_000_000).toFixed(1)}M`;
}

/**
 * What the server makes of a typed folder path: each part reduced to lowercase
 * letters, digits and dashes, joined by slashes ("Work/Client A" → "work/client-a").
 */
export function folderPath(typed: string): string {
  return typed
    .split(/[\\/]+/)
    .map((part) =>
      part
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64)
        .replace(/-+$/, ''),
    )
    .filter(Boolean)
    .slice(0, 8)
    .join('/');
}
