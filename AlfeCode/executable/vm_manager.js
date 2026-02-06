const { randomUUID } = require('crypto');

const vmSessions = [];
const nodePingMap = new Map();
const MAX_NODE_PINGS = 200;
const STATUS_OPTIONS = new Set(['Running', 'Stopped']);
const VM_TYPE_OPTIONS = new Set(['Default', 'Demo']);

function createSessionId() {
    if (typeof randomUUID === 'function') {
        return randomUUID();
    }
    return `vm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeStatus(status) {
    if (!status) {
        return 'Running';
    }
    const normalized = String(status).trim().toLowerCase();
    if (normalized === 'running') {
        return 'Running';
    }
    if (normalized === 'stopped') {
        return 'Stopped';
    }
    return null;
}

function isValidIpv4(ip) {
    if (!ip) {
        return false;
    }
    const trimmed = String(ip).trim();
    const parts = trimmed.split('.');
    if (parts.length !== 4) {
        return false;
    }
    return parts.every((segment) => {
        if (!/^\d{1,3}$/.test(segment)) {
            return false;
        }
        const value = Number(segment);
        return value >= 0 && value <= 255;
    });
}

function normalizeVmType(vmType) {
    if (!vmType) {
        return 'Default';
    }
    const normalized = String(vmType).trim().toLowerCase();
    if (normalized === 'default') {
        return 'Default';
    }
    if (normalized === 'demo') {
        return 'Demo';
    }
    return null;
}

function serializeSession(session) {
    if (!session) {
        return null;
    }
    const {
        sessionId,
        userSessionId,
        ipAddress,
        machineStatus,
        vmType,
        startTimestamp,
        lastUsedTimestamp,
        errorMessage,
        projectList,
    } = session;
    return {
        sessionId,
        userSessionId,
        ipAddress,
        machineStatus,
        vmType,
        startTimestamp,
        lastUsedTimestamp,
        errorMessage,
        projectList,
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

function addVm(ipAddress, machineStatus, userSessionId, vmType) {
    const normalizedIp = String(ipAddress || '').trim();
    if (!isValidIpv4(normalizedIp)) {
        return { ok: false, error: 'A valid public IPv4 address is required.', code: 'InvalidIp' };
    }
    const normalizedStatus = normalizeStatus(machineStatus);
    if (!normalizedStatus || !STATUS_OPTIONS.has(normalizedStatus)) {
        return { ok: false, error: 'Machine status must be Running or Stopped.', code: 'InvalidStatus' };
    }
    const normalizedVmType = normalizeVmType(vmType);
    if (!normalizedVmType || !VM_TYPE_OPTIONS.has(normalizedVmType)) {
        return { ok: false, error: 'VM type must be Default or Demo.', code: 'InvalidType' };
    }
    const now = new Date().toISOString();
    const session = {
        sessionId: createSessionId(),
        userSessionId: userSessionId ? String(userSessionId) : '',
        ipAddress: normalizedIp,
        machineStatus: normalizedStatus,
        vmType: normalizedVmType,
        startTimestamp: now,
        lastUsedTimestamp: now,
        errorMessage: '',
        projectList: {},
    };
    vmSessions.push(session);
    return { ok: true, session: serializeSession(session) };
}

module.exports = {
    addVm,
    getSessions,
    getNodePings,
    recordNodePing,
};

function getNodePings() {
    return Array.from(nodePingMap.values())
        .slice()
        .sort((a, b) => {
            const aTime = a.lastPingTimestamp ? Date.parse(a.lastPingTimestamp) : 0;
            const bTime = b.lastPingTimestamp ? Date.parse(b.lastPingTimestamp) : 0;
            return bTime - aTime;
        });
}

function recordNodePing(ipAddress, details = {}) {
    const normalizedIp = String(ipAddress || '').trim();
    if (!normalizedIp) {
        return null;
    }
    const now = new Date().toISOString();
    const existing = nodePingMap.get(normalizedIp);
    const payload = {
        ipAddress: normalizedIp,
        hostname: details.hostname ? String(details.hostname) : existing?.hostname || '',
        nodeId: details.nodeId ? String(details.nodeId) : existing?.nodeId || '',
        firstPingTimestamp: existing?.firstPingTimestamp || now,
        lastPingTimestamp: now,
        totalPings: (existing?.totalPings || 0) + 1,
    };
    nodePingMap.set(normalizedIp, payload);
    if (nodePingMap.size > MAX_NODE_PINGS) {
        const entries = Array.from(nodePingMap.entries()).sort(([, a], [, b]) => {
            const aTime = a.lastPingTimestamp ? Date.parse(a.lastPingTimestamp) : 0;
            const bTime = b.lastPingTimestamp ? Date.parse(b.lastPingTimestamp) : 0;
            return aTime - bTime;
        });
        const overflow = entries.length - MAX_NODE_PINGS;
        for (let i = 0; i < overflow; i += 1) {
            nodePingMap.delete(entries[i][0]);
        }
    }
    return payload;
}
