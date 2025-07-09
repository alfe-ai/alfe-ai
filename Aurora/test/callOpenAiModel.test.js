import assert from 'assert';
import { callOpenAiModel, toPrompt } from '../src/openAiUtils.js';

class DummyClient {
  constructor() {
    this.called = { completions: null, chat: null };
    this.completions = { create: opts => { this.called.completions = opts; return Promise.resolve(opts); } };
    this.chat = { completions: { create: opts => { this.called.chat = opts; return Promise.resolve(opts); } } };
  }
}

(async () => {
  const client = new DummyClient();
  const messages = [{ role: 'user', content: 'hello' }];
  await callOpenAiModel(client, 'codex-mini-latest', { messages });
  assert.ok(client.called.completions, 'completions endpoint should be used');
  assert.strictEqual(client.called.completions.prompt, toPrompt(messages));
  await callOpenAiModel(client, 'gpt-4', { messages });
  assert.ok(client.called.chat, 'chat completions endpoint should be used');
  console.log('All tests passed');
})();
