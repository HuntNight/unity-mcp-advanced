import { execAsync, spawnBackground } from '../utils/processHelpers.js';

function formatText(text) {
  return {
    content: [
      {
        type: 'text',
        text
      }
    ]
  };
}

function quoteForCmd(value) {
  return String(value).replace(/"/g, '\\"');
}

async function checkPortStatus(port) {
  const command = process.platform === 'win32'
    ? `netstat -ano | findstr :${port}`
    : `lsof -i :${port}`;

  try {
    const { stdout } = await execAsync(command);
    return stdout.trim() ? stdout.trim() : '';
  } catch {
    return '';
  }
}

async function listProcessesByName(name) {
  const command = process.platform === 'win32'
    ? `tasklist | findstr /I "${quoteForCmd(name)}"`
    : `ps aux | grep -i "${quoteForCmd(name)}" | grep -v grep`;

  try {
    const { stdout } = await execAsync(command);
    return stdout.trim();
  } catch {
    return '';
  }
}

const terminalTools = [
  {
    name: 'system_info',
    description: 'Returns basic host diagnostics, including time, platform, and a small port summary.',
    inputSchema: {
      type: 'object',
      properties: {
        include_processes: {
          type: 'boolean',
          default: false,
          description: 'Include a small process sample.'
        },
        max_processes: {
          type: 'number',
          default: 10,
          description: 'Maximum number of process rows to return.'
        }
      }
    },
    handler: async (args = {}) => {
      const { include_processes = false, max_processes = 10 } = args;
      const portsToCheck = [7777, 3000, 3001, 8080];
      const lines = [
        `time: ${new Date().toISOString()}`,
        `platform: ${process.platform}`,
        `node: ${process.version}`,
        ''
      ];

      for (const port of portsToCheck) {
        const output = await checkPortStatus(port);
        lines.push(`port ${port}: ${output ? 'open' : 'closed'}`);
      }

      if (include_processes) {
        const processOutput = await listProcessesByName(process.platform === 'win32' ? 'node' : 'node');
        const rows = processOutput
          ? processOutput.split('\n').filter(Boolean).slice(0, Math.max(1, max_processes))
          : [];
        lines.push('');
        lines.push('processes:');
        if (rows.length === 0) {
          lines.push('(none)');
        } else {
          lines.push(...rows);
        }
      }

      return formatText(lines.join('\n'));
    }
  },
  {
    name: 'check_port',
    description: 'Checks whether a TCP or UDP port appears to be in use.',
    inputSchema: {
      type: 'object',
      properties: {
        port: { type: 'number', description: 'Port number.' },
        protocol: { type: 'string', enum: ['tcp', 'udp'], default: 'tcp', description: 'Protocol label.' }
      },
      required: ['port']
    },
    handler: async ({ port, protocol = 'tcp' }) => {
      const output = await checkPortStatus(port);
      return formatText(
        `port: ${port}\nprotocol: ${protocol}\nstatus: ${output ? 'open' : 'closed'}${output ? `\n\n${output}` : ''}`
      );
    }
  },
  {
    name: 'find_process',
    description: 'Searches running processes by name.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Process name or fragment.' }
      },
      required: ['name']
    },
    handler: async ({ name }) => {
      const output = await listProcessesByName(name);
      return formatText(output || `No processes matched "${name}".`);
    }
  },
  {
    name: 'safe_curl',
    description: 'Runs a simple HTTP request through curl and returns the raw response.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Request URL.' },
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'], default: 'GET', description: 'HTTP method.' },
        data: { type: 'string', description: 'Optional request body.' }
      },
      required: ['url']
    },
    handler: async ({ url, method = 'GET', data }) => {
      let command = `curl -s "${quoteForCmd(url)}"`;
      if (method !== 'GET') {
        command += ` -X ${method}`;
      }
      if (data) {
        command += ` -d "${quoteForCmd(data)}"`;
      }

      const { stdout, stderr } = await execAsync(command);
      const result = [
        `method: ${method}`,
        `url: ${url}`,
        '',
        stdout || '(empty response)'
      ];
      if (stderr) {
        result.push('');
        result.push('stderr:');
        result.push(stderr);
      }
      return formatText(result.join('\n'));
    }
  },
  {
    name: 'wait_for_user',
    description: 'Opens a simple prompt window and asks the user to continue or answer in chat.',
    inputSchema: {
      type: 'object',
      properties: {
        request: { type: 'string', description: 'Prompt text.' },
        details: { type: 'string', description: 'Optional additional context.' },
        expect_answer: { type: 'boolean', default: false, description: 'If true, ask the user to reply in chat.' },
        answer_placeholder: { type: 'string', default: 'Enter your answer...', description: 'Default input text for macOS dialog mode.' }
      },
      required: ['request']
    },
    handler: async (args = {}) => {
      const {
        request,
        details = '',
        expect_answer = false,
        answer_placeholder = 'Enter your answer...'
      } = args;

      const fullRequest = details ? `${request}\n\n${details}` : request;

      if (process.platform === 'darwin' && expect_answer) {
        const script = `display dialog "${fullRequest.replace(/"/g, '\\"')}" default answer "${answer_placeholder.replace(/"/g, '\\"')}" buttons {"Submit", "Cancel"} default button "Submit"`;
        const { stdout } = await execAsync(`osascript -e '${script}'`);
        const match = stdout.match(/text returned:(.+)/);
        if (!match) {
          throw new Error('User canceled the dialog.');
        }
        return formatText(match[1].trim());
      }

      const command = process.platform === 'win32'
        ? `start cmd /k "echo ${quoteForCmd(fullRequest)} && echo. && echo Close this window when you are done. && pause"`
        : `x-terminal-emulator -e "bash -lc 'printf \"%s\\n\\n%s\\n\" \"${quoteForCmd(request)}\" \"${quoteForCmd(details)}\"; read -p \"Press Enter to continue...\"'"`;

      await spawnBackground(command);
      return formatText(expect_answer ? 'A prompt window was opened. Please reply in chat.' : 'A prompt window was opened for user confirmation.');
    }
  }
];

export const terminalModule = {
  namespace: 'terminal',
  description: 'Terminal and host diagnostics tools.',
  tools: terminalTools
};
