#!/usr/bin/env node
const axios = require('axios');
const { Command } = require('commander');

const program = new Command();
const VALID_MODELS = [
  'sonar',
  'sonar-pro',
  'sonar-reasoning',
  'sonar-reasoning-pro',
  'sonar-deep-research',
  'r1-1776'
];

program
  .name('pquery')
  .description('Perplexity API CLI with citations')
  .argument('<query>', 'Your search query')
  .option(
    '-m, --model <model>',
    `AI model (choices: ${VALID_MODELS.join(', ')}, default: sonar-pro)`,
    'sonar-pro'
  )
  .option('-k, --key <key>', 'Perplexity API key (or set PERPLEXITY_API_KEY)');

program.parse();
const options = program.opts();
const query = program.args.join(' ');
const apiKey = options.key || process.env.PERPLEXITY_API_KEY;

function stripCitationBrackets(text) {
  return (text || '').replace(/\s*\[[0-9]+\]/g, '');
}

if (!VALID_MODELS.includes(options.model)) {
  console.error(`Invalid model. Choose one of: ${VALID_MODELS.join(', ')}`);
  process.exit(1);
}

if (!apiKey) {
  console.error('Error: API key required. Use --key or set PERPLEXITY_API_KEY');
  process.exit(1);
}

axios.post('https://api.perplexity.ai/chat/completions', {
  model: options.model,
  messages: [{ role: 'user', content: query }],
}, {
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
})
.then(response => {
  const result = response.data.choices?.[0]?.message || {};

  const clean = stripCitationBrackets(result.content);
  console.log(`\n${clean}\n`);

  if (result.citations && result.citations.length > 0) {
    console.log('Citations:');
    result.citations.forEach((cite, index) => {
      console.log(`[${index + 1}] ${cite.url}`);
    });
  } else {
    console.log('No citations found.');
  }
})
.catch(error => {
  console.error('Error:', error.response?.data?.error || error.message);
});
