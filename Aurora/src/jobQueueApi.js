import axios from 'axios';
import https from 'https';

export default class JobQueueApi {
  constructor({ baseURL } = {}) {
    this.baseURL = baseURL || 'http://localhost:3000';
    this.axios = axios.create({
      baseURL: this.baseURL,
      httpsAgent: this.baseURL.startsWith('https://')
        ? new https.Agent({ rejectUnauthorized: false })
        : undefined,
    });
  }

  async list() {
    const { data } = await this.axios.get('/api/pipelineQueue');
    return data;
  }

  async enqueue(file, type, dbId = null, variant = null) {
    const { data } = await this.axios.post('/api/pipelineQueue', {
      file,
      type,
      dbId,
      variant,
    });
    return data;
  }

  async remove(id) {
    await this.axios.delete(`/api/pipelineQueue/${id}`);
    return true;
  }

  async removeByDbId(dbId) {
    await this.axios.delete(`/api/pipelineQueue/db/${dbId}`);
    return true;
  }

  async stopAll() {
    await this.axios.post('/api/pipelineQueue/stopAll');
    return true;
  }

  async pause() {
    await this.axios.post('/api/pipelineQueue/pause');
  }

  async resume() {
    await this.axios.post('/api/pipelineQueue/resume');
  }

  async state() {
    const { data } = await this.axios.get('/api/pipelineQueue/state');
    return data;
  }
}
