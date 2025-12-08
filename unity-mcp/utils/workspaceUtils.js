/**
 * 🔧 WORKSPACE UTILITIES - Утилиты для работы с рабочим пространством
 * 
 * 🎯 DRY ПРИНЦИП: Общие функции для всех MCP инструментов
 * Правильное определение workspace root, пути, и другие общие операции
 */

import path from 'path';

/**
 * 🔧 ПРАВИЛЬНОЕ ОПРЕДЕЛЕНИЕ WORKSPACE ROOT
 * 
 * MCP сервер может запускаться из папки Cursor'а, но workspace другой.
 * Эта функция пробует разные способы определения правильного workspace.
 * 
 * @returns {string} Путь к корню workspace
 */
export function getWorkspaceRoot() {
  // 🔥 ГЛАВНАЯ ПЕРЕМЕННАЯ ОТ CURSOR!
  if (process.env.WORKSPACE_FOLDER_PATHS) {
    try {
      // WORKSPACE_FOLDER_PATHS может содержать JSON массив путей
      const paths = JSON.parse(process.env.WORKSPACE_FOLDER_PATHS);
      if (Array.isArray(paths) && paths.length > 0) {
        return path.resolve(paths[0]); // Берем первый workspace
      }
    } catch (e) {
      // Если не JSON, возможно это просто путь
      return path.resolve(process.env.WORKSPACE_FOLDER_PATHS);
    }
  }

  // Пробуем другие переменные окружения в порядке приоритета
  return process.env.WORKSPACE_ROOT ||  // Если явно задан
    process.env.PWD ||             // Unix-style current directory
    process.env.INIT_CWD ||        // npm/node initial working directory
    process.cwd();                 // Fallback к текущей папке процесса
}

/**
 * 🔧 БЕЗОПАСНОЕ РАЗРЕШЕНИЕ ПУТИ ОТНОСИТЕЛЬНО WORKSPACE
 * 
 * @param {string} relativePath - Относительный путь от workspace root
 * @returns {string} Абсолютный путь
 */
export function resolveWorkspacePath(relativePath) {
  return path.resolve(getWorkspaceRoot(), relativePath);
}

/**
 * 🔧 ПОЛУЧЕНИЕ ОТНОСИТЕЛЬНОГО ПУТИ ОТ WORKSPACE ROOT
 * 
 * @param {string} absolutePath - Абсолютный путь
 * @returns {string} Относительный путь от workspace root
 */
export function getRelativeToWorkspace(absolutePath) {
  return path.relative(getWorkspaceRoot(), absolutePath);
}

/**
 * 🔧 ПРОВЕРКА ЧТО ПУТЬ НАХОДИТСЯ ВНУТРИ WORKSPACE
 * 
 * @param {string} targetPath - Путь для проверки
 * @returns {boolean} true если путь внутри workspace
 */
export function isInsideWorkspace(targetPath) {
  const workspaceRoot = getWorkspaceRoot();
  const relativePath = path.relative(workspaceRoot, targetPath);

  // Если путь начинается с ".." значит он вне workspace
  return !relativePath.startsWith('..');
}

/**
 * 🔧 УМНЫЙ ПОИСК GIT РЕПОЗИТОРИЯ
 * 
 * Ищет .git папку начиная от workspace root и поднимаясь вверх по дереву папок.
 * Это позволяет git инструментам работать даже если MCP сервер запущен не из корня репозитория.
 * 
 * @returns {string} Путь к корню git репозитория или workspace root если git не найден
 */
export async function findGitRoot() {
  const fs = await import('fs/promises');
  let currentPath = getWorkspaceRoot();

  // Поднимаемся вверх по дереву папок ищем .git
  while (currentPath !== path.dirname(currentPath)) { // Пока не дошли до корня диска
    try {
      const gitPath = path.join(currentPath, '.git');
      await fs.access(gitPath);
      return currentPath; // Нашли .git папку!
    } catch {
      // .git не найден, поднимаемся на уровень выше
      currentPath = path.dirname(currentPath);
    }
  }

  // Git репозиторий не найден, возвращаем workspace root
  return getWorkspaceRoot();
} 