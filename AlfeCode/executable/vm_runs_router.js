const express = require('express');
const { execFile } = require('child_process');
const vmManager = require('./vm_manager');

const AWS_CLI_TIMEOUT_MS = 120000;
const AWS_CLI_MAX_BUFFER = 1024 * 1024;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const execAws = (args, region) => new Promise((resolve, reject) => {
    const finalArgs = ['lightsail', ...args, '--region', region, '--output', 'json'];
    execFile('aws', finalArgs, { timeout: AWS_CLI_TIMEOUT_MS, maxBuffer: AWS_CLI_MAX_BUFFER }, (error, stdout, stderr) => {
        if (error) {
            const message = stderr || error.message || 'AWS CLI command failed';
            reject(new Error(message));
            return;
        }
        resolve(stdout);
    });
});

const normalizeString = (value) => (value ? String(value).trim() : '');

const ensureRequired = (value, label) => {
    if (!value) {
        return `${label} is required.`;
    }
    return '';
};

const parseJson = (payload) => {
    if (!payload) {
        return {};
    }
    return JSON.parse(payload);
};

const getInstanceIp = async (instanceName, region) => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
        const raw = await execAws(['get-instances'], region);
        const payload = parseJson(raw);
        const instance = (payload.instances || []).find((entry) => entry.name === instanceName);
        const ipAddress = instance?.publicIpAddress || instance?.publicIpAddress?.toString();
        if (ipAddress) {
            return ipAddress;
        }
        await delay(5000);
    }
    return '';
};

const router = express.Router();
const configIpWhitelist = new Set();
const configIpWhitelistEnv = process.env.CONFIG_IP_WHITELIST || "";
if (configIpWhitelistEnv) {
    configIpWhitelistEnv
        .split(",")
        .map((ip) => ip.trim())
        .filter(Boolean)
        .forEach((ip) => {
            configIpWhitelist.add(ip);
            configIpWhitelist.add(`::ffff:${ip}`);
        });
}

const getRequestIp = (req) => {
    const forwarded = req.headers["x-forwarded-for"];
    const forwardedIp = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const ip =
        (forwardedIp ? String(forwardedIp).split(",")[0].trim() : "") ||
        req.ip ||
        req.connection?.remoteAddress ||
        "";
    return ip.trim();
};

const isIpAllowed = (ip, whitelist) => {
    if (whitelist.size === 0) {
        return false;
    }
    if (!ip) {
        return false;
    }
    const normalized = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
    return whitelist.has(ip) || whitelist.has(normalized);
};

const requireConfigWhitelist = (req, res, next) => {
    if (!isIpAllowed(getRequestIp(req), configIpWhitelist)) {
        return res.status(403).send("Access denied.");
    }
    return next();
};

router.use(requireConfigWhitelist);

router.get('/', (req, res) => {
    const sessions = vmManager.getSessions();
    res.render('vm_runs', {
        sessions,
    });
});

router.post('/start', (req, res) => {
    const { ipAddress, machineStatus } = req.body || {};
    const result = vmManager.addVm(ipAddress, machineStatus, req.sessionId);
    if (!result.ok) {
        const statusCode = result.code === 'InvalidIp' || result.code === 'InvalidStatus' ? 400 : 500;
        return res.status(statusCode).json(result);
    }
    return res.json(result);
});

router.post('/clone', async (req, res) => {
    const {
        region,
        availabilityZone,
        instanceName,
        instanceSnapshotName,
        bundleId,
        keyPairName,
        ipAddressType,
    } = req.body || {};

    const normalized = {
        region: normalizeString(region),
        availabilityZone: normalizeString(availabilityZone),
        instanceName: normalizeString(instanceName),
        instanceSnapshotName: normalizeString(instanceSnapshotName),
        bundleId: normalizeString(bundleId),
        keyPairName: normalizeString(keyPairName),
        ipAddressType: normalizeString(ipAddressType),
    };

    const requiredErrors = [
        ensureRequired(normalized.region, 'Region'),
        ensureRequired(normalized.availabilityZone, 'Availability zone'),
        ensureRequired(normalized.instanceName, 'Instance name'),
        ensureRequired(normalized.instanceSnapshotName, 'Snapshot name'),
        ensureRequired(normalized.bundleId, 'Bundle ID'),
    ].filter(Boolean);

    if (requiredErrors.length) {
        return res.status(400).json({ ok: false, error: requiredErrors[0] });
    }

    try {
        const args = [
            'create-instances-from-snapshot',
            '--availability-zone',
            normalized.availabilityZone,
            '--instance-names',
            normalized.instanceName,
            '--instance-snapshot-name',
            normalized.instanceSnapshotName,
            '--bundle-id',
            normalized.bundleId,
        ];
        if (normalized.keyPairName) {
            args.push('--key-pair-name', normalized.keyPairName);
        }
        if (normalized.ipAddressType) {
            args.push('--ip-address-type', normalized.ipAddressType);
        }

        await execAws(args, normalized.region);

        const ipAddress = await getInstanceIp(normalized.instanceName, normalized.region);
        if (!ipAddress) {
            return res.status(502).json({
                ok: false,
                error: 'Instance created but IP address is not available yet. Try refreshing shortly.',
            });
        }

        const result = vmManager.addVm(ipAddress, 'Running', req.sessionId);
        if (!result.ok) {
            return res.status(500).json(result);
        }

        return res.json({
            ok: true,
            session: result.session,
            instance: {
                name: normalized.instanceName,
                ipAddress,
            },
        });
    } catch (error) {
        return res.status(500).json({
            ok: false,
            error: error.message || 'Unable to clone the VM from snapshot.',
        });
    }
});

module.exports = router;
