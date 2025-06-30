import child_process from "child_process";
import fs from "fs";

export default class JobManager {
  constructor(options = {}) {
    this.jobs = new Map();
    this.history = [];
    this.historyMap = new Map();
    this.historyPath = options.historyPath || null;
    this._loadHistory();
  }

  _loadHistory() {
    if (!this.historyPath) return;
    try {
      const data = JSON.parse(fs.readFileSync(this.historyPath, "utf8"));
      if (Array.isArray(data)) {
        this.history = data;
        for (const rec of data) {
          this.historyMap.set(rec.id, rec);
        }
      }
    } catch (err) {
      // ignore errors
    }
  }

  _saveHistory() {
    if (!this.historyPath) return;
    try {
      fs.writeFileSync(this.historyPath, JSON.stringify(this.history, null, 2));
    } catch (err) {
      // ignore write errors
    }
  }

  createJob(command, args = [], { cwd, file } = {}) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const job = {
      id,
      command,
      args,
      cwd,
      file,
      resultPath: null,
      productUrl: null,
      status: "running",
      startTime: Date.now(),
      finishTime: null,
      log: "",
      listeners: [],
      doneListeners: [],
    };

    const child = child_process.spawn(command, args, { cwd });
    job.child = child;

    child.stdout.on("data", (chunk) => {
      this._append(job, chunk.toString());
    });

    child.stderr.on("data", (chunk) => {
      this._append(job, chunk.toString());
    });

    child.on("error", (err) => {
      job.status = "error";
      job.finishTime = Date.now();
      this._append(job, `[error] ${err.toString()}`);
      this._notifyDone(job);
    });

    child.on("close", (code) => {
      if (job.status === "running") {
        job.status = code === 0 ? "finished" : "failed";
      }
      job.finishTime = Date.now();
      this._append(job, `\n[process exited with code ${code}]`);
      this._notifyDone(job);
    });

    this.jobs.set(id, job);

    const record = {
      id,
      command,
      args,
      cwd,
      file,
      status: job.status,
      startTime: job.startTime,
      finishTime: null,
      resultPath: null,
      productUrl: null,
      log: "",
    };
    job.historyRecord = record;
    this.history.push(record);
    this.historyMap.set(id, record);
    this._saveHistory();
    return job;
  }

  _append(job, chunk) {
    job.log += chunk;
    if (job.historyRecord) job.historyRecord.log += chunk;
    for (const l of job.listeners) l(chunk);
  }

  _notifyDone(job) {
    if (job.historyRecord) {
      job.historyRecord.status = job.status;
      job.historyRecord.finishTime = job.finishTime;
      job.historyRecord.resultPath = job.resultPath;
      job.historyRecord.productUrl = job.productUrl;
      job.historyRecord.log = job.log;
      this._saveHistory();
    }
    for (const l of job.doneListeners) l();
  }

  getJob(id) {
    return this.jobs.get(id);
  }

  listJobs() {
    return Array.from(this.jobs.values()).map((j) => ({
      id: j.id,
      file: j.file,
      status: j.status,
      startTime: j.startTime,
      finishTime: j.finishTime,
      resultPath: j.resultPath,
      productUrl: j.productUrl,
    }));
  }

  listHistory() {
    return this.history.map((r) => ({
      id: r.id,
      file: r.file,
      command: r.command,
      status: r.status,
      startTime: r.startTime,
      finishTime: r.finishTime,
      resultPath: r.resultPath,
      productUrl: r.productUrl,
    }));
  }

  getHistory(id) {
    return this.historyMap.get(id);
  }

  addListener(job, listener) {
    job.listeners.push(listener);
  }

  removeListener(job, listener) {
    job.listeners = job.listeners.filter((l) => l !== listener);
  }

  addDoneListener(job, listener) {
    job.doneListeners.push(listener);
  }

  removeDoneListener(job, listener) {
    job.doneListeners = job.doneListeners.filter((l) => l !== listener);
  }

  stopJob(id) {
    const job = this.jobs.get(id);
    if (!job) return false;
    if (job.child && job.status === "running") {
      job.status = "stopped";
      job.child.kill();
      if (job.historyRecord) {
        job.historyRecord.status = job.status;
        this._saveHistory();
      }
    }
    return true;
  }

  /**
   * Force mark a job as finished if for some reason the child process
   * exits without emitting the normal close event.
   */
  forceFinishJob(id) {
    const job = this.jobs.get(id);
    if (!job || job.status !== "running") return;
    job.status = "finished";
    job.finishTime = Date.now();
    this._append(job, "\n[force finished]");
    if (job.historyRecord) {
      job.historyRecord.status = job.status;
      job.historyRecord.finishTime = job.finishTime;
      job.historyRecord.log = job.log;
      this._saveHistory();
    }
    this._notifyDone(job);
  }
}
