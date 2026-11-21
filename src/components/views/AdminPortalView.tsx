import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Coins,
  Copy,
  Infinity as InfinityIcon,
  KeyRound,
  RefreshCw,
  Search,
  ShieldCheck,
  Ticket,
  Trash2,
  UserCheck,
  UserPlus,
  UserX,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import type {
  AdminAccountRecord,
  AdminActivityLog,
  AdminStats,
  AdminUserRecord,
  AuthorityInviteRecord,
  CreditTransaction,
  KeyAiProfile,
} from '../../types/keyai';

type AdminTab = 'users' | 'admins' | 'ledger';

const ADMIN_PERMISSION_OPTIONS: Array<{ key: string; label: string }> = [
  { key: 'manage_users', label: 'Manage Users & Creator Authorities' },
  { key: 'manage_credits', label: 'Manage User Credits' },
  { key: 'manage_admins', label: 'Manage Admins & Authority Invites' },
  { key: 'view_analytics', label: 'View Platform Analytics' },
  { key: 'unlimited_ai', label: 'Unlimited AI Access' },
];

const USER_AUTHORITY_OPTIONS: Array<{ key: string; label: string; desc: string }> = [
  { key: 'studio_chat', label: 'AI Chat Studio', desc: 'Conversational AI assistant' },
  { key: 'studio_text', label: 'Text & Translate', desc: 'Rewrite, translate & copywriting' },
  { key: 'studio_photo_edit', label: 'Photo Editor', desc: 'Edit, enhance & remove backgrounds' },
  { key: 'studio_video_edit', label: 'Video Editor', desc: 'Upload video edits & subtitles' },
];

interface AdminPortalViewProps {
  currentProfile?: KeyAiProfile;
  onProfileRefreshed?: () => Promise<void>;
}

export const AdminPortalView: React.FC<AdminPortalViewProps> = ({ currentProfile }) => {
  const [tab, setTab] = useState<AdminTab>('users');
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [admins, setAdmins] = useState<AdminAccountRecord[]>([]);
  const [authorityInvites, setAuthorityInvites] = useState<AuthorityInviteRecord[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [activityLogs, setActivityLogs] = useState<AdminActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Credit management modal state
  const [selectedUser, setSelectedUser] = useState<AdminUserRecord | null>(null);
  const [creditMode, setCreditMode] = useState<'add' | 'deduct' | 'set'>('add');
  const [creditAmount, setCreditAmount] = useState('25');
  const [creditNote, setCreditNote] = useState('');
  const [submittingCredit, setSubmittingCredit] = useState(false);

  // Manage user studio authorities modal state
  const [authorityUser, setAuthorityUser] = useState<AdminUserRecord | null>(null);
  const [editingUserAuthorities, setEditingUserAuthorities] = useState<string[]>([]);
  const [savingUserAuthorities, setSavingUserAuthorities] = useState(false);

  // Inspect user history modal
  const [inspectUser, setInspectUser] = useState<AdminUserRecord | null>(null);

  // Edit admin permissions modal
  const [editingAdmin, setEditingAdmin] = useState<AdminAccountRecord | null>(null);
  const [editingAdminRole, setEditingAdminRole] = useState<'super_admin' | 'admin' | 'moderator'>(
    'admin'
  );
  const [editingAdminPerms, setEditingAdminPerms] = useState<string[]>([]);
  const [savingAdminPerms, setSavingAdminPerms] = useState(false);

  // Create new admin form state
  const [newAdminUsername, setNewAdminUsername] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [newAdminRole, setNewAdminRole] = useState<'admin' | 'super_admin' | 'moderator'>('admin');
  const [newAdminPerms, setNewAdminPerms] = useState<string[]>([
    'manage_users',
    'manage_credits',
    'view_analytics',
    'unlimited_ai',
  ]);
  const [creatingAdmin, setCreatingAdmin] = useState(false);

  // Authority invite generator state
  const [inviteRole, setInviteRole] = useState<'admin' | 'super_admin' | 'moderator'>('admin');
  const [inviteHours, setInviteHours] = useState('72');
  const [invitePerms, setInvitePerms] = useState<string[]>([
    'manage_users',
    'manage_credits',
    'view_analytics',
    'unlimited_ai',
  ]);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [generatedInviteCode, setGeneratedInviteCode] = useState<string | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);

  const hasAuthority = (authority: string) =>
    currentProfile?.role === 'super_admin' ||
    Boolean(currentProfile?.permissions?.includes(authority));

  const canManageCredits = hasAuthority('manage_credits');
  const canManageUsers = hasAuthority('manage_users');
  const canManageAdmins = hasAuthority('manage_admins');

  const fetchOverview = async (searchQuery = search) => {
    setLoading(true);
    setError(null);
    try {
      const qs = searchQuery.trim() ? `?search=${encodeURIComponent(searchQuery.trim())}` : '';
      const res = await apiFetch<{
        users: AdminUserRecord[];
        admins: AdminAccountRecord[];
        authorityInvites?: AuthorityInviteRecord[];
        stats: AdminStats;
        transactions: CreditTransaction[];
        activityLogs: AdminActivityLog[];
      }>(`/api/admin/overview${qs}`);
      setUsers(res.users);
      setAdmins(res.admins);
      setAuthorityInvites(res.authorityInvites || []);
      setStats(res.stats);
      setTransactions(res.transactions);
      setActivityLogs(res.activityLogs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Admin Portal data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchOverview('');
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void fetchOverview(search);
  };

  const handleCreditMutation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setSubmittingCredit(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/admin/users/${selectedUser.uid}/credits`, {
        method: 'POST',
        body: JSON.stringify({
          mode: creditMode,
          amount: Number(creditAmount),
          note: creditNote.trim() || undefined,
        }),
      });
      setNotice(`Updated credits for ${selectedUser.username}.`);
      setSelectedUser(null);
      setCreditNote('');
      await fetchOverview(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Credit update failed.');
    } finally {
      setSubmittingCredit(false);
    }
  };

  const handleToggleUnlimited = async (user: AdminUserRecord) => {
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/admin/users/${user.uid}/credits`, {
        method: 'POST',
        body: JSON.stringify({
          mode: 'toggle_unlimited',
          unlimited: !user.unlimitedCredits,
        }),
      });
      setNotice(
        `${user.username} ${!user.unlimitedCredits ? 'granted' : 'revoked'} unlimited credits.`
      );
      await fetchOverview(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle unlimited credits.');
    }
  };

  const handleToggleStatus = async (user: AdminUserRecord) => {
    const nextStatus = user.status === 'active' ? 'suspended' : 'active';
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/admin/users/${user.uid}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: nextStatus }),
      });
      setNotice(`${user.username} is now ${nextStatus}.`);
      await fetchOverview(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change account status.');
    }
  };

  const handleSaveUserAuthorities = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authorityUser) return;
    setSavingUserAuthorities(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/admin/users/${authorityUser.uid}/authorities`, {
        method: 'PATCH',
        body: JSON.stringify({ authorities: editingUserAuthorities }),
      });
      setNotice(`Updated studio authorities for ${authorityUser.username}.`);
      setAuthorityUser(null);
      await fetchOverview(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update creator authorities.');
    } finally {
      setSavingUserAuthorities(false);
    }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingAdmin(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch('/api/admin/admins', {
        method: 'POST',
        body: JSON.stringify({
          username: newAdminUsername.trim(),
          email: newAdminEmail.trim(),
          password: newAdminPassword,
          role: newAdminRole,
          permissions: newAdminPerms,
        }),
      });
      setNotice(
        `Created authority "${newAdminUsername.trim()}" with automatic unlimited AI credits.`
      );
      setNewAdminUsername('');
      setNewAdminEmail('');
      setNewAdminPassword('');
      await fetchOverview(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create admin account.');
    } finally {
      setCreatingAdmin(false);
    }
  };

  const handleUpdateAdminRole = async (
    adminId: string,
    role: 'super_admin' | 'admin' | 'moderator',
    permissions: string[],
    status: 'active' | 'suspended'
  ) => {
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/admin/admins/${adminId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role, permissions, status }),
      });
      setNotice('Updated administrator role & permissions.');
      await fetchOverview(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update admin role.');
    }
  };

  const handleSaveAdminPermissions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAdmin) return;
    setSavingAdminPerms(true);
    await handleUpdateAdminRole(
      editingAdmin.id,
      editingAdminRole,
      editingAdminPerms,
      editingAdmin.status
    );
    setSavingAdminPerms(false);
    setEditingAdmin(null);
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingInvite(true);
    setError(null);
    setNotice(null);
    setCopiedInvite(false);
    try {
      const res = await apiFetch<{
        invite: AuthorityInviteRecord;
        inviteCode: string;
      }>('/api/admin/authority-invites', {
        method: 'POST',
        body: JSON.stringify({
          role: inviteRole,
          permissions: invitePerms,
          expiresInHours: Number(inviteHours) || 72,
        }),
      });
      setGeneratedInviteCode(res.inviteCode);
      setNotice(`Authority invite code issued for role "${inviteRole}".`);
      await fetchOverview(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate authority invite.');
    } finally {
      setCreatingInvite(false);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/admin/authority-invites/${inviteId}`, { method: 'DELETE' });
      setNotice('Authority invite code revoked.');
      await fetchOverview(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke invite.');
    }
  };

  const handleCopyInviteCode = async () => {
    if (!generatedInviteCode) return;
    try {
      await navigator.clipboard.writeText(generatedInviteCode);
      setCopiedInvite(true);
      setTimeout(() => setCopiedInvite(false), 2000);
    } catch {
      // Clipboard fallback ignored
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
          <h1 className="text-2xl font-bold font-display text-white flex items-center gap-2.5">
            <ShieldCheck className="w-6 h-6 text-violet-400" />
            Admin & Authorities Portal
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Protected server-authorized dashboard · Manage registered users, studio authorities,
            admin roles, and invite registration
          </p>
        </div>

        <button
          type="button"
          onClick={() => fetchOverview(search)}
          className="min-h-[42px] px-4 py-2 rounded-xl bg-[#141422] hover:bg-[#1B1B2E] border border-white/10 text-xs font-medium text-white inline-flex items-center gap-2"
        >
          <RefreshCw className="w-3.5 h-3.5 text-violet-400" />
          Refresh Data
        </button>
      </div>

      {/* Signed-in Authority Capabilities Bar */}
      {currentProfile && (
        <div className="p-4 rounded-2xl bg-[#121220] border border-violet-500/25 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs">
            <span className="text-slate-400">Signed in Authority: </span>
            <span className="font-semibold text-white">{currentProfile.username}</span>
            <span className="text-violet-300 font-mono ml-2">
              ({currentProfile.role.replace('_', ' ')})
            </span>
          </div>
          <div className="text-xs text-slate-400 font-mono">
            Authorities:{' '}
            <span className="text-slate-200">
              {currentProfile.role === 'super_admin'
                ? 'All Governance Authorities'
                : currentProfile.permissions?.join(', ') || 'standard'}
            </span>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-2 text-xs text-rose-200">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2 text-xs text-emerald-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Platform Statistics */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#141422] border border-white/10 rounded-2xl p-5 space-y-1">
            <p className="text-xs text-slate-400">Registered Users</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-white">
              {stats.totalUsers}
            </p>
            <p className="text-xs text-slate-500">
              {stats.activeUsers} active · {stats.suspendedUsers} suspended
            </p>
          </div>
          <div className="bg-[#141422] border border-white/10 rounded-2xl p-5 space-y-1">
            <p className="text-xs text-slate-400">Authorized Admins</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-white">
              {stats.totalAdmins}
            </p>
            <p className="text-xs text-slate-500">
              {stats.unlimitedUsers} users with unlimited credits
            </p>
          </div>
          <div className="bg-[#141422] border border-white/10 rounded-2xl p-5 space-y-1">
            <p className="text-xs text-slate-400">Total AI Operations</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-white">
              {stats.totalAiOperations}
            </p>
            <p className="text-xs text-slate-500">Across chat, photo, video, text</p>
          </div>
          <div className="bg-[#141422] border border-white/10 rounded-2xl p-5 space-y-1">
            <p className="text-xs text-slate-400">Credits Spent / Circulating</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-white">
              {stats.totalCreditsSpent} / {stats.totalCreditsInCirculation}
            </p>
            <p className="text-xs text-slate-500">Server-verified balance total</p>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 p-1 bg-[#141422] border border-white/10 rounded-xl w-fit">
        <button
          type="button"
          onClick={() => setTab('users')}
          className={`min-h-[40px] px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            tab === 'users' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          Users & Authorities ({users.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('admins')}
          className={`min-h-[40px] px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            tab === 'admins' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          Admin Accounts & Invites ({admins.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('ledger')}
          className={`min-h-[40px] px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            tab === 'ledger' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          Global Activity & Ledger
        </button>
      </div>

      {/* TAB 1: Users & Credits */}
      {tab === 'users' && (
        <div className="bg-[#141422] border border-white/10 rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold font-display text-white">
              Registered Users & Studio Authorities
            </h2>
            <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-72">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search username or email..."
                  className="w-full min-h-[40px] pl-9 pr-3 py-1.5 rounded-xl bg-[#0D0D16] border border-white/10 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
                />
              </div>
              <button
                type="submit"
                className="min-h-[40px] px-4 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-xs font-medium text-white"
              >
                Search
              </button>
            </form>
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-slate-400">Loading users...</div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No registered users match your search yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400">
                    <th className="py-3 px-5 font-medium">User</th>
                    <th className="py-3 px-4 font-medium">Status</th>
                    <th className="py-3 px-4 font-medium">Authorities</th>
                    <th className="py-3 px-4 font-medium text-right">Credits</th>
                    <th className="py-3 px-4 font-medium text-right">AI Runs</th>
                    <th className="py-3 px-5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {users.map((u) => {
                    const userAuths = u.authorities ?? USER_AUTHORITY_OPTIONS.map((o) => o.key);
                    return (
                      <tr key={u.uid} className="hover:bg-white/[0.02]">
                        <td className="py-3.5 px-5">
                          <p className="font-medium text-white">{u.username}</p>
                          <p className="text-slate-400">{u.email}</p>
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1.5 font-medium ${
                              u.status === 'active' ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {u.status === 'active' ? (
                              <UserCheck className="w-3.5 h-3.5" />
                            ) : (
                              <UserX className="w-3.5 h-3.5" />
                            )}
                            {u.status === 'active' ? 'Active' : 'Suspended'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-mono tabular-nums text-slate-300">
                          {userAuths.length} / {USER_AUTHORITY_OPTIONS.length} studio
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-white">
                          {u.unlimitedCredits ? (
                            <span className="inline-flex items-center gap-1 text-violet-300">
                              <InfinityIcon className="w-3.5 h-3.5" />
                              Unlimited
                            </span>
                          ) : (
                            u.credits
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-300">
                          {u.totalUsageCount}
                        </td>
                        <td className="py-3.5 px-5">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {canManageCredits && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedUser(u);
                                    setCreditMode('add');
                                    setCreditAmount('25');
                                  }}
                                  className="min-h-[34px] px-2.5 py-1 rounded-lg bg-violet-600/20 hover:bg-violet-600/35 text-violet-200 inline-flex items-center gap-1"
                                >
                                  <Coins className="w-3 h-3" />
                                  Adjust Credits
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleUnlimited(u)}
                                  className="min-h-[34px] px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200"
                                >
                                  {u.unlimitedCredits ? 'Revoke Unlimited' : 'Give Unlimited'}
                                </button>
                              </>
                            )}
                            {canManageUsers && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAuthorityUser(u);
                                    setEditingUserAuthorities([...userAuths]);
                                  }}
                                  className="min-h-[34px] px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-violet-200 inline-flex items-center gap-1"
                                >
                                  <KeyRound className="w-3 h-3" />
                                  Authorities
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleStatus(u)}
                                  className={`min-h-[34px] px-2.5 py-1 rounded-lg ${
                                    u.status === 'active'
                                      ? 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300'
                                      : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300'
                                  }`}
                                >
                                  {u.status === 'active' ? 'Suspend' : 'Reactivate'}
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => setInspectUser(u)}
                              className="min-h-[34px] px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300"
                            >
                              History
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Admin Accounts, Authorities & Invites */}
      {tab === 'admins' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* Create Admin Direct Form */}
            <form
              onSubmit={handleCreateAdmin}
              className="xl:col-span-5 bg-[#141422] border border-white/10 rounded-2xl p-5 space-y-4"
            >
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-violet-400" />
                <h2 className="text-base font-semibold font-display text-white">
                  Create Authority Account
                </h2>
              </div>
              <p className="text-xs text-slate-400">
                Directly provision an administrator or moderator account with unlimited AI credits.
              </p>

              {!canManageAdmins && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
                  Your account does not hold the <span className="font-mono">manage_admins</span>{' '}
                  authority.
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-slate-300">Username</label>
                  <input
                    type="text"
                    required
                    minLength={3}
                    disabled={!canManageAdmins}
                    value={newAdminUsername}
                    onChange={(e) => setNewAdminUsername(e.target.value)}
                    placeholder="Authority username"
                    className="w-full min-h-[40px] px-3 rounded-xl bg-[#0D0D16] border border-white/10 text-xs text-white disabled:opacity-50"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-slate-300">Email</label>
                  <input
                    type="email"
                    disabled={!canManageAdmins}
                    value={newAdminEmail}
                    onChange={(e) => setNewAdminEmail(e.target.value)}
                    placeholder="admin@keyai.studio"
                    className="w-full min-h-[40px] px-3 rounded-xl bg-[#0D0D16] border border-white/10 text-xs text-white disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-slate-300">Password (min 8 chars)</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    disabled={!canManageAdmins}
                    value={newAdminPassword}
                    onChange={(e) => setNewAdminPassword(e.target.value)}
                    placeholder="Strong password"
                    className="w-full min-h-[40px] px-3 rounded-xl bg-[#0D0D16] border border-white/10 text-xs text-white disabled:opacity-50"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-slate-300">Role</label>
                  <select
                    disabled={!canManageAdmins}
                    value={newAdminRole}
                    onChange={(e) =>
                      setNewAdminRole(e.target.value as 'admin' | 'super_admin' | 'moderator')
                    }
                    className="w-full min-h-[40px] px-3 rounded-xl bg-[#0D0D16] border border-white/10 text-xs text-white disabled:opacity-50"
                  >
                    <option value="admin">Admin</option>
                    <option value="super_admin">Super Admin</option>
                    <option value="moderator">Moderator</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-slate-300">Assigned Authorities</label>
                <div className="space-y-1.5">
                  {ADMIN_PERMISSION_OPTIONS.map((perm) => (
                    <label key={perm.key} className="flex items-center gap-2 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        disabled={!canManageAdmins}
                        checked={newAdminPerms.includes(perm.key)}
                        onChange={(e) => {
                          setNewAdminPerms((prev) =>
                            e.target.checked
                              ? [...prev, perm.key]
                              : prev.filter((p) => p !== perm.key)
                          );
                        }}
                        className="accent-violet-600"
                      />
                      <span>{perm.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={creatingAdmin || !canManageAdmins}
                className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-medium"
              >
                {creatingAdmin ? 'Creating Authority...' : 'Create Authority Account'}
              </button>
            </form>

            {/* Authorized Administrators List */}
            <div className="xl:col-span-7 bg-[#141422] border border-white/10 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-white/10">
                <h2 className="text-base font-semibold font-display text-white">
                  Authorized Administrators & Moderators
                </h2>
              </div>
              <div className="divide-y divide-white/5">
                {admins.map((adm) => (
                  <div
                    key={adm.id}
                    className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">{adm.username}</span>
                        <span className="text-xs text-violet-300 font-mono">
                          · Unlimited Credits
                        </span>
                        {adm.status === 'suspended' && (
                          <span className="text-xs text-rose-400 font-medium">· Suspended</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400">
                        {adm.email} · Created by {adm.createdBy}
                      </p>
                      <p className="text-[11px] text-slate-500 font-mono">
                        Authorities: {adm.permissions.join(', ')}
                      </p>
                    </div>

                    {canManageAdmins && (
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <select
                          aria-label={`Role for ${adm.username}`}
                          value={adm.role}
                          onChange={(e) =>
                            handleUpdateAdminRole(
                              adm.id,
                              e.target.value as 'super_admin' | 'admin' | 'moderator',
                              adm.permissions,
                              adm.status
                            )
                          }
                          className="min-h-[36px] px-2.5 rounded-lg bg-[#0D0D16] border border-white/10 text-xs text-white"
                        >
                          <option value="super_admin">super_admin</option>
                          <option value="admin">admin</option>
                          <option value="moderator">moderator</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingAdmin(adm);
                            setEditingAdminRole(adm.role);
                            setEditingAdminPerms([...adm.permissions]);
                          }}
                          className="min-h-[36px] px-3 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-slate-200"
                        >
                          Permissions
                        </button>
                        {adm.createdBy !== 'system' && (
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateAdminRole(
                                adm.id,
                                adm.role,
                                adm.permissions,
                                adm.status === 'active' ? 'suspended' : 'active'
                              )
                            }
                            className={`min-h-[36px] px-3 rounded-lg text-xs ${
                              adm.status === 'active'
                                ? 'bg-rose-500/15 text-rose-300'
                                : 'bg-emerald-500/15 text-emerald-300'
                            }`}
                          >
                            {adm.status === 'active' ? 'Suspend' : 'Activate'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Authority Registration Invites */}
          {canManageAdmins && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
              <form
                onSubmit={handleCreateInvite}
                className="xl:col-span-5 bg-[#141422] border border-white/10 rounded-2xl p-5 space-y-4"
              >
                <div className="flex items-center gap-2">
                  <Ticket className="w-4 h-4 text-violet-400" />
                  <h2 className="text-base font-semibold font-display text-white">
                    Issue Authority Registration Invite
                  </h2>
                </div>
                <p className="text-xs text-slate-400">
                  Generate a single-use invite code so a team member can self-register via the
                  Authorities → Register Authority screen.
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-300">Invite Role</label>
                    <select
                      value={inviteRole}
                      onChange={(e) =>
                        setInviteRole(e.target.value as 'admin' | 'super_admin' | 'moderator')
                      }
                      className="w-full min-h-[40px] px-3 rounded-xl bg-[#0D0D16] border border-white/10 text-xs text-white"
                    >
                      <option value="admin">Admin</option>
                      <option value="moderator">Moderator</option>
                      <option value="super_admin">Super Admin</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-300">Expires In (Hours)</label>
                    <input
                      type="number"
                      min={1}
                      max={720}
                      value={inviteHours}
                      onChange={(e) => setInviteHours(e.target.value)}
                      className="w-full min-h-[40px] px-3 rounded-xl bg-[#0D0D16] border border-white/10 text-xs font-mono text-white"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-300">Granted Authorities</label>
                  <div className="space-y-1.5">
                    {ADMIN_PERMISSION_OPTIONS.map((perm) => (
                      <label key={perm.key} className="flex items-center gap-2 text-xs text-slate-300">
                        <input
                          type="checkbox"
                          checked={invitePerms.includes(perm.key)}
                          onChange={(e) => {
                            setInvitePerms((prev) =>
                              e.target.checked
                                ? [...prev, perm.key]
                                : prev.filter((p) => p !== perm.key)
                            );
                          }}
                          className="accent-violet-600"
                        />
                        <span>{perm.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {generatedInviteCode && (
                  <div className="p-3.5 rounded-xl bg-violet-600/15 border border-violet-500/40 space-y-2">
                    <p className="text-[11px] text-violet-200 font-medium">
                      Single-Use Invite Code (Share Securely)
                    </p>
                    <div className="flex items-center justify-between gap-2">
                      <code className="text-sm font-mono font-bold text-white tracking-wider">
                        {generatedInviteCode}
                      </code>
                      <button
                        type="button"
                        onClick={handleCopyInviteCode}
                        className="min-h-[34px] px-3 py-1 rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-medium text-white inline-flex items-center gap-1.5"
                      >
                        {copiedInvite ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            Copy
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={creatingInvite}
                  className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-medium"
                >
                  {creatingInvite ? 'Generating Invite...' : 'Generate Authority Invite Code'}
                </button>
              </form>

              <div className="xl:col-span-7 bg-[#141422] border border-white/10 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-white/10">
                  <h2 className="text-base font-semibold font-display text-white">
                    Issued Authority Invites ({authorityInvites.length})
                  </h2>
                </div>
                <div className="divide-y divide-white/5 max-h-[420px] overflow-y-auto">
                  {authorityInvites.length === 0 ? (
                    <p className="p-6 text-xs text-slate-500 text-center">
                      No authority invite codes generated yet.
                    </p>
                  ) : (
                    authorityInvites.map((inv) => {
                      const expired = Date.now() > inv.expiresAt;
                      const stateLabel = inv.revoked
                        ? 'Revoked'
                        : inv.usedBy
                        ? `Used by ${inv.usedBy}`
                        : expired
                        ? 'Expired'
                        : 'Active';
                      return (
                        <div
                          key={inv.id}
                          className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-semibold text-white">
                                {inv.codePreview}
                              </span>
                              <span className="text-violet-300 font-mono">· {inv.role}</span>
                              <span
                                className={
                                  stateLabel === 'Active'
                                    ? 'text-emerald-400 font-medium'
                                    : 'text-slate-400'
                                }
                              >
                                · {stateLabel}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 truncate">
                              Authorities: {inv.permissions.join(', ')}
                            </p>
                            <p className="text-[11px] text-slate-500 font-mono">
                              Issued by {inv.createdBy} · Expires {formatDate(inv.expiresAt)}
                            </p>
                          </div>

                          {!inv.revoked && !inv.usedBy && !expired && (
                            <button
                              type="button"
                              onClick={() => handleRevokeInvite(inv.id)}
                              className="min-h-[34px] px-3 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 inline-flex items-center gap-1.5 shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Revoke
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Global Activity & Credit Ledger */}
      {tab === 'ledger' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-[#141422] border border-white/10 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10">
              <h2 className="text-base font-semibold font-display text-white">
                Recent Credit Transactions
              </h2>
            </div>
            <div className="divide-y divide-white/5 max-h-[480px] overflow-y-auto">
              {transactions.length === 0 ? (
                <p className="p-6 text-xs text-slate-500 text-center">No transactions yet.</p>
              ) : (
                transactions.map((tx) => (
                  <div key={tx.id} className="p-4 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <p className="text-white font-medium truncate">
                        {tx.username} · {tx.feature}
                      </p>
                      <p className="text-slate-400 truncate">{tx.note}</p>
                      <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                        {formatDate(tx.createdAt)} · by {tx.actorLabel}
                      </p>
                    </div>
                    <div className="text-right font-mono tabular-nums shrink-0">
                      <p
                        className={
                          tx.amount > 0
                            ? 'text-emerald-400'
                            : tx.amount < 0
                            ? 'text-rose-400'
                            : 'text-violet-300'
                        }
                      >
                        {tx.amount > 0 ? `+${tx.amount}` : tx.amount}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Bal: {tx.unlimitedAfter ? '∞' : tx.balanceAfter}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-[#141422] border border-white/10 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10">
              <h2 className="text-base font-semibold font-display text-white">
                Platform Activity Log
              </h2>
            </div>
            <div className="divide-y divide-white/5 max-h-[480px] overflow-y-auto">
              {activityLogs.length === 0 ? (
                <p className="p-6 text-xs text-slate-500 text-center">No activity logged yet.</p>
              ) : (
                activityLogs.map((log) => (
                  <div key={log.id} className="p-4 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <p className="text-white font-medium truncate">
                        {log.username} · {log.action}
                      </p>
                      <p className="text-[11px] text-slate-500 font-mono">
                        {formatDate(log.createdAt)} · {log.model}
                      </p>
                    </div>
                    <span className="font-mono tabular-nums text-slate-300 shrink-0">
                      {log.creditsUsed} cr
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Adjust User Credits */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#141422] border border-white/15 rounded-2xl p-6 space-y-5">
            <div>
              <h3 className="text-lg font-semibold font-display text-white">
                Adjust Credits for {selectedUser.username}
              </h3>
              <p className="text-xs text-slate-400 mt-1 font-mono tabular-nums">
                Current Balance:{' '}
                {selectedUser.unlimitedCredits ? 'Unlimited' : selectedUser.credits}
              </p>
            </div>

            <form onSubmit={handleCreditMutation} className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {(['add', 'deduct', 'set'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setCreditMode(m)}
                    className={`min-h-[38px] rounded-xl text-xs font-medium capitalize border ${
                      creditMode === m
                        ? 'bg-violet-600 border-violet-500 text-white'
                        : 'bg-[#0D0D16] border-white/10 text-slate-400'
                    }`}
                  >
                    {m === 'set' ? 'Set Exact' : m}
                  </button>
                ))}
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-300">Credit Amount</label>
                <input
                  type="number"
                  min={0}
                  required
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#0D0D16] border border-white/10 text-sm font-mono tabular-nums text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-300">Audit Note (Optional)</label>
                <input
                  type="text"
                  value={creditNote}
                  onChange={(e) => setCreditNote(e.target.value)}
                  placeholder="Reason for credit adjustment..."
                  className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#0D0D16] border border-white/10 text-xs text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedUser(null)}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingCredit}
                  className="min-h-[40px] px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-xs font-medium text-white"
                >
                  {submittingCredit ? 'Applying...' : 'Confirm Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Manage User Creator Authorities */}
      {authorityUser && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#141422] border border-white/15 rounded-2xl p-6 space-y-5">
            <div>
              <h3 className="text-lg font-semibold font-display text-white">
                Studio Authorities · {authorityUser.username}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Enable or revoke access to specific KeyAi creative studio endpoints.
              </p>
            </div>

            <form onSubmit={handleSaveUserAuthorities} className="space-y-3">
              {USER_AUTHORITY_OPTIONS.map((opt) => (
                <label
                  key={opt.key}
                  className="flex items-start gap-3 p-3 rounded-xl bg-[#0D0D16] border border-white/10 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={editingUserAuthorities.includes(opt.key)}
                    onChange={(e) => {
                      setEditingUserAuthorities((prev) =>
                        e.target.checked ? [...prev, opt.key] : prev.filter((k) => k !== opt.key)
                      );
                    }}
                    className="mt-0.5 accent-violet-600"
                  />
                  <div>
                    <p className="text-xs font-medium text-white">{opt.label}</p>
                    <p className="text-[11px] text-slate-400">{opt.desc}</p>
                  </div>
                </label>
              ))}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAuthorityUser(null)}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingUserAuthorities}
                  className="min-h-[40px] px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-xs font-medium text-white"
                >
                  {savingUserAuthorities ? 'Saving...' : 'Save Authorities'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Admin Permissions */}
      {editingAdmin && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#141422] border border-white/15 rounded-2xl p-6 space-y-5">
            <div>
              <h3 className="text-lg font-semibold font-display text-white">
                Edit Authority · {editingAdmin.username}
              </h3>
              <p className="text-xs text-slate-400 mt-1">{editingAdmin.email}</p>
            </div>

            <form onSubmit={handleSaveAdminPermissions} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs text-slate-300">Role</label>
                <select
                  value={editingAdminRole}
                  onChange={(e) =>
                    setEditingAdminRole(e.target.value as 'super_admin' | 'admin' | 'moderator')
                  }
                  className="w-full min-h-[40px] px-3 rounded-xl bg-[#0D0D16] border border-white/10 text-xs text-white"
                >
                  <option value="super_admin">super_admin</option>
                  <option value="admin">admin</option>
                  <option value="moderator">moderator</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-slate-300">Governance Authorities</label>
                <div className="space-y-1.5">
                  {ADMIN_PERMISSION_OPTIONS.map((perm) => (
                    <label key={perm.key} className="flex items-center gap-2 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={editingAdminPerms.includes(perm.key)}
                        onChange={(e) => {
                          setEditingAdminPerms((prev) =>
                            e.target.checked
                              ? [...prev, perm.key]
                              : prev.filter((p) => p !== perm.key)
                          );
                        }}
                        className="accent-violet-600"
                      />
                      <span>{perm.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingAdmin(null)}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingAdminPerms}
                  className="min-h-[40px] px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-xs font-medium text-white"
                >
                  {savingAdminPerms ? 'Saving...' : 'Save Authority'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Inspect Individual User Activity & Transactions */}
      {inspectUser && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-[#141422] border border-white/15 rounded-2xl p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold font-display text-white">
                  {inspectUser.username} · Activity & Credit Ledger
                </h3>
                <p className="text-xs text-slate-400">{inspectUser.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setInspectUser(null)}
                className="min-h-[36px] px-3 rounded-lg bg-white/5 text-xs text-slate-300"
              >
                Close
              </button>
            </div>

            <div className="overflow-y-auto divide-y divide-white/5 flex-1">
              {transactions.filter((t) => t.userId === inspectUser.uid).length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-500">
                  No transactions found for this user.
                </p>
              ) : (
                transactions
                  .filter((t) => t.userId === inspectUser.uid)
                  .map((tx) => (
                    <div key={tx.id} className="py-3 flex justify-between gap-3 text-xs">
                      <div>
                        <p className="text-white font-medium">{tx.feature}</p>
                        <p className="text-slate-400">{tx.note}</p>
                        <p className="text-[11px] font-mono text-slate-500">
                          {formatDate(tx.createdAt)}
                        </p>
                      </div>
                      <div className="text-right font-mono tabular-nums">
                        <p className={tx.amount >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                          {tx.amount > 0 ? `+${tx.amount}` : tx.amount}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Bal: {tx.unlimitedAfter ? '∞' : tx.balanceAfter}
                        </p>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
