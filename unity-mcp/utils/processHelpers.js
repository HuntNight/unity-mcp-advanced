import { exec, spawn } from 'child_process';
import { promisify } from 'util';

export const execAsync = promisify(exec);

export function spawnAsync(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: true,
      env: process.env,
      ...options
    });

    child.once('spawn', () => resolve(child));
    child.once('error', (error) => reject(new Error(`Failed to spawn ${command}: ${error.message}`)));
    child.once('exit', (code) => {
      if (code !== null && code !== 0) {
        reject(new Error(`Process ${command} exited with code ${code}`));
      }
    });
  });
}

export function spawnWithOutput(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: true,
      env: process.env,
      ...options
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.once('error', (error) => reject(new Error(`Failed to spawn ${command}: ${error.message}`)));
    child.once('close', (code) => resolve({
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      code: code || 0
    }));
  });
}

export async function spawnBackground(command, args = [], options = {}, healthCheck = null) {
  const child = await spawnAsync(command, args, {
    detached: false,
    stdio: 'pipe',
    ...options
  });

  child.unref();

  if (typeof healthCheck === 'function') {
    await healthCheck();
  }

  return child;
}

export async function commandExists(command) {
  try {
    const checkCommand = process.platform === 'win32' ? 'where' : 'which';
    const result = await spawnWithOutput(checkCommand, [command]);
    return result.code === 0 && result.stdout.length > 0;
  } catch {
    return false;
  }
}

export async function safeSpawn(command, args = [], options = {}) {
  const exists = await commandExists(command);
  if (!exists) {
    throw new Error(`Command "${command}" not found in PATH`);
  }
  return spawnAsync(command, args, options);
}
