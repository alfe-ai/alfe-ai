import fs from 'fs';
import path from 'path';
import { extractProductUrl, extractPrintifyUrl } from './printifyUtils.js';

export default class PrintifyJobQueue {
  constructor(jobManager, options = {}) {
    this.jobManager = jobManager;
    this.jobs = [];
    this.current = null;
    this.uploadsDir = options.uploadsDir || '';
    this.upscaleScript = options.upscaleScript || '';
    this.printifyScript = options.printifyScript || '';
    this.printifyPriceScript = options.printifyPriceScript || '';
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
          return j;
        });
      }
    } catch (err) {
      // ignore if file doesn't exist or can't be read
    }
  }

  _saveJobs() {
    if (!this.persistencePath) return;
    try {
      fs.writeFileSync(
        this.persistencePath,
        JSON.stringify({ jobs: this.jobs }, null, 2)
      );
    } catch (err) {
      // ignore write errors
    }
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
      variant
    };
    this.jobs.push(job);
    this._saveJobs();
    this._processNext();
    return job;
  }

  list() {
    return this.jobs.map(j => ({
      id: j.id,
      file: j.file,
      type: j.type,
      status: j.status,
      jobId: j.jobId,
      resultPath: j.resultPath || null,
      productUrl: j.productUrl || null,
      dbId: j.dbId || null,
      variant: j.variant || null
    }));
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
    this._saveJobs();
    this._processNext();
    return true;
  }

  _processNext() {
    if (this.current) return;
    const job = this.jobs.find(j => j.status === 'queued');
    if (!job) return;
    this.current = job;
    job.status = 'running';
    this._saveJobs();

    let filePath = path.isAbsolute(job.file)
      ? job.file
      : path.join(this.uploadsDir, job.file);
    let script = '';
    if (job.type === 'upscale') {
      script = this.upscaleScript;
    } else if (job.type === 'printify' || job.type === 'printifyPrice') {
      script = job.type === 'printify' ? this.printifyScript : this.printifyPriceScript;
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

    const cwd = path.dirname(script);
    const args = [];
    if (job.type === 'printifyPrice') {
      let url = job.productUrl || null;
      if (!url && this.db) {
        url = this.db.getProductUrlForImage(`/uploads/${job.file}`);
        if (!url) {
          const status = this.db.getImageStatusForUrl(`/uploads/${job.file}`);
          url = extractPrintifyUrl(status || '');
        }
      }
      if (url) {
        args.push(url);
      } else {
        job.status = 'error';
        this.current = null;
        this._saveJobs();
        this._processNext();
        return;
      }
    } else {
      args.push(filePath);
    }
    const jmJob = this.jobManager.createJob(script, args, { cwd, file: job.file });
    job.jobId = jmJob.id;
    this.jobManager.addDoneListener(jmJob, () => {
      job.status = jmJob.status;
      job.resultPath = jmJob.resultPath;
      if (job.type === 'upscale') {
        const matches = [...jmJob.log.matchAll(/Final output saved to:\s*(.+)/gi)];
        const m = matches[matches.length - 1];
        if (m) {
          job.resultPath = m[1].trim();
          if (this.db) {
            const originalUrl = `/uploads/${job.file}`;
            this.db.setUpscaledImage(originalUrl, job.resultPath);
            this.db.setImageStatus(originalUrl, 'Upscaled');
          }
        }
      } else if (job.type === 'printify') {
        const url = extractProductUrl(jmJob.log);
        if (url) {
          job.productUrl = url;
          jmJob.productUrl = url;
          if (this.db) {
            const originalUrl = `/uploads/${job.file}`;
            this.db.setProductUrl(originalUrl, url);
          }
          job.resultPath = url;
        }
      }
      this.current = null;
      this._saveJobs();
      this._processNext();
    });
  }
}
