const express = require('express');
const vmManager = require('./vm_manager');

const router = express.Router();

router.get('/', (req, res) => {
    const sessions = vmManager.getSessions();
    res.render('vm_runs', {
        sessions,
        vmImagePath: vmManager.VM_IMAGE_PATH,
    });
});

router.post('/start', (_req, res) => {
    const result = vmManager.startVm();
    if (!result.ok) {
        const statusCode = result.code === 'NoPorts' ? 503 : 500;
        return res.status(statusCode).json(result);
    }
    return res.json(result);
});

router.get('/log/:sessionId', (req, res) => {
    const sessionId = String(req.params.sessionId || '').trim();
    if (!sessionId) {
        return res.status(400).send('sessionId required');
    }
    const log = vmManager.readSessionLog(sessionId);
    if (log === null) {
        return res.status(404).send('Log not available');
    }
    res.set('Content-Type', 'text/plain; charset=utf-8');
    return res.send(log);
});

module.exports = router;
