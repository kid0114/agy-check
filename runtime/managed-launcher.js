'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { resolveAntigravityPath } = require('./paths.js');

const SESSION_ID = /^[a-f0-9]{16}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const CONVERSATION_FLAGS = new Set(['--conversation', '-r', '--resume']);
const MANAGED_FLAGS = new Set([...CONVERSATION_FLAGS, '-c', '--continue']);
const STALE_ENV = [
  'ANTIGRAVITY_LS_ADDRESS',
  'ANTIGRAVITY_CSRF_TOKEN',
  'ANTIGRAVITY_CONVERSATION_ID',
  'ANTIGRAVITY_TRAJECTORY_ID',
  'ANTIGRAVITY_SOURCE_METADATA',
];
const MAX_REQUEST_BYTES = 16 * 1024;
const IS_WINDOWS = process.platform === 'win32';

function buildChildEnv(baseEnv = process.env) {
  const env = { ...baseEnv };
  for (const key of STALE_ENV) delete env[key];
  return env;
}

function extractConversationIdFromArgs(args = []) {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (typeof arg !== 'string') continue;
    const equals = arg.indexOf('=');
    const flag = equals === -1 ? arg : arg.slice(0, equals);
    if (!CONVERSATION_FLAGS.has(flag)) continue;
    const value = equals === -1 ? args[i + 1] : arg.slice(equals + 1);
    if (typeof value === 'string' && UUID.test(value)) return value;
  }
  return null;
}

function replaceManagedArgs(origArgs = [], { conversationId } = {}) {
  if (conversationId == null) return origArgs.slice();
  const args = [];
  for (let i = 0; i < origArgs.length; i++) {
    const arg = origArgs[i];
    const equals = typeof arg === 'string' ? arg.indexOf('=') : -1;
    const flag = equals === -1 ? arg : arg.slice(0, equals);
    if (!MANAGED_FLAGS.has(flag)) {
      args.push(arg);
    } else if (equals === -1 && CONVERSATION_FLAGS.has(flag) && typeof origArgs[i + 1] === 'string' && !origArgs[i + 1].startsWith('-')) {
      i++;
    }
  }
  args.push('--conversation=' + conversationId);
  return args;
}

function getManagedSessionsDir(rootDir = null) {
  // paths.js requires a relative path, including when resolving the root itself.
  return path.join(rootDir || resolveAntigravityPath(''), 'managed-sessions');
}

function checkPrivateDirectory(directory) {
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (!IS_WINDOWS &&
      (stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0))) {
    throw new Error('Unsafe managed session directory: ' + directory);
  }
}

function makePrivateDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  checkPrivateDirectory(directory);
}

function socketPathFor(sessionId, socketDir) {
  if (IS_WINDOWS) return '\\\\.\\pipe\\agy-ms-' + sessionId;
  const limit = process.platform === 'darwin' ? 104 : 108;
  const candidates = socketDir ? [socketDir] : [os.tmpdir(), '/tmp'];
  for (const base of candidates) {
    const directory = path.resolve(base, 'agy-ms-' + process.getuid());
    const candidate = path.join(directory, 's-' + sessionId + '.sock');
    if (Buffer.byteLength(candidate) < limit) {
      makePrivateDirectory(directory);
      return candidate;
    }
  }
  throw new Error('Managed socket path is too long; supply a shorter socketDir');
}

function checkSocketPath(session, checkFile = true) {
  if (IS_WINDOWS) {
    if (session.socketPath !== '\\\\.\\pipe\\agy-ms-' + session.sessionId) {
      throw new Error('Invalid managed named pipe');
    }
    return;
  }
  const directory = path.dirname(session.socketPath);
  if (!path.isAbsolute(session.socketPath) || path.basename(directory) !== 'agy-ms-' + process.getuid() ||
      path.basename(session.socketPath) !== 's-' + session.sessionId + '.sock') {
    throw new Error('Invalid managed socket path');
  }
  checkPrivateDirectory(directory);
  if (checkFile) {
    const stat = fs.lstatSync(session.socketPath);
    if (!stat.isSocket() || stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0) {
      throw new Error('Unsafe managed session socket');
    }
  }
}

function unlinkIfPresent(filename) {
  try {
    fs.unlinkSync(filename);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function writeSession(filename, session) {
  const temporary = filename + '.' + crypto.randomBytes(8).toString('hex') + '.tmp';
  try {
    fs.writeFileSync(temporary, JSON.stringify(session) + '\n', { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, filename);
  } finally {
    unlinkIfPresent(temporary);
  }
}

function readSession(filename, sessionId) {
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || (!IS_WINDOWS && (stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0))) {
    throw new Error('Unsafe managed session metadata');
  }
  const session = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (session.version !== 1 || session.sessionId !== sessionId || !SESSION_ID.test(sessionId) ||
      !Number.isInteger(session.launcherPid) || session.launcherPid <= 0 ||
      typeof session.socketPath !== 'string' || !/^[a-f0-9]{64}$/.test(session.controlToken)) {
    throw new Error('Invalid managed session metadata');
  }
  return session;
}

function publicSession(session) {
  const { controlToken, ...summary } = session;
  if (Array.isArray(summary.args)) summary.args = summary.args.slice();
  return summary;
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== 'ESRCH';
  }
}

function requestSession(session, action, payload, timeoutMs) {
  checkSocketPath(session);
  const request = JSON.stringify({ ...payload, token: session.controlToken, action }) + '\n';
  if (Buffer.byteLength(request) - 1 > MAX_REQUEST_BYTES) {
    return Promise.reject(new Error('Managed control request exceeds 16 KB'));
  }
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(session.socketPath);
    let response = '';
    const timer = setTimeout(() => finish(new Error('Managed control request timed out')), timeoutMs);
    function finish(error, value) {
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error);
      else resolve(value);
    }
    socket.setEncoding('utf8');
    socket.on('error', error => finish(error));
    socket.on('end', () => finish(new Error('Managed control socket closed without a response')));
    socket.on('connect', () => socket.write(request));
    socket.on('data', chunk => {
      response += chunk;
      const newline = response.indexOf('\n');
      if (newline === -1) return;
      try {
        const value = JSON.parse(response.slice(0, newline));
        finish(null, value);
      } catch {
        finish(new Error('Invalid managed control response'));
      }
    });
  });
}

/** Discovery verifies live records by default; { verify: false } skips the 800 ms status ping. */
async function listManagedSessions(options = {}) {
  const directory = getManagedSessionsDir(options.rootDir);
  try {
    checkPrivateDirectory(directory);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const sessions = [];
  for (const name of fs.readdirSync(directory)) {
    if (!/^[a-f0-9]{16}\.json$/.test(name)) continue;
    const filename = path.join(directory, name);
    let session;
    try {
      session = readSession(filename, name.slice(0, -5));
    } catch {
      continue;
    }
    if (!isAlive(session.launcherPid)) {
      // Never unlink a path supplied by stale metadata without checking its boundary.
      if (!IS_WINDOWS) {
        try {
          checkSocketPath(session);
          unlinkIfPresent(session.socketPath);
        } catch (error) {
          if (error.code !== 'ENOENT') {
            // An unsafe socket is not ours to remove; the dead registry record still is.
          }
        }
      }
      unlinkIfPresent(filename);
      continue;
    }
    if (options.verify !== false) {
      try {
        const status = await requestSession(session, 'status', {}, 800);
        if (!status.ok || !status.session) continue;
        session = status.session;
      } catch {
        continue;
      }
    }
    sessions.push(publicSession(session));
  }
  return sessions;
}

async function findManagedSessionByChildPid(childPid, options = {}) {
  const sessions = await listManagedSessions(options);
  return sessions.find(session => session.childPid === Number(childPid)) || null;
}

async function findManagedSessionByConversation(conversationId, options = {}) {
  const sessions = await listManagedSessions(options);
  return sessions.find(session => session.conversationId === conversationId) || null;
}

async function sendManagedCommand(sessionIdOrChildPid, action, payload = {}, options = {}) {
  const directory = getManagedSessionsDir(options.rootDir);
  checkPrivateDirectory(directory);
  let sessionId = String(sessionIdOrChildPid);
  if (!SESSION_ID.test(sessionId)) {
    if (!/^\d+$/.test(sessionId)) throw new Error('Invalid managed session identifier');
    const session = await findManagedSessionByChildPid(Number(sessionId), { ...options, verify: false });
    if (!session) throw new Error('Managed session not found');
    sessionId = session.sessionId;
  }
  const session = readSession(path.join(directory, sessionId + '.json'), sessionId);
  const timeoutMs = options.timeoutMs ?? (action === 'status' ? 2000 : 15000);
  return requestSession(session, action, payload, timeoutMs);
}

function reply(socket, response) {
  if (socket.destroyed) return Promise.resolve();
  return new Promise(resolve => {
    function done() {
      socket.removeListener('close', done);
      socket.removeListener('error', done);
      resolve();
    }
    socket.once('close', done);
    socket.once('error', done);
    socket.end(JSON.stringify(response) + '\n', done);
  });
}

function waitForExit(child, timeoutMs) {
  if (child.exited) return Promise.resolve(true);
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    child.done.then(() => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

/**
 * Owns only its child, never the parent shell or a terminal process. onReady receives
 * a token-free summary; the returned promise settles after cleanup and the final reply.
 */
async function runManagedSession(options = {}) {
  const {
    agyBin = 'agy', agyArgs = [], cwd = process.cwd(), ownedSurface = false,
    rootDir = null, socketDir = null, env = process.env, stdio = 'inherit',
    termWaitMs = 5000, killWaitMs = 2000, clearScreenOnReplace = false, onReady = null,
  } = options;
  if (!Array.isArray(agyArgs) || !agyArgs.every(arg => typeof arg === 'string')) {
    throw new TypeError('agyArgs must be an array of strings');
  }
  const directory = getManagedSessionsDir(rootDir);
  makePrivateDirectory(directory);
  const sessionId = crypto.randomBytes(8).toString('hex');
  const socketPath = socketPathFor(sessionId, socketDir);
  const filename = path.join(directory, sessionId + '.json');
  const startedAt = new Date().toISOString();
  const session = {
    version: 1, sessionId, launcherPid: process.pid, childPid: null,
    ownedSurface: ownedSurface === true, cwd: path.resolve(cwd), command: agyBin,
    args: agyArgs.slice(), conversationId: extractConversationIdFromArgs(agyArgs),
    socketPath, controlToken: crypto.randomBytes(32).toString('hex'),
    startedAt, updatedAt: startedAt, state: 'starting',
  };
  const token = Buffer.from(session.controlToken);
  const sockets = new Set();
  let child = null;
  let finished = false;
  let suppressAutoExit = false;
  let socketCreated = false;
  let metadataCreated = false;
  let terminalError = null;
  let queue = Promise.resolve();
  let resolveCompletion;
  const completion = new Promise(resolve => { resolveCompletion = resolve; });
  const server = net.createServer(handleSocket);

  function enqueue(operation) {
    const pending = queue.then(operation);
    queue = pending.catch(() => {});
    return pending;
  }

  function persist() {
    session.updatedAt = new Date().toISOString();
    writeSession(filename, session);
    metadataCreated = true;
  }

  function cleanup() {
    if (server.listening) server.close(() => {});
    let error = null;
    for (const target of [!IS_WINDOWS && socketCreated && socketPath, metadataCreated && filename]) {
      if (!target) continue;
      try {
        unlinkIfPresent(target);
      } catch (failure) {
        error ||= failure;
      }
    }
    if (error) throw error;
  }

  function finish(result) {
    if (finished) return;
    finished = true;
    try {
      cleanup();
    } catch (error) {
      terminalError = error;
    }
    for (const socket of sockets) socket.destroy();
    resolveCompletion({ ...result, sessionId });
  }

  async function stopChild(current) {
    if (!current || current.exited) return;
    // Reap this ChildProcess's exit event, never poll a PID which might be reused.
    current.process.kill('SIGTERM');
    if (await waitForExit(current, termWaitMs)) return;
    current.process.kill('SIGKILL');
    if (await waitForExit(current, killWaitMs)) return;
    throw new Error('Child did not exit after SIGTERM and SIGKILL');
  }

  async function startChild() {
    const processChild = spawn(session.command, session.args, {
      cwd: session.cwd, env: buildChildEnv(env || process.env), stdio,
    });
    let resolveExit;
    const current = {
      process: processChild, exited: false,
      done: new Promise(resolve => { resolveExit = resolve; }),
    };
    child = current;
    // No pipe consumer is exposed by this API; drain output to avoid blocking a child.
    processChild.stdout?.resume();
    processChild.stderr?.resume();
    processChild.once('exit', (code, signal) => {
      current.exited = true;
      resolveExit();
      void enqueue(() => {
        if (child === current && !finished && !suppressAutoExit) {
          finish({ exitCode: code ?? 0, signal: signal ?? null, reason: 'child_exit' });
        }
      });
    });
    await new Promise((resolve, reject) => {
      processChild.once('spawn', resolve);
      processChild.on('error', error => {
        if (!processChild.pid) {
          current.exited = true;
          resolveExit();
          reject(error);
        }
      });
    });
    session.childPid = processChild.pid;
    session.state = 'running';
    persist();
  }

  async function control(request) {
    if (finished) return { response: { ok: false, code: 'session_closed', error: 'Managed session has ended' } };
    if (request.action === 'status') return { response: { ok: true, session: publicSession(session) } };
    if (!['replace', 'stop', 'close'].includes(request.action)) {
      return { response: { ok: false, code: 'invalid_action', error: 'Unknown control action' } };
    }
    if (request.action === 'close' && !session.ownedSurface) {
      return { response: {
        ok: false, code: 'not_owned_surface',
        error: 'Cannot close terminal surface: session was not started as an owned dedicated surface.',
      } };
    }
    let nextArgs = session.args;
    let nextCwd = session.cwd;
    if (request.action === 'replace') {
      if (request.args !== undefined && (!Array.isArray(request.args) || !request.args.every(arg => typeof arg === 'string'))) {
        return { response: { ok: false, code: 'invalid_args', error: 'args must be an array of strings' } };
      }
      if (request.conversationId != null && (typeof request.conversationId !== 'string' || !UUID.test(request.conversationId))) {
        return { response: { ok: false, code: 'invalid_conversation', error: 'conversationId must be a UUID' } };
      }
      if (request.cwd !== undefined) {
        try {
          if (typeof request.cwd !== 'string' || !fs.statSync(request.cwd).isDirectory()) throw new Error('Not a directory');
          nextCwd = path.resolve(request.cwd);
        } catch {
          return { response: { ok: false, code: 'invalid_cwd', error: 'cwd must be an existing directory' } };
        }
      }
      nextArgs = request.args !== undefined ? request.args.slice() : replaceManagedArgs(session.args, request);
    }
    const previousChildPid = session.childPid;
    suppressAutoExit = true;
    session.state = request.action === 'replace' ? 'replacing' : 'stopping';
    persist();
    try {
      await stopChild(child);
    } catch (error) {
      suppressAutoExit = false;
      session.state = 'running';
      persist();
      return { response: { ok: false, code: 'stop_failed', error: error.message } };
    }
    if (request.action === 'replace') {
      session.cwd = nextCwd;
      session.args = nextArgs;
      session.conversationId = extractConversationIdFromArgs(nextArgs);
      if ((request.clearScreen || clearScreenOnReplace) && process.stdout.isTTY) {
        process.stdout.write('\x1b[2J\x1b[H');
      }
      try {
        await startChild();
        suppressAutoExit = false;
      } catch (error) {
        return {
          response: { ok: false, code: 'spawn_failed', error: error.message },
          result: { exitCode: 1, signal: null, reason: 'child_exit' },
        };
      }
      return { response: {
        ok: true, sessionId, previousChildPid, childPid: session.childPid,
        conversationId: session.conversationId, args: session.args.slice(),
      } };
    }
    cleanup();
    const closing = request.action === 'close';
    return {
      response: closing
        ? { ok: true, sessionId, stoppedChildPid: previousChildPid, closing: true, exitCode: 0 }
        : { ok: true, sessionId, stoppedChildPid: previousChildPid, ownedSurface: session.ownedSurface },
      result: { exitCode: 0, signal: null, reason: closing ? 'closed' : 'stopped' },
    };
  }

  function handleSocket(socket) {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    socket.setTimeout(5000, () => socket.destroy());
    let buffer = Buffer.alloc(0);
    let received = false;
    function rejectRequest(code, error) {
      received = true;
      void reply(socket, { ok: false, code, error });
    }
    socket.on('data', chunk => {
      if (received) return;
      const newline = chunk.indexOf(10);
      const part = newline === -1 ? chunk : chunk.subarray(0, newline);
      if (buffer.length + part.length > MAX_REQUEST_BYTES) {
        rejectRequest('request_too_large', 'Control request exceeds 16 KB');
        return;
      }
      buffer = Buffer.concat([buffer, part]);
      if (newline === -1) return;
      received = true;
      let request;
      try {
        request = JSON.parse(buffer.toString('utf8'));
      } catch {
        rejectRequest('invalid_request', 'Invalid JSON control request');
        return;
      }
      const supplied = typeof request?.token === 'string' ? Buffer.from(request.token) : Buffer.alloc(0);
      if (supplied.length !== token.length || !crypto.timingSafeEqual(supplied, token)) {
        rejectRequest('unauthorized', 'Invalid control token');
        return;
      }
      // A complete request is busy, not idle, while queued or stopping a child.
      socket.setTimeout(0);
      void enqueue(async () => {
        try {
          const { response, result } = await control(request);
          await reply(socket, response);
          if (result) finish(result);
        } catch (error) {
          await reply(socket, { ok: false, code: 'operation_failed', error: error.message });
          terminalError = error;
          try {
            await stopChild(child);
          } finally {
            finish({ exitCode: 1, signal: null, reason: 'error' });
          }
        }
      }).catch(error => {
        terminalError = error;
        finish({ exitCode: 1, signal: null, reason: 'error' });
      });
    });
  }

  function handleSignal(signal) {
    if (signal === 'SIGINT' && stdio === 'inherit' && child && !child.exited) return;
    void enqueue(async () => {
      if (finished) return;
      suppressAutoExit = true;
      try {
        await stopChild(child);
      } catch (error) {
        terminalError = error;
      }
      finish({ exitCode: 0, signal, reason: 'signal' });
    });
  }
  const signalHandlers = new Map(['SIGINT', 'SIGTERM', 'SIGHUP'].map(signal => [signal, () => handleSignal(signal)]));
  for (const [signal, handler] of signalHandlers) process.on(signal, handler);
  server.on('error', () => {}); // listen errors are handled by the startup promise below.
  try {
    await enqueue(async () => {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(socketPath, () => {
          server.removeListener('error', reject);
          socketCreated = true;
          resolve();
        });
      });
      if (!IS_WINDOWS) fs.chmodSync(socketPath, 0o600);
      persist();
      await startChild();
    });
    if (onReady) await onReady(publicSession(session));
    const result = await completion;
    if (terminalError) throw terminalError;
    return result;
  } catch (error) {
    await enqueue(async () => {
      try {
        await stopChild(child);
      } finally {
        finish({ exitCode: 1, signal: null, reason: 'error' });
      }
    });
    throw error;
  } finally {
    for (const [signal, handler] of signalHandlers) process.removeListener(signal, handler);
    cleanup();
  }
}

module.exports = {
  buildChildEnv,
  extractConversationIdFromArgs,
  replaceManagedArgs,
  getManagedSessionsDir,
  runManagedSession,
  listManagedSessions,
  findManagedSessionByChildPid,
  findManagedSessionByConversation,
  sendManagedCommand,
};
