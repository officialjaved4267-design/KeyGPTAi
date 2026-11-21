import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Coins,
  Infinity as InfinityIcon,
  RefreshCw,
  ShieldCheck,
  User,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import type { CreditTransaction, FeatureCosts, KeyAiProfile } from '../../types/keyai';

const AUTHORITY_LABELS: Record<string, string> = {
  studio_chat: 'AI Chat Studio',
  studio_text: 'Text & Translate',
  studio_photo_edit: 'Photo Editor & Enhance',
  studio_video_edit: 'Video Editor & Subtitles',
  manage_users: 'Manage Users & Authorities',
  manage_credits: 'Manage Credits',
  manage_admins: 'Manage Admins & Invites',
  view_analytics: 'View Analytics',
  unlimited_ai: 'Unlimited AI Access',
};

interface CreditsProfileViewProps {
  profile: KeyAiProfile;
  featureCosts: FeatureCosts;
  isAdminAccount: boolean;
  onProfileRefreshed: () => Promise<void>;
}

export const CreditsProfileView: React.FC<CreditsProfileViewProps> = ({
  profile,
  featureCosts,
  isAdminAccount,
  onProfileRefreshed,
}) => {
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(true);
  const [username, setUsername] = useState(profile.username);
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = async () => {
    setLoadingTx(true);
    try {
      const res = await apiFetch<{ transactions: CreditTransaction[] }>('/api/credits/history');
      setTransactions(res.transactions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load credit history.');
    } finally {
      setLoadingTx(false);
    }
  };

  useEffect(() => {
    void loadHistory();
  }, [profile.credits, profile.unlimitedCredits]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAdminAccount) return;
    setSaving(true);
    setSavedNotice(null);
    setError(null);
    try {
      await apiFetch('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ username, displayName }),
      });
      await onProfileRefreshed();
      setSavedNotice('Profile updated successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update profile.');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (ms: number) =>
    new Date(ms).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-white">Credits & Account Profile</h1>
          <p className="text-sm text-slate-400 mt-1">
            Monitor your daily credit balance, 24-hour replenishment cycle, and complete audit
            history.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            void onProfileRefreshed();
            void loadHistory();
          }}
          className="min-h-[42px] px-4 py-2 rounded-xl bg-[#141422] hover:bg-[#1B1B2E] border border-white/10 text-xs font-medium text-white inline-flex items-center gap-2"
        >
          <RefreshCw className="w-3.5 h-3.5 text-violet-400" />
          Refresh Balance
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Profile Form */}
        <div className="lg:col-span-5 bg-[#141422] border border-white/10 rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-300">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold font-display text-white">Account Identity</h2>
              <p className="text-xs text-slate-400">Role: {profile.role.replace('_', ' ')}</p>
            </div>
          </div>

          {savedNotice && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              {savedNotice}
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200">
              {error}
            </div>
          )}

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Email</label>
              <input
                type="text"
                disabled
                value={profile.email}
                className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#0B0B12] border border-white/10 text-sm text-slate-400"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-400">Username</label>
              <input
                type="text"
                disabled={isAdminAccount}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#0D0D16] border border-white/10 text-sm text-white disabled:opacity-60 focus:outline-none focus:border-violet-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-400">Display Name</label>
              <input
                type="text"
                disabled={isAdminAccount}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#0D0D16] border border-white/10 text-sm text-white disabled:opacity-60 focus:outline-none focus:border-violet-500"
              />
            </div>

            {!isAdminAccount && (
              <button
                type="submit"
                disabled={saving}
                className="min-h-[42px] px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-medium"
              >
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
            )}
          </form>

          <div className="pt-4 border-t border-white/10 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
              <ShieldCheck className="w-4 h-4 text-violet-400" />
              Active Account Authorities
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(profile.permissions?.length
                ? profile.permissions
                : profile.authorities || []
              ).map((authKey) => (
                <div
                  key={authKey}
                  className="px-3 py-2 rounded-lg bg-[#0D0D16] border border-white/10 text-xs text-slate-200 flex items-center justify-between gap-2"
                >
                  <span className="truncate">{AUTHORITY_LABELS[authKey] || authKey}</span>
                  <span className="font-mono text-[10px] text-violet-300 shrink-0">{authKey}</span>
                </div>
              ))}
              {(profile.permissions?.length
                ? profile.permissions
                : profile.authorities || []
              ).length === 0 && (
                <p className="text-xs text-slate-500 sm:col-span-2">
                  No studio authorities are currently assigned to this account.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Credit Balance & Rate Card */}
        <div className="lg:col-span-7 bg-[#141422] border border-white/10 rounded-2xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/10">
            <div className="space-y-1">
              <p className="text-xs text-slate-400">Current Balance</p>
              <p className="text-3xl font-bold font-mono tabular-nums text-white flex items-center gap-2">
                {profile.unlimitedCredits ? (
                  <>
                    <InfinityIcon className="w-7 h-7 text-violet-400" />
                    Unlimited Credits
                  </>
                ) : (
                  <>
                    <Coins className="w-6 h-6 text-violet-400" />
                    {profile.credits} Credits
                  </>
                )}
              </p>
            </div>

            <div className="text-left sm:text-right space-y-1">
              <p className="text-xs text-slate-400 inline-flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-violet-400" />
                24-Hour Reset Policy
              </p>
              <p className="text-xs font-mono tabular-nums text-slate-300">
                {profile.unlimitedCredits
                  ? 'Unlimited access enabled'
                  : profile.nextCreditResetAt
                  ? `Next reset: ${formatDate(profile.nextCreditResetAt)}`
                  : '50 credits / 24h'}
              </p>
            </div>
          </div>

          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold text-slate-300">Feature Credit Rates</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-[#0D0D16] border border-white/10 flex justify-between">
                <span className="text-slate-300">AI Chat Message</span>
                <span className="font-mono tabular-nums text-white">{featureCosts.chat} cr</span>
              </div>
              <div className="p-3 rounded-xl bg-[#0D0D16] border border-white/10 flex justify-between">
                <span className="text-slate-300">Rewrite / Translate / Copy</span>
                <span className="font-mono tabular-nums text-white">
                  {featureCosts.text_tool} cr
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[#0D0D16] border border-white/10 flex justify-between">
                <span className="text-slate-300">Photo Edit / Enhance / BG Remove</span>
                <span className="font-mono tabular-nums text-white">
                  {featureCosts.image_edit} cr
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[#0D0D16] border border-white/10 flex justify-between">
                <span className="text-slate-300">AI Video Subtitles</span>
                <span className="font-mono tabular-nums text-white">
                  {featureCosts.video_subtitles} cr
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[#0D0D16] border border-white/10 flex justify-between sm:col-span-2">
                <span className="text-slate-300">AI Video Edit (Upload + Prompt)</span>
                <span className="font-mono tabular-nums text-white">
                  {featureCosts.video_edit} cr
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Transaction Ledger */}
      <div className="bg-[#141422] border border-white/10 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-base font-semibold font-display text-white">
            Credit Usage & Transaction History
          </h2>
          <span className="text-xs font-mono tabular-nums text-slate-400">
            {transactions.length} entries
          </span>
        </div>

        {loadingTx ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading ledger...</div>
        ) : transactions.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No credit transactions recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/10 text-slate-400">
                  <th className="py-3 px-5 font-medium">Time</th>
                  <th className="py-3 px-4 font-medium">Feature / Action</th>
                  <th className="py-3 px-4 font-medium">Type</th>
                  <th className="py-3 px-4 font-medium text-right">Delta</th>
                  <th className="py-3 px-4 font-medium text-right">Balance</th>
                  <th className="py-3 px-5 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-white/[0.02]">
                    <td className="py-3 px-5 font-mono tabular-nums text-slate-400 whitespace-nowrap">
                      {formatDate(tx.createdAt)}
                    </td>
                    <td className="py-3 px-4 text-white font-medium">{tx.feature}</td>
                    <td className="py-3 px-4 text-slate-400 capitalize">
                      {tx.type.replace('_', ' ')}
                    </td>
                    <td
                      className={`py-3 px-4 font-mono tabular-nums text-right font-medium ${
                        tx.amount > 0
                          ? 'text-emerald-400'
                          : tx.amount < 0
                          ? 'text-rose-400'
                          : 'text-violet-300'
                      }`}
                    >
                      {tx.amount > 0 ? `+${tx.amount}` : tx.amount === 0 ? '0' : tx.amount}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-right text-white">
                      {tx.unlimitedAfter ? 'Unlimited' : tx.balanceAfter}
                    </td>
                    <td className="py-3 px-5 text-slate-400 max-w-xs truncate">{tx.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
