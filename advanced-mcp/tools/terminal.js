/**
 * 💻 TERMINAL TOOLS - System MCP Module
 * 
 * Provides essential system commands for diagnostics, monitoring, and interaction.
 * Includes system info monitoring, port checking, process management, and user interaction.
 * 
 * Features:
 * - Automatic system info injection
 * - Screenshot capabilities
 */

import path from 'path';
import fs from 'fs/promises';
// Используем нативный fetch из Node.js 18+
// 🔥 ИСПОЛЬЗУЕМ БЕЗОПАСНЫЕ ОБЁРТКИ ИЗ PROCESS HELPERS!
import { execAsync, spawnAsync, spawnWithOutput, spawnBackground } from '../utils/processHelpers.js';
import { logInfo, logError, extractErrorDetails } from '../utils/logger.js';
import { getWorkspaceRoot, resolveWorkspacePath } from '../utils/workspaceUtils.js';

// 💻 ЭКСПОРТ ВСЕХ TERMINAL КОМАНД
export const terminalTools = [
  {
    name: "system_info",
    description: "Retrieves system diagnostic information including server time, port status, and Node.js process metrics. Provides real-time monitoring of key ports (1337, 3000, 3001, 8080, 5000) to verify service availability. Use `include_processes` to obtain a detailed list of active Node.js processes with PID and memory usage statistics.",
    inputSchema: {
      type: "object",
      properties: {
        include_processes: { type: "boolean", default: false, description: "If set to true, includes a detailed list of running Node.js processes in the output." },
        max_processes: { type: "number", default: 10, description: "Specifies the maximum number of processes to display when `include_processes` is enabled." }
      },
      required: []
    },
    handler: async (args) => {
      const { include_processes = false, max_processes = 10 } = args;

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
          3001: await checkPort(3001), // 🔥 ДОБАВИЛ ПОРТ 3001 ДЛЯ VS CODE МОСТА!
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

        let systemInfo = `📊 **SYSTEM INFO FROM TERMINAL TOOLS** 📊\n\n` +
          `🕐 **Time (MSK):** ${mskTime}\n\n` +
          `🌐 **Port Status:**\n` +
          `  • 1337: ${ports[1337]}\n` +
          `  • 3000: ${ports[3000]}\n` +
          `  • 3001: ${ports[3001]} 🔥 VS Code Bridge\n` +
          `  • 8080: ${ports[8080]}\n` +
          `  • 5000: ${ports[5000]}\n\n` +
          `⚡ **Node.js Processes:** ${nodeProcesses}\n\n`;

        if (include_processes && nodeProcesses > 0) {
          try {
            const { stdout } = await execAsync('ps aux | grep -i node | grep -v grep');
            const processes = stdout.split('\n')
              .filter(line => line.trim())
              .slice(0, max_processes)
              .map(line => {
                const parts = line.trim().split(/\s+/);
                return `  • PID ${parts[1]}: ${Math.round(parseFloat(parts[5]) / 1024)}MB (${parts[3]}% CPU)`;
              });

            systemInfo += `📋 **Node.js Processes:**\n${processes.join('\n')}\n\n`;
          } catch (error) {
            systemInfo += `❌ **Process List Error:** ${error.message}\n\n`;
          }
        }

        systemInfo += `💻 **Powered by Terminal Tools!**`;

        return systemInfo;
      } catch (error) {
        throw new Error(`❌ **SYSTEM INFO ERROR** ❌\n\nError: ${error.message}`);
      }
    }
  },

  {
    name: "check_port",
    description: "Checks the status of a specific network port to determine if it is active or closed. Utilizes system utilities (netstat/lsof) to interpret port activity. Useful for diagnosing connection issues or verifying that a server has started successfully.",
    inputSchema: {
      type: "object",
      properties: {
        port: { type: "number", description: "The port number to inspect." },
        protocol: { type: "string", enum: ["tcp", "udp"], default: "tcp", description: "The network protocol used for the check (TCP or UDP)." }
      },
      required: ["port"]
    },
    handler: async (args) => {
      const { port, protocol = "tcp" } = args;

      try {
        const { stdout } = await execAsync(`lsof -i :${port}`);
        const isActive = stdout.trim() ? true : false;

        return `🔍 **PORT CHECK FROM TERMINAL TOOLS** 🔍\n\n` +
          `🌐 **Port:** ${port}\n` +
          `📡 **Protocol:** ${protocol.toUpperCase()}\n` +
          `📊 **Status:** ${isActive ? '🟢 ACTIVE' : '🔴 CLOSED'}\n\n` +
          (isActive ? `📝 **Details:**\n\`\`\`\n${stdout.trim()}\n\`\`\`` : '💤 Port is not in use') +
          `\n\n💻 **Checked by Terminal Tools!**`;
      } catch (error) {
        throw new Error(`❌ **PORT CHECK ERROR** ❌\n\n` +
          `🌐 **Port:** ${port}\n` +
          `📡 **Protocol:** ${protocol.toUpperCase()}\n` +
          `💥 **Error:** ${error.message}`);
      }
    }
  },

  // 🔥 НОВЫЕ СТАБИЛЬНЫЕ ИНСТРУМЕНТЫ ДЛЯ MACOS!
  {
    name: "find_process",
    description: "Searches for running processes by name on the host system. Returns a list of matching processes including their Process IDs (PID) and memory usage. This tool is essential for identifying active applications or services, such as Node.js instances or browser sessions.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "The name or keyword of the process to search for." }
      },
      required: ["name"]
    },
    handler: async (args) => {
      const { name } = args;

      try {
        const { stdout } = await execAsync(`ps aux | grep -i "${name}" | grep -v grep`);
        const result = stdout.trim();

        if (result) {
          return `🔍 **PROCESS FOUND** 🔍\n\n` +
            `📋 **Search:** ${name}\n\n` +
            `📝 **Results:**\n\`\`\`\n${result}\n\`\`\`\n\n` +
            `💻 **Found by Terminal Tools!**`;
        } else {
          throw new Error(`❌ **PROCESS NOT FOUND** ❌\n\n` +
            `📋 **Search:** ${name}\n` +
            `💤 **Status:** No processes found with this name`);
        }
      } catch (error) {
        throw new Error(`❌ **PROCESS SEARCH ERROR** ❌\n\n` +
          `📋 **Search:** ${name}\n` +
          `💥 **Error:** ${error.message}`);
      }
    }
  },

  {
    name: "safe_curl",
    description: "Executes HTTP requests to a specified URL using safe system calls. Supports standard HTTP methods (GET, POST, PUT, DELETE) to test API endpoints or retrieve web content. Returns the complete server response, including status codes, headers, and body content.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The target URL for the HTTP request." },
        method: { type: "string", enum: ["GET", "POST", "PUT", "DELETE"], default: "GET", description: "The HTTP method to use (GET, POST, PUT, DELETE). Default is GET." },
        data: { type: "string", description: "The payload data (string) to send with POST or PUT requests." }
      },
      required: ["url"]
    },
    handler: async (args) => {
      const { url, method = "GET", data } = args;

      try {
        let cmd = `curl -s "${url}"`;

        if (method !== 'GET') {
          cmd += ` -X ${method}`;
        }

        if (data) {
          cmd += ` -d "${data}"`;
        }

        const { stdout, stderr } = await execAsync(cmd);

        let response = `🌐 **HTTP REQUEST** 🌐\n\n` +
          `📡 **Method:** ${method}\n` +
          `🔗 **URL:** ${url}\n`;

        if (data) {
          response += `📝 **Data:** ${data}\n`;
        }

        response += `\n📋 **Response:**\n\`\`\`\n${stdout}\n\`\`\``;

        if (stderr) {
          response += `\n\n⚠️ **Warnings:**\n\`\`\`\n${stderr}\n\`\`\``;
        }

        response += `\n\n💻 **Powered by Terminal Tools!**`;

        return response;
      } catch (error) {
        throw new Error(`❌ **HTTP REQUEST ERROR** ❌\n\n` +
          `📡 **Method:** ${method}\n` +
          `🔗 **URL:** ${url}\n` +
          `💥 **Error:** ${error.message}`);
      }
    }
  },

  {
    name: "wait_for_user",
    description: "Pauses execution to request input or confirmation from the user. Displays a system dialog or terminal prompt to facilitate human-in-the-loop interaction. Can be used to ask clarifying questions or request manual approval for critical actions.",
    inputSchema: {
      type: "object",
      properties: {
        request: { type: "string", description: "The question or instruction to present to the user." },
        details: { type: "string", description: "Optional additional context or information to display." },
        expect_answer: {
          type: "boolean",
          default: false,
          description: "If true, waits for text input from the user. If false, waits only for a confirmation (OK/Cancel)."
        },
        answer_placeholder: {
          type: "string",
          default: "Enter your answer...",
          description: "Placeholder text for the input field when `expect_answer` is true."
        }
      },
      required: ["request"]
    },
    handler: async (args) => {
      const {
        request,
        details = '',
        expect_answer = false,
        answer_placeholder = "Введите ваш ответ..."
      } = args;
      const os = process.platform;

      const title = expect_answer ? "❓ ВОПРОС ОТ ИИ ❓" : "⏳ ПРОСЬБА К ПОЛЬЗОВАТЕЛЮ ⏳";
      const fullRequest = details
        ? `🎯 ${request}\n\n📝 Детали: ${details}`
        : `🎯 ${request}`;

      try {
        if (os === 'darwin') {
          if (expect_answer) {
            // macOS: диалог с полем ввода для получения ответа
            const script = `display dialog "${fullRequest.replace(/"/g, '\\"')}" with title "${title}" default answer "${answer_placeholder}" buttons {"Отправить", "Отмена"} default button "Отправить"`;
            try {
              const { stdout } = await execAsync(`osascript -e '${script}'`);
              // Извлекаем введенный текст из ответа osascript
              const match = stdout.match(/text returned:(.+)/);
              if (match) {
                const userAnswer = match[1].trim();
                return `💬 **ОТВЕТ ПОЛЬЗОВАТЕЛЯ:**\n\n"${userAnswer}"`;
              } else {
                throw new Error("❌ Не удалось получить ответ пользователя.");
              }
            } catch (error) {
              throw new Error("❌ Пользователь отменил ввод ответа.");
            }
          } else {
            // macOS: простое подтверждение (старая логика)
            const script = `display dialog "${fullRequest.replace(/"/g, '\\"')}" with title "${title}" buttons {"Выполнено", "Отмена"} default button "Выполнено"`;
            try {
              const { stdout } = await execAsync(`osascript -e '${script}'`);
              if (stdout.includes("Выполнено")) {
                return "✅ Пользователь подтвердил выполнение.";
              } else {
                throw new Error("❌ Пользователь отменил операцию.");
              }
            } catch (error) {
              throw new Error("❌ Пользователь отменил операцию.");
            }
          }
        } else {
          // Windows/Linux: используем старый метод с терминалом
          if (expect_answer) {
            // Для других ОС пока оставляем упрощенную версию
            const command = os === 'win32'
              ? `start cmd /k "echo ${title} && echo. && echo ${fullRequest} && echo. && echo 📝 Введите ваш ответ в чат Cursor && echo. && pause"`
              : `x-terminal-emulator -e "bash -c 'echo \\"${title}\\"; echo; echo \\"${fullRequest}\\"; echo; echo \\"📝 Введите ваш ответ в чат Cursor\\"; read -p \\"Нажмите Enter...\\"'"`

            await spawnBackground(command);
            return "❓ Пожалуйста, введите ваш ответ в следующем сообщении в чате.";
          } else {
            const command = os === 'win32'
              ? `start cmd /k "echo ${title} && echo. && echo ${fullRequest} && echo. && echo ✅ Закрой этот терминал когда выполнишь && echo. && echo 🤝 Жду твоего действия... && echo. && pause"`
              : `x-terminal-emulator -e "bash -c 'echo \\"${title}\\"; echo; echo \\"${fullRequest}\\"; echo; read -p \\"Нажмите Enter, когда закончите...\\"'"`

            await spawnBackground(command);
            return "⏳ Ожидание пользователя... Пожалуйста, следуйте инструкциям в новом окне терминала.";
          }
        }
      } catch (error) {
        throw new Error(`❌ **ОШИБКА ИНТЕРАКТИВНОГО ИНТЕРФЕЙСА** ❌\n\n💥 ${error.message}`);
      }
    }
  }
];

export const terminalModule = {
  namespace: "terminal",
  description: "System Tools",
  tools: terminalTools
};

/**
 * 💻 TERMINAL TOOLS - MODULE READY
 * 
 * ✅ All system commands in one place
 * ✅ Port and process checking
 * ✅ Clean export for index.js
 * ✅ Automatic System Info injection
 */



