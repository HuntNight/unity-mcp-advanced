/**
 * 🧠 УМНЫЕ ФУНКЦИИ ДЛЯ РАБОТЫ С ФАЙЛАМИ
 * 
 * ⭐ ПРИОРИТЕТНЫЕ ИНСТРУМЕНТЫ! ⭐
 * Используй ЭТИ функции вместо стандартных read_file, edit_file и т.д.
 * Они содержат умную логику поиска, подсказки и обработку ошибок.
 * 
 * 🎯 Философия: Функциональное программирование + умные обертки
 */



import fs from 'fs/promises';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { createResponseContent } from '../utils/responseHelpers.js';
import { getWorkspaceRoot, resolveWorkspacePath, getRelativeToWorkspace } from '../utils/workspaceUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 📋 Функция для создания списка исключений для find команд (DRY принцип)
const createFindExclusions = () => {
  let exclusions = [
    'node_modules',
    '.git',
    'Library',
    'Temp', 
    'obj',
    'bin',
    '.DS_Store',
    '.vscode',
    '.idea',
    'Logs',
    'UserSettings'
  ];
  
  // Пытаемся прочитать исключения из .cursorignore
  try {
    const workspaceRoot = getWorkspaceRoot();
    const cursorIgnorePath = path.join(workspaceRoot, '.cursorignore');
    const content = readFileSync(cursorIgnorePath, 'utf8');
    
    const cursorIgnoreRules = content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .map(line => {
        // Убираем glob паттерны и извлекаем базовые имена папок
        if (line.includes('/')) {
          const parts = line.split('/');
          return parts[parts.length - 1] || parts[0];
        }
        return line.replace(/[\[\]]/g, ''); // Убираем [Aa] паттерны
      })
      .filter(rule => rule && !rule.includes('*') && !rule.includes('.'));
    
    // Объединяем с дефолтными исключениями
    exclusions = [...new Set([...exclusions, ...cursorIgnoreRules])];
  } catch (error) {
    // Если не удалось прочитать .cursorignore, используем дефолтные исключения
    console.warn('Could not read .cursorignore, using default exclusions:', error.message);
  }
  
  // ИСПРАВЛЕННЫЙ синтаксис find - правильная логика prune
  const excludePatterns = exclusions.map(dir => `-path "*/${dir}/*"`).join(' -o ');
  return `\\( ${excludePatterns} \\) -prune -o`;
};

// 🔍 Универсальная функция для выполнения find команд (DRY принцип)
const executeFindCommand = async (searchDir, namePattern, options = {}) => {
  const {
    maxDepth = 8,
    maxResults = 50,
    timeout = 10000,
    fuzzy = false
  } = options;
  
  const excludeDirs = createFindExclusions();
  const pattern = fuzzy ? `*${namePattern}*` : namePattern;
  
  // Исправленная команда find с правильным синтаксисом
  const command = `find "${searchDir}" -maxdepth ${maxDepth} ${excludeDirs} -name "${pattern}" -type f -print 2>/dev/null | head -${maxResults}`;
  
  console.log('🔍 Find command:', command); // Для дебага
  
  try {
    const result = execSync(command, { 
      encoding: 'utf8',
      timeout 
    }).trim();
    
    return result ? result.split('\n').filter(f => f.trim()) : [];
  } catch (error) {
    console.error(`Find command failed: ${error.message}`);
    return [];
  }
};

// 🔍 Универсальная функция для выполнения grep команд (DRY принцип)  
const executeGrepCommand = async (searchDir, pattern, filePattern = '*', options = {}) => {
  const {
    contextLines = 2,
    maxResults = 50,
    timeout = 15000
  } = options;
  
  const escapedPattern = pattern.replace(/'/g, "'\"'\"'");
  
  // Простая команда grep
  const command = `find "${searchDir}" -maxdepth 8 -name "${filePattern}" -type f ! -path "*/node_modules/*" ! -path "*/.git/*" ! -path "*/Library/*" ! -path "*/Temp/*" ! -path "*/obj/*" -exec grep -n -C ${contextLines} '${escapedPattern}' {} + 2>/dev/null | head -${maxResults * 10}`;
  
  console.log('🔍 Grep command:', command); // Для дебага
  
  try {
    const result = execSync(command, { 
      encoding: 'utf8',
      timeout 
    }).trim();
    
    return result || '';
  } catch (error) {
    console.error(`Grep command failed: ${error.message}`);
    return '';
  }
};

// 🔍 Умный поиск файла с подсказками (использует DRY функции)
const smartFileSearch = async (fileName) => {
  const workspaceRoot = getWorkspaceRoot();
  
  try {
    // Точный поиск
    const foundFiles = await executeFindCommand(workspaceRoot, fileName, {
      maxDepth: 5,
      maxResults: 10,
      timeout: 5000
    });
    
    if (foundFiles.length > 0) {
      return {
        found: true,
        files: foundFiles,
        suggestions: foundFiles.map(f => getRelativeToWorkspace(f))
      };
    }
    
    // Нечеткий поиск, если точного совпадения нет
    const similarFiles = await executeFindCommand(workspaceRoot, fileName, {
      maxDepth: 5,
      maxResults: 10,
      timeout: 5000,
      fuzzy: true
    });
    
    if (similarFiles.length > 0) {
      return {
        found: false,
        similar: similarFiles,
        suggestions: similarFiles.map(f => getRelativeToWorkspace(f))
      };
    }
    
    return { found: false, suggestions: [] };
  } catch (error) {
    console.error('Smart search failed:', error.message);
    return { found: false, suggestions: [], error: error.message };
  }
};

// 📁 Резолвинг пути файла с проверкой существования
const resolveFilePath = async (filePath) => {
  try {
    // Используем утилиту для резолвинга пути
    const fullPath = resolveWorkspacePath(filePath);
    
    try {
      await fs.access(fullPath);
      return { success: true, path: fullPath, relativePath: getRelativeToWorkspace(fullPath) };
    } catch {
      // Файл не найден - делаем умный поиск
      const fileName = path.basename(filePath);
      const searchResult = await smartFileSearch(fileName);
      
      let errorMessage = `❌ Файл не найден: ${filePath}\n`;
      errorMessage += `🔍 Workspace root: ${getWorkspaceRoot()}\n`;
      errorMessage += `📂 Полный путь: ${fullPath}\n\n`;
      
      if (searchResult.found) {
        errorMessage += `💡 Возможно, вы имели в виду один из этих файлов:\n`;
        searchResult.suggestions.forEach((suggestion, i) => {
          errorMessage += `  ${i + 1}. ${suggestion}\n`;
        });
      } else if (searchResult.similar && searchResult.similar.length > 0) {
        errorMessage += `🔎 Похожие файлы найдены:\n`;
        searchResult.suggestions.forEach((suggestion, i) => {
          errorMessage += `  ${i + 1}. ${suggestion}\n`;
        });
      } else {
        errorMessage += `🚫 Файлы с таким именем не найдены в workspace.`;
      }
      
      return { success: false, error: errorMessage };
    }
  } catch (error) {
    return { success: false, error: `Ошибка резолвинга пути: ${error.message}` };
  }
};

// 📖 Обертка для чтения файла
const readFileWrapper = async (filePath, options = {}) => {
  const resolved = await resolveFilePath(filePath);
  if (!resolved.success) {
    throw new Error(resolved.error);
  }
  
  try {
    const content = await fs.readFile(resolved.path, 'utf8');
    const lines = content.split('\n');
    const stats = await fs.stat(resolved.path);
    
    return {
      content,
      lines,
      lineCount: lines.length,
      size: stats.size,
      path: resolved.path,
      relativePath: resolved.relativePath,
      modified: stats.mtime
    };
  } catch (error) {
    throw new Error(`❌ Ошибка чтения файла ${resolved.relativePath}: ${error.message}`);
  }
};

// ✏️ Обертка для записи файла
const writeFileWrapper = async (filePath, content) => {
  try {
    const fullPath = resolveWorkspacePath(filePath);
    const relativePath = getRelativeToWorkspace(fullPath);
    
    // Создаем директорию если нужно
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf8');
    
    const stats = await fs.stat(fullPath);
    return {
      success: true,
      path: fullPath,
      relativePath,
      size: stats.size,
      lines: content.split('\n').length
    };
  } catch (error) {
    throw new Error(`❌ Ошибка записи файла ${getRelativeToWorkspace(resolveWorkspacePath(filePath))}: ${error.message}`);
  }
};

// 🗂️ Обертка для листинга директории
const listDirectoryWrapper = async (dirPath = '.') => {
  try {
    const fullPath = resolveWorkspacePath(dirPath);
    const relativePath = getRelativeToWorkspace(fullPath);
    
    await fs.access(fullPath);
    const items = await fs.readdir(fullPath, { withFileTypes: true });
    
    const files = [];
    const directories = [];
    
    for (const item of items) {
      const itemPath = path.join(fullPath, item.name);
      const stats = await fs.stat(itemPath);
      
      const itemInfo = {
        name: item.name,
        path: path.join(relativePath, item.name),
        size: stats.size,
        modified: stats.mtime,
        isDirectory: item.isDirectory()
      };
      
      if (item.isDirectory()) {
        directories.push(itemInfo);
      } else {
        files.push(itemInfo);
      }
    }
    
    return {
      path: fullPath,
      relativePath,
      files: files.sort((a, b) => a.name.localeCompare(b.name)),
      directories: directories.sort((a, b) => a.name.localeCompare(b.name)),
      totalFiles: files.length,
      totalDirectories: directories.length
    };
  } catch (error) {
    throw new Error(`❌ Ошибка чтения директории ${getRelativeToWorkspace(resolveWorkspacePath(dirPath))}: ${error.message}`);
  }
};

// Умные инструменты
const smartFileTools = {
  read_file: {
    description: '🧠 УМНАЯ ФУНКЦИЯ: Чтение файла с автопоиском и подсказками. ПРИОРИТЕТ над стандартной read_file!',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Путь к файлу (относительный от workspace или абсолютный)'
        },
        lines_range: {
          type: 'string',
          description: 'Диапазон строк в формате "start:end" (опционально)'
        }
      },
      required: ['file_path']
    },
    handler: async (params) => {
      try {
        const fileData = await readFileWrapper(params.file_path);
        
        let content = fileData.content;
        let lineInfo = `Весь файл (${fileData.lineCount} строк)`;
        
        // Обработка диапазона строк
        if (params.lines_range) {
          const [start, end] = params.lines_range.split(':').map(n => parseInt(n));
          if (!isNaN(start)) {
            const startIdx = Math.max(0, start - 1);
            const endIdx = isNaN(end) ? fileData.lines.length : Math.min(fileData.lines.length, end);
            content = fileData.lines.slice(startIdx, endIdx).join('\n');
            lineInfo = `Строки ${start}-${endIdx} из ${fileData.lineCount}`;
          }
        }
        
        const result = `📖 **${fileData.relativePath}**\n` +
                      `📊 ${lineInfo} | ${(fileData.size / 1024).toFixed(1)}KB | ${fileData.modified.toLocaleString()}\n\n` +
                      `\`\`\`\n${content}\n\`\`\``;
        
        return createResponseContent(result);
      } catch (error) {
        return createResponseContent(error.message);
      }
    }
  },

  edit_file: {
    description: '🧠 УМНАЯ ФУНКЦИЯ: Редактирование файла с созданием директорий. ПРИОРИТЕТ над стандартной edit_file!',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Путь к файлу для редактирования'
        },
        content: {
          type: 'string',
          description: 'Новое содержимое файла'
        },
        create_if_not_exists: {
          type: 'boolean',
          description: 'Создать файл если не существует (по умолчанию true)',
          default: true
        }
      },
      required: ['file_path', 'content']
    },
    handler: async (params) => {
      try {
        // Если файл не существует и create_if_not_exists = false, проверяем существование
        if (params.create_if_not_exists === false) {
          const resolved = await resolveFilePath(params.file_path);
          if (!resolved.success) {
            return createResponseContent(resolved.error);
          }
        }
        
        const writeResult = await writeFileWrapper(params.file_path, params.content);
        
        const result = `✅ **Файл успешно ${params.create_if_not_exists !== false ? 'создан/обновлен' : 'обновлен'}**\n\n` +
                      `📁 **Файл:** ${writeResult.relativePath}\n` +
                      `📊 **Размер:** ${(writeResult.size / 1024).toFixed(1)}KB\n` +
                      `📝 **Строк:** ${writeResult.lines}\n` +
                      `🎯 **Полный путь:** ${writeResult.path}`;
        
        return createResponseContent(result);
      } catch (error) {
        return createResponseContent(error.message);
      }
    }
  },

  delete_file: {
    description: '🧠 УМНАЯ ФУНКЦИЯ: Удаление файла с подтверждением и поиском. ПРИОРИТЕТ над стандартной delete_file!',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Путь к файлу для удаления'
        },
        confirm: {
          type: 'boolean',
          description: 'Подтверждение удаления (обязательно true для выполнения)',
          default: false
        }
      },
      required: ['file_path']
    },
    handler: async (params) => {
      try {
        if (!params.confirm) {
          return createResponseContent('⚠️ **Требуется подтверждение удаления!**\n\nДобавьте параметр `"confirm": true` для выполнения операции.');
        }
        
        const resolved = await resolveFilePath(params.file_path);
        if (!resolved.success) {
          return createResponseContent(resolved.error);
        }
        
        // Получаем информацию о файле перед удалением
        const stats = await fs.stat(resolved.path);
        await fs.unlink(resolved.path);
        
        const result = `🗑️ **Файл успешно удален**\n\n` +
                      `📁 **Удаленный файл:** ${resolved.relativePath}\n` +
                      `📊 **Размер был:** ${(stats.size / 1024).toFixed(1)}KB\n` +
                      `🕐 **Последнее изменение было:** ${stats.mtime.toLocaleString()}`;
        
        return createResponseContent(result);
      } catch (error) {
        return createResponseContent(error.message);
      }
    }
  },

  list_dir: {
    description: '🧠 УМНАЯ ФУНКЦИЯ: Листинг директории с подробной информацией. ПРИОРИТЕТ над стандартной list_dir!',
    inputSchema: {
      type: 'object',
      properties: {
        directory_path: {
          type: 'string',
          description: 'Путь к директории (по умолчанию текущая)',
          default: '.'
        },
        show_hidden: {
          type: 'boolean',
          description: 'Показывать скрытые файлы',
          default: false
        }
      }
    },
    handler: async (params) => {
      try {
        const dirData = await listDirectoryWrapper(params.directory_path || '.');
        
        // Фильтруем скрытые файлы если нужно
        const filterHidden = (items) => {
          return params.show_hidden ? items : items.filter(item => !item.name.startsWith('.'));
        };
        
        const visibleFiles = filterHidden(dirData.files);
        const visibleDirs = filterHidden(dirData.directories);
        
        let result = `📁 **${dirData.relativePath || 'workspace root'}**\n\n`;
        
        // Статистика
        result += `📊 **Статистика:** ${visibleDirs.length} папок, ${visibleFiles.length} файлов\n\n`;
        
        // Папки
        if (visibleDirs.length > 0) {
          result += `📂 **Папки:**\n`;
          visibleDirs.forEach(dir => {
            result += `  📁 ${dir.name}/\n`;
          });
          result += '\n';
        }
        
        // Файлы
        if (visibleFiles.length > 0) {
          result += `📄 **Файлы:**\n`;
          visibleFiles.forEach(file => {
            const size = file.size < 1024 ? `${file.size}B` : 
                        file.size < 1024*1024 ? `${(file.size/1024).toFixed(1)}KB` : 
                        `${(file.size/1024/1024).toFixed(1)}MB`;
            result += `  📄 ${file.name} (${size})\n`;
          });
        }
        
        if (visibleFiles.length === 0 && visibleDirs.length === 0) {
          result += '📭 **Папка пуста**';
        }
        
        return createResponseContent(result);
      } catch (error) {
        return createResponseContent(error.message);
      }
    }
  },

  file_search: {
    description: '🧠 УМНАЯ ФУНКЦИЯ: Поиск файлов с паттернами и фильтрами. ПРИОРИТЕТ над стандартной file_search!',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Паттерн поиска (поддерживает wildcards: *, ?)'
        },
        directory: {
          type: 'string',
          description: 'Директория для поиска (по умолчанию workspace root)',
          default: '.'
        },
        max_results: {
          type: 'number',
          description: 'Максимум результатов (по умолчанию 50)',
          default: 50
        }
      },
      required: ['pattern']
    },
    handler: async (params) => {
      try {
        const workspaceRoot = getWorkspaceRoot();
        const searchDir = params.directory === '.' ? workspaceRoot : 
                         path.isAbsolute(params.directory) ? params.directory : 
                         path.resolve(workspaceRoot, params.directory);
        
        // Используем универсальную DRY функцию
        const foundFiles = await executeFindCommand(searchDir, params.pattern, {
          maxResults: params.max_results || 50
        });
        
        if (foundFiles.length === 0) {
          return createResponseContent(`🔍 **Поиск не дал результатов**\n\nПаттерн: \`${params.pattern}\`\nПапка: \`${path.relative(workspaceRoot, searchDir)}\``);
        }
        
        const relativeFiles = foundFiles.map(f => path.relative(workspaceRoot, f));
        
        let response = `🔍 **Найдено ${foundFiles.length} файлов**\n\n`;
        response += `🎯 **Паттерн:** \`${params.pattern}\`\n`;
        response += `📁 **Папка поиска:** \`${path.relative(workspaceRoot, searchDir)}\`\n\n`;
        response += `📄 **Результаты:**\n`;
        
        relativeFiles.forEach((file, i) => {
          response += `  ${i + 1}. ${file}\n`;
        });
        
        return createResponseContent(response);
      } catch (error) {
        return createResponseContent(`❌ Ошибка поиска: ${error.message}`);
      }
    }
  },

  grep_search: {
    description: '🧠 УМНАЯ ФУНКЦИЯ: Поиск по содержимому файлов с контекстом. ПРИОРИТЕТ над стандартной grep_search!',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Паттерн для поиска (регулярное выражение)'
        },
        file_pattern: {
          type: 'string',
          description: 'Паттерн файлов для поиска (по умолчанию все файлы)',
          default: '*'
        },
        directory: {
          type: 'string',
          description: 'Директория для поиска',
          default: '.'
        },
        context_lines: {
          type: 'number',
          description: 'Количество строк контекста вокруг совпадения',
          default: 2
        },
        max_results: {
          type: 'number',
          description: 'Максимум результатов',
          default: 50
        }
      },
      required: ['pattern']
    },
    handler: async (params) => {
      try {
        const workspaceRoot = getWorkspaceRoot();
        const searchDir = params.directory === '.' ? workspaceRoot : 
                         path.isAbsolute(params.directory) ? params.directory : 
                         path.resolve(workspaceRoot, params.directory);
        
        // Используем универсальную DRY функцию
        const result = await executeGrepCommand(searchDir, params.pattern, params.file_pattern || '*', {
          contextLines: params.context_lines || 2,
          maxResults: params.max_results || 50
        });
        
        if (!result) {
          return createResponseContent(`🔍 **Поиск не дал результатов**\n\nПаттерн: \`${params.pattern}\`\nФайлы: \`${params.file_pattern || '*'}\`\nПапка: \`${path.relative(workspaceRoot, searchDir)}\``);
        }
        
        // Парсим результаты grep
        const lines = result.split('\n').filter(line => line.trim());
        const matches = [];
        let currentFile = '';
        let currentMatches = [];
        
        for (const line of lines) {
          // Ищем паттерн /path/file.js:123: или /path/file.js-123-
          const colonMatch = line.match(/^(.+?):(\d+):(.*)$/);
          const dashMatch = line.match(/^(.+?)-(\d+)-(.*)$/);
          
          if (colonMatch) {
            // Строка с совпадением
            const [, filePath, lineNum, content] = colonMatch;
            
            if (filePath !== currentFile) {
              if (currentMatches.length > 0) {
                matches.push({ file: currentFile, matches: currentMatches });
              }
              currentFile = filePath;
              currentMatches = [];
            }
            
            currentMatches.push({ line: lineNum, content, isMatch: true });
          } else if (dashMatch) {
            // Строка контекста
            const [, filePath, lineNum, content] = dashMatch;
            
            if (filePath === currentFile && currentMatches.length > 0) {
              currentMatches.push({ line: lineNum, content, isMatch: false });
            }
          }
        }
        
        if (currentMatches.length > 0) {
          matches.push({ file: currentFile, matches: currentMatches });
        }
        
        let response = `🔍 **Найдено совпадений в ${matches.length} файлах**\n\n`;
        response += `🎯 **Паттерн:** \`${params.pattern}\`\n`;
        response += `📁 **Файлы:** \`${params.file_pattern || '*'}\`\n`;
        response += `📂 **Папка:** \`${path.relative(workspaceRoot, searchDir)}\`\n\n`;
        
        matches.slice(0, 10).forEach((match, i) => {
          const relativeFile = path.relative(workspaceRoot, match.file);
          response += `📄 **${i + 1}. ${relativeFile}**\n`;
          match.matches.slice(0, 3).forEach(m => {
            response += `  ${m.line}: ${m.content}\n`;
          });
          response += '\n';
        });
        
        if (matches.length > 10) {
          response += `... и еще ${matches.length - 10} файлов\n`;
        }
        
        return createResponseContent(response);
      } catch (error) {
        return createResponseContent(`❌ Ошибка grep поиска: ${error.message}`);
      }
    }
  }
};

// Экспорт модуля
const smartFilesModule = {
  name: 'smart-files',
  description: '🧠 Умные функции для работы с файлами - используй ИХ вместо стандартных!',
  tools: smartFileTools
};

export default smartFilesModule;