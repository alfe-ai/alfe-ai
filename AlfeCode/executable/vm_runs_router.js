const express = require('express');
const { execFile } = require('child_process');
const vmManager = require('./vm_manager');

const AWS_CLI_TIMEOUT_MS = 120000;
const AWS_CLI_MAX_BUFFER = 1024 * 1024;
const VM_CLONE_DEFAULTS = {
    region: process.env.EC2_CLONE_REGION || '',
    amiId: process.env.EC2_CLONE_AMI_ID || '',
    instanceType: process.env.EC2_CLONE_INSTANCE_TYPE || '',
    subnetId: process.env.EC2_CLONE_SUBNET_ID || '',
    securityGroupIds: process.env.EC2_CLONE_SECURITY_GROUP_IDS || '',
    keyName: process.env.EC2_CLONE_KEY_NAME || '',
    iamInstanceProfile: process.env.EC2_CLONE_IAM_INSTANCE_PROFILE || '',
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const execAws = (args, region) => new Promise((resolve, reject) => {
    const finalArgs = ['ec2', ...args, '--region', region, '--output', 'json'];
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

const valueOrDefault = (value, fallback) => {
    const normalized = normalizeString(value);
    return normalized || normalizeString(fallback);
};

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

const getInstanceIp = async (instanceId, region) => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
        const raw = await execAws(['describe-instances', '--instance-ids', instanceId], region);
        const payload = parseJson(raw);
        const reservations = payload.Reservations || [];
        const instances = reservations.flatMap((reservation) => reservation.Instances || []);
        const instance = instances.find((entry) => entry.InstanceId === instanceId);
        const ipAddress = instance?.PublicIpAddress || instance?.PublicIpAddress?.toString();
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
        cloneDefaults: VM_CLONE_DEFAULTS,
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
        instanceName,
        amiId,
        instanceType,
        subnetId,
        securityGroupIds,
        keyName,
        iamInstanceProfile,
    } = req.body || {};

    const normalized = {
        region: valueOrDefault(region, VM_CLONE_DEFAULTS.region),
        instanceName: normalizeString(instanceName),
        amiId: valueOrDefault(amiId, VM_CLONE_DEFAULTS.amiId),
        instanceType: valueOrDefault(instanceType, VM_CLONE_DEFAULTS.instanceType),
        subnetId: valueOrDefault(subnetId, VM_CLONE_DEFAULTS.subnetId),
        securityGroupIds: valueOrDefault(securityGroupIds, VM_CLONE_DEFAULTS.securityGroupIds),
        keyName: valueOrDefault(keyName, VM_CLONE_DEFAULTS.keyName),
        iamInstanceProfile: valueOrDefault(iamInstanceProfile, VM_CLONE_DEFAULTS.iamInstanceProfile),
    };

    const requiredErrors = [
        ensureRequired(normalized.region, 'Region'),
        ensureRequired(normalized.instanceName, 'Instance name'),
        ensureRequired(normalized.amiId, 'AMI ID'),
        ensureRequired(normalized.instanceType, 'Instance type'),
        ensureRequired(normalized.subnetId, 'Subnet ID'),
        ensureRequired(normalized.securityGroupIds, 'Security group IDs'),
    ].filter(Boolean);

    if (requiredErrors.length) {
        return res.status(400).json({ ok: false, error: requiredErrors[0] });
    }

    try {
        const securityGroupIdList = normalized.securityGroupIds
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean);

        const args = [
            'run-instances',
            '--image-id',
            normalized.amiId,
            '--instance-type',
            normalized.instanceType,
            '--subnet-id',
            normalized.subnetId,
            '--security-group-ids',
            ...securityGroupIdList,
            '--tag-specifications',
            `ResourceType=instance,Tags=[{Key=Name,Value=${normalized.instanceName}}]`,
        ];
        if (normalized.keyName) {
            args.push('--key-name', normalized.keyName);
        }
        if (normalized.iamInstanceProfile) {
            args.push('--iam-instance-profile', `Name=${normalized.iamInstanceProfile}`);
        }

        const raw = await execAws(args, normalized.region);
        const payload = parseJson(raw);
        const instanceId = payload?.Instances?.[0]?.InstanceId;
        if (!instanceId) {
            return res.status(502).json({
                ok: false,
                error: 'Instance launch succeeded but no instance ID was returned.',
            });
        }

        const ipAddress = await getInstanceIp(instanceId, normalized.region);
        if (!ipAddress) {
            return res.status(502).json({
                ok: false,
                error: 'Instance created but public IP address is not available yet. Try refreshing shortly.',
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
                instanceId,
                ipAddress,
            },
        });
    } catch (error) {
        return res.status(500).json({
            ok: false,
            error: error.message || 'Unable to clone the VM from AMI.',
        });
    }
});

module.exports = router;
