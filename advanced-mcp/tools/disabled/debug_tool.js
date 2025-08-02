

export const debugModule = {
  name: "debug_tool",
  description: "Простой инструмент для отладки загрузчика.",
  tools: [
    {
      name: "ping",
      description: "Проверяет, загружен ли модуль.",
      inputSchema: {
        type: "object",
        properties: {},
      },
      handler: async () => {
        return { message: "pong" };
      },
    },
  ],
}; 