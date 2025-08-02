/**
 * 🎯 ХЕЛПЕРЫ ДЛЯ СОЗДАНИЯ ПРАВИЛЬНЫХ MCP ОТВЕТОВ
 * 
 * Эти функции помогают создавать ответы в правильном MCP формате
 * с content массивом вместо кастомных объектов
 */

/**
 * 🔧 УНИВЕРСАЛЬНАЯ ФУНКЦИЯ ДЛЯ ДОБАВЛЕНИЯ КОНТЕНТА К РЕЗУЛЬТАТУ
 */
export function addContentToResult(result, newContentItem) {
  // Если result уже имеет content массив, добавляем к нему
  if (result && result.content && Array.isArray(result.content)) {
    return {
      ...result,
      content: [...result.content, newContentItem]
    };
  }

  // Если result это строка, создаем новый content массив
  if (typeof result === 'string') {
    return {
      content: [
        { type: "text", text: result },
        newContentItem
      ]
    };
  }

  // Если result это объект без content, создаем content массив
  if (result && typeof result === 'object') {
    return {
      content: [
        { type: "text", text: JSON.stringify(result, null, 2) },
        newContentItem
      ]
    };
  }

  // Fallback: создаем новый content массив
  return {
    content: [newContentItem]
  };
}

/**
 * ✅ СОЗДАТЬ ПРОСТОЙ ТЕКСТОВЫЙ ОТВЕТ
 */
export function createResponseContent(text) {
  return {
    content: [
      {
        type: "text",
        text: text
      }
    ]
  };
}

/**
 * 📝 СОЗДАТЬ ОТВЕТ С НЕСКОЛЬКИМИ ТЕКСТОВЫМИ БЛОКАМИ
 */
export function createMultiTextResponse(textBlocks) {
  return {
    content: textBlocks.map(text => ({
      type: "text",
      text: text
    }))
  };
}

/**
 * 🖼️ СОЗДАТЬ ОТВЕТ С ТЕКСТОМ И ИЗОБРАЖЕНИЕМ
 */
export function createTextWithImageResponse(text, imageData, mimeType = "image/png") {
  return {
    content: [
      {
        type: "text",
        text: text
      },
      {
        type: "image",
        data: imageData,
        mimeType: mimeType
      }
    ]
  };
}

/**
 * 🎨 СОЗДАТЬ КАСТОМНЫЙ ОТВЕТ С ПРОИЗВОЛЬНЫМИ ЭЛЕМЕНТАМИ
 */
export function createCustomResponse(contentItems) {
  return {
    content: Array.isArray(contentItems) ? contentItems : [contentItems]
  };
}

/**
 * 🎯 СОЗДАТЬ ОТВЕТ ОБ УСПЕХЕ (LEGACY СОВМЕСТИМОСТЬ)
 */
export function createSuccessResponse(message) {
  return {
    content: [
      {
        type: "text",
        text: message
      }
    ]
  };
} 