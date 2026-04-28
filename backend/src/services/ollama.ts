import type { ChatMessage } from '@socialmind/shared';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
// Default model: aya-expanse:8b — Cohere's multilingual model, strong at Russian/Hebrew without language drift.
// Override per-context with OLLAMA_MODEL (general assistant) or OLLAMA_CHILD_MODEL (child helper).
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'aya-expanse:8b';
const OLLAMA_CHILD_MODEL = process.env.OLLAMA_CHILD_MODEL || OLLAMA_MODEL;

export async function chatWithOllama(messages: ChatMessage[], opts?: { model?: string; temperature?: number }): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: opts?.model ?? OLLAMA_MODEL,
      messages,
      stream: false,
      options: { temperature: opts?.temperature ?? 0.3 },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ollama_error: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { message?: { content?: string } };
  return data.message?.content ?? '';
}

export const helperModelName = OLLAMA_CHILD_MODEL;
