import type { GitChange } from '../../../shared/protocol';

export const areaLabel: Record<GitChange['area'], string> = {
  conflict: 'In conflict',
  staged: 'Staged',
  unstaged: 'Not staged',
  untracked: 'Untracked',
};

export type ChangeFolder = {
  path: string;
  name: string;
  folders: ChangeFolder[];
  files: GitChange[];
};

/** Keep both versions of a partially staged file. Prev/next follows the same order as the tree. */
export function buildChangeTree(changes: GitChange[], query: string) {
  const root: ChangeFolder = { path: '', name: '', folders: [], files: [] };
  const folders = new Map([['', root]]);
  for (const change of changes) {
    if (!change.path.toLowerCase().includes(query) && !change.from?.toLowerCase().includes(query)) continue;
    let parent = root;
    const parts = change.path.replace(/\/$/, '').split('/');
    for (const name of parts.slice(0, -1)) {
      const path = parent.path ? `${parent.path}/${name}` : name;
      let folder = folders.get(path);
      if (!folder) {
        folder = { path, name, folders: [], files: [] };
        parent.folders.push(folder);
        folders.set(path, folder);
      }
      parent = folder;
    }
    parent.files.push(change);
  }

  const files: GitChange[] = [];
  function order(folder: ChangeFolder) {
    folder.folders.sort((a, b) => a.name.localeCompare(b.name));
    folder.files.sort((a, b) => a.path.localeCompare(b.path) || a.area.localeCompare(b.area));
    for (const child of folder.folders) order(child);
    files.push(...folder.files);
  }
  order(root);
  return { root, files };
}
