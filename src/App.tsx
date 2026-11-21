import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { Coins, Infinity as InfinityIcon, Menu, ShieldCheck } from 'lucide-react';
import { AuthScreen } from './components/AuthScreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import { KeyAiLogo } from './components/KeyAiLogo';
import { Sidebar } from './components/Sidebar';
import { AdminPortalView } from './components/views/AdminPortalView';
import { AiChatView } from './components/views/AiChatView';
import { CreditsProfileView } from './components/views/CreditsProfileView';
import { DashboardOverview } from './components/views/DashboardOverview';
import { PhotoEditorView } from './components/views/PhotoEditorView';
import { TextToolsView } from './components/views/TextToolsView';
import { VideoEditorView } from './components/views/VideoEditorView';
import {
  apiFetch,
  getStoredAdminToken,
  getStoredUserToken,
  setStoredAdminToken,
  setStoredUserToken,
} from './lib/api';
import { auth, syncVerifiedUserProfileToFirestore } from './lib/firebase';
import type {
  CreationRecord,
  FeatureCosts,
  KeyAiProfile,
  WorkspaceSection,
} from './types/keyai';

const DEFAULT_COSTS: FeatureCosts = {
  chat: 1,
  text_tool: 1,
  image_edit: 4,
  bg_remove: 4,
  photo_enhance: 4,
  video_subtitles: 3,
  video_edit: 10,
};

function KeyAiApp() {
  const [initializing, setInitializing] = useState(true);
  const [profile, setProfile] = useState<KeyAiProfile | null>(null);
  const [actorType, setActorType] = useState<'admin' | 'user' | null>(null);
  const [featureCosts, setFeatureCosts] = useState<FeatureCosts>(DEFAULT_COSTS);
  const [authError, setAuthError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<WorkspaceSection>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [creations, setCreations] = useState<CreationRecord[]>([]);

  const isAdmin = Boolean(
    profile &&
      (actorType === 'admin' ||
        profile.role === 'super_admin' ||
        profile.role === 'admin' ||
        profile.role === 'moderator')
  );

  const syncFirebaseSession = useCallback(async (usernameHint?: string) => {
    const fbUser = auth.currentUser;
    if (!fbUser) return;
    const token = await fbUser.getIdToken();
    try {
      const res = await apiFetch<{
        user: KeyAiProfile & { featureCosts?: FeatureCosts };
      }>(
        '/api/auth/session',
        {
          method: 'POST',
          body: JSON.stringify({
            username: usernameHint || fbUser.displayName || undefined,
            displayName: fbUser.displayName || usernameHint || undefined,
          }),
        },
        token
      );
      setProfile(res.user);
      setActorType('user');
      if (res.user.featureCosts) {
        setFeatureCosts(res.user.featureCosts);
      }
      setAuthError(null);

      void syncVerifiedUserProfileToFirestore({
        uid: res.user.uid,
        email: res.user.email,
        username: res.user.username,
        displayName: res.user.displayName,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Session synchronization failed.';
      if (msg.toLowerCase().includes('suspended')) {
        await signOut(auth);
        setProfile(null);
        setActorType(null);
        setAuthError(msg);
      } else {
        throw err;
      }
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const res = await apiFetch<{
        actorType: 'admin' | 'user';
        profile: KeyAiProfile;
        featureCosts: FeatureCosts;
      }>('/api/auth/me');
      setProfile(res.profile);
      setActorType(res.actorType);
      setFeatureCosts(res.featureCosts);
    } catch {
      if (getStoredAdminToken()) {
        setStoredAdminToken(null);
        setProfile(null);
        setActorType(null);
      } else if (getStoredUserToken()) {
        setStoredUserToken(null);
        setProfile(null);
        setActorType(null);
      }
    }
  }, []);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      const storedAdmin = getStoredAdminToken();
      if (storedAdmin) {
        try {
          const res = await apiFetch<{
            actorType: 'admin' | 'user';
            profile: KeyAiProfile;
            featureCosts: FeatureCosts;
          }>('/api/auth/me', {}, storedAdmin);
          if (active) {
            setProfile(res.profile);
            setActorType(res.actorType);
            setFeatureCosts(res.featureCosts);
            setInitializing(false);
          }
          return;
        } catch {
          setStoredAdminToken(null);
        }
      }

      const storedUser = getStoredUserToken();
      if (storedUser) {
        try {
          const res = await apiFetch<{
            actorType: 'admin' | 'user';
            profile: KeyAiProfile;
            featureCosts: FeatureCosts;
          }>('/api/auth/me', {}, storedUser);
          if (active) {
            setProfile(res.profile);
            setActorType(res.actorType);
            setFeatureCosts(res.featureCosts);
            setInitializing(false);
          }
          return;
        } catch {
          setStoredUserToken(null);
        }
      }

      const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
        if (!active) return;
        if (getStoredAdminToken() || getStoredUserToken()) {
          setInitializing(false);
          return;
        }
        if (fbUser) {
          try {
            await syncFirebaseSession();
          } catch (err) {
            setAuthError(err instanceof Error ? err.message : 'Authentication error.');
          }
        } else {
          setProfile(null);
          setActorType(null);
        }
        if (active) setInitializing(false);
      });

      return unsubscribe;
    };

    let unsubFn: (() => void) | undefined;
    void bootstrap().then((fn) => {
      unsubFn = fn;
    });

    return () => {
      active = false;
      if (unsubFn) unsubFn();
    };
  }, [syncFirebaseSession]);

  const handleAdminAuthenticated = (adminProfile: KeyAiProfile, costs: FeatureCosts) => {
    setStoredUserToken(null);
    setProfile(adminProfile);
    setActorType('admin');
    setFeatureCosts(costs);
    setAuthError(null);
    setActiveSection('admin');
  };

  const handleServerUserAuthenticated = (userProfile: KeyAiProfile, costs: FeatureCosts) => {
    setStoredAdminToken(null);
    setProfile(userProfile);
    setActorType('user');
    setFeatureCosts(costs);
    setAuthError(null);
    setActiveSection('overview');
  };

  const handleLogout = async () => {
    if (actorType === 'admin') {
      await apiFetch('/api/admin/logout', { method: 'POST' }).catch(() => undefined);
    } else {
      await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    }
    setStoredAdminToken(null);
    setStoredUserToken(null);
    if (auth.currentUser) {
      await signOut(auth).catch(() => undefined);
    }
    setProfile(null);
    setActorType(null);
    setActiveSection('overview');
    setCreations([]);
  };

  const addCreation = (record: CreationRecord) => {
    setCreations((prev) => [record, ...prev].slice(0, 30));
  };

  if (initializing) {
    return (
      <div className="min-h-screen bg-[#09090F] text-slate-200 flex flex-col items-center justify-center gap-4">
        <KeyAiLogo size="lg" />
        <p className="text-xs text-slate-400">Initializing KeyAi Studio...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <AuthScreen
        initialError={authError}
        onAdminAuthenticated={handleAdminAuthenticated}
        onServerUserAuthenticated={handleServerUserAuthenticated}
        onFirebaseAuthenticated={syncFirebaseSession}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#09090F] text-slate-100 flex flex-col lg:flex-row">
      <Sidebar
        profile={profile}
        isAdmin={isAdmin}
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        onLogout={handleLogout}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Compact Top Bar */}
        <header className="sticky top-0 z-30 bg-[#09090F]/90 backdrop-blur-md border-b border-white/10 px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden min-h-[40px] min-w-[40px] p-2 rounded-xl bg-[#141422] border border-white/10 text-slate-200 flex items-center justify-center"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="lg:hidden">
              <KeyAiLogo size="sm" />
            </div>
            <span className="hidden lg:inline-block text-sm font-medium text-slate-300 capitalize">
              {activeSection.replace('_', ' ')}
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {isAdmin && activeSection !== 'admin' && (
              <button
                type="button"
                onClick={() => setActiveSection('admin')}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#19152E] hover:bg-[#231D40] border border-violet-500/35 text-xs font-medium text-violet-200 inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-violet-400" />
                <span className="hidden sm:inline">Admin Portal</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveSection('credits')}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#141422] hover:bg-[#1B1B2E] border border-white/10 text-xs font-mono tabular-nums text-white inline-flex items-center gap-2 whitespace-nowrap transition-colors"
            >
              {profile.unlimitedCredits ? (
                <>
                  <InfinityIcon className="w-4 h-4 text-violet-400" />
                  <span>Unlimited</span>
                </>
              ) : (
                <>
                  <Coins className="w-3.5 h-3.5 text-violet-400" />
                  <span>{profile.credits} cr</span>
                </>
              )}
            </button>
          </div>
        </header>

        {/* Main Workspace Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1380px] w-full mx-auto">
          {activeSection === 'overview' && (
            <DashboardOverview
              profile={profile}
              featureCosts={featureCosts}
              isAdmin={isAdmin}
              creations={creations}
              onNavigate={setActiveSection}
            />
          )}

          {activeSection === 'chat' && (
            <AiChatView
              profile={profile}
              featureCosts={featureCosts}
              onCreditsUpdated={refreshProfile}
            />
          )}

          {activeSection === 'text_tools' && (
            <TextToolsView
              profile={profile}
              featureCosts={featureCosts}
              onCreditsUpdated={refreshProfile}
              onAddCreation={addCreation}
            />
          )}

          {activeSection === 'photo_editor' && (
            <PhotoEditorView
              profile={profile}
              featureCosts={featureCosts}
              onCreditsUpdated={refreshProfile}
              onAddCreation={addCreation}
            />
          )}

          {activeSection === 'video_editor' && (
            <VideoEditorView
              profile={profile}
              featureCosts={featureCosts}
              onCreditsUpdated={refreshProfile}
              onAddCreation={addCreation}
            />
          )}

          {activeSection === 'credits' && (
            <CreditsProfileView
              profile={profile}
              featureCosts={featureCosts}
              isAdminAccount={actorType === 'admin'}
              onProfileRefreshed={refreshProfile}
            />
          )}

          {activeSection === 'admin' && isAdmin && (
            <AdminPortalView currentProfile={profile} onProfileRefreshed={refreshProfile} />
          )}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <KeyAiApp />
    </ErrorBoundary>
  );
}
