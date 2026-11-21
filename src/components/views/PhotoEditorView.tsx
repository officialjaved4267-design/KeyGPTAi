import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Download,
  Eraser,
  FlipHorizontal2,
  RotateCw,
  SlidersHorizontal,
  Sparkles,
  Upload,
  Wand2,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { syncCreationToFirestore } from '../../lib/firebase';
import { generateSampleStudioImage } from '../../lib/sampleAssets';
import type { CreationRecord, FeatureCosts, KeyAiProfile } from '../../types/keyai';

interface PhotoEditorViewProps {
  profile: KeyAiProfile;
  featureCosts: FeatureCosts;
  initialImageUrl?: string | null;
  onCreditsUpdated: () => Promise<void>;
  onAddCreation: (creation: CreationRecord) => void;
}

export const PhotoEditorView: React.FC<PhotoEditorViewProps> = ({
  profile,
  featureCosts,
  initialImageUrl,
  onCreditsUpdated,
  onAddCreation,
}) => {
  const [sourceUrl, setSourceUrl] = useState<string>(
    initialImageUrl || generateSampleStudioImage('product')
  );
  const [editedUrl, setEditedUrl] = useState<string | null>(null);
  const [instruction, setInstruction] = useState('');
  const [loadingOp, setLoadingOp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkerboard, setCheckerboard] = useState(false);

  // Real-time local canvas adjustments
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialImageUrl) {
      setSourceUrl(initialImageUrl);
      setEditedUrl(null);
      setCheckerboard(false);
    }
  }, [initialImageUrl]);

  const activeUrl = editedUrl || sourceUrl;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !activeUrl) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const swapDims = rotation % 180 !== 0;
      canvas.width = swapDims ? img.height : img.width;
      canvas.height = swapDims ? img.width : img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(flipped ? -1 : 1, 1);
      ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.restore();
    };
    img.src = activeUrl;
  }, [activeUrl, brightness, contrast, saturation, rotation, flipped]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSourceUrl(reader.result);
        setEditedUrl(null);
        setCheckerboard(false);
        resetLocalFilters();
      }
    };
    reader.readAsDataURL(file);
  };

  const resetLocalFilters = () => {
    setBrightness(100);
    setContrast(100);
    setSaturation(100);
    setRotation(0);
    setFlipped(false);
  };

  // Convert pure white studio cutout into real alpha-transparent PNG after AI BG removal
  const makeWhiteTransparent = (dataUrl: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d');
        if (!ctx) return resolve(dataUrl);
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, c.width, c.height);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i];
          const g = d[i + 1];
          const b = d[i + 2];
          if (r > 242 && g > 242 && b > 242) {
            d[i + 3] = 0;
          }
        }
        ctx.putImageData(imgData, 0, 0);
        resolve(c.toDataURL('image/png'));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  };

  const runAiOperation = async (operation: 'edit' | 'remove_bg' | 'enhance') => {
    if (operation === 'edit' && !instruction.trim()) {
      setError('Enter an editing instruction before applying AI Edit.');
      return;
    }
    setError(null);
    setLoadingOp(operation);

    try {
      const base64Source = canvasRef.current ? canvasRef.current.toDataURL('image/png') : activeUrl;
      const mimeType = base64Source.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png';

      const res = await apiFetch<{ imageDataUrl: string; model: string }>('/api/ai/image/edit', {
        method: 'POST',
        body: JSON.stringify({
          imageBase64: base64Source,
          mimeType,
          operation,
          instruction: instruction.trim(),
        }),
      });

      let finalUrl = res.imageDataUrl;
      if (operation === 'remove_bg') {
        finalUrl = await makeWhiteTransparent(res.imageDataUrl);
        setCheckerboard(true);
      } else {
        setCheckerboard(false);
      }

      setEditedUrl(finalUrl);
      resetLocalFilters();

      const label =
        operation === 'remove_bg'
          ? 'Background Removed'
          : operation === 'enhance'
          ? 'Quality Enhanced'
          : `Edited: ${instruction.trim().slice(0, 36)}`;

      onAddCreation({
        id: `edit_${Date.now()}`,
        type: 'image',
        title: label,
        prompt: instruction.trim() || label,
        model: res.model,
        dataUrl: finalUrl,
        createdAt: Date.now(),
      });

      void syncCreationToFirestore({
        type:
          operation === 'remove_bg'
            ? 'bg_remove'
            : operation === 'enhance'
            ? 'photo_enhance'
            : 'image_edit',
        prompt: instruction.trim() || label,
        model: res.model,
      });

      await onCreditsUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Photo editing failed.');
    } finally {
      setLoadingOp(null);
    }
  };

  const handleExport = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `keyai-photo-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-white">AI Photo Editor</h1>
          <p className="text-sm text-slate-400 mt-1">
            Edit photos with prompts, remove backgrounds, enhance quality, and export PNG ·{' '}
            <span className="font-mono tabular-nums text-violet-300">
              {profile.unlimitedCredits
                ? 'Unlimited'
                : `${featureCosts.image_edit} credits per AI tool`}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-[#141422] hover:bg-[#1B1B2E] border border-white/10 text-xs font-medium text-white inline-flex items-center gap-2 transition-colors"
          >
            <Upload className="w-4 h-4 text-violet-400" />
            Upload Photo
          </button>
          <button
            type="button"
            onClick={() => {
              setSourceUrl(generateSampleStudioImage('product'));
              setEditedUrl(null);
              setCheckerboard(false);
              resetLocalFilters();
            }}
            className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#141422] hover:bg-[#1B1B2E] border border-white/10 text-xs text-slate-300 transition-colors"
          >
            Sample Object
          </button>
          <button
            type="button"
            onClick={() => {
              setSourceUrl(generateSampleStudioImage('landscape'));
              setEditedUrl(null);
              setCheckerboard(false);
              resetLocalFilters();
            }}
            className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#141422] hover:bg-[#1B1B2E] border border-white/10 text-xs text-slate-300 transition-colors"
          >
            Sample Landscape
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
        {/* Controls Column */}
        <div className="xl:col-span-4 bg-[#141422] border border-white/10 rounded-2xl p-5 space-y-5">
          {/* AI Prompt Edit */}
          <div className="space-y-2.5">
            <label className="text-xs font-medium text-slate-300">AI Prompt Edit</label>
            <textarea
              rows={3}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="e.g. Place on a dark travertine pedestal with warm twilight rim lighting..."
              className="w-full p-3 rounded-xl bg-[#0D0D16] border border-white/10 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500 resize-none"
            />
            <button
              type="button"
              disabled={loadingOp !== null}
              onClick={() => runAiOperation('edit')}
              className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-medium inline-flex items-center justify-center gap-2 transition-colors"
            >
              <Wand2 className="w-4 h-4" />
              {loadingOp === 'edit' ? 'Applying AI Edit...' : 'Apply AI Edit'}
            </button>
          </div>

          {/* 1-Click AI Tools */}
          <div className="pt-4 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-2.5">
            <button
              type="button"
              disabled={loadingOp !== null}
              onClick={() => runAiOperation('remove_bg')}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[#0D0D16] hover:bg-[#19192B] border border-white/10 text-xs font-medium text-slate-200 inline-flex items-center justify-center gap-2 transition-colors"
            >
              <Eraser className="w-4 h-4 text-violet-400" />
              {loadingOp === 'remove_bg' ? 'Removing Background...' : 'Remove Background (PNG)'}
            </button>

            <button
              type="button"
              disabled={loadingOp !== null}
              onClick={() => runAiOperation('enhance')}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[#0D0D16] hover:bg-[#19192B] border border-white/10 text-xs font-medium text-slate-200 inline-flex items-center justify-center gap-2 transition-colors"
            >
              <Sparkles className="w-4 h-4 text-violet-400" />
              {loadingOp === 'enhance' ? 'Enhancing Quality...' : 'Enhance Photo Quality'}
            </button>
          </div>

          {/* Real-Time Canvas Color & Geometry */}
          <div className="pt-4 border-t border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-300 inline-flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-violet-400" />
                Live Adjustments
              </span>
              <button
                type="button"
                onClick={resetLocalFilters}
                className="text-xs text-violet-400 hover:text-violet-300"
              >
                Reset
              </button>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-400 font-mono tabular-nums">
                <span>Brightness</span>
                <span>{brightness}%</span>
              </div>
              <input
                type="range"
                min={40}
                max={180}
                value={brightness}
                onChange={(e) => setBrightness(Number(e.target.value))}
                className="w-full accent-violet-500"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-400 font-mono tabular-nums">
                <span>Contrast</span>
                <span>{contrast}%</span>
              </div>
              <input
                type="range"
                min={40}
                max={180}
                value={contrast}
                onChange={(e) => setContrast(Number(e.target.value))}
                className="w-full accent-violet-500"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-400 font-mono tabular-nums">
                <span>Saturation</span>
                <span>{saturation}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={200}
                value={saturation}
                onChange={(e) => setSaturation(Number(e.target.value))}
                className="w-full accent-violet-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setRotation((r) => (r + 90) % 360)}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#0D0D16] hover:bg-white/5 border border-white/10 text-xs text-slate-300 inline-flex items-center justify-center gap-1.5"
              >
                <RotateCw className="w-3.5 h-3.5" />
                Rotate 90°
              </button>
              <button
                type="button"
                onClick={() => setFlipped((f) => !f)}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#0D0D16] hover:bg-white/5 border border-white/10 text-xs text-slate-300 inline-flex items-center justify-center gap-1.5"
              >
                <FlipHorizontal2 className="w-3.5 h-3.5" />
                Flip X
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={handleExport}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-medium inline-flex items-center justify-center gap-2 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export Edited PNG
          </button>
        </div>

        {/* Canvas Preview */}
        <div className="xl:col-span-8 bg-[#141422] border border-white/10 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>{editedUrl ? 'Edited Result' : 'Original Photo'}</span>
            {editedUrl && (
              <button
                type="button"
                onClick={() => {
                  setEditedUrl(null);
                  setCheckerboard(false);
                }}
                className="text-violet-400 hover:text-violet-300"
              >
                Revert to Original
              </button>
            )}
          </div>

          <div
            className={`w-full rounded-xl overflow-hidden border border-white/10 flex items-center justify-center min-h-[420px] max-h-[620px] ${
              checkerboard ? 'checkerboard-bg' : 'bg-[#09090F]'
            }`}
          >
            <canvas
              ref={canvasRef}
              className="max-w-full max-h-[600px] object-contain"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
