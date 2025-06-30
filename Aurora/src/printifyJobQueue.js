import fs from 'fs';
import path from 'path';
import { extractProductUrl, extractPrintifyUrl, extractUpdatedTitle } from './printifyUtils.js';
import child_process from "child_process";

export default class PrintifyJobQueue {
  constructor(jobManager, options = {}) {
    this.jobManager = jobManager;
    this.jobs = [];
    this.current = null;
    this.paused = false;
    this.uploadsDir = options.uploadsDir || '';
    this.upscaleScript = options.upscaleScript || '';
    this.printifyScript = options.printifyScript || '';
    this.printifyPriceScript = options.printifyPriceScript || '';
    this.printifyTitleFixScript = options.printifyTitleFixScript || '';
    this.runPuppetScript = options.runPuppetScript || '';
    this.db = options.db || null;
    this.persistencePath = options.persistencePath || null;

    this._loadJobs();
    this._processNext();
  }

  _loadJobs() {
    if (!this.persistencePath) return;
    try {
      const data = JSON.parse(fs.readFileSync(this.persistencePath, 'utf8'));
      if (Array.isArray(data.jobs)) {
        this.jobs = data.jobs.map(j => {
          if (j.status === 'running') j.status = 'queued';
          let dbId = j.dbId || null;
          if (dbId === null && this.db) {
            try {
              dbId = this.db.getImageIdForUrl(`/uploads/${j.file}`);
            } catch (e) {
              dbId = null;
            }
          }
          return {
            id: j.id,
            file: j.file,
            type: j.type,
            status: j.status,
            jobId: j.jobId || null,
            resultPath: j.resultPath || null,
            productUrl: j.productUrl || null,
            dbId,
            variant: j.variant || null,
            startTime: j.startTime || null,
            finishTime: j.finishTime || null,
          };
        });
      }
      this.paused = !!data.paused;
    } catch (err) {
      // ignore if file doesn't exist or can't be read
    }
  }

  _saveJobs() {
    if (!this.persistencePath) return;
    try {
      fs.writeFileSync(
        this.persistencePath,
        JSON.stringify({ jobs: this.jobs, paused: this.paused }, null, 2)
      );
    } catch (err) {
      // ignore write errors
    }
  }

  pause() {
    if (!this.paused) {
      this.paused = true;
      this._saveJobs();
    }
  }

  resume() {
    if (this.paused) {
      this.paused = false;
      this._saveJobs();
      this._processNext();
    }
  }

  isPaused() {
    return this.paused;
  }

  enqueue(file, type, dbId = null, variant = null) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const job = {
      id,
      file,
      type,
      status: 'queued',
      jobId: null,
      resultPath: null,
      productUrl: null,
      dbId,
      variant,
      startTime: null,
      finishTime: null
    };
    this.jobs.push(job);
    console.debug('[PrintifyJobQueue Debug] Enqueued job =>', job);
    this._saveJobs();
    this._processNext();
    return job;
  }

  list() {
    return this.jobs.map(j => {
      let dbId = j.dbId || null;
      if (dbId === null && this.db) {
        try {
          dbId = this.db.getImageIdForUrl(`/uploads/${j.file}`);
          if (dbId !== null && dbId !== undefined) j.dbId = dbId;
        } catch (e) {
          dbId = null;
        }
      }
      const location =
        j.type === 'printifyFixMockups' || j.type === 'printifyFinalize'
          ? 'ProgramaticPuppet'
          : 'Local';
      return {
        id: j.id,
        file: j.file,
        type: j.type,
        location,
        status: j.status,
        jobId: j.jobId,
        resultPath: j.resultPath || null,
        productUrl: j.productUrl || null,
        dbId,
        variant: j.variant || null,
        startTime: j.startTime || null,
        finishTime: j.finishTime || null
      };
    });
  }

  remove(id) {
    const idx = this.jobs.findIndex(j => j.id === id);
    if (idx === -1) return false;
    const job = this.jobs[idx];
    if (job.status === 'running' && job.jobId) {
      this.jobManager.stopJob(job.jobId);
    }
    this.jobs.splice(idx, 1);
    if (this.current && this.current.id === id) {
      this.current = null;
    }
    console.debug('[PrintifyJobQueue Debug] Removed job =>', job);
    this._saveJobs();
    this._processNext();
    return true;
  }

  removeByDbId(dbId) {
    let removed = false;
    for (let i = this.jobs.length - 1; i >= 0; i--) {
      const job = this.jobs[i];
      if (job.dbId === dbId) {
        if (job.status === 'running' && job.jobId) {
          this.jobManager.stopJob(job.jobId);
        }
        this.jobs.splice(i, 1);
        if (this.current && this.current.id === job.id) {
          this.current = null;
        }
        console.debug('[PrintifyJobQueue Debug] Removed job =>', job);
        removed = true;
      }
    }
    if (removed) {
      this._saveJobs();
      this._processNext();
    }
    return removed;
  }

  stopAll() {
    for (const job of this.jobs) {
      if (job.status === 'running' && job.jobId) {
        this.jobManager.stopJob(job.jobId);
      }
    }
    console.debug('[PrintifyJobQueue Debug] stopAll clearing', this.jobs.length, 'jobs');
    this.jobs = [];
    this.current = null;
    this._saveJobs();
  }

  _processNext() {
    if (this.current || this.paused) return;
    const job = this.jobs.find(j => j.status === 'queued');
    if (!job) return;
    console.debug('[PrintifyJobQueue Debug] Starting job =>', job);
    this.current = job;
    job.status = 'running';
    job.startTime = Date.now();
    job.finishTime = null;
    this._saveJobs();

    let filePath = path.isAbsolute(job.file)
      ? job.file
      : path.join(this.uploadsDir, job.file);
    let script = '';
    if (job.type === 'upscale') {
      script = this.upscaleScript;
    } else if (
      job.type === 'printify' ||
      job.type === 'printifyPrice' ||
      job.type === 'printifyTitleFix' ||
      job.type === 'printifyFixMockups' ||
      job.type === 'printifyFinalize'
    ) {
      script =
        job.type === 'printify'
          ? this.printifyScript
          : job.type === 'printifyPrice'
          ? this.printifyPriceScript
          : job.type === 'printifyTitleFix'
          ? this.printifyTitleFixScript
          : this.runPuppetScript;
      const ext = path.extname(filePath);
      const base = path.basename(filePath, ext);
      const searchDir = path.isAbsolute(job.file)
        ? path.dirname(filePath)
        : this.uploadsDir;
      const normalCandidates = [
        ...(job.dbId ? [path.join(searchDir, `${job.dbId}_upscale${ext}`)] : []),
        path.join(searchDir, `${base}_4096${ext}`),
        path.join(searchDir, `${base}-4096${ext}`),
        path.join(searchDir, `${base}_upscaled${ext}`),
        path.join(searchDir, `${base}-upscaled${ext}`)
      ];
      const nobgCandidates = [
        ...(job.dbId ? [path.join(searchDir, `${job.dbId}_nobg${ext}`)] : []),
        path.join(searchDir, `${base}_4096_nobg${ext}`),
        path.join(searchDir, `${base}-4096-nobg${ext}`),
        path.join(searchDir, `${base}_upscaled_nobg${ext}`),
        path.join(searchDir, `${base}-upscaled-nobg${ext}`),
        path.join(searchDir, `${base}_4096_no_bg${ext}`),
        path.join(searchDir, `${base}-4096-no_bg${ext}`),
        path.join(searchDir, `${base}_4096-no-bg${ext}`),
        path.join(searchDir, `${base}-4096-no-bg${ext}`),
        path.join(searchDir, `${base}_upscaled_no_bg${ext}`),
        path.join(searchDir, `${base}-upscaled-no_bg${ext}`),
        path.join(searchDir, `${base}_upscaled-no-bg${ext}`),
        path.join(searchDir, `${base}-upscaled-no-bg${ext}`)
      ];

      const findFirst = (cands) => {
        for (const p of cands) {
          if (fs.existsSync(p)) return p;
        }
        return null;
      };

      let normalFound = findFirst(normalCandidates);
      if (!normalFound && this.db) {
        const fromDb = this.db.getUpscaledImage(`/uploads/${job.file}`);
        if (fromDb && fs.existsSync(fromDb)) normalFound = fromDb;
      }

      let nobgFound = findFirst(nobgCandidates);
      if (!nobgFound && this.db) {
        const fromDb = this.db.getUpscaledImage(`/uploads/${job.file}-nobg`);
        if (fromDb && fs.existsSync(fromDb)) nobgFound = fromDb;
      }

      if (job.variant === 'nobg') {
        if (nobgFound) filePath = nobgFound;
        else if (normalFound) filePath = normalFound;
      } else if (job.variant === 'normal') {
        if (normalFound) filePath = normalFound;
      } else {
        if (nobgFound) filePath = nobgFound;
        else if (normalFound) filePath = normalFound;
      }
    } else {
      job.status = 'error';
      this.current = null;
      this._saveJobs();
      this._processNext();
      return;
    }

    if (!fs.existsSync(filePath) || !fs.existsSync(script)) {
      job.status = 'error';
      this.current = null;
      this._saveJobs();
      this._processNext();
      return;
    }

    let colorArgs = [];
    if (job.type === 'printify') {
      try {
        const colorScript = path.join(__dirname, '../scripts/detectColors.js');
        const detected = child_process
          .execFileSync(colorScript, [filePath], { encoding: 'utf8' })
          .trim();
        console.log('[PrintifyJobQueue] Detected colors:', detected);
        colorArgs = detected
          .split(/\s*,\s*/)
          .map(c => c.trim())
          .filter(Boolean)
          .slice(0, 3);
      } catch (err) {
        console.error(
          '[PrintifyJobQueue] Color detection failed:',
          err.message || err
        );
      }
    }

    const cwd = path.dirname(script);
    const args = [];
    if (job.type === 'printifyFixMockups' || job.type === 'printifyFinalize') {
      args.push(job.type === 'printifyFixMockups' ? 'PrintifyFixMockups' : 'PrintifyFinalize');
    }
    if (
      job.type === 'printifyPrice' ||
      job.type === 'printifyTitleFix' ||
      job.type === 'printifyFixMockups' ||
      job.type === 'printifyFinalize'
    ) {
      let url = job.productUrl || null;
      if (!url && this.db) {
        url = this.db.getProductUrlForImage(`/uploads/${job.file}`);
        if (!url) {
          const status = this.db.getImageStatusForUrl(`/uploads/${job.file}`);
          url = extractPrintifyUrl(status || '');
        }
      }
      if (url) {
        job.productUrl = url;
        console.debug('[PrintifyJobQueue Debug] Resolved productUrl =>', url);
        if (job.type === 'printifyPrice' || job.type === 'printifyFixMockups' || job.type === 'printifyFinalize') {
          args.push(url);
        } else {
          const productId = (() => {
            try {
              return new URL(url).pathname.split('/').pop();
            } catch {
              return url.split('/').pop().split('?')[0];
            }
          })();
          args.push(productId, filePath);
        }
      } else {
        job.status = 'error';
        this.current = null;
        this._saveJobs();
        this._processNext();
        return;
      }
    } else {
      args.push(filePath);
      if (job.type === 'printify' && colorArgs.length) {
        args.push(...colorArgs);
      }
    }
    console.log(`[PrintifyJobQueue] Running ${job.type} with script: ${script}`);
    console.debug('[PrintifyJobQueue Debug] args =>', args.join(' '));
    const jmJob = this.jobManager.createJob(script, args, { cwd, file: job.file });
    job.jobId = jmJob.id;
    job.startTime = jmJob.startTime;
    this.jobManager.addDoneListener(jmJob, () => {
      job.status = jmJob.status;
      job.finishTime = jmJob.finishTime;
      job.resultPath = jmJob.resultPath;
      const originalUrl = `/uploads/${job.file}`;
      if (job.type === 'upscale') {
        const matches = [...jmJob.log.matchAll(/Final output saved to:\s*(.+)/gi)];
        const m = matches[matches.length - 1];
        if (m) {
          job.resultPath = m[1].trim();
          if (this.db) {
            this.db.setUpscaledImage(originalUrl, job.resultPath);
          }
        }
      } else if (job.type === 'printify') {
        const url = extractProductUrl(jmJob.log);
        if (url) {
          job.productUrl = url;
          jmJob.productUrl = url;
          if (this.db) {
            this.db.setProductUrl(originalUrl, url);
          }
          job.resultPath = url;
        }
      } else if (job.type === 'printifyTitleFix') {
        const title = extractUpdatedTitle(jmJob.log);
        if (title && this.db) {
          this.db.setImageTitle(originalUrl, title);
        }
      }
      if (this.db) {
        const statusMap = {
          upscale: 'Upscaled',
          printify: 'Printify Price Puppet',
          printifyPrice: 'Printify API Updates',
          printifyTitleFix: 'Printify API Title Fix',
          printifyFixMockups: 'Printify Fix Mockups',
          printifyFinalize: 'Printify Finalize'
        };
        const status = statusMap[job.type] || job.type;
        this.db.setImageStatus(originalUrl, status);
      }
      this.current = null;
      this._saveJobs();
      this._processNext();
    });
  }
}
