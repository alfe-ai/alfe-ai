const express = require('express');
const vmManager = require('./vm_manager');

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
    const result = vmManager.addVm(ipAddress, machineStatus);
    if (!result.ok) {
        const statusCode = result.code === 'InvalidIp' || result.code === 'InvalidStatus' ? 400 : 500;
        return res.status(statusCode).json(result);
    }
    return res.json(result);
});

module.exports = router;
