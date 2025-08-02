/**
 * 🔍 ВАЛИДАЦИЯ ОТВЕТОВ ИНСТРУМЕНТОВ
 * 
 * Проверяет что инструменты возвращают правильный MCP формат
 * и предупреждает о deprecated форматах
 */

import { logError, logInfo } from './logger.js';

/**
 * 🚨 ВАЛИДАЦИЯ ОТВЕТА ИНСТРУМЕНТА
 */
export function validateToolResponse(result, toolName) {
  // Проверяем deprecated формат {success: true, message: "..."}
  if (result && typeof result === 'object' &&
    result.hasOwnProperty('success') &&
    result.hasOwnProperty('message') &&
    !result.hasOwnProperty('content')) {

    logError(`🚨 DEPRECATED RESPONSE FORMAT in tool "${toolName}"!`);
    logInfo(`📋 Old format: { success: ${result.success}, message: "..." }`);
    logInfo(`✅ New format: Use createResponseContent() helper!`);
    logInfo(`🔧 Example: return createResponseContent("Your message here");`);
    logInfo(`📚 Import: import { createResponseContent } from '../utils/responseHelpers.js';`);

    return false; // Deprecated format detected
  }

  // Проверяем правильный MCP формат
  if (result && typeof result === 'object' &&
    result.hasOwnProperty('content') &&
    Array.isArray(result.content)) {

    // Валидируем каждый элемент content массива
    for (let i = 0; i < result.content.length; i++) {
      const item = result.content[i];

      if (!item || typeof item !== 'object') {
        logError(`🚨 Invalid content item ${i} in tool "${toolName}": not an object`);
        return false;
      }

      if (!item.type) {
        logError(`🚨 Invalid content item ${i} in tool "${toolName}": missing type`);
        return false;
      }

      if (item.type === 'text' && !item.text) {
        logError(`🚨 Invalid text content item ${i} in tool "${toolName}": missing text`);
        return false;
      }

      if (item.type === 'image' && (!item.data || !item.mimeType)) {
        logError(`🚨 Invalid image content item ${i} in tool "${toolName}": missing data or mimeType`);
        return false;
      }
    }

    return true; // Valid MCP format
  }

  // Простые форматы (строка, число) - тоже валидны, будут обёрнуты
  if (typeof result === 'string' || typeof result === 'number' || typeof result === 'boolean') {
    return true;
  }

  // Неизвестный формат
  logError(`🚨 Unknown response format in tool "${toolName}": ${typeof result}`);
  return false;
} 