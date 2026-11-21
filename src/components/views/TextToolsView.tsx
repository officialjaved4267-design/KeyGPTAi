import React, { useState } from 'react';
import { AlertCircle, Check, Copy, Languages, PenLine, Wand2 } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { syncCreationToFirestore } from '../../lib/firebase';
import type { CreationRecord, FeatureCosts, KeyAiProfile } from '../../types/keyai';

interface TextToolsViewProps {
  profile: KeyAiProfile;
  featureCosts: FeatureCosts;
  onCreditsUpdated: () => Promise<void>;
  onAddCreation: (creation: CreationRecord) => void;
}

const TONES = ['Professional', 'Concise', 'Friendly', 'Academic', 'Persuasive', 'Creative'];
const LANGUAGES = [
  'Spanish',
  'French',
  'German',
  'Japanese',
  'Korean',
  'Mandarin Chinese',
  'Arabic',
  'Hindi',
  'Portuguese',
  'Italian',
  'Dutch',
  'Turkish',
];
const CONTENT_TYPES = [
  'Blog Post',
  'Product Description',
  'Social Media Thread',
  'Marketing Email',
  'Video Script',
  'Executive Summary',
];

export const TextToolsView: React.FC<TextToolsViewProps> = ({
  profile,
  featureCosts,
  onCreditsUpdated,
  onAddCreation,
}) => {
  const [mode, setMode] = useState<'rewrite' | 'translate' | 'generate'>('rewrite');
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [tone, setTone] = useState('Professional');
  const [targetLanguage, setTargetLanguage] = useState('Spanish');
  const [contentType, setContentType] = useState('Blog Post');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ output: string; model: string }>('/api/ai/text-tools', {
        method: 'POST',
        body: JSON.stringify({
          mode,
          input: input.trim(),
          tone,
          targetLanguage,
          contentType,
        }),
      });
      setOutput(res.output);
      onAddCreation({
        id: `txt_${Date.now()}`,
        type: 'text',
        title:
          mode === 'rewrite'
            ? `Rewrite (${tone})`
            : mode === 'translate'
            ? `Translate to ${targetLanguage}`
            : contentType,
        prompt: input.trim(),
        model: res.model,
        textOutput: res.output,
        createdAt: Date.now(),
      });
      void syncCreationToFirestore({
        type: 'text_tool',
        prompt: input.trim(),
        model: res.model,
        summary: res.output,
      });
      await onCreditsUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Text operation failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-white">
            Text Rewrite, Translation & Content Studio
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Refine tone, translate fluently across languages, or generate structured copy ·{' '}
            <span className="font-mono tabular-nums text-violet-300">
              {profile.unlimitedCredits ? 'Unlimited' : `${featureCosts.text_tool} credit per run`}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#141422] border border-white/10 rounded-xl">
          <button
            type="button"
            onClick={() => setMode('rewrite')}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              mode === 'rewrite' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <PenLine className="w-3.5 h-3.5" />
            Rewrite
          </button>
          <button
            type="button"
            onClick={() => setMode('translate')}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              mode === 'translate' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Languages className="w-3.5 h-3.5" />
            Translate
          </button>
          <button
            type="button"
            onClick={() => setMode('generate')}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              mode === 'generate' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Wand2 className="w-3.5 h-3.5" />
            Generate
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-2.5 text-xs text-rose-200">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form
          onSubmit={handleRun}
          className="bg-[#141422] border border-white/10 rounded-2xl p-5 space-y-4 flex flex-col"
        >
          <div className="flex flex-wrap items-center gap-3">
            {mode === 'rewrite' && (
              <div className="flex-1 min-w-[180px] space-y-1">
                <label className="text-xs text-slate-400">Target Tone</label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-xl bg-[#0D0D16] border border-white/10 text-sm text-white focus:outline-none focus:border-violet-500"
                >
                  {TONES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {mode === 'translate' && (
              <div className="flex-1 min-w-[180px] space-y-1">
                <label className="text-xs text-slate-400">Target Language</label>
                <select
                  value={targetLanguage}
                  onChange={(e) => setTargetLanguage(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-xl bg-[#0D0D16] border border-white/10 text-sm text-white focus:outline-none focus:border-violet-500"
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang} value={lang}>
                      {lang}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {mode === 'generate' && (
              <>
                <div className="flex-1 min-w-[160px] space-y-1">
                  <label className="text-xs text-slate-400">Format</label>
                  <select
                    value={contentType}
                    onChange={(e) => setContentType(e.target.value)}
                    className="w-full min-h-[42px] px-3 rounded-xl bg-[#0D0D16] border border-white/10 text-sm text-white focus:outline-none focus:border-violet-500"
                  >
                    {CONTENT_TYPES.map((ct) => (
                      <option key={ct} value={ct}>
                        {ct}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 min-w-[160px] space-y-1">
                  <label className="text-xs text-slate-400">Tone</label>
                  <select
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    className="w-full min-h-[42px] px-3 rounded-xl bg-[#0D0D16] border border-white/10 text-sm text-white focus:outline-none focus:border-violet-500"
                  >
                    {TONES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>

          <textarea
            rows={10}
            required
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              mode === 'rewrite'
                ? 'Paste the text you want to rewrite and polish...'
                : mode === 'translate'
                ? 'Enter text in any language to translate...'
                : 'Describe the topic, audience, and key points to generate...'
            }
            className="flex-1 w-full p-4 rounded-xl bg-[#0D0D16] border border-white/10 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500 resize-none"
          />

          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            {loading
              ? 'Processing...'
              : mode === 'rewrite'
              ? 'Rewrite Text'
              : mode === 'translate'
              ? `Translate to ${targetLanguage}`
              : `Generate ${contentType}`}
          </button>
        </form>

        <div className="bg-[#141422] border border-white/10 rounded-2xl p-5 flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Output</h2>
            <button
              type="button"
              disabled={!output}
              onClick={handleCopy}
              className="min-h-[36px] px-3 py-1 rounded-lg bg-[#0D0D16] hover:bg-white/5 border border-white/10 disabled:opacity-40 text-xs text-slate-300 inline-flex items-center gap-1.5 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy Output'}
            </button>
          </div>

          <div className="flex-1 min-h-[260px] p-4 rounded-xl bg-[#0D0D16] border border-white/10 text-sm text-slate-200 whitespace-pre-wrap leading-relaxed overflow-y-auto">
            {output ? (
              output
            ) : (
              <span className="text-slate-500">
                Your transformed or generated text will appear here.
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
