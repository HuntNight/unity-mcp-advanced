#!/usr/bin/env node

/**
 * 🔥 УНИВЕРСАЛЬНЫЕ УТИЛИТЫ ДЛЯ MCP СЕРВЕРОВ - LEGACY СОВМЕСТИМОСТЬ
 * 
 * ⚠️ DEPRECATED: Этот файл теперь просто реэкспортирует новые модули!
 * 
 * 🎯 НОВАЯ АРХИТЕКТУРА:
 * - mcpServer.js - основной сервер
 * - decorators.js - система декораторов  
 * - responseHelpers.js - хелперы для ответов
 * - validation.js - валидация ответов
 * - logger.js - система логирования
 * 
 * 🚀 ЭТО НАСТОЯЩИЙ DRY - Don't Repeat Yourself!
 */

// 🔄 РЕЭКСПОРТЫ ДЛЯ ОБРАТНОЙ СОВМЕСТИМОСТИ
export { createMcpServer } from './mcpServer.js';
export {
  logInfo,
  logError,
  logSuccess,
  logDebug,
  extractErrorDetails
} from './logger.js';
export {
  addContentToResult,
  createResponseContent,
  createMultiTextResponse,
  createTextWithImageResponse,
  createCustomResponse,
  createSuccessResponse
} from './responseHelpers.js';
export {
  addSystemScreenshotParameter,
  applyDecorators,
  initializeDefaultDecorators,
  addDecorator,
  removeDecorator,
  clearDecorators,
  getActiveDecorators,
  createBrowserDecorator,
  createProcessDecorator,
  createMetricsDecorator,
  createCustomDecorator,
  createTextDecorator,
  createImageDecorator
} from './decorators.js';
export { validateToolResponse } from './validation.js';