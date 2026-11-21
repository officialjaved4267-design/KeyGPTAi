import React, { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Lock,
  Mail,
  Shield,
  ShieldCheck,
  Ticket,
  User,
} from 'lucide-react';
import { apiFetch, setStoredAdminToken, setStoredUserToken } from '../lib/api';
import { auth } from '../lib/firebase';
import type { FeatureCosts, KeyAiProfile } from '../types/keyai';
import { KeyAiLogo } from './KeyAiLogo';

type AuthMode = 'login' | 'signup' | 'forgot' | 'authority';
type AuthoritySubMode = 'login' | 'register';

interface AuthScreenProps {
  initialError?: string | null;
  onAdminAuthenticated: (profile: KeyAiProfile, featureCosts: FeatureCosts) => void;
  onServerUserAuthenticated: (profile: KeyAiProfile, featureCosts: FeatureCosts) => void;
  onFirebaseAuthenticated: (usernameHint?: string) => Promise<void>;
}

const CREATOR_AUTHORITIES_PREVIEW = [
  { key: 'studio_chat', label: 'AI Chat' },
  { key: 'studio_text', label: 'Text & Translate' },
  { key: 'studio_photo_edit', label: 'Photo Editor' },
  { key: 'studio_video_edit', label: 'Video Editor' },
];

export const AuthScreen: React.FC<AuthScreenProps> = ({
  initialError,
  onAdminAuthenticated,
  onServerUserAuthenticated,
  onFirebaseAuthenticated,
}) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [authorityMode, setAuthorityMode] = useState<AuthoritySubMode>('login');

  // Creator Login / Register / Reset fields
  const [username, setUsername] = useState('');
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Authority Login & Register fields
  const [authIdentifier, setAuthIdentifier] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoginCode, setAuthLoginCode] = useState('');
  const [authRegUsername, setAuthRegUsername] = useState('');
  const [authRegEmail, setAuthRegEmail] = useState('');
  const [authRegPassword, setAuthRegPassword] = useState('');
  const [authInviteCode, setAuthInviteCode] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError || null);
  const [notice, setNotice] = useState<string | null>(null);

  const clearFeedback = () => {
    setError(null);
    setNotice(null);
  };

  const handleModeSwitch = (nextMode: AuthMode) => {
    setMode(nextMode);
    clearFeedback();
  };

  const handleEmailAuthError = (err: unknown) => {
    const message = err instanceof Error ? err.message : 'Authentication failed.';
    if (message.includes('auth/invalid-credential') || message.includes('auth/wrong-password')) {
      setError('Invalid credentials. Please verify your email/username and password.');
      return;
    }
    if (message.includes('auth/email-already-in-use')) {
      setError('An account with this email already exists. Switch to Sign In instead.');
      return;
    }
    if (message.includes('auth/weak-password')) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    setError(message.replace('Firebase: ', ''));
  };

  const loginViaServer = async (identifier: string, secret: string) => {
    const res = await apiFetch<{
      isAdmin?: boolean;
      adminToken?: string;
      userToken?: string;
      profile: KeyAiProfile;
      featureCosts: FeatureCosts;
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: identifier.trim(), password: secret }),
    });
    if (res.isAdmin && res.adminToken) {
      setStoredAdminToken(res.adminToken);
      onAdminAuthenticated(res.profile, res.featureCosts);
      return;
    }
    if (res.userToken) {
      setStoredUserToken(res.userToken);
    }
    onServerUserAuthenticated(res.profile, res.featureCosts);
  };

  const registerViaServer = async (name: string, mail: string, secret: string) => {
    const res = await apiFetch<{
      userToken: string;
      profile: KeyAiProfile;
      featureCosts: FeatureCosts;
    }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: name.trim(),
        email: mail.trim(),
        password: secret,
      }),
    });
    setStoredUserToken(res.userToken);
    onServerUserAuthenticated(res.profile, res.featureCosts);
  };

  const handleUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    setLoading(true);
    try {
      if (mode === 'signup') {
        if (username.trim().length < 2) {
          throw new Error('Please choose a username of at least 2 characters.');
        }
        try {
          const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
          await updateProfile(cred.user, { displayName: username.trim() });
          await sendEmailVerification(cred.user).catch(() => undefined);
          await onFirebaseAuthenticated(username.trim());
        } catch (fbErr) {
          const fbMsg = fbErr instanceof Error ? fbErr.message : '';
          if (fbMsg.includes('auth/operation-not-allowed')) {
            await registerViaServer(username, email, password);
          } else {
            throw fbErr;
          }
        }
      } else if (mode === 'login') {
        const cleanId = loginIdentifier.trim();
        if (!cleanId.includes('@')) {
          await loginViaServer(cleanId, password);
        } else {
          try {
            await signInWithEmailAndPassword(auth, cleanId, password);
            await onFirebaseAuthenticated();
          } catch (fbErr) {
            const fbMsg = fbErr instanceof Error ? fbErr.message : '';
            if (
              fbMsg.includes('auth/operation-not-allowed') ||
              fbMsg.includes('auth/invalid-credential') ||
              fbMsg.includes('auth/user-not-found')
            ) {
              await loginViaServer(cleanId, password);
            } else {
              throw fbErr;
            }
          }
        }
      } else if (mode === 'forgot') {
        await sendPasswordResetEmail(auth, email.trim());
        setNotice(`Password reset instructions have been sent to ${email.trim()}.`);
      }
    } catch (err) {
      handleEmailAuthError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    clearFeedback();
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      await onFirebaseAuthenticated();
    } catch (err) {
      handleEmailAuthError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAuthorityLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    setLoading(true);
    try {
      const res = await apiFetch<{
        adminToken: string;
        profile: KeyAiProfile;
        featureCosts: FeatureCosts;
      }>('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({
          username: authIdentifier.trim(),
          password: authPassword,
          authorizationCode: authLoginCode.trim() || undefined,
        }),
      });
      setStoredAdminToken(res.adminToken);
      onAdminAuthenticated(res.profile, res.featureCosts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authority authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleAuthorityRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    setLoading(true);
    try {
      const cleanCode = authInviteCode.trim().toUpperCase();
      const res = await apiFetch<{
        adminToken: string;
        profile: KeyAiProfile;
        featureCosts: FeatureCosts;
      }>('/api/authority/register', {
        method: 'POST',
        body: JSON.stringify({
          username: authRegUsername.trim(),
          email: authRegEmail.trim(),
          password: authRegPassword,
          authorizationCode: cleanCode,
          inviteCode: cleanCode,
        }),
      });
      setStoredAdminToken(res.adminToken);
      onAdminAuthenticated(res.profile, res.featureCosts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authority registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090F] text-slate-100 flex flex-col lg:flex-row">
      {/* Left Studio Overview Panel */}
      <div className="lg:w-[48%] bg-[#0E0E18] border-b lg:border-b-0 lg:border-r border-white/10 p-8 sm:p-12 lg:p-16 flex flex-col justify-between">
        <div className="space-y-10 max-w-xl">
          <KeyAiLogo size="lg" />

          <div className="space-y-4">
            <p className="text-xs font-medium tracking-wide text-violet-400">
              One AI. Unlimited Creativity.
            </p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold font-display tracking-tight text-white leading-[1.12] [text-wrap:balance]">
              Every creative AI studio inside a single unified workspace.
            </h1>
            <p className="text-sm sm:text-base text-slate-400 leading-relaxed max-w-lg">
              Upload and edit videos with AI prompts, enhance photos, remove backgrounds, add timed
              subtitles, write and translate across languages, and collaborate with conversational AI.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-xl bg-[#141422] border border-white/10">
              <p className="text-sm font-semibold text-white">50 Daily Credits</p>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Automatically replenished every 24 hours for every registered creator account.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-[#141422] border border-white/10">
              <p className="text-sm font-semibold text-white">Photo & Video Editors</p>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Upload videos to edit by prompt, remove photo backgrounds, enhance quality, and add
                subtitles.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-[#141422] border border-white/10">
              <p className="text-sm font-semibold text-white">Creator Authorities</p>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Role-scoped studio access and server-enforced credit balances on every AI request.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-[#141422] border border-white/10">
              <p className="text-sm font-semibold text-white">Authority Governance</p>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Invite-verified Authority registration, granular permissions, and unlimited credits.
              </p>
            </div>
          </div>
        </div>

        <div className="pt-8 mt-8 border-t border-white/10 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <span>KeyAi Creative Platform</span>
          <span>Secured with Firebase & Server Authorities</span>
        </div>
      </div>

      {/* Right Authentication Form Panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 lg:p-16">
        <div className="w-full max-w-md space-y-6">
          {/* Mode Switcher */}
          <div className="flex items-center justify-between gap-2 p-1 bg-[#141422] border border-white/10 rounded-xl">
            <button
              type="button"
              onClick={() => handleModeSwitch('login')}
              className={`flex-1 min-h-[40px] px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                mode === 'login'
                  ? 'bg-violet-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => handleModeSwitch('signup')}
              className={`flex-1 min-h-[40px] px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                mode === 'signup'
                  ? 'bg-violet-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Register
            </button>
            <button
              type="button"
              onClick={() => handleModeSwitch('authority')}
              className={`flex-1 min-h-[40px] px-3 py-2 rounded-lg text-xs font-medium transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap ${
                mode === 'authority'
                  ? 'bg-violet-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Shield className="w-3.5 h-3.5 shrink-0" />
              Authorities
            </button>
          </div>

          <div className="bg-[#141422] border border-white/10 rounded-2xl p-6 sm:p-8 space-y-6">
            <div>
              <h2 className="text-xl font-bold font-display text-white">
                {mode === 'login' && 'Welcome back to KeyAi'}
                {mode === 'signup' && 'Create your KeyAi account'}
                {mode === 'forgot' && 'Reset your password'}
                {mode === 'authority' &&
                  (authorityMode === 'login' ? 'Admin & Authority Login' : 'Register Authority')}
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                {mode === 'login' &&
                  'Sign in with your email or username to access your studio workspace.'}
                {mode === 'signup' &&
                  'New creator accounts include 50 daily credits and studio authorities.'}
                {mode === 'forgot' && 'Enter your email address to receive a password reset link.'}
                {mode === 'authority' &&
                  (authorityMode === 'login'
                    ? 'Sign in with an authorized administrator or moderator account for unlimited credits.'
                    : 'Redeem an admin-issued Authority Invite Code to activate a privileged account.')}
              </p>
            </div>

            {error && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-xs text-rose-200">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <p>{error}</p>
              </div>
            )}

            {notice && (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-2.5 text-xs text-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <p>{notice}</p>
              </div>
            )}

            {mode === 'authority' ? (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#0D0D16] border border-white/10">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthorityMode('login');
                      clearFeedback();
                    }}
                    className={`min-h-[38px] rounded-lg text-xs font-medium transition-colors ${
                      authorityMode === 'login'
                        ? 'bg-violet-600/25 text-violet-200 border border-violet-500/40'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Authority Login
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthorityMode('register');
                      clearFeedback();
                    }}
                    className={`min-h-[38px] rounded-lg text-xs font-medium transition-colors ${
                      authorityMode === 'register'
                        ? 'bg-violet-600/25 text-violet-200 border border-violet-500/40'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Register Authority
                  </button>
                </div>

                {authorityMode === 'login' ? (
                  <form onSubmit={handleAuthorityLogin} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-slate-300">
                        Authority Username or Email
                      </label>
                      <div className="relative">
                        <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          required
                          value={authIdentifier}
                          onChange={(e) => setAuthIdentifier(e.target.value)}
                          placeholder="Username or authority email"
                          autoComplete="username"
                          className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-xl bg-[#0D0D16] border border-white/10 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-slate-300">
                        Authority Password
                      </label>
                      <div className="relative">
                        <KeyRound className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="password"
                          required
                          value={authPassword}
                          onChange={(e) => setAuthPassword(e.target.value)}
                          placeholder="Enter authority password"
                          autoComplete="current-password"
                          className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-xl bg-[#0D0D16] border border-white/10 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-slate-300">
                        Authorization Code (Optional)
                      </label>
                      <div className="relative">
                        <Ticket className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={authLoginCode}
                          onChange={(e) => setAuthLoginCode(e.target.value)}
                          placeholder="Enter authorization code if verifying"
                          className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-xl bg-[#0D0D16] border border-white/10 text-sm font-mono uppercase text-white placeholder:text-slate-500 placeholder:font-sans placeholder:normal-case focus:outline-none focus:border-violet-500"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white text-sm font-medium transition-colors inline-flex items-center justify-center gap-2"
                    >
                      <Shield className="w-4 h-4" />
                      {loading ? 'Verifying Authority...' : 'Sign In as Authority'}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleAuthorityRegister} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-slate-300">
                        Authorization Code
                      </label>
                      <div className="relative">
                        <Ticket className="w-4 h-4 text-violet-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          required
                          value={authInviteCode}
                          onChange={(e) => setAuthInviteCode(e.target.value)}
                          placeholder="Enter authorization or invite code"
                          className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-xl bg-[#0D0D16] border border-violet-500/30 text-sm font-mono uppercase text-white placeholder:text-slate-500 placeholder:font-sans placeholder:normal-case focus:outline-none focus:border-violet-500"
                        />
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Use your organization Authorization Code or an admin-issued invite code.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-slate-300">Username</label>
                      <div className="relative">
                        <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          required
                          minLength={3}
                          maxLength={40}
                          value={authRegUsername}
                          onChange={(e) => setAuthRegUsername(e.target.value)}
                          placeholder="Authority username"
                          className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-xl bg-[#0D0D16] border border-white/10 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-slate-300">
                        Email Address
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="email"
                          required
                          value={authRegEmail}
                          onChange={(e) => setAuthRegEmail(e.target.value)}
                          placeholder="authority@domain.com"
                          className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-xl bg-[#0D0D16] border border-white/10 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-slate-300">
                        Password (min 8 chars)
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="password"
                          required
                          minLength={8}
                          value={authRegPassword}
                          onChange={(e) => setAuthRegPassword(e.target.value)}
                          placeholder="Strong authority password"
                          className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-xl bg-[#0D0D16] border border-white/10 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white text-sm font-medium transition-colors inline-flex items-center justify-center gap-2"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      {loading ? 'Activating Authority...' : 'Register & Activate Authority'}
                    </button>
                  </form>
                )}
              </div>
            ) : (
              <>
                <form onSubmit={handleUserSubmit} className="space-y-4">
                  {mode === 'signup' && (
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-slate-300">Username</label>
                      <div className="relative">
                        <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          required
                          minLength={2}
                          maxLength={40}
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          placeholder="Creator username"
                          className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-xl bg-[#0D0D16] border border-white/10 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
                        />
                      </div>
                    </div>
                  )}

                  {mode === 'login' ? (
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-slate-300">
                        Email or Username
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          required
                          value={loginIdentifier}
                          onChange={(e) => setLoginIdentifier(e.target.value)}
                          placeholder="you@domain.com or username"
                          autoComplete="username"
                          className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-xl bg-[#0D0D16] border border-white/10 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-slate-300">
                        Email Address
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@domain.com"
                          autoComplete="email"
                          className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-xl bg-[#0D0D16] border border-white/10 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
                        />
                      </div>
                    </div>
                  )}

                  {mode !== 'forgot' && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-medium text-slate-300">Password</label>
                        {mode === 'login' && (
                          <button
                            type="button"
                            onClick={() => handleModeSwitch('forgot')}
                            className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
                          >
                            Forgot password?
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="password"
                          required
                          minLength={6}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                          className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-xl bg-[#0D0D16] border border-white/10 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
                        />
                      </div>
                    </div>
                  )}

                  {mode === 'signup' && (
                    <div className="p-3 rounded-xl bg-[#0D0D16] border border-white/10 space-y-2">
                      <p className="text-[11px] font-medium text-slate-300">
                        Included Creator Authorities & Allowance
                      </p>
                      <div className="grid grid-cols-2 gap-1.5 text-[11px] text-slate-400">
                        {CREATOR_AUTHORITIES_PREVIEW.map((item) => (
                          <span key={item.key} className="truncate">
                            · {item.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white text-sm font-medium transition-colors inline-flex items-center justify-center gap-2"
                  >
                    {loading
                      ? 'Please wait...'
                      : mode === 'signup'
                      ? 'Register Creator Account'
                      : mode === 'forgot'
                      ? 'Send Reset Link'
                      : 'Sign In'}
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  {mode === 'forgot' && (
                    <button
                      type="button"
                      onClick={() => handleModeSwitch('login')}
                      className="w-full text-xs text-slate-400 hover:text-white py-2 transition-colors"
                    >
                      Back to Sign In
                    </button>
                  )}
                </form>

                {mode !== 'forgot' && (
                  <>
                    <div className="relative flex items-center py-1">
                      <div className="flex-grow border-t border-white/10" />
                      <span className="shrink mx-3 text-xs text-slate-500">or continue with</span>
                      <div className="flex-grow border-t border-white/10" />
                    </div>

                    <button
                      type="button"
                      disabled={loading}
                      onClick={handleGoogleSignIn}
                      className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#0D0D16] hover:bg-[#19192A] border border-white/10 text-sm font-medium text-slate-200 transition-colors inline-flex items-center justify-center gap-2.5"
                    >
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                        <path
                          fill="#4285F4"
                          d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.88c2.27-2.09 3.54-5.17 3.54-8.82z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                      </svg>
                      Google Account
                    </button>
                  </>
                )}
              </>
            )}
          </div>

          {mode !== 'authority' && (
            <div className="flex items-center justify-between px-1 text-xs text-slate-400">
              <span>Authority login or invite registration?</span>
              <button
                type="button"
                onClick={() => handleModeSwitch('authority')}
                className="text-violet-400 hover:text-violet-300 font-medium inline-flex items-center gap-1 transition-colors"
              >
                <Shield className="w-3.5 h-3.5" />
                Open Authorities Portal
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
