import child_process from "child_process";

export default class JobManager {
  constructor() {
    this.jobs = new Map();
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
    return job;
  }

  _append(job, chunk) {
    job.log += chunk;
    for (const l of job.listeners) l(chunk);
  }

  _notifyDone(job) {
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
    this._notifyDone(job);
  }
}
