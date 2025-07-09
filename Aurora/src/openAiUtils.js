export function toPrompt(messages = []) {
  if (!Array.isArray(messages)) return String(messages || "");
  return (
    messages
      .map(m => `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content}`)
      .join("\n") + "\nAssistant:"
  );
}

export async function callOpenAiModel(client, model, options = {}) {
  const { messages = [], max_tokens, temperature, stream = false } = options;
  if (model === "codex-mini-latest") {
    const prompt = toPrompt(messages);
    return client.completions.create({
      model,
      prompt,
      max_tokens,
      temperature,
      stream: !!stream
    });
  }
  return client.chat.completions.create({
    model,
    messages,
    max_tokens,
    temperature,
    stream: !!stream
  });
}
