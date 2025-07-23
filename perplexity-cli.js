#!/usr/bin/env node
const axios = require('axios');
const { Command } = require('commander');

const program = new Command();
program
  .name('pquery')
  .description('Perplexity API CLI with citations')
  .argument('<query>', 'Your search query')
  .option('-m, --model <model>', 'AI model (default: sonar-medium-online)', 'sonar-medium-online')
  .option('-k, --key <key>', 'Perplexity API key (or set PERPLEXITY_API_KEY)');

program.parse();
const options = program.opts();
const query = program.args.join(' ');
const apiKey = options.key || process.env.PERPLEXITY_API_KEY;

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

  console.log(`\n${result.content}\n`);

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
