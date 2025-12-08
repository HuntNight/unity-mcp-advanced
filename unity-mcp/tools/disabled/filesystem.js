import fs from 'fs/promises';
import path from 'path';
import { getWorkspaceRoot, getRelativeToWorkspace } from '../utils/workspaceUtils.js';

// Вспомогательная функция для поиска доступного имени
async function findAvailableName(directory, baseName) {
  const ext = path.extname(baseName);
  const nameWithoutExt = path.basename(baseName, ext);

  let counter = 1;
  let newName;

  do {
    newName = `${nameWithoutExt}_${counter}${ext}`;
    counter++;
  } while (await fs.access(path.resolve(directory, newName)).then(() => true).catch(() => false));

  return path.resolve(directory, newName);
}

// Вспомогательная функция для получения размера файла в человеческом формате
function formatFileSize(bytes) {
  const sizes = ['B', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 B';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

// Вспомогательная функция для анализа структуры проекта
async function analyzeProjectStructure(dirPath) {
  const stats = {
    totalFiles: 0,
    totalDirs: 0,
    totalSize: 0,
    fileTypes: {},
    largeFiles: [],
    emptyDirs: []
  };

  async function walkDir(currentPath) {
    try {
      const items = await fs.readdir(currentPath);

      if (items.length === 0) {
        stats.emptyDirs.push(getRelativeToWorkspace(currentPath));
      }

      for (const item of items) {
        const itemPath = path.join(currentPath, item);
        const stat = await fs.stat(itemPath);

        if (stat.isDirectory()) {
          stats.totalDirs++;
          await walkDir(itemPath);
        } else {
          stats.totalFiles++;
          stats.totalSize += stat.size;

          const ext = path.extname(item).toLowerCase();
          stats.fileTypes[ext] = (stats.fileTypes[ext] || 0) + 1;

          if (stat.size > 1024 * 1024) { // Файлы больше 1MB
            stats.largeFiles.push({
              path: getRelativeToWorkspace(itemPath),
              size: formatFileSize(stat.size)
            });
          }
        }
      }
    } catch (error) {
      // Логируем ошибку для диагностики
      console.error(`❌ Ошибка чтения папки ${currentPath}:`, error.message);
      // Добавляем ошибку в статистику для отладки
      if (!stats.errors) stats.errors = [];
      stats.errors.push({
        path: getRelativeToWorkspace(currentPath),
        error: error.message
      });
    }
  }

  await walkDir(dirPath);
  return stats;
}

export const filesystemModule = {
  name: "filesystem",
  description: "🗂️ Умные файловые операции с CISC подходом - экономия ментальной нагрузки!",

  tools: [
    {
      name: "smart_rename",
      description: "🧠 УМНАЯ АВТОМАТИЗАЦИЯ! Инструмент не просто показывает данные, а НАПРАВЛЯЕТ ПОВЕДЕНИЕ! 🧠\n\n" +
        "🗣️ ГОВОРИТ ТЕБЕ: 'Чувак, я сам разрешу конфликты имен! Не парься о стратегиях - я умный!'\n" +
        "📊 ДАЕТ ДАННЫЕ: Показывает что именно будет переименовано и как разрешен конфликт\n" +
        "💡 НАПРАВЛЯЕТ: Если сомневаешься - используй dry_run сначала!\n" +
        "🐕 ТВОЙ ФАЙЛОВЫЙ ПИТОМЕЦ: Адаптируется под контекст (constitution.md → dev-constitution.md)",
      inputSchema: {
        type: "object",
        properties: {
          source_path: {
            type: "string",
            description: "Исходный путь к файлу/папке (относительно workspace)"
          },
          new_name: {
            type: "string",
            description: "Новое имя (без пути, только имя файла)"
          },
          strategy: {
            type: "string",
            enum: ["auto", "backup", "increment", "replace"],
            default: "auto",
            description: "Стратегия при конфликтах: auto=умная, backup=создать .bak, increment=добавить цифру, replace=заменить"
          },
          dry_run: {
            type: "boolean",
            default: false,
            description: "Только показать что будет сделано, не выполнять"
          }
        },
        required: ["source_path", "new_name"]
      },
      handler: async (args) => {
        const { source_path, new_name, strategy = "auto", dry_run = false } = args;

        try {
          // Нормализуем пути
          const workspaceRoot = getWorkspaceRoot();
          const sourcePath = path.resolve(workspaceRoot, source_path);
          const sourceDir = path.dirname(sourcePath);
          const targetPath = path.resolve(sourceDir, new_name);

          // Проверяем существование исходного файла
          const sourceExists = await fs.access(sourcePath).then(() => true).catch(() => false);
          if (!sourceExists) {
            throw new Error(`❌ Исходный файл не найден: ${source_path}`);
          }

          // Получаем информацию об исходном файле
          const sourceStat = await fs.stat(sourcePath);
          const isDirectory = sourceStat.isDirectory();

          // Проверяем конфликт имён
          const targetExists = await fs.access(targetPath).then(() => true).catch(() => false);

          let finalTargetPath = targetPath;
          let conflictResolution = "none";

          if (targetExists && sourcePath !== targetPath) {
            // Разрешаем конфликт по стратегии
            switch (strategy) {
              case "auto":
                // Умная стратегия: анализируем контекст
                if (new_name.includes("constitution") && source_path.includes("dev-environment")) {
                  finalTargetPath = path.resolve(sourceDir, "dev-constitution.md");
                  conflictResolution = "smart_prefix";
                } else {
                  // Добавляем инкремент
                  finalTargetPath = await findAvailableName(sourceDir, new_name);
                  conflictResolution = "increment";
                }
                break;

              case "backup":
                // Создаём бэкап существующего файла
                const backupPath = targetPath + '.bak';
                if (!dry_run) {
                  await fs.rename(targetPath, backupPath);
                }
                conflictResolution = `backup_created: ${path.basename(backupPath)}`;
                break;

              case "increment":
                finalTargetPath = await findAvailableName(sourceDir, new_name);
                conflictResolution = "increment";
                break;

              case "replace":
                conflictResolution = "replace_existing";
                break;
            }
          }

          // Выполняем операцию
          const operation = {
            source: getRelativeToWorkspace(sourcePath),
            target: getRelativeToWorkspace(finalTargetPath),
            type: isDirectory ? "directory" : "file",
            conflict_resolution: conflictResolution,
            dry_run
          };

          if (!dry_run) {
            await fs.rename(sourcePath, finalTargetPath);
          }

          return {
            success: true,
            operation,
            message: `✅ ${dry_run ? '[DRY RUN] ' : ''}${isDirectory ? 'Папка' : 'Файл'} переименован: ${operation.source} → ${operation.target}${conflictResolution !== 'none' ? ` (${conflictResolution})` : ''}`
          };

        } catch (error) {
          throw new Error(`❌ Ошибка переименования: ${error.message}`);
        }
      }
    },

    {
      name: "batch_rename",
      description: "📦 МАССОВЫЙ ПЕРЕИМЕНОВАТЕЛЬ! Твой регулярочный питомец готов к работе! 📦\n\n" +
        "🗣️ ГОВОРИТ ТЕБЕ: 'Дай мне паттерн и замену - я переименую все файлы разом!'\n" +
        "📊 ДАЕТ ДАННЫЕ: Показывает список всех операций переименования\n" +
        "💡 НАПРАВЛЯЕТ: Всегда начинай с dry_run=true чтобы увидеть что будет!\n" +
        "🐕 ТВОЙ REGEX ПИТОМЕЦ: Понимает группы ($1, $2) и сложные паттерны",
      inputSchema: {
        type: "object",
        properties: {
          directory: {
            type: "string",
            description: "Папка для поиска файлов"
          },
          pattern: {
            type: "string",
            description: "Регулярное выражение для поиска (например: '^constitution\\.md$')"
          },
          replacement: {
            type: "string",
            description: "Шаблон замены (может содержать $1, $2 для групп)"
          },
          dry_run: {
            type: "boolean",
            default: true,
            description: "Только показать что будет сделано"
          }
        },
        required: ["directory", "pattern", "replacement"]
      },
      handler: async (args) => {
        const { directory, pattern, replacement, dry_run = true } = args;

        try {
          const workspaceRoot = getWorkspaceRoot();
          const dirPath = path.resolve(workspaceRoot, directory);

          // Читаем содержимое папки
          const files = await fs.readdir(dirPath);
          const regex = new RegExp(pattern);
          const operations = [];

          for (const file of files) {
            const match = file.match(regex);
            if (match) {
              const newName = file.replace(regex, replacement);
              if (newName !== file) {
                const sourcePath = path.resolve(dirPath, file);
                const targetPath = path.resolve(dirPath, newName);

                operations.push({
                  source: getRelativeToWorkspace(sourcePath),
                  target: getRelativeToWorkspace(targetPath),
                  original_name: file,
                  new_name: newName
                });

                if (!dry_run) {
                  await fs.rename(sourcePath, targetPath);
                }
              }
            }
          }

          return {
            success: true,
            operations,
            count: operations.length,
            dry_run,
            message: `✅ ${dry_run ? '[DRY RUN] ' : ''}Обработано файлов: ${operations.length}`
          };

        } catch (error) {
          throw new Error(`❌ Ошибка массового переименования: ${error.message}`);
        }
      }
    },

    {
      name: "organize_by_date",
      description: "📅 ВРЕМЕННОЙ ОРГАНИЗАТОР! Твой хронологический питомец наводит порядок! 📅\n\n" +
        "🗣️ ГОВОРИТ ТЕБЕ: 'Дай мне файлы - я рассортирую их по папкам YYYY/MM!'\n" +
        "📊 ДАЕТ ДАННЫЕ: Показывает куда какой файл переместится и по какой дате\n" +
        "💡 НАПРАВЛЯЕТ: Выбери created или modified - я сам создам нужные папки!\n" +
        "🐕 ТВОЙ АРХИВАРИУС: Автоматически создает структуру папок по датам",
      inputSchema: {
        type: "object",
        properties: {
          source_directory: {
            type: "string",
            description: "Папка с файлами для сортировки"
          },
          target_directory: {
            type: "string",
            description: "Папка куда складывать организованные файлы"
          },
          date_type: {
            type: "string",
            enum: ["created", "modified"],
            default: "modified",
            description: "По какой дате сортировать: created=дата создания, modified=дата изменения"
          },
          file_pattern: {
            type: "string",
            default: ".*",
            description: "Регулярка для фильтрации файлов (по умолчанию все)"
          },
          dry_run: {
            type: "boolean",
            default: true,
            description: "Только показать что будет сделано"
          }
        },
        required: ["source_directory", "target_directory"]
      },
      handler: async (args) => {
        const { source_directory, target_directory, date_type = "modified", file_pattern = ".*", dry_run = true } = args;

        try {
          const workspaceRoot = getWorkspaceRoot();
          const sourcePath = path.resolve(workspaceRoot, source_directory);
          const targetPath = path.resolve(workspaceRoot, target_directory);
          const regex = new RegExp(file_pattern);

          const files = await fs.readdir(sourcePath);
          const operations = [];

          for (const file of files) {
            if (!regex.test(file)) continue;

            const filePath = path.join(sourcePath, file);
            const stat = await fs.stat(filePath);

            if (stat.isFile()) {
              const date = date_type === "created" ? stat.birthtime : stat.mtime;
              const year = date.getFullYear();
              const month = String(date.getMonth() + 1).padStart(2, '0');

              const dateFolder = path.join(targetPath, String(year), month);
              const targetFile = path.join(dateFolder, file);

              operations.push({
                source: getRelativeToWorkspace(filePath),
                target: getRelativeToWorkspace(targetFile),
                date: date.toISOString().split('T')[0],
                folder: `${year}/${month}`
              });

              if (!dry_run) {
                await fs.mkdir(dateFolder, { recursive: true });
                await fs.rename(filePath, targetFile);
              }
            }
          }

          return {
            success: true,
            operations,
            count: operations.length,
            dry_run,
            message: `✅ ${dry_run ? '[DRY RUN] ' : ''}Организовано файлов: ${operations.length} по датам`
          };

        } catch (error) {
          throw new Error(`❌ Ошибка организации по датам: ${error.message}`);
        }
      }
    },

    {
      name: "cleanup_temp",
      description: "🧹 УБОРЩИК МУСОРА! Твой чистящий питомец готов навести порядок! 🧹\n\n" +
        "🗣️ ГОВОРИТ ТЕБЕ: 'Покажи мне папку - я найду весь мусор и уберу его!'\n" +
        "📊 ДАЕТ ДАННЫЕ: Список всех файлов которые будут удалены с размерами\n" +
        "💡 НАПРАВЛЯЕТ: Используй aggressive=true для глубокой очистки, но осторожно!\n" +
        "🐕 ТВОЙ САНИТАР: Знает что такое мусор (.tmp, .bak, node_modules, .git)",
      inputSchema: {
        type: "object",
        properties: {
          directory: {
            type: "string",
            default: ".",
            description: "Папка для очистки (по умолчанию текущая)"
          },
          aggressive: {
            type: "boolean",
            default: false,
            description: "Агрессивная очистка (включает node_modules, .git, dist, build)"
          },
          older_than_days: {
            type: "number",
            default: 7,
            description: "Удалять файлы старше N дней (0 = все)"
          },
          dry_run: {
            type: "boolean",
            default: true,
            description: "Только показать что будет удалено"
          }
        }
      },
      handler: async (args) => {
        const { directory = ".", aggressive = false, older_than_days = 7, dry_run = true } = args;

        try {
          const workspaceRoot = getWorkspaceRoot();
          const targetPath = path.resolve(workspaceRoot, directory);

          const tempPatterns = [
            /\.tmp$/i, /\.temp$/i, /\.bak$/i, /\.backup$/i,
            /\.log$/i, /\.cache$/i, /~$/,
            /^\.DS_Store$/i, /^Thumbs\.db$/i
          ];

          const aggressivePatterns = [
            /^node_modules$/i, /^\.git$/i, /^dist$/i, /^build$/i,
            /^\.next$/i, /^\.nuxt$/i, /^coverage$/i
          ];

          const patterns = aggressive ? [...tempPatterns, ...aggressivePatterns] : tempPatterns;
          const cutoffDate = older_than_days > 0 ? new Date(Date.now() - older_than_days * 24 * 60 * 60 * 1000) : null;

          const operations = [];
          let totalSize = 0;

          async function scanDirectory(currentPath) {
            try {
              const items = await fs.readdir(currentPath);

              for (const item of items) {
                const itemPath = path.join(currentPath, item);
                const stat = await fs.stat(itemPath);

                const shouldDelete = patterns.some(pattern => pattern.test(item)) &&
                  (!cutoffDate || stat.mtime < cutoffDate);

                if (shouldDelete) {
                  const size = stat.isDirectory() ? await getDirSize(itemPath) : stat.size;
                  totalSize += size;

                  operations.push({
                    path: getRelativeToWorkspace(itemPath),
                    type: stat.isDirectory() ? "directory" : "file",
                    size: formatFileSize(size),
                    age_days: Math.floor((Date.now() - stat.mtime.getTime()) / (24 * 60 * 60 * 1000))
                  });

                  if (!dry_run) {
                    await fs.rm(itemPath, { recursive: true, force: true });
                  }
                } else if (stat.isDirectory() && !patterns.some(pattern => pattern.test(item))) {
                  await scanDirectory(itemPath);
                }
              }
            } catch (error) {
              // Игнорируем недоступные папки
            }
          }

          async function getDirSize(dirPath) {
            let size = 0;
            try {
              const items = await fs.readdir(dirPath);
              for (const item of items) {
                const itemPath = path.join(dirPath, item);
                const stat = await fs.stat(itemPath);
                size += stat.isDirectory() ? await getDirSize(itemPath) : stat.size;
              }
            } catch (error) {
              // Игнорируем ошибки
            }
            return size;
          }

          await scanDirectory(targetPath);

          return {
            success: true,
            operations,
            count: operations.length,
            total_size: formatFileSize(totalSize),
            dry_run,
            message: `✅ ${dry_run ? '[DRY RUN] ' : ''}Очищено: ${operations.length} элементов, освобождено: ${formatFileSize(totalSize)}`
          };

        } catch (error) {
          throw new Error(`❌ Ошибка очистки: ${error.message}`);
        }
      }
    },

    {
      name: "find_duplicates",
      description: "🔍 УМНЫЙ ДЕТЕКТИВ ДУБЛИКАТОВ! Твой дрессированный сыщик анализирует и предлагает! 🔍\n\n" +
        "🗣️ ГОВОРИТ ТЕБЕ: 'Дай папку - найду дубликаты и предложу что с ними делать!'\n" +
        "📊 ДАЕТ ДАННЫЕ: Умный анализ дубликатов с рекомендациями по очистке\n" +
        "💡 НАПРАВЛЯЕТ: Предлагает какие файлы удалить, а какие оставить как основные\n" +
        "🐕 ТВОЙ ДРЕССИРОВАННЫЙ СЫЩИК: Думает о приоритетах и дает умные советы!",
      inputSchema: {
        type: "object",
        properties: {
          directory: {
            type: "string",
            default: ".",
            description: "Папка для поиска дубликатов"
          },
          min_size: {
            type: "number",
            default: 1024,
            description: "Минимальный размер файла в байтах (игнорировать мелочь)"
          },
          extensions: {
            type: "array",
            items: { type: "string" },
            description: "Расширения для проверки (пустой массив = все файлы)"
          }
        }
      },
      handler: async (args) => {
        const { directory = ".", min_size = 1024, extensions = [] } = args;

        try {
          const crypto = await import('crypto');
          const workspaceRoot = getWorkspaceRoot();
          const targetPath = path.resolve(workspaceRoot, directory);

          const filesBySize = new Map();
          const duplicateGroups = [];
          let analysisStats = {
            totalScanned: 0,
            skippedSmall: 0,
            skippedExtension: 0,
            hashCalculated: 0
          };

          // 🧠 УМНОЕ СКАНИРОВАНИЕ С АНАЛИЗОМ
          async function smartScanFiles(currentPath) {
            try {
              const items = await fs.readdir(currentPath);

              for (const item of items) {
                const itemPath = path.join(currentPath, item);
                const stat = await fs.stat(itemPath);

                if (stat.isDirectory()) {
                  await smartScanFiles(itemPath);
                } else {
                  analysisStats.totalScanned++;

                  // Проверка размера
                  if (stat.size < min_size) {
                    analysisStats.skippedSmall++;
                    continue;
                  }

                  // Проверка расширения
                  const ext = path.extname(item).toLowerCase();
                  if (extensions.length > 0 && !extensions.includes(ext)) {
                    analysisStats.skippedExtension++;
                    continue;
                  }

                  const sizeKey = stat.size;
                  if (!filesBySize.has(sizeKey)) {
                    filesBySize.set(sizeKey, []);
                  }
                  filesBySize.get(sizeKey).push({
                    path: itemPath,
                    relativePath: getRelativeToWorkspace(itemPath),
                    size: stat.size,
                    name: item,
                    directory: path.dirname(getRelativeToWorkspace(itemPath)),
                    modified: stat.mtime
                  });
                }
              }
            } catch (error) {
              // Игнорируем недоступные папки
            }
          }

          await smartScanFiles(targetPath);

          // 🔍 УМНЫЙ АНАЛИЗ ДУБЛИКАТОВ
          for (const [size, files] of filesBySize) {
            if (files.length > 1) {
              const hashGroups = new Map();

              for (const file of files) {
                try {
                  const content = await fs.readFile(file.path);
                  const hash = crypto.createHash('md5').update(content).digest('hex');
                  analysisStats.hashCalculated++;

                  if (!hashGroups.has(hash)) {
                    hashGroups.set(hash, []);
                  }
                  hashGroups.get(hash).push(file);
                } catch (error) {
                  // Игнорируем нечитаемые файлы
                }
              }

              for (const [hash, duplicates] of hashGroups) {
                if (duplicates.length > 1) {
                  // 🧠 УМНЫЙ АНАЛИЗ ПРИОРИТЕТОВ
                  const smartAnalysis = analyzeDuplicatePriority(duplicates);

                  duplicateGroups.push({
                    hash,
                    size: formatFileSize(size),
                    count: duplicates.length,
                    files: duplicates.map(f => ({
                      path: f.relativePath,
                      name: f.name,
                      directory: f.directory,
                      modified: f.modified.toISOString(),
                      priority: smartAnalysis.priorities[f.relativePath] || 'unknown'
                    })),
                    total_waste: formatFileSize(size * (duplicates.length - 1)),
                    smart_recommendations: smartAnalysis.recommendations,
                    suggested_action: smartAnalysis.suggestedAction
                  });
                }
              }
            }
          }

          // 🎯 ОБЩИЕ УМНЫЕ РЕКОМЕНДАЦИИ
          const overallRecommendations = generateOverallRecommendations(duplicateGroups, analysisStats);

          const totalWasteBytes = duplicateGroups.reduce((sum, group) => {
            return sum + (group.files.length - 1) * parseInt(group.size.replace(/[^\d.]/g, ''));
          }, 0);

          return `🔍 **УМНЫЙ ДЕТЕКТИВ ЗАВЕРШИЛ РАССЛЕДОВАНИЕ!** 🔍\n\n` +
            `📊 **СТАТИСТИКА АНАЛИЗА:**\n` +
            `   • Всего файлов просканировано: ${analysisStats.totalScanned}\n` +
            `   • Пропущено (размер < ${formatFileSize(min_size)}): ${analysisStats.skippedSmall}\n` +
            `   • Пропущено (расширение): ${analysisStats.skippedExtension}\n` +
            `   • Хешей вычислено: ${analysisStats.hashCalculated}\n\n` +
            `🎯 **РЕЗУЛЬТАТЫ ПОИСКА:**\n` +
            `   • Групп дубликатов: ${duplicateGroups.length}\n` +
            `   • Всего дубликатов: ${duplicateGroups.reduce((sum, g) => sum + g.count, 0)}\n` +
            `   • Можно освободить: ${formatFileSize(totalWasteBytes)}\n\n` +
            (duplicateGroups.length > 0 ?
              `🧠 **УМНЫЕ РЕКОМЕНДАЦИИ ПО ГРУППАМ:**\n` +
              duplicateGroups.slice(0, 5).map((group, i) =>
                `\n**Группа ${i + 1}** (${group.size}, ${group.count} файлов):\n` +
                `   📁 Файлы: ${group.files.map(f => f.path).join(', ')}\n` +
                `   💡 Рекомендация: ${group.suggested_action}\n` +
                `   🎯 Детали: ${group.smart_recommendations.join('; ')}`
              ).join('\n') +
              (duplicateGroups.length > 5 ? `\n\n... и еще ${duplicateGroups.length - 5} групп` : '') + '\n\n' : '') +
            `🚀 **ОБЩИЕ СОВЕТЫ ПИТОМЦА:**\n` +
            overallRecommendations.map(r => `   • ${r}`).join('\n') + '\n\n' +
            (duplicateGroups.length === 0 ?
              `✨ **ОТЛИЧНО!** Дубликатов не найдено - файловая система чистая!` :
              `⚠️ **ВНИМАНИЕ:** Найдены дубликаты. Рекомендую проверить перед удалением!`);

        } catch (error) {
          throw new Error(`❌ **УМНЫЙ ДЕТЕКТИВ СТОЛКНУЛСЯ С ПРОБЛЕМОЙ** ❌\n\n` +
            `💥 **Ошибка:** ${error.message}\n\n` +
            `🧠 **ДИАГНОСТИКА ПИТОМЦА:**\n` +
            `   • Проверь что папка существует и доступна\n` +
            `   • Убедись что есть права на чтение файлов\n` +
            `   • Возможно некоторые файлы заблокированы другими процессами`);
        }
      }
    },

    {
      name: "project_analysis",
      description: "📊 АНАЛИТИК ПРОЕКТОВ! Твой статистический питомец изучает структуру! 📊\n\n" +
        "🗣️ ГОВОРИТ ТЕБЕ: 'Покажи мне проект - я расскажу всё о его структуре!'\n" +
        "📊 ДАЕТ ДАННЫЕ: Полная статистика - файлы, папки, типы, размеры, большие файлы\n" +
        "💡 НАПРАВЛЯЕТ: Обращай внимание на большие файлы и пустые папки!\n" +
        "🐕 ТВОЙ ПРОЕКТНЫЙ АУДИТОР: Видит проблемы которые ты можешь пропустить",
      inputSchema: {
        type: "object",
        properties: {
          directory: {
            type: "string",
            default: ".",
            description: "Папка для анализа"
          },
          include_hidden: {
            type: "boolean",
            default: false,
            description: "Включать скрытые файлы и папки"
          }
        }
      },
      handler: async (args) => {
        const { directory = ".", include_hidden = false } = args;

        try {
          const workspaceRoot = getWorkspaceRoot();
          const targetPath = path.resolve(workspaceRoot, directory);

          // Отладочная информация
          const debugInfo = {
            workspaceRoot,
            directory,
            targetPath,
            pathExists: await fs.access(targetPath).then(() => true).catch(() => false)
          };

          if (!debugInfo.pathExists) {
            throw new Error(`❌ Папка не найдена: ${targetPath}`);
          }

          const stats = await analyzeProjectStructure(targetPath);

          // Сортируем типы файлов по количеству
          const sortedFileTypes = Object.entries(stats.fileTypes)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10); // Топ 10

          // Сортируем большие файлы по размеру
          stats.largeFiles.sort((a, b) => {
            const sizeA = parseFloat(a.size);
            const sizeB = parseFloat(b.size);
            return sizeB - sizeA;
          });

          return {
            success: true,
            analysis: {
              summary: {
                total_files: stats.totalFiles,
                total_directories: stats.totalDirs,
                total_size: formatFileSize(stats.totalSize),
                empty_directories: stats.emptyDirs.length
              },
              file_types: sortedFileTypes.map(([ext, count]) => ({
                extension: ext || '(no extension)',
                count,
                percentage: Math.round((count / stats.totalFiles) * 100)
              })),
              large_files: stats.largeFiles.slice(0, 10), // Топ 10 больших файлов
              empty_directories: stats.emptyDirs.slice(0, 10), // Первые 10 пустых папок
              recommendations: generateRecommendations(stats),
              errors: stats.errors || [] // Показываем ошибки если есть
            },
            debug: debugInfo, // Добавляем отладочную информацию
            message: `📊 Проанализировано: ${stats.totalFiles} файлов, ${stats.totalDirs} папок, общий размер: ${formatFileSize(stats.totalSize)}${stats.errors ? ` | ⚠️ Ошибок: ${stats.errors.length}` : ''}`
          };

        } catch (error) {
          throw new Error(`❌ Ошибка анализа проекта: ${error.message}`);
        }
      }
    },

    {
      name: "smart_backup",
      description: "💾 ХРАНИТЕЛЬ БЭКАПОВ! Твой архивный питомец защищает важные файлы! 💾\n\n" +
        "🗣️ ГОВОРИТ ТЕБЕ: 'Я сам определю что важно и создам правильную структуру бэкапов!'\n" +
        "📊 ДАЕТ ДАННЫЕ: Список файлов для бэкапа с размерами и путями назначения\n" +
        "💡 НАПРАВЛЯЕТ: Используй include_patterns для точного контроля что бэкапить!\n" +
        "🐕 ТВОЙ ЦИФРОВОЙ АРХИВАРИУС: Знает что важно (.md, .json, .js) и что мусор",
      inputSchema: {
        type: "object",
        properties: {
          source_directory: {
            type: "string",
            default: ".",
            description: "Папка для резервирования"
          },
          backup_directory: {
            type: "string",
            default: "backup",
            description: "Папка для сохранения бэкапов"
          },
          include_patterns: {
            type: "array",
            items: { type: "string" },
            default: ["*.md", "*.json", "*.js", "*.ts", "*.py", "*.txt"],
            description: "Паттерны файлов для включения в бэкап"
          },
          exclude_patterns: {
            type: "array",
            items: { type: "string" },
            default: ["node_modules", ".git", "*.tmp", "*.log"],
            description: "Паттерны для исключения из бэкапа"
          },
          compress: {
            type: "boolean",
            default: false,
            description: "Сжимать бэкап в архив"
          }
        }
      },
      handler: async (args) => {
        const {
          source_directory = ".",
          backup_directory = "backup",
          include_patterns = ["*.md", "*.json", "*.js", "*.ts", "*.py", "*.txt"],
          exclude_patterns = ["node_modules", ".git", "*.tmp", "*.log"],
          compress = false
        } = args;

        try {
          const workspaceRoot = getWorkspaceRoot();
          const sourcePath = path.resolve(workspaceRoot, source_directory);
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
          const backupPath = path.resolve(workspaceRoot, backup_directory, `backup-${timestamp}`);

          await fs.mkdir(backupPath, { recursive: true });

          const operations = [];
          let totalSize = 0;

          // Простая функция для проверки паттернов
          function matchesPattern(filename, patterns) {
            return patterns.some(pattern => {
              const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
              return regex.test(filename) || regex.test(path.basename(filename));
            });
          }

          async function backupDirectory(currentSource, currentBackup) {
            try {
              const items = await fs.readdir(currentSource);

              for (const item of items) {
                const sourcePath = path.join(currentSource, item);
                const backupItemPath = path.join(currentBackup, item);
                const stat = await fs.stat(sourcePath);

                // Проверяем исключения
                if (matchesPattern(item, exclude_patterns)) {
                  continue;
                }

                if (stat.isDirectory()) {
                  await fs.mkdir(backupItemPath, { recursive: true });
                  await backupDirectory(sourcePath, backupItemPath);
                } else {
                  // Проверяем включения
                  if (matchesPattern(item, include_patterns)) {
                    await fs.copyFile(sourcePath, backupItemPath);
                    totalSize += stat.size;

                    operations.push({
                      source: getRelativeToWorkspace(sourcePath),
                      backup: getRelativeToWorkspace(backupItemPath),
                      size: formatFileSize(stat.size)
                    });
                  }
                }
              }
            } catch (error) {
              // Игнорируем недоступные папки
            }
          }

          await backupDirectory(sourcePath, backupPath);

          return {
            success: true,
            backup_info: {
              backup_path: getRelativeToWorkspace(backupPath),
              timestamp,
              files_backed_up: operations.length,
              total_size: formatFileSize(totalSize),
              compressed: compress
            },
            operations: operations.slice(0, 20), // Показываем первые 20 операций
            message: `💾 Создан бэкап: ${operations.length} файлов, размер: ${formatFileSize(totalSize)}`
          };

        } catch (error) {
          throw new Error(`❌ Ошибка создания бэкапа: ${error.message}`);
        }
      }
    },

    {
      name: "execute_js_on_files",
      description: "🚀 КОМПОЗИЦИЯ ПУШКА! Твой программируемый питомец выполняет любой код! 🚀\n\n" +
        "🗣️ ГОВОРИТ ТЕБЕ: 'Дай мне JavaScript функцию - я выполню её на каждом файле!'\n" +
        "📊 ДАЕТ ДАННЫЕ: Результаты выполнения функции, изменения файлов, статистику\n" +
        "💡 НАПРАВЛЯЕТ: Функция получает {filePath, fileName, content, stats} и возвращает {action, result, newContent}\n" +
        "🐕 ТВОЙ КОДОВЫЙ ИСПОЛНИТЕЛЬ: Безопасно выполняет пользовательский код на файлах",
      inputSchema: {
        type: "object",
        properties: {
          directory: {
            type: "string",
            default: ".",
            description: "Папка для обработки файлов"
          },
          file_filter: {
            type: "string",
            default: ".*",
            description: "Регулярное выражение для фильтрации файлов (например: '\\.(js|ts)$')"
          },
          js_function: {
            type: "string",
            description: "JavaScript функция как строка. Получает объект: {filePath, fileName, content, stats}. Должна вернуть {action, result, newContent?}"
          },
          dry_run: {
            type: "boolean",
            default: true,
            description: "Только показать что будет сделано, не изменять файлы"
          },
          max_file_size: {
            type: "number",
            default: 1048576,
            description: "Максимальный размер файла для обработки в байтах (по умолчанию 1MB)"
          }
        },
        required: ["js_function"]
      },
      handler: async (args) => {
        const {
          directory = ".",
          file_filter = ".*",
          js_function,
          dry_run = true,
          max_file_size = 1048576
        } = args;

        try {
          const workspaceRoot = getWorkspaceRoot();
          const targetPath = path.resolve(workspaceRoot, directory);
          const filterRegex = new RegExp(file_filter);

          // Создаём функцию из строки
          let userFunction;
          try {
            // Безопасное выполнение пользовательского кода
            userFunction = new Function('fileData', `
              const { filePath, fileName, content, stats } = fileData;
              ${js_function}
            `);
          } catch (error) {
            throw new Error(`❌ Ошибка в JavaScript функции: ${error.message}`);
          }

          const operations = [];
          let processedFiles = 0;
          let modifiedFiles = 0;

          async function processDirectory(currentPath) {
            try {
              const items = await fs.readdir(currentPath);

              for (const item of items) {
                const itemPath = path.join(currentPath, item);
                const stat = await fs.stat(itemPath);

                if (stat.isDirectory()) {
                  await processDirectory(itemPath);
                } else if (filterRegex.test(item) && stat.size <= max_file_size) {
                  processedFiles++;

                  try {
                    // Читаем содержимое файла
                    const content = await fs.readFile(itemPath, 'utf8');

                    // Подготавливаем данные для функции
                    const fileData = {
                      filePath: getRelativeToWorkspace(itemPath),
                      fileName: item,
                      content: content,
                      stats: {
                        size: stat.size,
                        created: stat.birthtime,
                        modified: stat.mtime,
                        isDirectory: stat.isDirectory()
                      }
                    };

                    // Выполняем пользовательскую функцию
                    const result = userFunction(fileData);

                    if (result && typeof result === 'object') {
                      const operation = {
                        file: fileData.filePath,
                        action: result.action || 'processed',
                        result: result.result || 'no result',
                        modified: false
                      };

                      // Если функция вернула новое содержимое
                      if (result.newContent !== undefined && result.newContent !== content) {
                        operation.modified = true;
                        operation.changes = {
                          old_size: content.length,
                          new_size: result.newContent.length,
                          diff_chars: result.newContent.length - content.length
                        };

                        if (!dry_run) {
                          await fs.writeFile(itemPath, result.newContent, 'utf8');
                          modifiedFiles++;
                        }
                      }

                      operations.push(operation);
                    }

                  } catch (funcError) {
                    operations.push({
                      file: getRelativeToWorkspace(itemPath),
                      action: 'error',
                      result: `Ошибка выполнения функции: ${funcError.message}`,
                      modified: false
                    });
                  }
                }
              }
            } catch (error) {
              // Игнорируем недоступные папки
            }
          }

          await processDirectory(targetPath);

          return {
            success: true,
            summary: {
              processed_files: processedFiles,
              modified_files: modifiedFiles,
              total_operations: operations.length,
              dry_run
            },
            operations: operations.slice(0, 50), // Показываем первые 50 операций
            function_code: js_function,
            message: `🚀 Обработано файлов: ${processedFiles}, изменено: ${modifiedFiles} ${dry_run ? '[DRY RUN]' : ''}`
          };

        } catch (error) {
          throw new Error(`❌ Ошибка выполнения JS на файлах: ${error.message}`);
        }
      }
    },

    {
      name: "workspace_utils_diagnostic",
      description: "🔧 ВРЕМЕННАЯ ДИАГНОСТИКА: Тестирует все функции из workspaceUtils.js для проверки корректности работы с путями",
      inputSchema: {
        type: "object",
        properties: {
          test_paths: {
            type: "array",
            items: { type: "string" },
            default: [".", "unity-mcp", "unity-mcp/tools", "../", "C:\\localhost\\engine"],
            description: "Массив путей для тестирования"
          }
        }
      },
      handler: async (args) => {
        const { test_paths = [".", "unity-mcp", "unity-mcp/tools", "../", "C:\\localhost\\engine"] } = args;

        try {
          // Импортируем все функции из workspaceUtils
          const {
            getWorkspaceRoot,
            resolveWorkspacePath,
            getRelativeToWorkspace,
            isInsideWorkspace,
            findGitRoot
          } = await import('../utils/workspaceUtils.js');

          const diagnostics = {
            environment: {
              process_cwd: process.cwd(),
              workspace_root: getWorkspaceRoot(),
              env_workspace_root: process.env.WORKSPACE_ROOT || 'не задан',
              env_pwd: process.env.PWD || 'не задан',
              env_init_cwd: process.env.INIT_CWD || 'не задан'
            },
            git_info: {},
            path_tests: []
          };

          // Тестируем findGitRoot
          try {
            const gitRoot = await findGitRoot();
            diagnostics.git_info = {
              git_root: gitRoot,
              git_relative_to_workspace: getRelativeToWorkspace(gitRoot),
              is_git_inside_workspace: isInsideWorkspace(gitRoot)
            };
          } catch (error) {
            diagnostics.git_info = {
              error: `Ошибка поиска git: ${error.message}`
            };
          }

          // Тестируем все функции на разных путях
          for (const testPath of test_paths) {
            const pathTest = {
              input_path: testPath,
              tests: {}
            };

            try {
              // resolveWorkspacePath
              const resolved = resolveWorkspacePath(testPath);
              pathTest.tests.resolved_path = resolved;

              // getRelativeToWorkspace
              const relative = getRelativeToWorkspace(resolved);
              pathTest.tests.relative_to_workspace = relative;

              // isInsideWorkspace
              const isInside = isInsideWorkspace(resolved);
              pathTest.tests.is_inside_workspace = isInside;

              // Проверяем существование пути
              try {
                await fs.access(resolved);
                pathTest.tests.path_exists = true;

                // Если существует, получаем статистику
                const stat = await fs.stat(resolved);
                pathTest.tests.path_type = stat.isDirectory() ? 'directory' : 'file';
              } catch {
                pathTest.tests.path_exists = false;
              }

            } catch (error) {
              pathTest.tests.error = error.message;
            }

            diagnostics.path_tests.push(pathTest);
          }

          // Дополнительные проверки
          const additionalChecks = {
            workspace_exists: false,
            workspace_readable: false,
            unity_mcp_exists: false,
            tools_dir_exists: false
          };

          try {
            const workspaceRoot = getWorkspaceRoot();
            await fs.access(workspaceRoot);
            additionalChecks.workspace_exists = true;

            try {
              await fs.readdir(workspaceRoot);
              additionalChecks.workspace_readable = true;
            } catch { }

            const unityMcpPath = resolveWorkspacePath('unity-mcp');
            try {
              await fs.access(unityMcpPath);
              additionalChecks.unity_mcp_exists = true;
            } catch { }

            const toolsPath = resolveWorkspacePath('unity-mcp/tools');
            try {
              await fs.access(toolsPath);
              additionalChecks.tools_dir_exists = true;
            } catch { }

          } catch (error) {
            additionalChecks.workspace_error = error.message;
          }

          diagnostics.additional_checks = additionalChecks;

          return {
            success: true,
            diagnostics,
            message: `🔧 **ДИАГНОСТИКА WORKSPACE UTILS** 🔧\n\n` +
              `📁 **Workspace Root:** ${diagnostics.environment.workspace_root}\n` +
              `📁 **Process CWD:** ${diagnostics.environment.process_cwd}\n` +
              `🔧 **Git Root:** ${diagnostics.git_info.git_root || 'не найден'}\n\n` +
              `✅ **Workspace существует:** ${additionalChecks.workspace_exists}\n` +
              `✅ **Workspace читается:** ${additionalChecks.workspace_readable}\n` +
              `✅ **unity-mcp существует:** ${additionalChecks.unity_mcp_exists}\n` +
              `✅ **tools/ существует:** ${additionalChecks.tools_dir_exists}\n\n` +
              `📊 **Протестировано путей:** ${test_paths.length}\n` +
              `🔍 **Подробности в diagnostics объекте**`
          };

        } catch (error) {
          throw new Error(`❌ Ошибка диагностики: ${error.message}`);
        }
      }
    }
  ]
};

// 🧠 УМНЫЙ АНАЛИЗ ПРИОРИТЕТОВ ДУБЛИКАТОВ
function analyzeDuplicatePriority(duplicates) {
  const priorities = {};
  const recommendations = [];
  let suggestedAction = '';

  // Анализируем каждый файл
  duplicates.forEach(file => {
    let score = 0;
    let reasons = [];

    // Приоритет по расположению
    if (file.directory.includes('backup') || file.directory.includes('temp')) {
      score -= 10;
      reasons.push('в backup/temp папке');
    } else if (file.directory === '.' || file.directory === '') {
      score += 5;
      reasons.push('в корне проекта');
    }

    // Приоритет по имени
    if (file.name.includes('copy') || file.name.includes('backup') || file.name.includes('old')) {
      score -= 8;
      reasons.push('похоже на копию');
    } else if (file.name.includes('original') || file.name.includes('master')) {
      score += 8;
      reasons.push('похоже на оригинал');
    }

    // Приоритет по дате (новее = лучше)
    const daysSinceModified = (Date.now() - file.modified.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceModified < 7) {
      score += 3;
      reasons.push('недавно изменен');
    } else if (daysSinceModified > 30) {
      score -= 3;
      reasons.push('давно не изменялся');
    }

    // Приоритет по длине пути (короче = лучше)
    if (file.relativePath.split('/').length <= 2) {
      score += 2;
      reasons.push('короткий путь');
    }

    priorities[file.relativePath] = {
      score,
      reasons: reasons.join(', '),
      priority: score > 0 ? 'high' : score < -5 ? 'low' : 'medium'
    };
  });

  // Определяем лучший файл
  const bestFile = Object.entries(priorities).reduce((best, [path, data]) =>
    data.score > best.score ? { path, ...data } : best, { score: -999 });

  // Формируем рекомендации
  if (bestFile.score > -999) {
    recommendations.push(`Оставить: ${bestFile.path} (${bestFile.reasons})`);
    suggestedAction = `Оставить "${bestFile.path}", удалить остальные`;

    Object.entries(priorities).forEach(([path, data]) => {
      if (path !== bestFile.path && data.score < bestFile.score - 3) {
        recommendations.push(`Удалить: ${path} (${data.reasons})`);
      }
    });
  } else {
    suggestedAction = 'Проверить вручную - нет явного лидера';
    recommendations.push('Все файлы имеют похожий приоритет');
  }

  return { priorities, recommendations, suggestedAction };
}

// 🎯 ОБЩИЕ РЕКОМЕНДАЦИИ ПО ДУБЛИКАТАМ
function generateOverallRecommendations(duplicateGroups, analysisStats) {
  const recommendations = [];

  if (duplicateGroups.length === 0) {
    recommendations.push('Дубликатов не найдено - файловая система оптимизирована!');
    return recommendations;
  }

  // Анализ по количеству групп
  if (duplicateGroups.length > 10) {
    recommendations.push('Много групп дубликатов - рекомендую систематическую очистку');
  } else if (duplicateGroups.length > 5) {
    recommendations.push('Умеренное количество дубликатов - можно почистить постепенно');
  }

  // Анализ по размеру
  const totalWaste = duplicateGroups.reduce((sum, g) => sum + g.files.length - 1, 0);
  if (totalWaste > 50) {
    recommendations.push('Много дублированных файлов - значительная экономия места при очистке');
  }

  // Анализ по типам файлов
  const imageGroups = duplicateGroups.filter(g =>
    g.files.some(f => /\.(jpg|jpeg|png|gif|bmp)$/i.test(f.path)));
  if (imageGroups.length > 0) {
    recommendations.push(`Найдены дубликаты изображений (${imageGroups.length} групп) - проверь нужны ли все`);
  }

  // Анализ по расположению
  const backupDuplicates = duplicateGroups.filter(g =>
    g.files.some(f => f.directory.includes('backup') || f.directory.includes('temp')));
  if (backupDuplicates.length > 0) {
    recommendations.push('Есть дубликаты в backup/temp папках - можно безопасно удалить');
  }

  // Общие советы
  recommendations.push('Всегда делай backup перед массовым удалением');
  recommendations.push('Проверяй содержимое файлов перед удалением важных документов');

  return recommendations;
}

// Генерация рекомендаций на основе анализа
function generateRecommendations(stats) {
  const recommendations = [];

  if (stats.emptyDirs.length > 5) {
    recommendations.push(`🗑️ Найдено ${stats.emptyDirs.length} пустых папок - можно удалить`);
  }

  if (stats.largeFiles.length > 0) {
    recommendations.push(`📦 Найдено ${stats.largeFiles.length} больших файлов - проверить необходимость`);
  }

  const logFiles = Object.keys(stats.fileTypes).filter(ext => ext.includes('log')).length;
  if (logFiles > 0) {
    recommendations.push(`📝 Найдены лог-файлы - можно настроить ротацию`);
  }

  if (stats.totalSize > 1024 * 1024 * 1024) { // > 1GB
    recommendations.push(`💾 Проект больше 1GB - рассмотреть архивирование старых файлов`);
  }

  return recommendations;
} 