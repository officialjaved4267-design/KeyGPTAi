import React from 'react';
import {
  Coins,
  Film,
  Infinity as InfinityIcon,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  ShieldCheck,
  SlidersHorizontal,
  Type,
  X,
} from 'lucide-react';
import { KeyAiLogo } from './KeyAiLogo';
import type { KeyAiProfile, WorkspaceSection } from '../types/keyai';

interface SidebarProps {
  profile: KeyAiProfile;
  isAdmin: boolean;
  activeSection: WorkspaceSection;
  onSelectSection: (section: WorkspaceSection) => void;
  onLogout: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

interface NavItem {
  id: WorkspaceSection;
  label: string;
  icon: React.FC<{ className?: string }>;
  group: 'Studio' | 'Visual' | 'Motion' | 'Account' | 'Admin';
}

export const Sidebar: React.FC<SidebarProps> = ({
  profile,
  isAdmin,
  activeSection,
  onSelectSection,
  onLogout,
  mobileOpen,
  onCloseMobile,
}) => {
  const navItems: NavItem[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard, group: 'Studio' },
    { id: 'chat', label: 'AI Chat', icon: MessageSquare, group: 'Studio' },
    { id: 'text_tools', label: 'Text & Translate', icon: Type, group: 'Studio' },
    { id: 'photo_editor', label: 'Photo Editor', icon: SlidersHorizontal, group: 'Visual' },
    { id: 'video_editor', label: 'Video Editor', icon: Film, group: 'Motion' },
    { id: 'credits', label: 'Credits & Profile', icon: Coins, group: 'Account' },
  ];

  if (isAdmin) {
    navItems.push({
      id: 'admin',
      label: 'Admin Portal',
      icon: ShieldCheck,
      group: 'Admin',
    });
  }

  const groups: Array<{ name: NavItem['group']; label: string }> = [
    { name: 'Studio', label: 'Core Studio' },
    { name: 'Visual', label: 'Visual Lab' },
    { name: 'Motion', label: 'Motion Lab' },
    { name: 'Account', label: 'Account & Ledger' },
  ];
  if (isAdmin) {
    groups.push({ name: 'Admin', label: 'Governance' });
  }

  const formatCountdown = (targetMs: number | null) => {
    if (!targetMs) return 'Unlimited';
    const diff = Math.max(0, targetMs - Date.now());
    const hrs = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `Resets in ${hrs}h ${mins}m`;
  };

  const sidebarContent = (
    <div className="h-full flex flex-col bg-[#0D0D17] border-r border-white/10 w-[264px]">
      {/* Brand Header */}
      <div className="px-5 py-5 border-b border-white/10 flex items-center justify-between">
        <KeyAiLogo size="md" showTagline />
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation"
          className="lg:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {groups.map((group) => {
          const items = navItems.filter((item) => item.group === group.name);
          return (
            <div key={group.name} className="space-y-1">
              <p className="px-3 text-xs font-medium text-slate-500">{group.label}</p>
              {items.map((item) => {
                const Icon = item.icon;
                const active = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSelectSection(item.id);
                      onCloseMobile();
                    }}
                    className={`w-full min-h-[42px] px-3 py-2 rounded-xl flex items-center gap-3 text-sm font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-violet-600/20 text-violet-200 border border-violet-500/35'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.04] border border-transparent'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        active ? 'text-violet-400' : 'text-slate-500'
                      }`}
                    />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Credit Balance & Profile Footer */}
      <div className="p-4 border-t border-white/10 space-y-3">
        <button
          type="button"
          onClick={() => {
            onSelectSection('credits');
            onCloseMobile();
          }}
          className="w-full text-left p-3.5 rounded-xl bg-[#141424] hover:bg-[#19192D] border border-white/10 transition-colors space-y-2"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Credit Balance</span>
            {profile.unlimitedCredits ? (
              <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-violet-300">
                <InfinityIcon className="w-3.5 h-3.5" />
                Unlimited
              </span>
            ) : (
              <span className="text-xs font-mono tabular-nums font-semibold text-white">
                {profile.credits} / 50
              </span>
            )}
          </div>
          {!profile.unlimitedCredits && (
            <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-violet-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, (profile.credits / 50) * 100)}%` }}
              />
            </div>
          )}
          <p className="text-[11px] text-slate-500 font-mono tabular-nums">
            {profile.unlimitedCredits
              ? 'Authorized unlimited access'
              : formatCountdown(profile.nextCreditResetAt)}
          </p>
        </button>

        <div className="flex items-center justify-between gap-2 px-1">
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{profile.username}</p>
            <p className="text-xs text-slate-500 truncate">
              {profile.role === 'user' ? profile.email : `${profile.role.replace('_', ' ')}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            title="Log Out"
            aria-label="Log Out"
            className="min-h-[40px] min-w-[40px] p-2 rounded-xl text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 border border-white/10 flex items-center justify-center transition-colors shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block shrink-0 h-screen sticky top-0">{sidebarContent}</aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{sidebarContent}</div>
        </div>
      )}
    </>
  );
};
