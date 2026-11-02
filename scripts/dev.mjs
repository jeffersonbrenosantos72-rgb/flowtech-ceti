import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const viteCli = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const preferredPort = Number(process.env.PORT ?? 3001);

async function reservePort(port) {
  const listener = createServer();
  await new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(port, '127.0.0.1', resolve);
  });
  const address = listener.address();
  if (!address || typeof address === 'string') throw new Error('Não foi possível reservar uma porta para a API.');
  await new Promise((resolve, reject) => {
    listener.close((error) => error ? reject(error) : resolve());
  });
  return address.port;
}

let apiPort;
try {
  apiPort = await reservePort(preferredPort);
} catch (error) {
  if (error.code !== 'EADDRINUSE') throw error;
  apiPort = await reservePort(0);
  console.warn(`A porta ${preferredPort} já está em uso; a API usará a porta ${apiPort}.`);
}

const children = [
  spawn(process.execPath, ['--watch', 'server/index.mjs'], {
    stdio: 'inherit',
    env: { ...process.env, PORT: String(apiPort) },
  }),
  spawn(process.execPath, [viteCli], {
    stdio: 'inherit',
    env: { ...process.env, FLOWTECH_API_PORT: String(apiPort) },
  }),
];

let stopping = false;
let exitCode = 0;

function stop(code) {
  if (stopping) return;
  stopping = true;
  exitCode = code;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  }
}

for (const child of children) {
  child.on('error', (error) => {
    console.error('Não foi possível iniciar um serviço de desenvolvimento:', error);
    stop(1);
  });
  child.on('exit', (code) => {
    if (!stopping) stop(code ?? 1);
    if (stopping && children.every(({ exitCode: childExitCode, signalCode }) => childExitCode !== null || signalCode !== null)) {
      process.exitCode = exitCode;
    }
  });
}

process.once('SIGINT', () => stop(0));
process.once('SIGTERM', () => stop(0));
