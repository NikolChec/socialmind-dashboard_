import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import type { ChatMessage } from '@socialmind/shared';
import { api } from '../lib/api';

interface Props {
  childId?: string;
  childName?: string;
}

function typewriteAssistant(
  fullText: string,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  onTick: () => void,
) {
  const TICK_MS = 18;
  let i = 0;
  // Start with an empty assistant message; we splice the text in.
  setMessages((m) => [...m, { role: 'assistant', content: '' }]);
  const timer = setInterval(() => {
    if (i >= fullText.length) {
      clearInterval(timer);
      return;
    }
    const remaining = fullText.length - i;
    const step = remaining > 200 ? 5 : remaining > 60 ? 2 : 1;
    const next = fullText.slice(0, i + step);
    i += step;
    setMessages((m) => {
      const copy = m.slice();
      const last = copy[copy.length - 1];
      if (last && last.role === 'assistant') copy[copy.length - 1] = { role: 'assistant', content: next };
      return copy;
    });
    onTick();
  }, TICK_MS);
}

export function AssistantPanel({ childId, childName }: Props) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setError(null);
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);
    setLoading(true);
    try {
      const res = await api.assistantChat(next, childId);
      // Letter-by-letter typewriter — same feel as the child-app helper. We already have
      // the full reply, so we just splice characters into the latest message at a fixed
      // cadence. Speeds up if the buffer is long so a wall-of-text doesn't feel sluggish.
      setLoading(false);
      typewriteAssistant(res.reply, setMessages, () =>
        requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }))
      );
    } catch (e) {
      const body = (e as { body?: { hint?: string; detail?: string } }).body;
      setError(body?.hint || body?.detail || t('assistant.unavailable'));
      setLoading(false);
    }
  }

  const suggestions = childId
    ? [
        t('assistant.sug_child_summarize', { name: childName }),
        t('assistant.sug_child_trend', { name: childName }),
        t('assistant.sug_child_draft'),
      ]
    : [
        t('assistant.sug_caseload_high'),
        t('assistant.sug_caseload_inactive'),
        t('assistant.sug_caseload_summary'),
      ];

  return (
    <section className="bg-card border border-line rounded-lg">
      <header className="px-5 py-3 border-b border-line flex items-center justify-between">
        <h2 className="font-medium">
          {t('assistant.panel_title')} {childId && <span className="text-muted text-xs">{t('assistant.panel_focused', { name: childName })}</span>}
        </h2>
        <span className="text-xs text-muted">Ollama</span>
      </header>

      <div ref={scrollRef} className="p-5 space-y-3 max-h-80 overflow-y-auto scrollbar-thin">
        {messages.length === 0 && (
          <div className="space-y-2">
            <div className="text-sm text-muted">{childId ? t('assistant.ask_child') : t('assistant.ask_caseload')}</div>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button key={s}
                  onClick={() => setInput(s)}
                  className="text-xs px-3 py-1.5 rounded-full bg-white/5 text-slate-300 hover:bg-white/10 border border-line"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : ''}`}>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
              m.role === 'user'
                ? 'bg-accent/20 text-slate-100 whitespace-pre-wrap'
                : 'bg-white/5 text-slate-200 chat-md'
            }`}>
              {m.role === 'assistant' ? (
                <ReactMarkdown
                  components={{
                    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                    strong: ({ children }) => <strong className="font-bold text-white">{children}</strong>,
                    em: ({ children }) => <em className="italic">{children}</em>,
                    ul: ({ children }) => <ul className="list-disc ms-5 my-1 space-y-0.5">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal ms-5 my-1 space-y-0.5">{children}</ol>,
                    code: ({ children }) => <code className="bg-ink/60 px-1 py-0.5 rounded text-[0.85em]">{children}</code>,
                    a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" className="text-accent underline">{children}</a>,
                  }}
                >
                  {m.content}
                </ReactMarkdown>
              ) : (
                m.content
              )}
            </div>
          </div>
        ))}
        {loading && <div className="text-xs text-muted">{t('assistant.thinking')}</div>}
        {error && <div className="text-xs text-red-400">{error}</div>}
      </div>

      <div className="border-t border-line p-3 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={childId ? t('assistant.placeholder_child', { name: childName }) : t('assistant.placeholder_caseload')}
          className="flex-1 bg-ink border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent"
        />
        <button
          onClick={send} disabled={loading || !input.trim()}
          className="px-4 py-2 rounded-md bg-accent hover:bg-accent/90 disabled:opacity-50 text-sm font-medium"
        >
          {t('assistant.send')}
        </button>
      </div>
    </section>
  );
}
