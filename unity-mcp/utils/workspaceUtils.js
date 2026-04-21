import path from 'path';
import fs from 'fs/promises';

export function getWorkspaceRoot() {
  if (process.env.WORKSPACE_FOLDER_PATHS) {
    try {
      const workspacePaths = JSON.parse(process.env.WORKSPACE_FOLDER_PATHS);
      if (Array.isArray(workspacePaths) && workspacePaths.length > 0) {
        return path.resolve(workspacePaths[0]);
      }
    } catch {
      return path.resolve(process.env.WORKSPACE_FOLDER_PATHS);
    }
  }

  return path.resolve(
    process.env.WORKSPACE_ROOT ||
    process.env.PWD ||
    process.env.INIT_CWD ||
    process.cwd()
  );
}

export function resolveWorkspacePath(relativePath) {
  return path.resolve(getWorkspaceRoot(), relativePath);
}

export function getRelativeToWorkspace(absolutePath) {
  return path.relative(getWorkspaceRoot(), absolutePath);
}

export function isInsideWorkspace(targetPath) {
  const relativePath = path.relative(getWorkspaceRoot(), targetPath);
  return !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

export async function findGitRoot() {
  let currentPath = getWorkspaceRoot();

  while (currentPath !== path.dirname(currentPath)) {
    try {
      await fs.access(path.join(currentPath, '.git'));
      return currentPath;
    } catch {
      currentPath = path.dirname(currentPath);
    }
  }

  return getWorkspaceRoot();
}
