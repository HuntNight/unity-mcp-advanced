/**
 * 🎨 СИСТЕМА ДЕКОРАТОРОВ - КОМПОЗИЦИОННАЯ АРХИТЕКТУРА
 * 
 * Декораторы позволяют автоматически добавлять дополнительную информацию
 * к ответам всех инструментов без изменения их кода
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { logError, logSuccess, logInfo, getFilteredLogs, clearBufferedLogs, LOG_LEVELS, DEFAULT_LOG_LEVEL } from './logger.js';
import { addContentToResult } from './responseHelpers.js';

// 🔧 Простая функция для извлечения деталей ошибки
function extractErrorDetails(error) {
  return error?.message || error?.toString() || 'Unknown error';
}

const execAsync = promisify(exec);

// 🎨 СИСТЕМА ДЕКОРАТОРОВ - КРАСИВАЯ КОМПОЗИЦИЯ!
let decorators = [];



/**
 * 🎨 НОВАЯ ГИБКАЯ СИСТЕМА ДЕКОРАТОРОВ С ФУНКЦИЯМИ-ТРИГГЕРАМИ!
 * 
 * Декораторы теперь получают ФУНКЦИЮ первым аргументом, что позволяет:
 * - 📊 Мерить перформанс (до и после вызова)
 * - 🔒 Добавлять авторизацию (проверить перед вызовом)
 * - 🛡️ Обрабатывать ошибки (try/catch вокруг вызова)
 * - 📝 Логировать (до, во время, после)
 * - 🔄 Ретраи (повторить при ошибке)
 * 
 * Порядок применения (обёртки):
 * 1. System decorators (глобальные) - внешний слой
 * 2. Module decorators (для всего модуля) - средний слой
 * 3. Tool decorators (специфичные для инструмента) - внутренний слой
 * 4. Original handler - ядро
 */
export async function applyDecorators(originalFunc, args, toolDecorators = [], moduleDecorators = []) {
  // 🐛 DEBUG: Логируем что получили
  logInfo(`🎨 APPLY DECORATORS START: Tool=${toolDecorators.length}, Module=${moduleDecorators.length}, System=${decorators.length}`);

  // 🔥 СОЗДАЁМ ЦЕПОЧКУ ОБЁРТОК (от внутренней к внешней)
  let wrappedFunc = originalFunc;

  // 🔧 1. TOOL-LEVEL DECORATORS (самый внутренний слой)
  if (toolDecorators.length > 0) {
    logInfo(`🔧 Wrapping with ${toolDecorators.length} tool decorators...`);
    for (const decorator of toolDecorators.reverse()) { // Обратный порядок для правильной вложенности
      const currentFunc = wrappedFunc;
      wrappedFunc = async () => {
        logInfo(`🔧 Executing tool decorator: ${decorator.name || 'anonymous'}`);
        return await decorator(currentFunc, args);
      };
    }
  } else {
    logInfo(`🔧 No tool decorators to apply`);
  }

  // 🎭 2. MODULE-LEVEL DECORATORS (средний слой)
  if (moduleDecorators.length > 0) {
    logInfo(`🎭 Wrapping with ${moduleDecorators.length} module decorators...`);
    for (const decorator of moduleDecorators.reverse()) { // Обратный порядок для правильной вложенности
      const currentFunc = wrappedFunc;
      wrappedFunc = async () => {
        logInfo(`🎭 Executing module decorator: ${decorator.name || 'anonymous'}`);
        return await decorator(currentFunc, args);
      };
    }
  } else {
    logInfo(`🎭 No module decorators to apply`);
  }

  // 🖥️ 3. SYSTEM-LEVEL DECORATORS (самый внешний слой)
  for (const decorator of decorators.slice().reverse()) { // Обратный порядок для правильной вложенности
    const currentFunc = wrappedFunc;
    wrappedFunc = async () => {
      return await decorator(currentFunc, args);
    };
  }

  // 🚀 ВЫПОЛНЯЕМ ФИНАЛЬНУЮ ОБЁРНУТУЮ ФУНКЦИЮ
  return await wrappedFunc();
}

/**
 * 🔧 УПРАВЛЕНИЕ ДЕКОРАТОРАМИ
 */
export function addDecorator(decorator) {
  decorators.push(decorator);
}

export function removeDecorator(decorator) {
  const index = decorators.indexOf(decorator);
  if (index > -1) {
    decorators.splice(index, 1);
  }
}

export function clearDecorators() {
  decorators = [];
}

export function getActiveDecorators() {
  return decorators.map(d => d.name || 'anonymous');
}



/**
 * 🔥 КРУТОЙ ДЕКОРАТОР СИСТЕМНОЙ ИНФОРМАЦИИ С ПОРТАМИ И ПРОЦЕССАМИ!
 * На базе system_info из terminal.js - показывает реально полезную инфу!
 * (НОВАЯ АРХИТЕКТУРА)
 */
const advancedSystemInfoDecorator = async (callOriginalFunc, args) => {
  // 🚀 Сначала выполняем оригинальную функцию
  const result = await callOriginalFunc();
  try {
    // Время в MSK
    const now = new Date();
    const mskTime = new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'Europe/Moscow',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(now);

    // Проверка портов (macOS)
    const checkPort = async (port) => {
      try {
        const { stdout } = await execAsync(`lsof -i :${port}`);
        return stdout.trim() ? '🟢 ACTIVE' : '🔴 CLOSED';
      } catch {
        return '🔴 CLOSED';
      }
    };

    const ports = {
      1337: await checkPort(1337),
      3000: await checkPort(3000),
      3001: await checkPort(3001), // VS Code Bridge
      8080: await checkPort(8080),
      5000: await checkPort(5000)
    };

    // Процессы Node.js (macOS)
    let nodeProcesses = 0;
    try {
      const { stdout } = await execAsync('pgrep -f node');
      nodeProcesses = stdout.split('\n').filter(line => line.trim()).length;
    } catch {
      nodeProcesses = 0;
    }

    // Базовая системная инфа
    const memoryMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const uptimeMin = Math.round(process.uptime() / 60 * 10) / 10;

    const systemInfo = `🔥 **ADVANCED SYSTEM INFO** 🔥

🕐 **Time (MSK):** ${mskTime}

🌐 **Port Status:**
  • 1337: ${ports[1337]}
  • 3000: ${ports[3000]}
  • 3001: ${ports[3001]} 🔥 VS Code Bridge
  • 8080: ${ports[8080]}
  • 5000: ${ports[5000]}

⚡ **Node.js Processes:** ${nodeProcesses}`;

    return addContentToResult(result, {
      type: "text",
      text: systemInfo
    });
  } catch (error) {
    logError(`Advanced system info decorator failed: ${extractErrorDetails(error)}`);
    // Fallback к базовой инфе если что-то сломалось
    const fallbackInfo = `🖥️ **BASIC SYSTEM INFO** 🖥️

⏰ **Time:** ${new Date().toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow' })}
💻 **Platform:** ${process.platform}
🟢 **Node.js:** ${process.version}
💾 **Memory:** ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB

⚠️ **Advanced info failed - using fallback**`;

    return addContentToResult(result, {
      type: "text",
      text: fallbackInfo
    });
  }
};

/**
 * 🐛 DEBUG LOGS DECORATOR - показывает буферизованные логи
 * Берет логи из буфера logger.js и добавляет как отдельный контент
 * 
 * 🎯 ПО УМОЛЧАНИЮ ПОКАЗЫВАЕТ ТОЛЬКО ERROR ЛОГИ чтобы не засирать контекст!
 * Константы лог левелов импортируются из logger.js
 * (НОВАЯ АРХИТЕКТУРА)
 */
const debugLogsDecorator = async (callOriginalFunc, args) => {
  // 🚀 Сначала выполняем оригинальную функцию
  const response = await callOriginalFunc();
  // 🎯 ПОЛУЧАЕМ УЖЕ ОТФИЛЬТРОВАННЫЕ ЛОГИ ИЗ LOGGER.JS!
  // TODO: Когда декораторы научатся добавлять параметры в schema, вернуть args?.debugLogLevel
  const filteredLogs = getFilteredLogs(); // 🔥 ИСПОЛЬЗУЕМ DEFAULT_LOG_LEVEL (ERROR)

  // Очищаем буфер ВСЕГДА после обработки (предотвращаем утечки памяти)
  clearBufferedLogs();

  if (filteredLogs.length === 0) {
    return response; // Нет логов нужного уровня - ничего не добавляем
  }

  // Форматируем логи в красивый текст
  const logsText = filteredLogs.map(log =>
    `${log.level === 'ERROR' ? '🔴' : log.level === 'SUCCESS' ? '🟢' : log.level === 'DEBUG' ? '🟡' : '🔵'} [${log.time}] ${log.level}: ${log.message}`
  ).join('\n');

  // Добавляем логи как отдельный контент
  if (!response.content) {
    response.content = [];
  }

  response.content.push({
    type: "text",
    text: `\n📋 **DEBUG LOGS:**\n\`\`\`\n${logsText}\n\`\`\``
  });

  return response;
};

/**
 * 🚀 ИНИЦИАЛИЗАЦИЯ ДЕКОРАТОРОВ ПО УМОЛЧАНИЮ
 */
export function initializeDefaultDecorators() {
  clearDecorators();
  addDecorator(debugLogsDecorator); // 🔥 DEBUG ЛОГИ ПЕРВЫМИ - чтобы захватить все логи!

  //addDecorator(advancedSystemInfoDecorator); // 🔥 КРУТОЙ СИСТЕМНЫЙ ДЕКОРАТОР!
  logSuccess('🎨 Default decorators initialized: debugLogs + screenshot + advancedSystemInfo');
}

/**
 * 🎯 ХЕЛПЕРЫ ДЛЯ СОЗДАНИЯ КАСТОМНЫХ ДЕКОРАТОРОВ
 */

export function createBrowserDecorator(getBrowserState) {
  return async (callOriginalFunc, args) => {
    // 🚀 Сначала выполняем оригинальную функцию
    const result = await callOriginalFunc();

    try {
      if (args?.includeBrowserState) {
        const browserState = await getBrowserState();
        return addContentToResult(result, {
          type: "text",
          text: `🌐 **Browser State:**\n${JSON.stringify(browserState, null, 2)}`
        });
      }
      return result;
    } catch (error) {
      logError(`Browser decorator failed: ${extractErrorDetails(error)}`);
      return result;
    }
  };
}

export function createProcessDecorator(getProcessInfo) {
  return async (callOriginalFunc, args) => {
    // 🚀 Сначала выполняем оригинальную функцию
    const result = await callOriginalFunc();

    try {
      if (args?.includeProcessInfo) {
        const processInfo = await getProcessInfo();
        return addContentToResult(result, {
          type: "text",
          text: `⚙️ **Process Info:**\n${JSON.stringify(processInfo, null, 2)}`
        });
      }
      return result;
    } catch (error) {
      logError(`Process decorator failed: ${extractErrorDetails(error)}`);
      return result;
    }
  };
}

export function createMetricsDecorator(getMetrics) {
  return async (callOriginalFunc, args) => {
    // 🚀 Сначала выполняем оригинальную функцию
    const result = await callOriginalFunc();

    try {
      if (args?.includeMetrics) {
        const metrics = await getMetrics();
        return addContentToResult(result, {
          type: "text",
          text: `📊 **Metrics:**\n${JSON.stringify(metrics, null, 2)}`
        });
      }
      return result;
    } catch (error) {
      logError(`Metrics decorator failed: ${extractErrorDetails(error)}`);
      return result;
    }
  };
}

export function createCustomDecorator(fieldName, getValue, addToText = false) {
  return async (callOriginalFunc, args) => {
    // 🚀 Сначала выполняем оригинальную функцию
    const response = await callOriginalFunc();

    try {
      const value = typeof getValue === 'function' ? await getValue() : getValue;
      response[fieldName] = value;

      if (addToText && value && response.content[0]) {
        response.content[0].text += `\n\n🎨 **${fieldName}:** ${JSON.stringify(value)}`;
      }
    } catch (error) {
      logError(`Custom decorator error for ${fieldName}: ${extractErrorDetails(error)}`);
    }
    return response;
  };
}

export function createTextDecorator(title, getData) {
  return async (callOriginalFunc, args) => {
    // 🚀 Сначала выполняем оригинальную функцию
    const result = await callOriginalFunc();

    try {
      const data = typeof getData === 'function' ? await getData(args) : getData;
      if (data) {
        return addContentToResult(result, {
          type: "text",
          text: `${title}\n${typeof data === 'string' ? data : JSON.stringify(data, null, 2)}`
        });
      }
      return result;
    } catch (error) {
      logError(`Text decorator failed: ${extractErrorDetails(error)}`);
      return result;
    }
  };
}

export function createImageDecorator(condition, getImageData, mimeType = "image/png") {
  return async (callOriginalFunc, args) => {
    // 🚀 Сначала выполняем оригинальную функцию
    const result = await callOriginalFunc();

    try {
      if (condition(args)) {
        const imageData = await getImageData(args);
        if (imageData) {
          return addContentToResult(result, {
            type: "image",
            data: imageData,
            mimeType
          });
        }
      }
      return result;
    } catch (error) {
      logError(`Image decorator failed: ${extractErrorDetails(error)}`);
      return result;
    }
  };
} 