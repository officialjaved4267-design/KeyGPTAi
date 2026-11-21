import React from 'react';
import {
  ArrowUpRight,
  Coins,
  Film,
  Infinity as InfinityIcon,
  MessageSquare,
  ShieldCheck,
  SlidersHorizontal,
  Type,
} from 'lucide-react';
import type {
  CreationRecord,
  FeatureCosts,
  KeyAiProfile,
  WorkspaceSection,
} from '../../types/keyai';

interface DashboardOverviewProps {
  profile: KeyAiProfile;
  featureCosts: FeatureCosts;
  isAdmin: boolean;
  creations: CreationRecord[];
  onNavigate: (section: WorkspaceSection) => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  profile,
  featureCosts,
  isAdmin,
  creations,
  onNavigate,
}) => {
  const studioTools: Array<{
    id: WorkspaceSection;
    title: string;
    description: string;
    cost: string;
    icon: React.FC<{ className?: string }>;
  }> = [
    {
      id: 'chat',
      title: 'AI Chatbot',
      description: 'Ask any question, brainstorm, write code, or analyze ideas in multi-turn chat.',
      cost: `${featureCosts.chat} credit / msg`,
      icon: MessageSquare,
    },
    {
      id: 'text_tools',
      title: 'Text, Rewrite & Translate',
      description: 'Rewrite tone, translate across 25+ languages, and generate structured copy.',
      cost: `${featureCosts.text_tool} credit / run`,
      icon: Type,
    },
    {
      id: 'photo_editor',
      title: 'AI Photo Editor',
      description: 'Edit photos by prompt, remove backgrounds cleanly, and enhance image quality.',
      cost: `${featureCosts.image_edit} credits`,
      icon: SlidersHorizontal,
    },
    {
      id: 'video_editor',
      title: 'AI Video Editor & Subtitles',
      description:
        'Upload a video and say "Edit it" or describe a prompt to transform it, add subtitles, and apply effects.',
      cost: `${featureCosts.video_subtitles}–${featureCosts.video_edit} credits`,
      icon: Film,
    },
  ];

  const formatTimeRemaining = (target: number | null) => {
    if (!target) return 'No daily limit';
    const diff = Math.max(0, target - Date.now());
    const hrs = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hrs}h ${mins}m remaining`;
  };

  return (
    <div className="space-y-8">
      {/* Studio Welcome Banner */}
      <div className="bg-[#141422] border border-white/10 rounded-2xl p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <p className="text-xs font-medium text-violet-400">
            KeyAi Studio · One AI. Unlimited Creativity.
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold font-display text-white tracking-tight [text-wrap:balance]">
            Welcome back, {profile.username}
          </h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            Launch any creative AI tool below. Your credit balance and history update in real time
            across every studio module.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('chat')}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors whitespace-nowrap"
          >
            Open AI Chat
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => onNavigate('admin')}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#1D1A32] hover:bg-[#262242] border border-violet-500/35 text-violet-200 text-sm font-medium transition-colors inline-flex items-center gap-2 whitespace-nowrap"
            >
              <ShieldCheck className="w-4 h-4 text-violet-400" />
              Admin Portal
            </button>
          )}
        </div>
      </div>

      {/* 4-Column Account & Credit KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-[#141422] border border-white/10 rounded-2xl p-5 space-y-1.5">
          <p className="text-xs text-slate-400">Available Credits</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-white flex items-center gap-2">
            {profile.unlimitedCredits ? (
              <>
                <InfinityIcon className="w-6 h-6 text-violet-400" />
                Unlimited
              </>
            ) : (
              `${profile.credits} / 50`
            )}
          </p>
          <p className="text-xs text-slate-500">
            {profile.unlimitedCredits ? 'Unrestricted studio access' : 'Standard daily allowance'}
          </p>
        </div>

        <div className="bg-[#141422] border border-white/10 rounded-2xl p-5 space-y-1.5">
          <p className="text-xs text-slate-400">Next 24h Credit Reset</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-white">
            {profile.unlimitedCredits ? 'Exempt' : formatTimeRemaining(profile.nextCreditResetAt)}
          </p>
          <p className="text-xs text-slate-500">Auto-refills to 50 credits every 24 hours</p>
        </div>

        <div className="bg-[#141422] border border-white/10 rounded-2xl p-5 space-y-1.5">
          <p className="text-xs text-slate-400">Account Tier & Role</p>
          <p className="text-2xl font-bold font-display text-white capitalize">
            {profile.role.replace('_', ' ')}
          </p>
          <p className="text-xs text-slate-500 truncate">{profile.email}</p>
        </div>

        <div className="bg-[#141422] border border-white/10 rounded-2xl p-5 space-y-1.5">
          <p className="text-xs text-slate-400">Session Creations</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-white">
            {creations.length}
          </p>
          <button
            type="button"
            onClick={() => onNavigate('credits')}
            className="text-xs text-violet-400 hover:text-violet-300 inline-flex items-center gap-1 transition-colors"
          >
            <Coins className="w-3.5 h-3.5" />
            View Credit History
          </button>
        </div>
      </div>

      {/* Creative Studios Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold font-display text-white">AI Creative Studios</h2>
          <span className="text-xs text-slate-400">All tools connected to live Gemini models</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {studioTools.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => onNavigate(tool.id)}
                className="group text-left bg-[#141422] hover:bg-[#19192B] border border-white/10 hover:border-violet-500/40 rounded-2xl p-5 transition-colors flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-violet-600/15 border border-violet-500/25 flex items-center justify-center text-violet-300">
                      <Icon className="w-5 h-5" />
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-violet-300 transition-colors" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold font-display text-white">
                      {tool.title}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      {tool.description}
                    </p>
                  </div>
                </div>
                <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs text-slate-400 font-mono tabular-nums">
                  <span>{profile.unlimitedCredits ? '0 credits (Unlimited)' : tool.cost}</span>
                  <span className="text-violet-400 font-sans font-medium">Launch Studio</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Recent Creations */}
      {creations.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold font-display text-white">Recent Studio Outputs</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {creations.slice(0, 6).map((item) => (
              <div
                key={item.id}
                className="bg-[#141422] border border-white/10 rounded-2xl overflow-hidden flex flex-col"
              >
                {item.type === 'image' && item.dataUrl && (
                  <img
                    src={item.dataUrl}
                    alt={item.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-44 object-cover bg-[#0D0D16]"
                  />
                )}
                {item.type === 'video' && item.dataUrl && (
                  <video
                    src={item.dataUrl}
                    controls
                    className="w-full h-44 object-cover bg-black"
                  />
                )}
                <div className="p-4 space-y-1.5">
                  <p className="text-xs text-slate-400 font-mono tabular-nums">
                    {item.type.toUpperCase()} · {item.model}
                  </p>
                  <p className="text-sm font-medium text-white truncate">{item.title}</p>
                  <p className="text-xs text-slate-400 line-clamp-2">{item.prompt}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
