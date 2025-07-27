// Config for reasoning menu tooltip
// Reorder chatModels or reasoningModels arrays to change the order shown
window.REASONING_TOOLTIP_CONFIG = {
  chatModels: [
    { name: 'deepseek/deepseek-chat-v3-0324' },
    { name: 'openai/gpt-4o-mini' },
    { name: 'openai/gpt-4.1-mini' },
    { name: 'openai/gpt-4o', label: 'pro' },
    { name: 'openai/gpt-4.1', label: 'pro' },
    { name: 'anthropic/claude-3.7-sonnet', label: 'pro' },
    { name: 'anthropic/claude-sonnet-4', label: 'ultimate' }
  ],
  reasoningModels: [
    { name: 'deepseek/deepseek-r1-distill-llama-70b' },
    { name: 'deepseek/deepseek-r1-0528' },
    { name: 'openai/o4-mini', label: 'pro' },
    { name: 'openai/o4-mini-high', label: 'pro' },
    { name: 'openai/codex-mini', label: 'pro' },
    { name: 'openrouter/perplexity/r1-1776', label: 'pro', note: 'openrouter - offline conversational (no search)' },
    { name: 'openai/o3', label: 'ultimate' },
    { name: 'anthropic/claude-opus-4', label: 'ultimate' },
    { name: 'r1-1776', note: 'offline conversational (no search)' },
    { name: 'perplexity/r1-1776', note: 'offline conversational (no search)' }
  ]
};
