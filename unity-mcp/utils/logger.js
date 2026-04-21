export const LOG_LEVELS = {
  ERROR: 'ERROR',
  SUCCESS: 'SUCCESS',
  INFO: 'INFO',
  DEBUG: 'DEBUG',
  ALL: 'ALL'
};

export const DEFAULT_LOG_LEVEL = LOG_LEVELS.ERROR;

let logBuffer = [];

function getCurrentTime() {
  return new Date().toISOString();
}

function addToBuffer(level, message) {
  logBuffer.push({
    timestamp: getCurrentTime(),
    level,
    message: String(message)
  });

  if (logBuffer.length > 100) {
    logBuffer = logBuffer.slice(-100);
  }
}

function writeStderr(prefix, message) {
  if (process.env.NODE_ENV === 'development') {
    console.error(`${prefix} ${message}`);
  }
}

export function logInfo(message) {
  addToBuffer(LOG_LEVELS.INFO, message);
  writeStderr('[INFO]', message);
}

export function logDebug(message) {
  if (!process.env.DEBUG) {
    return;
  }
  addToBuffer(LOG_LEVELS.DEBUG, message);
  writeStderr('[DEBUG]', message);
}

export function logError(message) {
  addToBuffer(LOG_LEVELS.ERROR, message);
  writeStderr('[ERROR]', message);
}

export function logSuccess(message) {
  addToBuffer(LOG_LEVELS.SUCCESS, message);
  writeStderr('[SUCCESS]', message);
}

export function getBufferedLogs() {
  return [...logBuffer];
}

export function getFilteredLogs(logLevel = DEFAULT_LOG_LEVEL) {
  const logs = getBufferedLogs();
  if (logLevel === LOG_LEVELS.ALL) {
    return logs;
  }
  if (logLevel === LOG_LEVELS.DEBUG) {
    return logs;
  }
  if (logLevel === LOG_LEVELS.INFO) {
    return logs.filter((entry) => [LOG_LEVELS.ERROR, LOG_LEVELS.SUCCESS, LOG_LEVELS.INFO].includes(entry.level));
  }
  if (logLevel === LOG_LEVELS.SUCCESS) {
    return logs.filter((entry) => [LOG_LEVELS.ERROR, LOG_LEVELS.SUCCESS].includes(entry.level));
  }
  return logs.filter((entry) => entry.level === LOG_LEVELS.ERROR);
}

export function clearBufferedLogs() {
  logBuffer.length = 0;
}

export function extractErrorDetails(error) {
  if (!error) {
    return 'Unknown error';
  }

  let details = error.message || String(error);
  if (!error.stack) {
    return details;
  }

  const lines = error.stack.split('\n').map((line) => line.trim());
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.includes('node_modules') || line.includes('node:') || line.includes('<anonymous>')) {
      continue;
    }

    const match = line.match(/at\s+(?:.*?\s+)?\(?(?:file:\/\/\/)?([^:]+):(\d+):(\d+)\)?/);
    if (!match) {
      continue;
    }

    const [, filePath, lineNumber, columnNumber] = match;
    const fileName = filePath.split(/[/\\]/).pop();
    details += ` | ${fileName}:${lineNumber}:${columnNumber}`;
    break;
  }

  return details;
}
