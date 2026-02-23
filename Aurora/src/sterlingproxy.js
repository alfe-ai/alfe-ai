
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Safe port range for assigning Sterling instances (1000 ports)
const SAFE_PORT_START = 32000;
const SAFE_PORT_END = 32999;

const STERLING_EJS_PATH = path.join(__dirname, '..', '..', 'AlfeCode', 'executable', 'views', 'codex_runner.ejs');

// QEMU image path (override with env var AURORA_QEMU_IMAGE)
const DEFAULT_QEMU_IMG = path.join(__dirname, '..', '..', 'example', 'alfe-agent.qcow2');
const QEMU_IMG = process.env.AURORA_QEMU_IMAGE || DEFAULT_QEMU_IMG;

const router = express.Router();

// In-memory sessions copied from original standalone implementation
const auroraSessions = [];

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderSplashHtml() {
  try {
    let html = fs.readFileSync(STERLING_EJS_PATH, 'utf8');
    html = html.replace(/<%[\s\S]*?%>/g, '');
    html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
    html = html.replace(/\s*<%=.*?%>\s*/g, '');
    return html;
  } catch (err) {
    return `<!doctype html><html><body><h1>Mock splash unavailable</h1><pre>${String(err)}</pre></body></html>`;
  }
}

function renderPage() {
  const formatOptions = {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Chicago'
  };
  const currentSystemTimestamp = new Date().toLocaleString('en-US', formatOptions) + ' CT';
  const tableRows = auroraSessions
    .slice()
    .sort((a, b) => new Date(a.startTimestamp) - new Date(b.startTimestamp))
    .map(
      (session) => `
        <tr>
          <td>${escapeHtml(session.sessionId)}</td>
          <td>${escapeHtml(session.ipAddress)}</td>
          <td>${new Date(session.startTimestamp).toLocaleString('en-US', formatOptions) + ' CT'} UTC</td>
          <td>${new Date(session.lastUsedTimestamp).toLocaleString('en-US', formatOptions) + ' CT'} UTC</td>
          <td>${escapeHtml(String(session.assignedPort || ''))}</td>
          <td>${session.qemuLog ? `<a href="/sterlingproxy/log/${encodeURIComponent(session.sessionId)}" target="_blank">${escapeHtml(session.qemuLog)}</a>` : ''}</td>
          <td>${escapeHtml(session.status || '')}</td>
        </tr>
      `
    )
    .join('');

  return `\n    <!doctype html>\n    <html lang="en">\n      <head>\n        <meta charset="utf-8" />\n        <meta name="viewport" content="width=device-width, initial-scale=1" />\n        <title>Sterling Proxy</title>\n        <style>\n          :root {\n            color-scheme: light dark;\n            font-family: "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;\n          }\n          body {\n            margin: 0;\n            padding: 2rem;\n            background: #0f172a;\n            color: #f8fafc;\n          }\n          h1 {\n            text-align: center;\n            margin-bottom: 1.5rem;\n          }\n          .timestamp {\n            text-align: center;\n            margin-bottom: 2rem;\n            color: #38bdf8;\n          }\n          table {\n            width: min(800px, 100%);\n            margin: 0 auto;\n            border-collapse: collapse;\n            background: #1e293b;\n            border-radius: 0.5rem;\n            overflow: hidden;\n            box-shadow: 0 10px 25px rgba(15, 23, 42, 0.5);\n          }\n          thead {\n            background: #0ea5e9;\n            color: #0f172a;\n          }\n          th, td {\n            padding: 0.85rem 1rem;\n            text-align: left;\n          }\n          tbody tr:nth-child(odd) {\n            background: #1e293b;\n          }\n          tbody tr:nth-child(even) {\n            background: #0f172a;\n          }\n        </style>\n      </head>\n      <body>\n        <p class="timestamp">Current System Timestamp: ${currentSystemTimestamp} UTC</p>\n        <table>\n          <thead>\n            <tr>\n              <th>Aurora Session ID</th>\n              <th>Sterling IP address</th>\n              <th>Sterling start timestamp</th>\n              <th>Sterling last used timestamp</th>\n              <th>Assigned Port</th>
              <th>QEMU Log</th>
              <th>Status</th>\n            </tr>\n          </thead>\n          <tbody>\n            ${tableRows}\n          </tbody>\n        </table>\n      </body>\n    </html>\n  `;
}

// GET / -> table (optionally accepts ?aurora_session= to register/update a session)
router.get('/', (req, res) => {
  const query = req.query || {};

  if (query.aurora_session) {
    const sessionId = String(query.aurora_session).trim();
    if (sessionId.length) {
      const now = new Date().toISOString();
      const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
      const idx = auroraSessions.findIndex(s => s.sessionId === sessionId);
      if (idx !== -1) {
        auroraSessions[idx].ipAddress = ip || 'unknown';
        auroraSessions[idx].lastUsedTimestamp = now;
      } else {
        // Assign a random free port from the safe range
        let assignedPort = null;
        const used = new Set(auroraSessions.map(s => Number(s.assignedPort)).filter(Boolean));
        const allPorts = [];
        for (let p = SAFE_PORT_START; p <= SAFE_PORT_END; p++) { allPorts.push(p); }
        const freePorts = allPorts.filter(p => !used.has(p));
        if (freePorts.length > 0) {
          assignedPort = freePorts[Math.floor(Math.random() * freePorts.length)];
        }
        const sessionObj = {
          sessionId: sessionId,
          ipAddress: ip || 'unknown',
          startTimestamp: now,
          lastUsedTimestamp: now,
          assignedPort: assignedPort,
          status: 'Running',
          qemuPid: null,
          qemuStatus: '',
          qemuLog: assignedPort ? `aurora-qemu-${sessionId}.log` : ''
        };
        auroraSessions.push(sessionObj);

        // Try to spawn QEMU to forward guest port 443 to the assigned host port
        try {
          if (assignedPort && fs.existsSync(QEMU_IMG)) {
            const logPath = path.join(path.dirname(QEMU_IMG), `aurora-qemu-${sessionId}.log`);
            const logFd = fs.openSync(logPath, 'a');
            const qemuArgs = [
              '-m', '1024',
              '-drive', `file=${QEMU_IMG},if=virtio,format=qcow2`,
              '-net', `user,hostfwd=tcp::${assignedPort}-:443`,
              '-net', 'nic',
              '-nographic'
            ];
            const child = spawn('qemu-system-x86_64', qemuArgs, { detached: true, stdio: ['ignore', logFd, logFd] });
            sessionObj.qemuPid = child.pid;
            sessionObj.qemuStatus = 'Started';
            sessionObj.qemuLog = path.basename(logPath);
            child.unref();
            try { fs.closeSync(logFd); } catch (e) {}
          } else if (assignedPort) {
            console.error(`[SterlingProxy] QEMU image not found at ${QEMU_IMG}; cannot spawn QEMU for session ${sessionId}`);
            sessionObj.qemuStatus = 'ImgMissing';
          }
        } catch (e) {
          console.error('[SterlingProxy] Failed to spawn QEMU:', e);
          sessionObj.qemuStatus = 'Failed';
        }

      }

    }
  }

  // If mounted under a base path (e.g. '/code') and an Aurora session
  // query param is present, redirect to the splash page on the same
  // mount path so the embedded splash opens with the Aurora modal.
  if (query && query.aurora_session) {
    const sid = String(query.aurora_session).trim();
    if (sid.length) {
      const base = req.baseUrl || '';
      return res.redirect(base + '/splash?aurora_session=' + encodeURIComponent(sid));
    }
  }

  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(renderPage());
});

router.post('/clear', (req, res) => {
  // Clear all in-memory Aurora sessions
  auroraSessions.length = 0;
  res.json({ ok: true, cleared: true });
});

router.get('/splash-inner', (req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(renderSplashHtml());
});

router.get('/splash', (req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8');

  const showOnAurora = !!(req.query && req.query.aurora_session);

  res.send(`<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1" />\n    <title>Sterling Proxy - Embedded Splash</title>
    <script>window.__STERLING_SHOW_FOR_AURORA__ = ${showOnAurora};</script>\n    <style>\n      :root{color-scheme: light dark;font-family: "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif}\n      body{margin:0;padding:0;background:linear-gradient(180deg,#0b1220,#071026);color:#e6eef8}\n      .frame-wrap{position:relative;height:100vh}\n      iframe{border:0;width:100%;height:100vh;display:block}\n      /* Floating info button */\n      #sterlingOpenBtn{position:fixed;right:1rem;bottom:1rem;background:#0ea5e9;color:#021126;border:none;border-radius:999px;width:48px;height:48px;display:flex;align-items:center;justify-content:center;font-size:20px;cursor:pointer;box-shadow:0 6px 18px rgba(2,6,23,0.6)}\n      /* Modal styles */\n      .sterling-modal-backdrop{position:fixed;inset:0;background:rgba(2,6,23,0.6);display:none;align-items:center;justify-content:center;z-index:1000}\n      .sterling-modal{position:relative;background:#0f172a;color:#e2e8f0;max-width:720px;width:calc(100% - 2rem);border-radius:12px;padding:1.25rem;box-shadow:0 20px 50px rgba(2,6,23,0.6);border:1px solid rgba(148,163,184,0.25)}\n      .sterling-modal h2{margin:0 0.25rem 0.5rem 0;color:#f8fafc}\n      .sterling-modal p{margin:0.25rem 0;color:#cbd5f5}\n      .sterling-modal a{color:#38bdf8}\n      .sterling-modal .actions{display:flex;justify-content:flex-end;margin-top:1rem}\n      .sterling-modal button{background:#38bdf8;color:#031224;border:none;padding:0.5rem 0.75rem;border-radius:8px;cursor:pointer;font-weight:600}\n      .sterling-modal button:hover{background:#0ea5e9}\n      .sterling-modal .close-plain{background:transparent;color:#94a3b8;padding:0.35rem 0.5rem;margin-right:auto}\n      @media (min-width:800px){iframe{height: calc(100vh - 0px)}}\n    </style>\n  </head>\n  <body>\n    <div class="frame-wrap">\n      <iframe src="/sterlingproxy/splash-inner" title="Sterling proxy splash"></iframe>\n    </div>\n\n    <button id="sterlingOpenBtn" aria-label="Open Sterling info">i</button>\n\n    <div id="sterlingDisclaimer" class="sterling-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="sterlingDisclaimerTitle">\n      <div class="sterling-modal">\n        <h2 id="sterlingDisclaimerTitle">Alfe AI Code</h2>
        
        
                <!-- Add Repository Form (embedded from Sterling) -->
        <form id="auroraAddRepoForm" action="http://localhost:3333/repositories/add" method="POST" style="margin-top:0.75rem;border-top:1px solid rgba(255,255,255,0.03);padding-top:0.75rem;">
          <label for="aurora_repoName" style="display:block;color:#e2e8f0;margin-bottom:0.25rem;">Repository Name:</label>
          <input type="text" id="aurora_repoName" name="repoName" required style="width:100%;padding:0.45rem;border-radius:6px;border:1px solid rgba(148,163,184,0.25);background:transparent;color:#e2e8f0;">

          <label for="aurora_gitRepoURL" style="display:block;color:#e2e8f0;margin:0.5rem 0 0.25rem;">SSH Git Repo URL:</label>
          <input type="text" id="aurora_gitRepoURL" name="gitRepoURL" style="width:100%;padding:0.45rem;border-radius:6px;border:1px solid rgba(148,163,184,0.25);background:transparent;color:#e2e8f0;">

          <label for="aurora_gitRepoLocalPath" style="display:block;color:#e2e8f0;margin:0.5rem 0 0.25rem;">Or specify existing repo path:</label>
          <input type="text" id="aurora_gitRepoLocalPath" name="gitRepoLocalPath" placeholder="/absolute/path/to/repo" style="width:100%;padding:0.45rem;border-radius:6px;border:1px solid rgba(148,163,184,0.25);background:transparent;color:#e2e8f0;">
          <input type="file" id="aurora_dirPicker" style="display:none" webkitdirectory directory>
          <button type="button" id="aurora_browseBtn" style="margin-top:0.45rem;padding:0.4rem 0.6rem;border-radius:8px;border:1px solid rgba(148,163,184,0.12);background:#0f172a;color:#e2e8f0;">Browse...</button>

          <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:0.75rem;">
            <button type="submit" style="background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;border:none;padding:0.5rem 0.9rem;border-radius:8px;">Add Repository</button>
          </div>
        </form>
        <details id="alfeInfo" style="margin-top:0.75rem;border-top:1px solid rgba(255,255,255,0.03);padding-top:0.75rem;">
  <summary style="cursor:pointer;font-weight:600;margin-bottom:0.5rem;">Info</summary>
  <p>Please note, as a free user without an account, your data in Alfe AI Code may be cleared periodically and is not guaranteed to be retained.</p>
  <p>For persistant storage of information, please <a href="#" id="createLoginLink">Create an Account or Log In</a>.</p>
  <p>You can start using Alfe AI Code before creating an account, and data will be saved upon account creation.</p>
</details>

        <script>
          (function(){
            const browseBtn = document.getElementById('aurora_browseBtn');
            const dirPicker = document.getElementById('aurora_dirPicker');
            const localPathInput = document.getElementById('aurora_gitRepoLocalPath');
            const repoNameInput = document.getElementById('aurora_repoName');
            const addRepoForm = document.getElementById('auroraAddRepoForm');
            let repoNameManuallyEdited = false;
            let lastDerivedRepoName = "";

            function extractRepoName(path){
              if(!path) return "";
              const trimmed = path.trim().replace(/[\/]+$/, "");
              if(!trimmed) return "";
              const parts = trimmed.split(/[\/]+/);
              return parts.length ? parts[parts.length-1] : "";
            }

            function updateRepoNameFromPath(){
              const derivedName = extractRepoName(localPathInput.value);
              if(!derivedName) return;
              const currentValue = repoNameInput.value.trim();
              const shouldUpdate = !repoNameManuallyEdited || currentValue === "" || currentValue === lastDerivedRepoName;
              lastDerivedRepoName = derivedName;
              if(shouldUpdate){
                repoNameInput.value = derivedName;
                repoNameManuallyEdited = false;
              }
            }

            browseBtn.addEventListener('click', ()=>{
              dirPicker.disabled = false;
              dirPicker.click();
            });

            dirPicker.addEventListener('change', (ev)=>{
              const file = ev.target.files && ev.target.files[0];
              if(!file) return;
              let fullPath = file.path || '';
              if(!fullPath && file.webkitRelativePath){
                const parts = file.webkitRelativePath.split('/');
                parts.pop();
                fullPath = parts.join('/');
              }
              if(fullPath){
                const sep = fullPath.includes('\\') ? /\\[^\\]*$/ : /\/[^/]*$/;
                localPathInput.value = fullPath.replace(sep, '');
                updateRepoNameFromPath();
              }
              dirPicker.disabled = true;
            });

            localPathInput.addEventListener('input', updateRepoNameFromPath);

            repoNameInput.addEventListener('input', ()=>{
              repoNameManuallyEdited = repoNameInput.value.trim() !== "";
            });

            addRepoForm.addEventListener('submit', ()=>{
              if(!repoNameInput.value.trim()){
                updateRepoNameFromPath();
              }
            });
          })();
        </script>
<span id="comingSoonTip" style="display:none;position:absolute;top:1.25rem;right:1.25rem;background:#111827;color:#ffffff;padding:6px 10px;border-radius:8px;border:1px solid rgba(148,163,184,0.18);box-shadow:0 14px 36px rgba(2,6,23,0.6);z-index:1001;font-size:0.95rem;">Coming Soon</span>
        <div class="actions">\n          <button id="sterlingDismiss">Continue</button>\n        </div>\n      </div>\n    </div>\n\n    <script>\n      (function(){\n        const key='sterlingDisclaimerDismissed:v1';\n        const modal=document.getElementById('sterlingDisclaimer');\n        const openBtn=document.getElementById('sterlingOpenBtn');\n        const dismiss=document.getElementById('sterlingDismiss');\n        function show(){modal.style.display='flex';document.body.style.overflow='hidden';}\n        function hide(){modal.style.display='none';document.body.style.overflow='auto';}\n        openBtn.addEventListener('click',()=>{show();});\n        dismiss.addEventListener('click',()=>{localStorage.setItem(key,'1');
          try{
            const params=new URLSearchParams(window.location.search||'');
            const sid=params.get('aurora_session');
            const target = sid ? 'http://localhost:3333/splash?aurora_session=' + encodeURIComponent(sid) : 'http://localhost:3333/';
            window.location.href=target;
          }catch(e){
            window.location.href='http://localhost:3333/';
          }
        });
\n        try{
          if (window.__STERLING_SHOW_FOR_AURORA__ === true) {
            setTimeout(show,450);
          } else {
            if(!localStorage.getItem(key)){setTimeout(show,450);}
          }
        }catch(e){}\n        // Clicking the backdrop no longer closes the modal. (Preserve explicit close buttons.)
        // modal.addEventListener('click',(e)=>{if(e.target===modal){hide();}});\n        // Injected: Coming Soon tooltip handler for the Create Account link
        (function(){
          var comingTimer=null;
          function showComingSoon(){
            var tip=document.getElementById('comingSoonTip');
            if(!tip) return;
            tip.style.display='block';
            if(comingTimer) clearTimeout(comingTimer);
            comingTimer=setTimeout(function(){ tip.style.display='none'; comingTimer=null; },2000);
          }
          try{
            var link=document.getElementById('createLoginLink');
            if(link){
              link.addEventListener('click',function(e){ e.preventDefault(); e.stopPropagation(); showComingSoon(); });
            }
          }catch(e){}
        })();
        document.addEventListener('keydown',(e)=>{if(e.key==='Escape'){hide();}});\n      })();\n    </script>\n  </body>\n</html>`);

});

router.get('/log/:sessionId', (req, res) => {
  const sid = String(req.params.sessionId || '');
  const session = auroraSessions.find(s => s.sessionId === sid);
  if (!session || !session.qemuLog) return res.status(404).send('Not found');
  const logPath = path.join(path.dirname(QEMU_IMG), session.qemuLog);
  if (!fs.existsSync(logPath)) return res.status(404).send('Log not found');
  res.set('Content-Type', 'text/plain; charset=utf-8');
  const stream = fs.createReadStream(logPath);
  stream.pipe(res);
});

export default router;
