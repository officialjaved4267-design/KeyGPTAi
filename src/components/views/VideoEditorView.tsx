import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Captions,
  Download,
  Film,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { syncCreationToFirestore } from '../../lib/firebase';
import type { CreationRecord, FeatureCosts, KeyAiProfile, SubtitleCue } from '../../types/keyai';

interface VideoEditorViewProps {
  profile: KeyAiProfile;
  featureCosts: FeatureCosts;
  onCreditsUpdated: () => Promise<void>;
  onAddCreation: (creation: CreationRecord) => void;
}

type ColorFilterId = 'none' | 'violet_dusk' | 'noir' | 'warm_film' | 'teal_orange' | 'crisp_hdr';
type SubtitleStyleId = 'cinematic' | 'bold' | 'minimal';

const FILTER_MAP: Record<ColorFilterId, { label: string; css: string }> = {
  none: { label: 'Original', css: 'none' },
  violet_dusk: { label: 'Violet Dusk', css: 'contrast(1.12) saturate(1.2) hue-rotate(-14deg)' },
  noir: { label: 'Noir B&W', css: 'grayscale(1) contrast(1.25) brightness(0.96)' },
  warm_film: { label: 'Warm Film', css: 'sepia(0.28) contrast(1.08) saturate(1.18)' },
  teal_orange: { label: 'Teal & Orange', css: 'contrast(1.15) saturate(1.28) brightness(1.02)' },
  crisp_hdr: { label: 'Crisp HDR', css: 'contrast(1.2) saturate(1.15) brightness(1.06)' },
};

const QUICK_EDIT_PROMPTS = [
  'Edit it',
  'Golden hour cinematic sunset lighting',
  'Cyberpunk neon rain atmosphere',
  'Clean studio color grade & crisp clarity',
  'Vintage 35mm film aesthetic',
];

const MAX_UPLOAD_BYTES = 70 * 1024 * 1024;

export const VideoEditorView: React.FC<VideoEditorViewProps> = ({
  profile,
  featureCosts,
  onCreditsUpdated,
  onAddCreation,
}) => {
  const [originalVideoUrl, setOriginalVideoUrl] = useState<string | null>(null);
  const [originalVideoBase64, setOriginalVideoBase64] = useState<string | null>(null);
  const [originalVideoMime, setOriginalVideoMime] = useState('video/mp4');
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoBase64, setVideoBase64] = useState<string | null>(null);
  const [videoMime, setVideoMime] = useState('video/mp4');
  const [isAiEdited, setIsAiEdited] = useState(false);

  const [aiInstruction, setAiInstruction] = useState('');
  const [subtitleLang, setSubtitleLang] = useState('English');
  const [subtitles, setSubtitles] = useState<SubtitleCue[]>([]);
  const [filterId, setFilterId] = useState<ColorFilterId>('none');
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyleId>('cinematic');
  const [vignette, setVignette] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loadingOp, setLoadingOp] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rafRef = useRef<number | null>(null);

  // Real-time canvas compositor loop rendering uploaded/edited video + effects + active subtitle cue
  useEffect(() => {
    const drawFrame = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= 2) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth || 1280;
          canvas.height = video.videoHeight || 720;
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.filter = FILTER_MAP[filterId].css;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          ctx.restore();

          if (vignette) {
            const grad = ctx.createRadialGradient(
              canvas.width / 2,
              canvas.height / 2,
              canvas.width * 0.25,
              canvas.width / 2,
              canvas.height / 2,
              canvas.width * 0.72
            );
            grad.addColorStop(0, 'rgba(0,0,0,0)');
            grad.addColorStop(1, 'rgba(0,0,0,0.62)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }

          const t = video.currentTime;
          const activeCue = subtitles.find((c) => t >= c.startSec && t <= c.endSec);
          if (activeCue && activeCue.text.trim()) {
            const fontSize = Math.max(18, Math.round(canvas.height * 0.045));
            ctx.font =
              subtitleStyle === 'bold'
                ? `700 ${fontSize}px Outfit, sans-serif`
                : `500 ${fontSize}px "Plus Jakarta Sans", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const y =
              subtitleStyle === 'minimal' ? canvas.height * 0.14 : canvas.height * 0.86;
            const metrics = ctx.measureText(activeCue.text);
            const padX = 20;
            const padY = 10;
            const boxW = Math.min(canvas.width - 40, metrics.width + padX * 2);
            const boxH = fontSize + padY * 2;

            if (subtitleStyle !== 'minimal') {
              ctx.fillStyle =
                subtitleStyle === 'bold' ? 'rgba(124, 58, 237, 0.88)' : 'rgba(9, 9, 15, 0.78)';
              ctx.beginPath();
              ctx.roundRect(canvas.width / 2 - boxW / 2, y - boxH / 2, boxW, boxH, 10);
              ctx.fill();
            }

            ctx.fillStyle = '#FFFFFF';
            ctx.fillText(activeCue.text, canvas.width / 2, y, canvas.width - 60);
          }
        }
      }
      rafRef.current = requestAnimationFrame(drawFrame);
    };

    rafRef.current = requestAnimationFrame(drawFrame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [filterId, vignette, subtitles, subtitleStyle, videoUrl]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  const loadVideoFile = (file: File) => {
    if (!file.type.startsWith('video/')) {
      setError('Please upload a valid video file (MP4, WebM, or MOV).');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('Video file must be under 70 MB.');
      return;
    }

    setError(null);
    const mime = file.type || 'video/mp4';
    const url = URL.createObjectURL(file);

    setUploadedFileName(file.name);
    setOriginalVideoUrl(url);
    setOriginalVideoMime(mime);
    setVideoUrl(url);
    setVideoMime(mime);
    setIsAiEdited(false);
    setPlaying(false);
    setCurrentTime(0);

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setOriginalVideoBase64(reader.result);
        setVideoBase64(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      loadVideoFile(file);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      loadVideoFile(file);
    }
  };

  const revertToOriginal = () => {
    if (!originalVideoUrl || !originalVideoBase64) return;
    setVideoUrl(originalVideoUrl);
    setVideoBase64(originalVideoBase64);
    setVideoMime(originalVideoMime);
    setIsAiEdited(false);
    setPlaying(false);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  };

  const handleAiVideoEdit = async (overrideInstruction?: string) => {
    if (!videoBase64) {
      setError('Please upload a video first before editing.');
      return;
    }
    const rawPrompt = (overrideInstruction ?? aiInstruction).trim() || 'Edit it';

    setError(null);
    setLoadingOp('edit');
    try {
      const res = await apiFetch<{ videoDataUrl: string; model: string }>('/api/ai/video/edit', {
        method: 'POST',
        body: JSON.stringify({
          videoBase64,
          mimeType: videoMime,
          instruction: rawPrompt,
        }),
      });
      setVideoUrl(res.videoDataUrl);
      setVideoBase64(res.videoDataUrl);
      setVideoMime('video/mp4');
      setIsAiEdited(true);
      setPlaying(false);

      onAddCreation({
        id: `ved_${Date.now()}`,
        type: 'video',
        title:
          rawPrompt.toLowerCase() === 'edit it'
            ? `AI Edited: ${uploadedFileName || 'Uploaded Video'}`
            : `Edited: ${rawPrompt.slice(0, 36)}`,
        prompt: rawPrompt,
        model: res.model,
        dataUrl: res.videoDataUrl,
        createdAt: Date.now(),
      });
      void syncCreationToFirestore({
        type: 'video_edit',
        prompt: rawPrompt,
        model: res.model,
      });
      await onCreditsUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI video editing failed.');
    } finally {
      setLoadingOp(null);
    }
  };

  const handleAutoSubtitles = async () => {
    if (!videoBase64) {
      setError('Please upload a video first to generate AI subtitles.');
      return;
    }
    setError(null);
    setLoadingOp('subtitles');
    try {
      const res = await apiFetch<{
        subtitles: Array<{ startSec: number; endSec: number; text: string }>;
        model: string;
      }>('/api/ai/video/subtitles', {
        method: 'POST',
        body: JSON.stringify({
          videoBase64,
          mimeType: videoMime,
          language: subtitleLang,
        }),
      });
      setSubtitles(
        res.subtitles.map((s, idx) => ({
          id: `cue_${Date.now()}_${idx}`,
          startSec: Number(s.startSec) || 0,
          endSec: Number(s.endSec) || 2,
          text: s.text || '',
        }))
      );
      await onCreditsUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Auto-subtitle generation failed.');
    } finally {
      setLoadingOp(null);
    }
  };

  const addManualCue = () => {
    const start = Math.round(currentTime * 10) / 10;
    setSubtitles((prev) => [
      ...prev,
      {
        id: `cue_${Date.now()}`,
        startSec: start,
        endSec: start + 2.5,
        text: 'New subtitle caption',
      },
    ]);
  };

  const exportSrt = () => {
    const fmt = (sec: number) => {
      const hrs = Math.floor(sec / 3600);
      const mins = Math.floor((sec % 3600) / 60);
      const secs = Math.floor(sec % 60);
      const ms = Math.round((sec % 1) * 1000);
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(
        secs
      ).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
    };
    const body = subtitles
      .map((c, idx) => `${idx + 1}\n${fmt(c.startSec)} --> ${fmt(c.endSec)}\n${c.text}\n`)
      .join('\n');
    const blob = new Blob([body], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `keyai-subtitles-${Date.now()}.srt`;
    a.click();
  };

  const downloadAiEditedMp4 = () => {
    if (!videoUrl) return;
    const a = document.createElement('a');
    a.href = videoUrl;
    a.download = `keyai-ai-edited-${Date.now()}.mp4`;
    a.click();
  };

  const exportCompositedVideo = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    setExporting(true);
    setError(null);
    try {
      video.pause();
      video.currentTime = 0;
      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });

      recorder.start();
      setPlaying(true);
      await video.play();
      await new Promise<void>((resolve) => {
        const onEnd = () => {
          video.removeEventListener('ended', onEnd);
          resolve();
        };
        video.addEventListener('ended', onEnd);
      });
      recorder.stop();
      setPlaying(false);
      await stopped;

      const outBlob = new Blob(chunks, { type: 'video/webm' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(outBlob);
      a.download = `keyai-edited-${Date.now()}.webm`;
      a.click();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Video export failed.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-white">
            AI Video Editor, Subtitles & Effects
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Upload a video, say &quot;Edit it&quot; or describe your edit prompt, add subtitles,
            and export ·{' '}
            <span className="font-mono tabular-nums text-violet-300">
              {profile.unlimitedCredits
                ? 'Unlimited'
                : `${featureCosts.video_edit} cr AI edit · ${featureCosts.video_subtitles} cr subtitles`}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleUpload}
            className="hidden"
          />
          {isAiEdited && originalVideoUrl && (
            <button
              type="button"
              onClick={revertToOriginal}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[#141422] hover:bg-[#1B1B2E] border border-white/10 text-xs font-medium text-slate-200 inline-flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4 text-violet-400" />
              Revert to Uploaded Video
            </button>
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-xs font-medium text-white inline-flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            {videoUrl ? 'Replace Video' : 'Upload Video'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-2.5 text-xs text-rose-200">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left Controls */}
        <div className="xl:col-span-4 space-y-5 bg-[#141422] border border-white/10 rounded-2xl p-5">
          {/* AI Video Prompt Edit */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-300">
                Describe Edit or Say &quot;Edit It&quot;
              </label>
              {uploadedFileName && (
                <span className="text-[11px] font-mono text-violet-300 truncate max-w-[140px]">
                  {uploadedFileName}
                </span>
              )}
            </div>

            <textarea
              rows={3}
              value={aiInstruction}
              onChange={(e) => setAiInstruction(e.target.value)}
              placeholder='Describe your edit (e.g. "Change background to neon city at night") or just say "Edit it"...'
              className="w-full p-3 rounded-xl bg-[#0D0D16] border border-white/10 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500 resize-none"
            />

            <div className="flex flex-wrap gap-1.5">
              {QUICK_EDIT_PROMPTS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setAiInstruction(preset)}
                  className="px-2.5 py-1 rounded-lg bg-[#0D0D16] hover:bg-[#19192B] border border-white/10 text-[11px] text-slate-300 transition-colors"
                >
                  {preset}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-2">
              <button
                type="button"
                disabled={!videoBase64 || loadingOp !== null}
                onClick={() => handleAiVideoEdit()}
                className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-medium inline-flex items-center justify-center gap-2"
              >
                <Wand2 className="w-4 h-4" />
                {loadingOp === 'edit'
                  ? 'Editing Uploaded Video...'
                  : aiInstruction.trim()
                  ? 'Edit Video with Prompt'
                  : 'Edit It (Auto AI Polish)'}
              </button>

              {aiInstruction.trim() && (
                <button
                  type="button"
                  disabled={!videoBase64 || loadingOp !== null}
                  onClick={() => handleAiVideoEdit('Edit it')}
                  className="w-full min-h-[40px] px-4 py-2 rounded-xl bg-[#0D0D16] hover:bg-[#19192B] border border-white/10 disabled:opacity-50 text-violet-200 text-xs font-medium inline-flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                  Quick &quot;Edit It&quot; Polish
                </button>
              )}
            </div>
          </div>

          {/* AI Auto-Subtitles */}
          <div className="pt-4 border-t border-white/10 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-medium text-slate-300">AI Auto-Subtitles</label>
              <select
                value={subtitleLang}
                onChange={(e) => setSubtitleLang(e.target.value)}
                className="px-2.5 py-1 rounded-lg bg-[#0D0D16] border border-white/10 text-xs text-white"
              >
                <option value="English">English</option>
                <option value="Spanish">Spanish</option>
                <option value="French">French</option>
                <option value="German">German</option>
                <option value="Japanese">Japanese</option>
              </select>
            </div>
            <button
              type="button"
              disabled={!videoBase64 || loadingOp !== null}
              onClick={handleAutoSubtitles}
              className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-[#0D0D16] hover:bg-[#19192B] border border-white/10 disabled:opacity-50 text-xs font-medium text-slate-200 inline-flex items-center justify-center gap-2"
            >
              <Captions className="w-4 h-4 text-violet-400" />
              {loadingOp === 'subtitles' ? 'Transcribing Video...' : 'Generate AI Subtitles'}
            </button>
          </div>

          {/* Visual Effects & Color Grading */}
          <div className="pt-4 border-t border-white/10 space-y-3">
            <p className="text-xs font-medium text-slate-300">Visual Color Effects</p>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(FILTER_MAP) as ColorFilterId[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilterId(key)}
                  className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs border transition-colors ${
                    filterId === key
                      ? 'bg-violet-600/25 border-violet-500 text-violet-200'
                      : 'bg-[#0D0D16] border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  {FILTER_MAP[key].label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="space-y-1">
                <label className="text-[11px] text-slate-400">Subtitle Style</label>
                <select
                  value={subtitleStyle}
                  onChange={(e) => setSubtitleStyle(e.target.value as SubtitleStyleId)}
                  className="w-full min-h-[38px] px-2.5 rounded-xl bg-[#0D0D16] border border-white/10 text-xs text-white"
                >
                  <option value="cinematic">Cinematic Box</option>
                  <option value="bold">Violet Creator</option>
                  <option value="minimal">Top Minimal</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-slate-400">Speed</label>
                <select
                  value={playbackRate}
                  onChange={(e) => setPlaybackRate(Number(e.target.value))}
                  className="w-full min-h-[38px] px-2.5 rounded-xl bg-[#0D0D16] border border-white/10 text-xs text-white font-mono"
                >
                  <option value={0.5}>0.5x</option>
                  <option value={1}>1.0x</option>
                  <option value={1.25}>1.25x</option>
                  <option value={1.5}>1.5x</option>
                  <option value={2}>2.0x</option>
                </select>
              </div>
            </div>

            <label className="flex items-center justify-between p-3 rounded-xl bg-[#0D0D16] border border-white/10 cursor-pointer">
              <span className="text-xs text-slate-300">Cinematic Vignette</span>
              <input
                type="checkbox"
                checked={vignette}
                onChange={(e) => setVignette(e.target.checked)}
                className="w-4 h-4 accent-violet-600"
              />
            </label>
          </div>

          <div className="space-y-2">
            {isAiEdited && videoUrl && (
              <button
                type="button"
                onClick={downloadAiEditedMp4}
                className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/35 text-violet-100 text-xs font-medium inline-flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download AI Edited MP4
              </button>
            )}
            <button
              type="button"
              disabled={!videoUrl || exporting}
              onClick={exportCompositedVideo}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 disabled:opacity-40 text-white text-xs font-medium inline-flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              {exporting ? 'Recording & Exporting WebM...' : 'Export Video with Effects & Subtitles'}
            </button>
          </div>
        </div>

        {/* Right Compositor & Subtitle Timeline */}
        <div className="xl:col-span-8 space-y-5">
          <div className="bg-[#141422] border border-white/10 rounded-2xl p-5 space-y-4">
            {!videoUrl ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                className={`min-h-[380px] rounded-xl border-2 border-dashed flex flex-col items-center justify-center text-center p-6 space-y-4 cursor-pointer transition-colors ${
                  dragOver
                    ? 'border-violet-400 bg-violet-500/10'
                    : 'border-white/15 bg-[#0D0D16] hover:border-violet-500/50 hover:bg-[#11111D]'
                }`}
              >
                <div className="w-14 h-14 rounded-2xl bg-violet-600/15 border border-violet-500/30 flex items-center justify-center text-violet-300">
                  <Film className="w-7 h-7" />
                </div>
                <div className="space-y-1.5">
                  <p className="text-base font-semibold text-white">
                    Upload a video to start editing
                  </p>
                  <p className="text-xs text-slate-400 max-w-md">
                    Drag and drop an MP4, WebM, or MOV file here (up to 70 MB), then say
                    &quot;Edit it&quot; or describe any edit prompt.
                  </p>
                </div>
                <span className="min-h-[40px] px-4 py-2 rounded-xl bg-violet-600 text-white text-xs font-medium inline-flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  Choose Video File
                </span>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>
                    {isAiEdited
                      ? 'AI Edited Video Preview'
                      : `Uploaded Video${uploadedFileName ? ` · ${uploadedFileName}` : ''}`}
                  </span>
                  {loadingOp === 'edit' && (
                    <span className="text-violet-300 font-medium">
                      Processing AI video edit...
                    </span>
                  )}
                </div>

                <video
                  ref={videoRef}
                  src={videoUrl}
                  playsInline
                  onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
                  onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
                  onEnded={() => setPlaying(false)}
                  className="hidden"
                />
                <div className="w-full rounded-xl overflow-hidden bg-black border border-white/10 flex items-center justify-center">
                  <canvas ref={canvasRef} className="w-full max-h-[440px] object-contain" />
                </div>

                {/* Transport Scrubber */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={togglePlay}
                    className="min-h-[40px] min-w-[40px] rounded-xl bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center shrink-0"
                  >
                    {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={duration || 1}
                    step={0.05}
                    value={currentTime}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (videoRef.current) videoRef.current.currentTime = val;
                      setCurrentTime(val);
                    }}
                    className="flex-1 accent-violet-500"
                  />
                  <span className="text-xs font-mono tabular-nums text-slate-400 shrink-0">
                    {currentTime.toFixed(1)}s / {duration.toFixed(1)}s
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Subtitle Cues Table */}
          <div className="bg-[#141422] border border-white/10 rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-white">Subtitle Timeline Cues</h2>
                <p className="text-xs text-slate-400">
                  Edit timestamps and captions or export standard .SRT files
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!videoUrl}
                  onClick={addManualCue}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#0D0D16] hover:bg-white/5 border border-white/10 disabled:opacity-40 text-xs text-white inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5 text-violet-400" />
                  Add Cue
                </button>
                <button
                  type="button"
                  disabled={subtitles.length === 0}
                  onClick={exportSrt}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#0D0D16] hover:bg-white/5 border border-white/10 disabled:opacity-40 text-xs text-slate-300 inline-flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download .SRT
                </button>
              </div>
            </div>

            {subtitles.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">
                No subtitle cues yet. Upload a video and use AI Auto-Subtitles or click &quot;Add
                Cue&quot;.
              </p>
            ) : (
              <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                {subtitles.map((cue) => (
                  <div
                    key={cue.id}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center p-2.5 rounded-xl bg-[#0D0D16] border border-white/10"
                  >
                    <div className="sm:col-span-2">
                      <input
                        type="number"
                        step={0.1}
                        min={0}
                        aria-label="Start seconds"
                        value={cue.startSec}
                        onChange={(e) =>
                          setSubtitles((prev) =>
                            prev.map((c) =>
                              c.id === cue.id ? { ...c, startSec: Number(e.target.value) } : c
                            )
                          )
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-[#141422] border border-white/10 text-xs font-mono tabular-nums text-white"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <input
                        type="number"
                        step={0.1}
                        min={0}
                        aria-label="End seconds"
                        value={cue.endSec}
                        onChange={(e) =>
                          setSubtitles((prev) =>
                            prev.map((c) =>
                              c.id === cue.id ? { ...c, endSec: Number(e.target.value) } : c
                            )
                          )
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-[#141422] border border-white/10 text-xs font-mono tabular-nums text-white"
                      />
                    </div>
                    <div className="sm:col-span-7">
                      <input
                        type="text"
                        aria-label="Subtitle text"
                        value={cue.text}
                        onChange={(e) =>
                          setSubtitles((prev) =>
                            prev.map((c) =>
                              c.id === cue.id ? { ...c, text: e.target.value } : c
                            )
                          )
                        }
                        className="w-full px-3 py-1.5 rounded-lg bg-[#141422] border border-white/10 text-xs text-white"
                      />
                    </div>
                    <div className="sm:col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() =>
                          setSubtitles((prev) => prev.filter((c) => c.id !== cue.id))
                        }
                        aria-label="Delete cue"
                        className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
