/**
 * 📝 СИСТЕМА ЛОГИРОВАНИЯ - КРАСИВЫЕ ЛОГИ ДЛЯ ОТЛАДКИ
 */

// 🔥 КОНСТАНТЫ ЛОГ ЛЕВЕЛОВ
export const LOG_LEVELS = {
  ERROR: 'ERROR',
  SUCCESS: 'SUCCESS',
  INFO: 'INFO',
  DEBUG: 'DEBUG',
  ALL: 'ALL'
};

// 🎯 ЛОГ ЛЕВЕЛ ПО УМОЛЧАНИЮ ДЛЯ ДЕКОРАТОРОВ - ТОЛЬКО ОШИБКИ!
export const DEFAULT_LOG_LEVEL = LOG_LEVELS.ERROR;

function getCurrentTime() {
  return new Date().toLocaleTimeString('ru-RU', {
    timeZone: 'Europe/Moscow',
    hour12: false
  });
}

// 🔥 БУФЕРИЗОВАННЫЕ ЛОГИ - НЕ НАРУШАЕМ MCP STDIO!
let logBuffer = [];

function addToBuffer(level, message) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    time: getCurrentTime(),
    level,
    message
  };

  logBuffer.push(logEntry);

  // Ограничиваем размер буфера (последние 100 записей)
  if (logBuffer.length > 100) {
    logBuffer = logBuffer.slice(-100);
  }
}

export function logInfo(message) {
  addToBuffer('INFO', message);
  // В development режиме можно писать в console.error для отладки
  if (process.env.NODE_ENV === 'development') {
    console.error(`🔵 [${getCurrentTime()}] ${message}`);
  }
}

export function logDebug(message) {
  if (process.env.DEBUG) {
    addToBuffer('DEBUG', message);
    if (process.env.NODE_ENV === 'development') {
      console.error(`🟡 [${getCurrentTime()}] DEBUG: ${message}`);
    }
  }
}

export function logError(message) {
  addToBuffer('ERROR', message);
  if (process.env.NODE_ENV === 'development') {
    console.error(`🔴 [${getCurrentTime()}] ERROR: ${message}`);
  }
}

export function logSuccess(message) {
  addToBuffer('SUCCESS', message);
  if (process.env.NODE_ENV === 'development') {
    console.error(`🟢 [${getCurrentTime()}] SUCCESS: ${message}`);
  }
}

/**
 * 📋 ПОЛУЧИТЬ ВСЕ ЛОГИ ДЛЯ ДЕКОРАТОРА
 */
export function getBufferedLogs() {
  return [...logBuffer];
}

/**
 * 🎯 ПОЛУЧИТЬ ОТФИЛЬТРОВАННЫЕ ЛОГИ ПО УРОВНЮ
 */
export function getFilteredLogs(logLevel = DEFAULT_LOG_LEVEL) {
  const logs = getBufferedLogs();

  if (logs.length === 0) {
    return [];
  }

  // 🎯 ФИЛЬТРУЕМ ЛОГИ ПО УРОВНЮ - по умолчанию только ERROR!
  const filteredLogs = logs.filter(log => {
    if (logLevel === LOG_LEVELS.ERROR) return log.level === LOG_LEVELS.ERROR;
    if (logLevel === LOG_LEVELS.ALL) return true;
    if (logLevel === LOG_LEVELS.SUCCESS) return [LOG_LEVELS.ERROR, LOG_LEVELS.SUCCESS].includes(log.level);
    if (logLevel === LOG_LEVELS.INFO) return [LOG_LEVELS.ERROR, LOG_LEVELS.SUCCESS, LOG_LEVELS.INFO].includes(log.level);
    if (logLevel === LOG_LEVELS.DEBUG) return true; // DEBUG включает все
    return log.level === logLevel;
  });

  return filteredLogs;
}

/**
 * 🧹 ОЧИСТИТЬ БУФЕР ЛОГОВ
 */
export function clearBufferedLogs() {
  logBuffer.length = 0;
}

/**
 * 🔥 УЛУЧШЕННАЯ ОБРАБОТКА ОШИБОК - ПАРСИМ СТЕКТРЕЙС!
 */
export function extractErrorDetails(error) {
  let details = error.message || 'Unknown error';

  if (error.stack) {
    // Ищем первую строку стека которая указывает на наш код (не node_modules)
    const stackLines = error.stack.split('\n');

    for (let i = 1; i < stackLines.length; i++) {
      const line = stackLines[i].trim();

      // Пропускаем node_modules и внутренние модули Node.js
      if (line.includes('node_modules') || line.includes('node:') || line.includes('<anonymous>')) {
        continue;
      }

      // Ищем паттерн: at functionName (file:///path/to/file.js:line:column)
      const match = line.match(/at\s+(?:.*?\s+)?\(?(?:file:\/\/\/)?([^:]+):(\d+):(\d+)\)?/);
      if (match) {
        const [, filePath, lineNum, colNum] = match;
        const fileName = filePath.split(/[/\\]/).pop(); // Берём только имя файла
        details += ` | 📁 ${fileName}:${lineNum}:${colNum}`;
        break;
      }

      // Альтернативный паттерн для абсолютных Unix путей
      const unixMatch = line.match(/at\s+(?:.*?\s+)?\(?(\/[^:]+):(\d+):(\d+)\)?/);
      if (unixMatch) {
        const [, filePath, lineNum, colNum] = unixMatch;
        const fileName = filePath.split('/').pop();
        details += ` | 📁 ${fileName}:${lineNum}:${colNum}`;
        break;
      }
    }
  }

  return details;
} 