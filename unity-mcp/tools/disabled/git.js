// 🔥 GIT MCP VIRTUAL SERVER 🔥
// Умные обёртки над сложным git синтаксисом для тех кто не хочет помнить все флаги
// Каждая функция = логическая операция с понятным названием и ПИЗДАТЫМ описанием




import { execSync } from 'child_process';
import path from 'path';
import { getWorkspaceRoot, findGitRoot } from '../utils/workspaceUtils.js';
import { logInfo, logSuccess } from '../utils/logger.js';

/**
 * 🎯 ПОЛУЧИТЬ GIT STATUS ДЛЯ ДЕКОРАТОРОВ
 * Отдельная функция которая используется и в git_status инструменте и в module decorator
 */
async function getGitStatus(detailed = false) {
  try {
    const command = detailed ? 'git status' : 'git status --porcelain';
    const result = execSync(command, {
      encoding: 'utf8',
      cwd: getWorkspaceRoot()
    });

    const statusText = result || "Working directory clean ✨";
    return {
      success: true,
      status: statusText,
      clean: !result || result.trim() === ''
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// 🔄 ВОССТАНОВЛЕНИЕ ФАЙЛОВ
const restore_file = {
  name: "restore_file",
  description: "🔄 СПАСАТЕЛЬ ФАЙЛОВ! Твой git-реаниматор восстанавливает потерянное! 🔄\n\n" +
    "🗣️ ГОВОРИТ ТЕБЕ: 'Накосячил с файлом? Я верну его из последнего коммита!'\n" +
    "📊 ДАЕТ ДАННЫЕ: Показывает какой файл восстановлен и откуда\n" +
    "💡 НАПРАВЛЯЕТ: ВНИМАНИЕ! Все несохраненные изменения ПРОПАДУТ навсегда!\n" +
    "🐕 ТВОЙ GIT РЕАНИМАТОР: Использует git checkout HEAD для воскрешения файлов",
  inputSchema: {
    type: "object",
    properties: {
      filepath: {
        type: "string",
        description: "Путь к файлу который нужно восстановить (относительно корня репозитория)"
      }
    },
    required: ["filepath"]
  },
  handler: async (args) => {
    const { filepath } = args;

    try {
      const result = execSync(`git checkout HEAD -- "${filepath}"`, {
        encoding: 'utf8',
        cwd: getWorkspaceRoot()
      });

      return `🔄 **FILE RESTORED FROM GIT** 🔄\n\n` +
        `📁 **File:** ${filepath}\n` +
        `✅ **Status:** Successfully restored from last commit\n` +
        `⚠️ **Warning:** All unsaved changes in this file are lost!\n\n` +
        `💻 **Powered by Git Tools!**`;
    } catch (error) {
      throw new Error(`❌ **GIT RESTORE ERROR** ❌\n\n` +
        `📁 **File:** ${filepath}\n` +
        `💥 **Error:** ${error.message}`);
    }
  }
};

// 📊 СТАТУС РЕПОЗИТОРИЯ  
const status = {
  name: "status",
  description: "📊 ДИАГНОСТ РЕПОЗИТОРИЯ! Твой git-доктор проверяет состояние проекта! 📊\n\n" +
    "🗣️ ГОВОРИТ ТЕБЕ: 'Покажи мне репозиторий - я расскажу что изменено!'\n" +
    "📊 ДАЕТ ДАННЫЕ: Полный статус - измененные, добавленные, неотслеживаемые файлы\n" +
    "💡 НАПРАВЛЯЕТ: Используй detailed=true для подробного анализа состояния\n" +
    "🐕 ТВОЙ GIT ДИАГНОСТ: Читает git status в машинном и человеческом формате",
  inputSchema: {
    type: "object",
    properties: {
      detailed: {
        type: "boolean",
        description: "Показать подробный вывод (по умолчанию краткий)",
        default: false
      }
    }
  },
  handler: async (args) => {
    const { detailed = false } = args;

    const statusResult = await getGitStatus(detailed);

    if (!statusResult.success) {
      throw new Error(`❌ **GIT STATUS ERROR** ❌\n\n` +
        `💥 **Error:** ${statusResult.error}`);
    }

    return `📊 **GIT STATUS** 📊\n\n` +
      `📋 **Mode:** ${detailed ? 'Detailed' : 'Short'}\n\n` +
      `📝 **Status:**\n\`\`\`\n${statusResult.status}\n\`\`\`\n\n` +
      `💻 **Powered by Git Tools!**`;
  }
};

// 💾 БЕЗОПАСНЫЙ КОММИТ
const safe_commit = {
  name: "safe_commit", 
  description: "💾 УМНЫЙ АРХИВАРИУС! Твой дрессированный git-хранитель анализирует и советует! 💾\n\n" +
    "🗣️ ГОВОРИТ ТЕБЕ: 'Дай сообщение - проанализирую изменения и умно сохраню!'\n" +
    "📊 ДАЕТ ДАННЫЕ: Анализ изменений, умные советы, статистика коммита\n" +
    "💡 НАПРАВЛЯЕТ: 🚀 АВТОСОЗДАЕТ Git репозиторий если его нет! Предлагает разбить большие коммиты\n" +
    "🐕 ТВОЙ ДРЕССИРОВАННЫЙ АРХИВАРИУС: Думает перед коммитом, создает .gitignore и дает советы!",
  inputSchema: {
    type: "object",
    properties: {
      message: {
        type: "string",
        description: "Сообщение коммита (обязательно!)"
      },
      add_all: {
        type: "boolean",
        description: "Добавить все файлы (git add .) или только отслеживаемые (git add -u)",
        default: true
      }
    },
    required: ["message"]
  },
  handler: async (args) => {
    const { message, add_all = true } = args;

    try {
      // 🧠 УМНЫЙ ПОИСК GIT РЕПОЗИТОРИЯ
      const gitRoot = await findGitRoot();
      
      // 🚀 АВТОСОЗДАНИЕ GIT РЕПОЗИТОРИЯ ЕСЛИ НЕ СУЩЕСТВУЕТ
      try {
        // Проверяем действительно ли это git репозиторий
        execSync('git status', { 
          cwd: gitRoot, 
          stdio: 'ignore' 
        });
      } catch (gitError) {
        // Git репозитория нет - создаём автоматически!
        logInfo(`🔥 Git репозиторий не найден - создаю автоматически в ${gitRoot}`);
        
        execSync('git init', { 
          cwd: gitRoot,
          stdio: 'pipe'
        });
        
        // Создаём базовый .gitignore если его нет
        const fs = await import('fs/promises');
        const gitignorePath = path.join(gitRoot, '.gitignore');
        try {
          await fs.access(gitignorePath);
        } catch {
          // .gitignore не существует - создаём базовый
          const basicGitignore = `# Node modules
node_modules/
npm-debug.log*

# Build outputs  
dist/
build/
.next/

# Environment files
.env
.env.local
.env.*.local

# IDE files
.vscode/
.idea/
*.swp
*.swo

# OS files
.DS_Store
Thumbs.db

# Logs
logs/
*.log
`;
          await fs.writeFile(gitignorePath, basicGitignore, 'utf8');
          logInfo(`📝 Создан базовый .gitignore файл`);
        }
        
        logSuccess(`✅ Git репозиторий успешно инициализирован!`);
      }

      // 🔍 УМНЫЙ АНАЛИЗ ПЕРЕД КОММИТОМ
      let analysis = { warnings: [], suggestions: [], stats: {} };

      // Проверяем статус
      try {
        const statusResult = execSync('git status --porcelain', {
          encoding: 'utf8',
          cwd: gitRoot
        });

        if (!statusResult.trim()) {
          return `🐕 **УМНЫЙ АРХИВАРИУС:** НЕТ ИЗМЕНЕНИЙ ДЛЯ КОММИТА! 🐕\n\n` +
            `📝 **Сообщение:** "${message}"\n` +
            `📊 **Статус:** Рабочая директория чистая\n\n` +
            `💡 **СОВЕТ ПИТОМЦА:** Возможно изменения уже закоммичены или нет новых файлов`;
        }

        // Подсчет изменений
        const lines = statusResult.trim().split('\n');
        analysis.stats = {
          total: lines.length,
          modified: lines.filter(l => l.startsWith(' M')).length,
          added: lines.filter(l => l.startsWith('A')).length,
          untracked: lines.filter(l => l.startsWith('??')).length
        };

        // Умные проверки
        if (analysis.stats.total > 15) {
          analysis.warnings.push(`🚨 Много файлов (${analysis.stats.total}) - возможно стоит разбить коммит`);
        }
        if (analysis.stats.untracked > 8) {
          analysis.warnings.push(`📁 Много новых файлов (${analysis.stats.untracked}) - проверь что все нужны`);
        }
        if (message.length < 10) {
          analysis.warnings.push(`📝 Короткое сообщение (${message.length} символов)`);
        }
      } catch (e) { /* ignore */ }

      // Выполняем коммит
      const addCommand = add_all ? 'git add .' : 'git add -u';
      execSync(addCommand, { cwd: gitRoot });

      const result = execSync(`git commit -m "${message}"`, {
        encoding: 'utf8',
        cwd: gitRoot
      });

      // Получаем хеш коммита
      let commitHash = '';
      try {
        commitHash = execSync('git rev-parse --short HEAD', {
          encoding: 'utf8',
          cwd: gitRoot
        }).trim();
      } catch (e) { /* ignore */ }

      return `🐕 **УМНЫЙ АРХИВАРИУС УСПЕШНО СОХРАНИЛ!** 🐕\n\n` +
        `📝 **Сообщение:** "${message}"\n` +
        `🎯 **Коммит:** ${commitHash}\n` +
        `📁 **Режим:** ${add_all ? 'Все изменения (git add .)' : 'Только отслеживаемые (git add -u)'}\n\n` +
        `📊 **СТАТИСТИКА:**\n` +
        `   • Всего файлов: ${analysis.stats.total || 0}\n` +
        `   • Изменено: ${analysis.stats.modified || 0}\n` +
        `   • Добавлено: ${analysis.stats.added || 0}\n` +
        `   • Новых: ${analysis.stats.untracked || 0}\n\n` +
        (analysis.warnings.length > 0 ?
          `⚠️ **ЗАМЕЧАНИЯ ПИТОМЦА:**\n${analysis.warnings.map(w => `   • ${w}`).join('\n')}\n\n` : '') +
        `📋 **РЕЗУЛЬТАТ GIT:**\n\`\`\`\n${result}\n\`\`\`\n\n` +
        `✅ **КОММИТ ВЫПОЛНЕН УСПЕШНО!**`;

    } catch (error) {
      // Умная диагностика ошибок
      let diagnosis = [];
      if (error.message.includes('nothing to commit')) {
        diagnosis.push('Нет изменений для коммита - проверь git status');
      } else if (error.message.includes('not a git repository')) {
        diagnosis.push('Проблема с git репозиторием - автосоздание не сработало');
      }

      throw new Error(`❌ **УМНЫЙ АРХИВАРИУС СТОЛКНУЛСЯ С ПРОБЛЕМОЙ** ❌\n\n` +
        `📝 **Сообщение:** "${message}"\n` +
        `💥 **Ошибка:** ${error.message}\n\n` +
        (diagnosis.length > 0 ?
          `🧠 **ДИАГНОСТИКА ПИТОМЦА:**\n${diagnosis.map(d => `   • ${d}`).join('\n')}` : ''));
    }
  }
};

// 📜 ИСТОРИЯ КОММИТОВ
const log = {
  name: "log",
  description: "📜 ИСТОРИК ПРОЕКТА! Твой git-летописец рассказывает прошлое! 📜\n\n" +
    "🗣️ ГОВОРИТ ТЕБЕ: 'Хочешь узнать историю? Покажу красивый граф коммитов!'\n" +
    "📊 ДАЕТ ДАННЫЕ: Последние коммиты с хешами, сообщениями и графом веток\n" +
    "💡 НАПРАВЛЯЕТ: Используй count для количества, graph=true для визуализации\n" +
    "🐕 ТВОЙ GIT ЛЕТОПИСЕЦ: Показывает --oneline --graph --decorate в красоте",
  inputSchema: {
    type: "object",
    properties: {
      count: {
        type: "number",
        description: "Количество коммитов для показа (по умолчанию 10)",
        default: 10
      },
      graph: {
        type: "boolean",
        description: "Показать граф веток",
        default: true
      }
    }
  },
  handler: async (args) => {
    const { count = 10, graph = true } = args;

    try {
      const graphFlag = graph ? '--graph' : '';
      const result = execSync(`git log --oneline ${graphFlag} --decorate -${count}`, {
        encoding: 'utf8',
        cwd: getWorkspaceRoot()
      });

      return `📜 **GIT HISTORY** 📜\n\n` +
        `📊 **Count:** ${count} commits\n` +
        `🌿 **Graph:** ${graph ? 'Enabled' : 'Disabled'}\n\n` +
        `📋 **Commits:**\n\`\`\`\n${result}\n\`\`\`\n\n` +
        `💻 **Powered by Git Tools!**`;
    } catch (error) {
      throw new Error(`❌ **GIT LOG ERROR** ❌\n\n` +
        `💥 **Error:** ${error.message}`);
    }
  }
};

// 🔍 РАЗЛИЧИЯ
const diff = {
  name: "diff",
  description: "🔍 ДЕТЕКТИВ ИЗМЕНЕНИЙ! Твой git-сыщик находит все различия! 🔍\n\n" +
    "🗣️ ГОВОРИТ ТЕБЕ: 'Покажи файл - я найду каждое изменение и покажу diff!'\n" +
    "📊 ДАЕТ ДАННЫЕ: Подробный diff с добавленными/удаленными строками\n" +
    "💡 НАПРАВЛЯЕТ: staged=true для индекса, false для рабочей директории\n" +
    "🐕 ТВОЙ GIT СЫЩИК: Использует git diff и git diff --cached для анализа",
  inputSchema: {
    type: "object",
    properties: {
      staged: {
        type: "boolean",
        description: "Показать изменения в индексе (git add) вместо рабочей директории",
        default: false
      },
      filepath: {
        type: "string",
        description: "Показать изменения только для конкретного файла"
      }
    }
  },
  handler: async (args) => {
    const { staged = false, filepath } = args;

    try {
      let command = staged ? 'git diff --cached' : 'git diff';
      if (filepath) {
        command += ` "${filepath}"`;
      }

      const result = execSync(command, {
        encoding: 'utf8',
        cwd: getWorkspaceRoot()
      });

      const type = staged ? "staged (after git add)" : "working directory";
      const file = filepath ? ` for ${filepath}` : "";
      const diffText = result || "No changes ✨";

      return {
        success: true,
        message: `🔍 **GIT DIFF** 🔍\n\n` +
          `📊 **Type:** ${type}${file}\n\n` +
          `📋 **Changes:**\n\`\`\`diff\n${diffText}\n\`\`\`\n\n` +
          `💻 **Powered by Git Tools!**`
      };
    } catch (error) {
      throw new Error(`❌ **GIT DIFF ERROR** ❌\n\n` +
        `💥 **Error:** ${error.message}`);
    }
  }
};

// 🌿 ВЕТКИ
const branch = {
  name: "branch",
  description: "🌿 САДОВНИК ВЕТОК! Твой git-ботаник выращивает и подрезает ветки! 🌿\n\n" +
    "🗣️ ГОВОРИТ ТЕБЕ: 'Хочешь новую ветку? Переключиться? Удалить старую? Я всё сделаю!'\n" +
    "📊 ДАЕТ ДАННЫЕ: Список веток, текущая ветка, результаты операций\n" +
    "💡 НАПРАВЛЯЕТ: ВНИМАНИЕ! Переключение может потребовать коммита изменений!\n" +
    "🐕 ТВОЙ GIT БОТАНИК: Использует git branch, checkout, switch для управления",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "create", "switch", "delete"],
        description: "Действие: list=список веток, create=создать, switch=переключиться, delete=удалить"
      },
      branch_name: {
        type: "string",
        description: "Название ветки (для create, switch, delete)"
      },
      force: {
        type: "boolean",
        description: "Принудительное удаление ветки (git branch -D)",
        default: false
      }
    },
    required: ["action"]
  },
  handler: async (args) => {
    const { action, branch_name, force = false } = args;

    try {
      let command;
      let message;

      switch (action) {
        case 'list':
          command = 'git branch -a';
          message = "🌿 All branches:";
          break;
        case 'create':
          if (!branch_name) throw new Error("Branch name required");
          command = `git checkout -b "${branch_name}"`;
          message = `🌿 Created and switched to: ${branch_name}`;
          break;
        case 'switch':
          if (!branch_name) throw new Error("Branch name required");
          command = `git checkout "${branch_name}"`;
          message = `🌿 Switched to: ${branch_name}`;
          break;
        case 'delete':
          if (!branch_name) throw new Error("Branch name required");
          const deleteFlag = force ? '-D' : '-d';
          command = `git branch ${deleteFlag} "${branch_name}"`;
          message = `🌿 Deleted branch: ${branch_name}`;
          break;
        default:
          throw new Error("Unknown action");
      }

      const result = execSync(command, {
        encoding: 'utf8',
        cwd: getWorkspaceRoot()
      });

      return {
        success: true,
        message: `🌿 **GIT BRANCH** 🌿\n\n` +
          `⚡ **Action:** ${action}\n` +
          (branch_name ? `📝 **Branch:** ${branch_name}\n` : '') +
          `\n📋 **Result:**\n\`\`\`\n${result}\n\`\`\`\n\n` +
          `💻 **Powered by Git Tools!**`
      };
    } catch (error) {
      throw new Error(`❌ **GIT BRANCH ERROR** ❌\n\n` +
        `⚡ **Action:** ${action}\n` +
        (branch_name ? `📝 **Branch:** ${branch_name}\n` : '') +
        `💥 **Error:** ${error.message}`);
    }
  }
};

// 📦 ВРЕМЕННОЕ СОХРАНЕНИЕ
const stash = {
  name: "stash",
  description: "📦 ХРАНИТЕЛЬ ЧЕРНОВИКОВ! Твой git-кладовщик прячет незавершенную работу! 📦\n\n" +
    "🗣️ ГОВОРИТ ТЕБЕ: 'Не готов коммитить? Спрячу изменения, потом верну!'\n" +
    "📊 ДАЕТ ДАННЫЕ: Список stash'ей, сообщения, результаты операций\n" +
    "💡 НАПРАВЛЯЕТ: save для сохранения, restore для возврата, list для просмотра\n" +
    "🐕 ТВОЙ GIT КЛАДОВЩИК: Использует git stash для временного хранения",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["save", "restore", "list", "drop"],
        description: "Действие: save=сохранить, restore=восстановить последний, list=список, drop=удалить"
      },
      message: {
        type: "string",
        description: "Сообщение для stash (при save)"
      },
      stash_id: {
        type: "string",
        description: "ID stash'а для restore/drop (например stash@{0})"
      }
    },
    required: ["action"]
  },
  handler: async (args) => {
    const { action, message, stash_id } = args;

    try {
      let command;
      let resultMessage;

      switch (action) {
        case 'save':
          command = message ? `git stash push -m "${message}"` : 'git stash push';
          resultMessage = `📦 Changes saved to stash${message ? `: ${message}` : ''}`;
          break;
        case 'restore':
          command = stash_id ? `git stash pop "${stash_id}"` : 'git stash pop';
          resultMessage = `📦 Restored changes from stash${stash_id ? `: ${stash_id}` : ' (latest)'}`;
          break;
        case 'list':
          command = 'git stash list';
          resultMessage = "📦 Stash list:";
          break;
        case 'drop':
          if (!stash_id) throw new Error("Stash ID required for drop");
          command = `git stash drop "${stash_id}"`;
          resultMessage = `📦 Dropped stash: ${stash_id}`;
          break;
        default:
          throw new Error("Unknown action");
      }

      const result = execSync(command, {
        encoding: 'utf8',
        cwd: getWorkspaceRoot()
      });

      return {
        success: true,
        message: `📦 **GIT STASH** 📦\n\n` +
          `⚡ **Action:** ${action}\n` +
          (message ? `📝 **Message:** ${message}\n` : '') +
          (stash_id ? `🆔 **Stash ID:** ${stash_id}\n` : '') +
          `\n📋 **Result:**\n\`\`\`\n${result || 'Operation completed ✨'}\n\`\`\`\n\n` +
          `💻 **Powered by Git Tools!**`
      };
    } catch (error) {
      throw new Error(`❌ **GIT STASH ERROR** ❌\n\n` +
        `⚡ **Action:** ${action}\n` +
        `💥 **Error:** ${error.message}`);
    }
  }
};

// 🔄 СИНХРОНИЗАЦИЯ
const sync = {
  name: "sync",
  description: "🔄 СИНХРОНИЗАТОР РЕПОЗИТОРИЕВ! Твой git-курьер доставляет изменения! 🔄\n\n" +
    "🗣️ ГОВОРИТ ТЕБЕ: 'Нужно синхронизироваться? Скачаю или отправлю изменения!'\n" +
    "📊 ДАЕТ ДАННЫЕ: Результаты pull/push/fetch операций с деталями\n" +
    "💡 НАПРАВЛЯЕТ: ВНИМАНИЕ! pull может создать merge конфликты!\n" +
    "🐕 ТВОЙ GIT КУРЬЕР: Использует git pull/push/fetch для синхронизации",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["pull", "push", "fetch"],
        description: "Действие: pull=скачать и слить, push=отправить, fetch=только скачать без слияния"
      },
      remote: {
        type: "string",
        description: "Название удалённого репозитория (по умолчанию origin)",
        default: "origin"
      },
      branch: {
        type: "string",
        description: "Название ветки (по умолчанию текущая)"
      },
      force: {
        type: "boolean",
        description: "Принудительный push (git push --force) - ОПАСНО!",
        default: false
      }
    },
    required: ["action"]
  },
  handler: async (args) => {
    const { action, remote = "origin", branch, force = false } = args;

    try {
      let command;
      let message;

      switch (action) {
        case 'pull':
          command = branch ? `git pull ${remote} ${branch}` : `git pull ${remote}`;
          message = `🔄 Pulling changes from ${remote}${branch ? `/${branch}` : ''}`;
          break;
        case 'push':
          const forceFlag = force ? '--force' : '';
          command = branch ? `git push ${forceFlag} ${remote} ${branch}` : `git push ${forceFlag} ${remote}`;
          message = `🔄 Pushing changes to ${remote}${branch ? `/${branch}` : ''}${force ? ' (FORCE!)' : ''}`;
          break;
        case 'fetch':
          command = `git fetch ${remote}`;
          message = `🔄 Fetching info from ${remote} (no merge)`;
          break;
        default:
          throw new Error("Unknown action");
      }

      const result = execSync(command, {
        encoding: 'utf8',
        cwd: getWorkspaceRoot()
      });

      return {
        success: true,
        message: `🔄 **GIT SYNC** 🔄\n\n` +
          `⚡ **Action:** ${action}\n` +
          `🌐 **Remote:** ${remote}\n` +
          (branch ? `🌿 **Branch:** ${branch}\n` : '') +
          (force ? `⚠️ **Force:** YES (DANGEROUS!)\n` : '') +
          `\n📋 **Result:**\n\`\`\`\n${result}\n\`\`\`\n\n` +
          `💻 **Powered by Git Tools!**`
      };
    } catch (error) {
      throw new Error(`❌ **GIT SYNC ERROR** ❌\n\n` +
        `⚡ **Action:** ${action}\n` +
        `🌐 **Remote:** ${remote}\n` +
        `💥 **Error:** ${error.message}`);
    }
  }
};

// 🚨 EMERGENCY HARD RESET - когда всё запорил и нужно быстро откатиться!
const hard_reset = {
  name: "hard_reset",
  description: '🚨 EMERGENCY: Hard reset к последнему коммиту. ПЕРВЫЙ ВЫЗОВ - показывает что будет потеряно. ВТОРОЙ ВЫЗОВ с confirm: true - реально делает reset',
  inputSchema: {
    type: 'object',
    properties: {
      confirm: {
        type: 'boolean',
        description: 'Подтверждение что понимаешь риски (потеря всех изменений). БЕЗ этого флага - только показывает что будет потеряно',
        default: false
      }
    }
  },
  handler: async (args) => {
    try {
      // Проверяем что будет потеряно
      const statusResult = execSync('git status --porcelain', {
        encoding: 'utf8',
        cwd: getWorkspaceRoot()
      });

      const hasChanges = statusResult.trim();

      // ПЕРВЫЙ ЭТАП: Показываем что будет потеряно
      if (!args.confirm) {
        if (!hasChanges) {
          return `✅ **БЕЗОПАСНО ДЛЯ RESET** ✅

🔍 **Проверка изменений:** Нет несохранённых изменений
🎯 **Можно делать reset без потерь!**

🚨 **Для выполнения reset:** Вызови снова с \`confirm: true\`
🛠️ **Powered by Emergency Git Tools!**`;
        }

        return `⚠️ **ВНИМАНИЕ! БУДУТ ПОТЕРЯНЫ ИЗМЕНЕНИЯ** ⚠️

📋 **Несохранённые изменения:**
\`\`\`
${hasChanges}
\`\`\`

💀 **ЭТИ ФАЙЛЫ БУДУТ ПОТЕРЯНЫ НАВСЕГДА!**

🤖 **Клод, посмотри на файлы выше:**
        - 🔍 Если видишь что-то **СОМНИТЕЛЬНОЕ** (README, конфиги, важные файлы) → **НЕ ДЕЛАЙ** \`confirm: true\` → **СПРОСИ ПОЛЬЗОВАТЕЛЯ!**
- 😎 Если видишь что **ПОХУЙ** (временные файлы, тестовый код) → делай \`confirm: true\`

🚨 **Для выполнения reset:** Вызови снова с \`confirm: true\`

🛠️ **Powered by Emergency Git Tools!**`;
      }

      // ВТОРОЙ ЭТАП: Реально делаем reset
      const result = execSync('git reset --hard HEAD', {
        encoding: 'utf8',
        cwd: getWorkspaceRoot()
      });

      return `🚨 **EMERGENCY HARD RESET ВЫПОЛНЕН** 🚨

✅ **Результат:** ${result.trim() || 'Reset completed'}

${hasChanges ? '💀 **ИЗМЕНЕНИЯ ПОТЕРЯНЫ НАВСЕГДА!**' : '✨ **Никаких изменений не было потеряно**'}

🔄 **Текущее состояние:** Откачен к последнему коммиту
🛠️ **Powered by Emergency Git Tools!**`;

    } catch (error) {
      throw new Error(`❌ Hard reset failed: ${error.message}`);
    }
  }
};

// 🔥 МАССИВ ВСЕХ GIT ИНСТРУМЕНТОВ
const gitTools = [
  restore_file,
  status,
  safe_commit,
  log,
  diff,
  branch,
  stash,
  sync,
  hard_reset  // 🚨 EMERGENCY TOOL!
];

/**
 * 📊 GIT STATUS MODULE DECORATOR (НОВАЯ АРХИТЕКТУРА)
 * Показывает статус репозитория после каждой git операции
 */
const gitStatusDecorator = async (callOriginalFunc, args) => {
  // 🚀 Сначала выполняем оригинальную функцию
  const response = await callOriginalFunc();

  const statusResult = await getGitStatus(false); // Краткий формат для декоратора

  if (!statusResult.success) {
    // Если git status не работает - не ломаем весь ответ
    return {
      ...response,
      content: [
        ...response.content,
        {
          type: "text",
          text: `⚠️ **Git Status Unavailable** ⚠️\n\n` +
            `💥 **Error:** ${statusResult.error}`
        }
      ]
    };
  }

  // Добавляем git status как дополнительный контент
  return {
    ...response,
    content: [
      ...response.content,
      {
        type: "text",
        text: `📊 **Git Repository Status** 📊\n\n` +
          (statusResult.clean
            ? `✨ **Working directory clean** ✨`
            : `📝 **Changes detected:**\n\`\`\`\n${statusResult.status}\n\`\`\``
          )
      }
    ]
  };
};

// 🚀 ЭКСПОРТ МОДУЛЯ В ПРАВИЛЬНОМ ФОРМАТЕ
export const gitModule = {
  namespace: "git",
  description: "🔥 Git инструменты - умные обёртки над сложным git синтаксисом",
  tools: gitTools,
  decorators: [gitStatusDecorator] // 🎯 MODULE DECORATOR - показывает git status после каждой операции!
};

/**
 * 🔥 GIT MCP VIRTUAL SERVER - МОДУЛЬ ЗАВЕРШЁН!
 * 
 * ✅ 8 умных git инструментов с ПИЗДАТЫМИ описаниями
 * ✅ Правильный формат экспорта для динамической загрузки
 * ✅ Все сложности git синтаксиса спрятаны за логическими операциями
 * ✅ Готов к использованию!
 * 
 * 🎯 БОЛЬШЕ НИКАКОЙ ПУТАНИЦЫ С GIT КОМАНДАМИ!
 */ 