import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, Copy, Plus, Send, Trash2 } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import type { ChatMessage, FeatureCosts, KeyAiProfile } from '../../types/keyai';

interface AiChatViewProps {
  profile: KeyAiProfile;
  featureCosts: FeatureCosts;
  onCreditsUpdated: () => Promise<void>;
}

const PERSONA_PRESETS = [
  { id: 'general', label: 'General Assistant', prompt: '' },
  {
    id: 'creative',
    label: 'Creative Director',
    prompt:
      'You are a world-class creative director. Provide crisp, original ideas, visual concepts, and persuasive copy.',
  },
  {
    id: 'engineer',
    label: 'Senior Engineer',
    prompt:
      'You are a senior software architect. Give accurate, production-ready code and clear technical explanations.',
  },
  {
    id: 'tutor',
    label: 'Clear Tutor',
    prompt:
      'You are a patient, crystal-clear educator. Break down complex topics step-by-step with intuitive examples.',
  },
];

const QUICK_PROMPTS = [
  'Outline a 5-part launch campaign for a minimalist hardware product',
  'Write a clean TypeScript debounce utility with unit tests',
  'Explain quantum key distribution using everyday analogies',
  'Draft 3 cinematic prompts for a twilight architectural video scene',
];

export const AiChatView: React.FC<AiChatViewProps> = ({
  profile,
  featureCosts,
  onCreditsUpdated,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [personaId, setPersonaId] = useState('general');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const sendMessage = async (textOverride?: string) => {
    const content = (textOverride ?? input).trim();
    if (!content || sending) return;

    setError(null);
    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}_u`,
      role: 'user',
      content,
      createdAt: Date.now(),
    };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    if (!textOverride) setInput('');
    setSending(true);

    try {
      const persona = PERSONA_PRESETS.find((p) => p.id === personaId);
      const res = await apiFetch<{
        reply: string;
        model: string;
        creditsRemaining: number;
        unlimited: boolean;
      }>('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: content,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
          systemPrompt: persona?.prompt || undefined,
        }),
      });

      const assistantMsg: ChatMessage = {
        id: `msg_${Date.now()}_a`,
        role: 'assistant',
        content: res.reply,
        model: res.model,
        createdAt: Date.now(),
      };
      setMessages([...nextHistory, assistantMsg]);
      await onCreditsUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reach KeyAi assistant.');
    } finally {
      setSending(false);
    }
  };

  const handleCopy = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1600);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8.5rem)] min-h-[540px] bg-[#141422] border border-white/10 rounded-2xl overflow-hidden">
      {/* Chat Header */}
      <div className="px-5 py-4 border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold font-display text-white">AI Chat Studio</h1>
          <p className="text-xs text-slate-400 font-mono tabular-nums">
            Model: gemini-4-hydrogen ·{' '}
            {profile.unlimitedCredits ? 'Unlimited' : `${featureCosts.chat} credit per message`}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            aria-label="Assistant persona"
            value={personaId}
            onChange={(e) => setPersonaId(e.target.value)}
            className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#0D0D16] border border-white/10 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
          >
            {PERSONA_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              setMessages([]);
              setError(null);
            }}
            className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#0D0D16] hover:bg-white/5 border border-white/10 text-xs text-slate-300 inline-flex items-center gap-1.5 transition-colors"
          >
            {messages.length > 0 ? <Trash2 className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            New Thread
          </button>
        </div>
      </div>

      {/* Messages Viewport */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto text-center space-y-6 py-8">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold font-display text-white">
                Ask KeyAi anything
              </h2>
              <p className="text-sm text-slate-400">
                Research, debug code, brainstorm campaigns, summarize documents, or draft scripts.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
              {QUICK_PROMPTS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => sendMessage(q)}
                  className="text-left p-4 rounded-xl bg-[#0D0D16] hover:bg-[#19192B] border border-white/10 hover:border-violet-500/40 text-xs text-slate-300 leading-relaxed transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-violet-600 text-white'
                    : 'bg-[#0D0D16] border border-white/10 text-slate-200'
                }`}
              >
                <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                {msg.role === 'assistant' && (
                  <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-between gap-4 text-[11px] text-slate-500">
                    <span className="font-mono">{msg.model || 'gemini-4-hydrogen'}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(msg.id, msg.content)}
                      className="inline-flex items-center gap-1 text-slate-400 hover:text-white transition-colors"
                    >
                      {copiedId === msg.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-4 py-3 bg-[#0D0D16] border border-white/10 text-xs text-slate-400">
              Generating response...
            </div>
          </div>
        )}
        <div ref={scrollEndRef} />
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mx-5 mb-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-2 text-xs text-rose-200">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void sendMessage();
        }}
        className="p-4 border-t border-white/10 bg-[#0F0F1B] flex items-end gap-3"
      >
        <textarea
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void sendMessage();
            }
          }}
          placeholder="Message KeyAi... (Press Enter to send, Shift+Enter for newline)"
          className="flex-1 resize-none px-4 py-2.5 rounded-xl bg-[#141422] border border-white/10 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="min-h-[44px] px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-medium transition-colors inline-flex items-center gap-2 shrink-0"
        >
          <Send className="w-4 h-4" />
          <span className="hidden sm:inline">Send</span>
        </button>
      </form>
    </div>
  );
};
