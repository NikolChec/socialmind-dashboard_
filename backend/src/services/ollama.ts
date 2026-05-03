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

// Streaming variant — yields content chunks as they arrive from Ollama.
// Caller is responsible for forwarding to client (e.g., as SSE).
export async function* streamFromOllama(
  messages: ChatMessage[],
  opts?: { model?: string; temperature?: number }
): AsyncGenerator<string> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: opts?.model ?? OLLAMA_MODEL,
      messages,
      stream: true,
      options: { temperature: opts?.temperature ?? 0.3 },
    }),
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new Error(`ollama_error: ${res.status} ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let leftover = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    leftover += decoder.decode(value, { stream: true });
    const lines = leftover.split('\n');
    leftover = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const chunk = JSON.parse(line) as { message?: { content?: string }; done?: boolean };
        const piece = chunk.message?.content ?? '';
        if (piece) yield piece;
      } catch { /* skip malformed line */ }
    }
  }
}

export const helperModelName = OLLAMA_CHILD_MODEL;
