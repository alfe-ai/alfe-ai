const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_VM_IMAGE_PATH = path.join(PROJECT_ROOT, '..', 'example', 'alfe-agent.qcow2');
const VM_LOG_DIR = path.join(PROJECT_ROOT, 'data', 'vm_runs_logs');

const vmPortStartEnv = Number.parseInt(process.env.ALFECODE_VM_PORT_START, 10);
const vmPortEndEnv = Number.parseInt(process.env.ALFECODE_VM_PORT_END, 10);
const normalizedPortStart = Number.isFinite(vmPortStartEnv) && vmPortStartEnv > 0 ? vmPortStartEnv : 32000;
const normalizedEndCandidate = Number.isFinite(vmPortEndEnv) && vmPortEndEnv >= normalizedPortStart ? vmPortEndEnv : normalizedPortStart + 199;
const VM_PORT_START = normalizedPortStart;
const VM_PORT_END = Math.min(normalizedEndCandidate, VM_PORT_START + 999);
const VM_IMAGE_PATH = process.env.ALFECODE_VM_IMAGE_PATH || process.env.AURORA_QEMU_IMAGE || DEFAULT_VM_IMAGE_PATH;
const MAX_PORT_RANGE = 1000;

const vmSessions = [];

function logVmEvent(message) {
    console.log(`[vm-manager] ${message}`);
}

function logVmError(message) {
    console.error(`[vm-manager] ${message}`);
}

function collectUsedPorts() {
    return vmSessions
        .flatMap((session) => [session.assignedPort, session.sshPort])
        .map((port) => Number(port))
        .filter((port) => Number.isInteger(port) && port > 0);
}

function ensureLogDir() {
    if (!fs.existsSync(VM_LOG_DIR)) {
        fs.mkdirSync(VM_LOG_DIR, { recursive: true });
    }
}

function createSessionId() {
    if (typeof randomUUID === 'function') {
        return randomUUID();
    }
    return `vm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function allocatePort(reservedPorts = []) {
    const used = new Set([...collectUsedPorts(), ...reservedPorts]);
    for (let candidate = VM_PORT_START; candidate <= VM_PORT_END && candidate < VM_PORT_START + MAX_PORT_RANGE; candidate += 1) {
        if (!used.has(candidate)) {
            return candidate;
        }
    }
    return null;
}

function serializeSession(session) {
    if (!session) {
        return null;
    }
    const {
        sessionId,
        assignedPort,
        sshPort,
        status,
        qemuStatus,
        startTimestamp,
        lastUsedTimestamp,
        endTimestamp,
        qemuPid,
        qemuLog,
        errorMessage,
    } = session;
    return {
        sessionId,
        assignedPort,
        sshPort,
        status,
        qemuStatus,
        startTimestamp,
        lastUsedTimestamp,
        endTimestamp,
        qemuPid,
        qemuLog,
        errorMessage,
        logUrl: sessionId ? `/vm_runs/log/${encodeURIComponent(sessionId)}` : '',
    };
}

function getSessions() {
    return vmSessions
        .slice()
        .sort((a, b) => {
            const aTime = a.startTimestamp ? Date.parse(a.startTimestamp) : 0;
            const bTime = b.startTimestamp ? Date.parse(b.startTimestamp) : 0;
            return bTime - aTime;
        })
        .map(serializeSession);
}

function getSessionById(sessionId) {
    if (!sessionId) {
        return null;
    }
    return vmSessions.find((session) => session.sessionId === sessionId) || null;
}

function buildSessionRecord(port, sshPort) {
    const now = new Date().toISOString();
    return {
        sessionId: createSessionId(),
        assignedPort: port,
        sshPort,
        startTimestamp: now,
        lastUsedTimestamp: now,
        endTimestamp: null,
        status: 'Starting',
        qemuStatus: 'Starting',
        qemuPid: null,
        qemuLog: '',
        logPath: '',
        errorMessage: '',
    };
}

function spawnQemuForSession(session) {
    if (!session || !session.assignedPort) {
        return;
    }

    if (!fs.existsSync(VM_IMAGE_PATH)) {
        session.qemuStatus = 'ImgMissing';
        session.status = 'ImgMissing';
        session.errorMessage = `QEMU image missing at ${VM_IMAGE_PATH}`;
        session.lastUsedTimestamp = new Date().toISOString();
        logVmError(`Session ${session.sessionId} failed: ${session.errorMessage}`);
        return;
    }

    session.qemuStatus = 'Starting';
    session.status = 'Starting';

    try {
        ensureLogDir();
        const logPath = path.join(VM_LOG_DIR, `alfecode-vm-${session.sessionId}.log`);
        const logFd = fs.openSync(logPath, 'a');
        logVmEvent(
            `Starting QEMU session ${session.sessionId} (host ports https=${session.assignedPort} ssh=${session.sshPort}) log=${logPath}`,
        );
        const qemuArgs = [
            '-m', '1024',
            '-drive', `file=${VM_IMAGE_PATH},if=virtio,format=qcow2`,
            '-net', `user,hostfwd=tcp::${session.assignedPort}-:443,hostfwd=tcp::${session.sshPort}-:22`,
            '-net', 'nic',
            '-nographic',
            '-display', 'none',
        ];
        const child = spawn('qemu-system-x86_64', qemuArgs, {
            detached: true,
            stdio: ['ignore', logFd, logFd],
        });

        session.qemuPid = child.pid || null;
        session.qemuStatus = 'Started';
        session.status = 'Running';
        session.qemuLog = path.basename(logPath);
        session.logPath = logPath;
        session.lastUsedTimestamp = new Date().toISOString();
        logVmEvent(`Session ${session.sessionId} started (pid=${session.qemuPid ?? 'unknown'}).`);

        child.on('error', (error) => {
            session.qemuStatus = 'Failed';
            session.status = 'Failed';
            session.errorMessage = error ? String(error.message || error) : 'Unknown error';
            session.lastUsedTimestamp = new Date().toISOString();
            logVmError(`Session ${session.sessionId} failed: ${session.errorMessage}`);
        });

        child.on('exit', (code) => {
            session.qemuStatus = `Exited (${code ?? 'unknown'})`;
            session.status = 'Stopped';
            session.endTimestamp = new Date().toISOString();
            session.lastUsedTimestamp = new Date().toISOString();
            logVmEvent(`Session ${session.sessionId} exited with code ${code ?? 'unknown'}.`);
        });

        child.unref();
        try {
            fs.closeSync(logFd);
        } catch (closeError) {
            /* Ignore; we attempted to close the descriptor. */
        }
    } catch (error) {
        session.qemuStatus = 'Failed';
        session.status = 'Failed';
        session.errorMessage = error ? String(error.message || error) : 'Failed to start QEMU';
        session.lastUsedTimestamp = new Date().toISOString();
        logVmError(`Session ${session.sessionId} failed: ${session.errorMessage}`);
    }
}

function startVm() {
    const assignedPort = allocatePort();
    if (!assignedPort) {
        return { ok: false, error: 'No available ports in the configured range', code: 'NoPorts' };
    }
    const sshPort = allocatePort([assignedPort]);
    if (!sshPort) {
        return { ok: false, error: 'No available ports for SSH forwarding', code: 'NoPorts' };
    }
    const session = buildSessionRecord(assignedPort, sshPort);
    vmSessions.push(session);
    logVmEvent(`Allocated session ${session.sessionId} (https=${assignedPort}, ssh=${sshPort}).`);
    spawnQemuForSession(session);
    return { ok: true, session: serializeSession(session) };
}

function readSessionLog(sessionId) {
    const session = getSessionById(sessionId);
    if (!session || !session.logPath) {
        return null;
    }
    try {
        if (!fs.existsSync(session.logPath)) {
            return null;
        }
        const content = fs.readFileSync(session.logPath, 'utf-8');
        return content;
    } catch (error) {
        return null;
    }
}

module.exports = {
    startVm,
    getSessions,
    readSessionLog,
    VM_IMAGE_PATH,
    VM_PORT_START,
    VM_PORT_END,
};
