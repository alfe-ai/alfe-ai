#!/usr/bin/env node
/*────────────────────────────────────────────────────────────
  pplx.js – Perplexity CLI (2025-07-23)

  Quick setup
    mkdir pplx-cli && cd pplx-cli
    npm init -y && npm i axios dotenv
    export PERPLEXITY_API_KEY="pplx-XXXX..."
    node pplx.js            # interactive
    node pplx.js "hello"    # prompt passed via argv
────────────────────────────────────────────────────────────*/

require('dotenv').config();
const axios     = require('axios');
const readline  = require('readline');

function stripCitationBrackets(text){
  return (text || '').replace(/\s*\[[0-9]+\]/g, '');
}

const MODELS = [
  { id: 'sonar',                 note: 'lightweight, web-grounded' },
  { id: 'sonar-pro',             note: 'advanced search model' },
  { id: 'sonar-reasoning',       note: 'fast, real-time reasoning (search)' },
  { id: 'sonar-reasoning-pro',   note: 'higher-accuracy CoT reasoning' },
  { id: 'sonar-deep-research',   note: 'exhaustive long-form research' },
  { id: 'r1-1776',               note: 'offline conversational (no search)' }
];

// ────────────────────────────────────────────────────────────
function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(res => rl.question(q, ans => { rl.close(); res(ans.trim()); }));
}

(async () => {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    console.error('❌  PERPLEXITY_API_KEY not set'); process.exit(1);
  }

  // Show list / choose model
  console.log('\nSelect a Perplexity model:\n');
  MODELS.forEach((m, i) => console.log(`  ${i + 1}. ${m.id.padEnd(22)}– ${m.note}`));
  console.log('');

  let idx = await ask(`Enter number [1-${MODELS.length}] (default 2): `);
  if (!idx) idx = 2;                       // default sonar-pro
  if (!/^\d+$/.test(idx) || idx < 1 || idx > MODELS.length) {
    console.error('Invalid selection.'); process.exit(1);
  }
  const model = MODELS[idx - 1].id;

  // Get prompt
  const promptArg = process.argv.slice(2).join(' ').trim();
  const prompt = promptArg || await ask('Enter your prompt: ');
  if (!prompt) { console.error('Prompt cannot be empty.'); process.exit(1); }

  console.log(`\n🛈  Requesting ${model} …\n`);

  try {
    const { data } = await axios.post(
      'https://api.perplexity.ai/chat/completions',
      { model, messages: [{ role: 'user', content: prompt }], stream: false },
      { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
    );

    const msg = data.choices?.[0]?.message || {};
    const clean = stripCitationBrackets(msg.content);
    console.log(clean || '(no content)\n');

    if (msg.citations?.length) {
      console.log('— citations —');
      msg.citations.forEach((url, i) => console.log(`${i + 1}. ${url}`));
      console.log('');
    }
  } catch (err) {
    const msg = err.response?.data ? JSON.stringify(err.response.data, null, 2) : err.message;
    console.error('Error:\n', msg);
    process.exit(1);
  }
})();
