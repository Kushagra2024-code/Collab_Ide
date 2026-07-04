import { spawnSync, spawn } from 'child_process';
import { logger } from './lib/logger';

/**
 * Minimal Docker sandbox manager.
 * - ensureContainer(projectId): creates a named container if not exists
 * - getContainerName(projectId): returns the standardized name
 *
 * This is intentionally simple: it runs `docker` CLI and requires the host
 * to have Docker installed and the current user permitted to run docker.
 */

export function getContainerName(projectId: string | number) {
  return `collab_project_${String(projectId)}`;
}

export function containerExists(name: string): boolean {
  try {
    const r = spawnSync('docker', ['ps', '-a', '-q', '-f', `name=^/${name}$`], { encoding: 'utf8' });
    return !!r.stdout?.trim();
  } catch (e) {
    return false;
  }
}

export function ensureContainer(projectId: string | number): string | null {
  const name = getContainerName(projectId);
  try {
    if (containerExists(name)) return name;

    // Run lightweight ubuntu container that sleeps; limit resources modestly
    const image = process.env.SANDBOX_IMAGE ?? 'ubuntu:22.04';
    const memory = process.env.SANDBOX_MEMORY ?? '256m';
    const cpus = process.env.SANDBOX_CPUS ?? '0.5';
    const pidsLimit = process.env.SANDBOX_PIDS_LIMIT ?? '128';
    const readOnly = process.env.SANDBOX_READ_ONLY !== 'false';
    const network = process.env.SANDBOX_NETWORK ?? 'none';
    logger.info({ projectId, name }, 'Starting sandbox container');
    const args = [
      'run', '-d', '--name', name,
      '--rm',
      '--memory', memory,
      '--cpus', cpus,
      '--pids-limit', pidsLimit,
      '--security-opt', 'no-new-privileges',
      '--cap-drop', 'ALL',
      '--network', network,
      '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m',
    ];

    if (readOnly) args.push('--read-only');

    args.push(image, 'sleep', 'infinity');

    const r = spawnSync('docker', args, { encoding: 'utf8', stdio: 'pipe' });

    if (r.status !== 0) {
      logger.warn({ stdout: r.stdout, stderr: r.stderr }, 'Failed to start sandbox container');
      return null;
    }
    logger.info({ containerId: r.stdout?.trim() }, 'Sandbox created');
    return name;
  } catch (e) {
    logger.warn({ err: e }, 'Docker sandbox ensure failed');
    return null;
  }
}

export function execInContainer(containerName: string, command: string[], options?: { cwd?: string }) {
  // returns a child process for docker exec -i <container> <command...>
  const args = ['exec', '-i', '--user', process.env.SANDBOX_EXEC_USER ?? 'nobody', containerName, ...command];
  logger.info({ args }, 'Spawning docker exec');
  const proc = spawn('docker', args, { stdio: 'pipe', cwd: options?.cwd });
  return proc;
}
