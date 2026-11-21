import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import {
  requireAdmin,
  requireAuth,
  requireAuthority,
  requireStudioAuthority,
  signAdminToken,
  signUserToken,
  verifyFirebaseIdToken,
} from './server/auth.ts';
import {
  formatGeminiError,
  normalizeVideoEditInstruction,
  runAiChat,
  runImageEdit,
  runTextTool,
  runVideoEdit,
  runVideoSubtitles,
} from './server/gemini.ts';
import {
  adminMutateUserCredits,
  adminSetUserAuthorities,
  adminSetUserStatus,
  authenticateLocalUser,
  chargeForOperation,
  createAdminAccount,
  createAuthorityInvite,
  FEATURE_COSTS,
  getAdminById,
  getAdminByIdentifier,
  getAdminStatsAndHistory,
  getUserById,
  getUserTransactions,
  listAllAdmins,
  listAllUsers,
  listAuthorityInvites,
  markAdminLogin,
  refundFailedOperation,
  registerAuthorityWithInvite,
  registerLocalUser,
  RESET_INTERVAL_MS,
  revokeAuthorityInvite,
  sanitizeUserForClient,
  updateAdminRoleAndPermissions,
  updateUserProfileName,
  upsertFirebaseUser,
  verifyMasterAuthorizationCode,
  verifyPassword,
} from './server/store.ts';

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ extended: true, limit: '100mb' }));

  // --- Health ---
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'KeyAi', timestamp: Date.now() });
  });

  // --- Firebase User Session Sync (Creates profile & triggers 24h credit reset) ---
  app.post('/api/auth/session', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing Firebase ID token.' });
      return;
    }
    const token = authHeader.slice(7).trim();
    try {
      const verified = await verifyFirebaseIdToken(token);
      const { username, displayName } = (req.body || {}) as {
        username?: string;
        displayName?: string;
      };
      const user = upsertFirebaseUser({
        uid: verified.uid,
        email: verified.email,
        username,
        displayName: displayName || verified.name,
      });

      if (user.status === 'suspended') {
        res.status(403).json({
          error: 'Your account has been suspended by an administrator.',
          suspended: true,
        });
        return;
      }

      res.json({
        user: {
          ...sanitizeUserForClient(user),
          permissions: user.authorities,
          nextCreditResetAt: user.lastCreditReset + RESET_INTERVAL_MS,
          featureCosts: FEATURE_COSTS,
        },
      });
    } catch (err) {
      res.status(401).json({
        error: err instanceof Error ? err.message : 'Invalid Firebase session.',
      });
    }
  });

  // --- KeyAi Email/Password Registration & Login (Works alongside Firebase Auth) ---
  app.post('/api/auth/register', (req: Request, res: Response) => {
    const { username, email, password } = (req.body || {}) as {
      username?: string;
      email?: string;
      password?: string;
    };
    if (!username || !email || !password) {
      res.status(400).json({ error: 'Username, email, and password are required.' });
      return;
    }
    const created = registerLocalUser({ username, email, password });
    if ('error' in created) {
      res.status(created.status).json({ error: created.error });
      return;
    }

    const token = signUserToken({ uid: created.uid, email: created.email });
    res.cookie('keyai_user_session', token, {
      httpOnly: true,
      sameSite: 'none',
      secure: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({
      userToken: token,
      profile: {
        ...sanitizeUserForClient(created),
        permissions: created.authorities,
        nextCreditResetAt: created.lastCreditReset + RESET_INTERVAL_MS,
      },
      featureCosts: FEATURE_COSTS,
    });
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { identifier, email, password } = (req.body || {}) as {
      identifier?: string;
      email?: string;
      password?: string;
    };
    const loginId = (identifier || email || '').trim();
    if (!loginId || !password) {
      res.status(400).json({ error: 'Email or username and password are required.' });
      return;
    }

    const admin = getAdminByIdentifier(loginId);
    if (admin && verifyPassword(password, admin.passwordHash, admin.passwordSalt)) {
      if (admin.status === 'suspended') {
        res.status(403).json({ error: 'This authority account is suspended.' });
        return;
      }
      markAdminLogin(admin.id);
      const adminToken = signAdminToken({
        adminId: admin.id,
        username: admin.username,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions,
      });
      res.cookie('keyai_admin_session', adminToken, {
        httpOnly: true,
        sameSite: 'none',
        secure: true,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      res.json({
        isAdmin: true,
        adminToken,
        profile: {
          uid: admin.id,
          username: admin.username,
          displayName: admin.username,
          email: admin.email,
          role: admin.role,
          permissions: admin.permissions,
          credits: 999999,
          unlimitedCredits: true,
          status: admin.status,
          lastCreditReset: admin.createdAt,
          nextCreditResetAt: null,
          createdAt: admin.createdAt,
        },
        featureCosts: FEATURE_COSTS,
      });
      return;
    }

    const result = authenticateLocalUser({ identifier: loginId, password });
    if ('error' in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    const token = signUserToken({ uid: result.uid, email: result.email });
    res.cookie('keyai_user_session', token, {
      httpOnly: true,
      sameSite: 'none',
      secure: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      isAdmin: false,
      userToken: token,
      profile: {
        ...sanitizeUserForClient(result),
        permissions: result.authorities,
        nextCreditResetAt: result.lastCreditReset + RESET_INTERVAL_MS,
      },
      featureCosts: FEATURE_COSTS,
    });
  });

  app.post('/api/auth/logout', (_req: Request, res: Response) => {
    res.clearCookie('keyai_user_session', { httpOnly: true, sameSite: 'none', secure: true });
    res.clearCookie('keyai_admin_session', { httpOnly: true, sameSite: 'none', secure: true });
    res.json({ ok: true });
  });

  // --- Get Current Authenticated Profile (User or Admin) ---
  app.get('/api/auth/me', requireAuth, (req: Request, res: Response) => {
    const ctx = req.authContext!;
    if (ctx.actorType === 'admin') {
      const admin = getAdminById(ctx.uid);
      if (!admin) {
        res.status(404).json({ error: 'Admin not found.' });
        return;
      }
      res.json({
        actorType: 'admin',
        profile: {
          uid: admin.id,
          username: admin.username,
          displayName: admin.username,
          email: admin.email,
          role: admin.role,
          permissions: admin.permissions,
          credits: 999999,
          unlimitedCredits: true,
          status: admin.status,
          lastCreditReset: admin.createdAt,
          nextCreditResetAt: null,
          createdAt: admin.createdAt,
        },
        featureCosts: FEATURE_COSTS,
      });
      return;
    }

    const user = getUserById(ctx.uid);
    if (!user) {
      res.status(404).json({ error: 'User profile not initialized.' });
      return;
    }
    res.json({
      actorType: 'user',
      profile: {
        ...sanitizeUserForClient(user),
        permissions: ctx.permissions,
        nextCreditResetAt: user.lastCreditReset + RESET_INTERVAL_MS,
      },
      featureCosts: FEATURE_COSTS,
    });
  });

  // --- Update Own Safe Profile Fields (Never credits/role/authorities) ---
  app.patch('/api/auth/profile', requireAuth, (req: Request, res: Response) => {
    const ctx = req.authContext!;
    if (ctx.actorType === 'admin') {
      res.status(400).json({ error: 'Admin username is managed in the Admin Portal.' });
      return;
    }
    const { username, displayName } = (req.body || {}) as {
      username?: string;
      displayName?: string;
    };
    const updated = updateUserProfileName(
      ctx.uid,
      username || ctx.username,
      displayName || username || ctx.username
    );
    if (!updated) {
      res.status(404).json({ error: 'User profile not found.' });
      return;
    }
    res.json({
      profile: {
        ...sanitizeUserForClient(updated),
        permissions: updated.authorities,
        nextCreditResetAt: updated.lastCreditReset + RESET_INTERVAL_MS,
      },
    });
  });

  // --- User Credit Transaction History ---
  app.get('/api/credits/history', requireAuth, (req: Request, res: Response) => {
    const ctx = req.authContext!;
    const transactions = getUserTransactions(ctx.uid, 100);
    res.json({ transactions });
  });

  // --- Admin / Authority Authentication (Server-Side Credential Verification) ---
  app.post('/api/admin/login', (req: Request, res: Response) => {
    const { username, password, authorizationCode } = (req.body || {}) as {
      username?: string;
      password?: string;
      authorizationCode?: string;
    };
    if (!username || !password) {
      res.status(400).json({ error: 'Username or email and password are required.' });
      return;
    }

    if (authorizationCode && authorizationCode.trim() && !verifyMasterAuthorizationCode(authorizationCode)) {
      res.status(401).json({ error: 'Invalid authorization code.' });
      return;
    }

    const admin = getAdminByIdentifier(username);
    if (!admin || !verifyPassword(password, admin.passwordHash, admin.passwordSalt)) {
      res.status(401).json({ error: 'Invalid authority credentials.' });
      return;
    }

    if (admin.status === 'suspended') {
      res.status(403).json({ error: 'This authority account is suspended.' });
      return;
    }

    markAdminLogin(admin.id);

    const token = signAdminToken({
      adminId: admin.id,
      username: admin.username,
      email: admin.email,
      role: admin.role,
      permissions: admin.permissions,
    });

    res.cookie('keyai_admin_session', token, {
      httpOnly: true,
      sameSite: 'none',
      secure: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      adminToken: token,
      profile: {
        uid: admin.id,
        username: admin.username,
        displayName: admin.username,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions,
        credits: 999999,
        unlimitedCredits: true,
        status: admin.status,
        createdAt: admin.createdAt,
      },
      featureCosts: FEATURE_COSTS,
    });
  });

  // --- Authorization-Code & Invite-Protected Authority Registration ---
  app.post('/api/authority/register', (req: Request, res: Response) => {
    const { username, email, password, inviteCode, authorizationCode } = (req.body || {}) as {
      username?: string;
      email?: string;
      password?: string;
      inviteCode?: string;
      authorizationCode?: string;
    };
    const resolvedCode = (authorizationCode || inviteCode || '').trim();
    if (!username || !email || !password || !resolvedCode) {
      res.status(400).json({
        error: 'Username, email, password, and an Authorization Code are required.',
      });
      return;
    }

    const created = registerAuthorityWithInvite({
      username,
      email,
      password,
      inviteCode: resolvedCode,
    });
    if ('error' in created) {
      res.status(created.status).json({ error: created.error });
      return;
    }

    markAdminLogin(created.id);
    const token = signAdminToken({
      adminId: created.id,
      username: created.username,
      email: created.email,
      role: created.role,
      permissions: created.permissions,
    });

    res.cookie('keyai_admin_session', token, {
      httpOnly: true,
      sameSite: 'none',
      secure: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({
      adminToken: token,
      profile: {
        uid: created.id,
        username: created.username,
        displayName: created.username,
        email: created.email,
        role: created.role,
        permissions: created.permissions,
        credits: 999999,
        unlimitedCredits: true,
        status: created.status,
        createdAt: created.createdAt,
      },
      featureCosts: FEATURE_COSTS,
    });
  });

  app.post('/api/admin/logout', (_req: Request, res: Response) => {
    res.clearCookie('keyai_admin_session', { httpOnly: true, sameSite: 'none', secure: true });
    res.clearCookie('keyai_user_session', { httpOnly: true, sameSite: 'none', secure: true });
    res.json({ ok: true });
  });

  // --- Protected Admin & Authority APIs (Enforced via requireAuth + requireAdmin + requireAuthority) ---
  app.get('/api/admin/overview', requireAuth, requireAdmin, (req: Request, res: Response) => {
    const search = typeof req.query.search === 'string' ? req.query.search : '';
    const users = listAllUsers(search);
    const admins = listAllAdmins();
    const { stats, transactions, activityLogs } = getAdminStatsAndHistory(120);
    const authorityInvites =
      req.authContext?.role === 'super_admin' || req.authContext?.permissions.includes('manage_admins')
        ? listAuthorityInvites()
        : [];
    res.json({ users, admins, authorityInvites, stats, transactions, activityLogs });
  });

  app.post(
    '/api/admin/users/:uid/credits',
    requireAuth,
    requireAuthority('manage_credits'),
    (req: Request, res: Response) => {
      const ctx = req.authContext!;
      const targetUid = String(req.params.uid);
      const { mode, amount, unlimited, note } = (req.body || {}) as {
        mode?: 'add' | 'deduct' | 'set' | 'toggle_unlimited';
        amount?: number;
        unlimited?: boolean;
        note?: string;
      };

      if (!mode || !['add', 'deduct', 'set', 'toggle_unlimited'].includes(mode)) {
        res.status(400).json({ error: 'Invalid credit mutation mode.' });
        return;
      }

      const result = adminMutateUserCredits({
        targetUid,
        mode,
        amount,
        unlimited,
        note,
        actorId: ctx.uid,
        actorLabel: ctx.username,
      });

      if ('error' in result) {
        res.status(result.status).json({ error: result.error });
        return;
      }

      res.json({ user: sanitizeUserForClient(result) });
    }
  );

  app.post(
    '/api/admin/users/:uid/status',
    requireAuth,
    requireAuthority('manage_users'),
    (req: Request, res: Response) => {
      const ctx = req.authContext!;
      const targetUid = String(req.params.uid);
      const { status } = (req.body || {}) as { status?: 'active' | 'suspended' };
      if (status !== 'active' && status !== 'suspended') {
        res.status(400).json({ error: 'Status must be active or suspended.' });
        return;
      }
      const result = adminSetUserStatus({
        targetUid,
        status,
        actorId: ctx.uid,
        actorLabel: ctx.username,
      });
      if ('error' in result) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json({ user: sanitizeUserForClient(result) });
    }
  );

  app.patch(
    '/api/admin/users/:uid/authorities',
    requireAuth,
    requireAuthority('manage_users'),
    (req: Request, res: Response) => {
      const ctx = req.authContext!;
      const targetUid = String(req.params.uid);
      const { authorities } = (req.body || {}) as { authorities?: string[] };
      if (!Array.isArray(authorities)) {
        res.status(400).json({ error: 'Authorities array is required.' });
        return;
      }
      const result = adminSetUserAuthorities({
        targetUid,
        authorities,
        actorLabel: ctx.username,
      });
      if ('error' in result) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json({ user: result });
    }
  );

  app.post(
    '/api/admin/admins',
    requireAuth,
    requireAuthority('manage_admins'),
    (req: Request, res: Response) => {
      const ctx = req.authContext!;
      const { username, email, password, role, permissions } = (req.body || {}) as {
        username?: string;
        email?: string;
        password?: string;
        role?: 'super_admin' | 'admin' | 'moderator';
        permissions?: string[];
      };

      if (!username || !password) {
        res.status(400).json({ error: 'Username and password are required.' });
        return;
      }

      const result = createAdminAccount({
        username,
        email: email || `${username.toLowerCase()}@keyai.studio`,
        password,
        role: role || 'admin',
        permissions: Array.isArray(permissions)
          ? permissions
          : ['manage_users', 'manage_credits', 'view_analytics', 'unlimited_ai'],
        createdBy: ctx.username,
      });

      if ('error' in result) {
        res.status(result.status).json({ error: result.error });
        return;
      }

      res.status(201).json({ admin: result });
    }
  );

  app.patch(
    '/api/admin/admins/:adminId',
    requireAuth,
    requireAuthority('manage_admins'),
    (req: Request, res: Response) => {
      const ctx = req.authContext!;
      const adminId = String(req.params.adminId);
      const { role, permissions, status } = (req.body || {}) as {
        role?: 'super_admin' | 'admin' | 'moderator';
        permissions?: string[];
        status?: 'active' | 'suspended';
      };

      const result = updateAdminRoleAndPermissions({
        adminId,
        role,
        permissions,
        status,
        actorUsername: ctx.username,
      });

      if ('error' in result) {
        res.status(result.status).json({ error: result.error });
        return;
      }

      res.json({ admin: result });
    }
  );

  app.get(
    '/api/admin/authority-invites',
    requireAuth,
    requireAuthority('manage_admins'),
    (_req: Request, res: Response) => {
      res.json({ invites: listAuthorityInvites() });
    }
  );

  app.post(
    '/api/admin/authority-invites',
    requireAuth,
    requireAuthority('manage_admins'),
    (req: Request, res: Response) => {
      const ctx = req.authContext!;
      const { role, permissions, expiresInHours } = (req.body || {}) as {
        role?: 'super_admin' | 'admin' | 'moderator';
        permissions?: string[];
        expiresInHours?: number;
      };
      const created = createAuthorityInvite({
        role: role || 'admin',
        permissions: Array.isArray(permissions)
          ? permissions
          : ['manage_users', 'manage_credits', 'view_analytics', 'unlimited_ai'],
        expiresInHours,
        createdBy: ctx.username,
      });
      res.status(201).json({
        invite: {
          id: created.invite.id,
          codePreview: created.invite.codePreview,
          role: created.invite.role,
          permissions: created.invite.permissions,
          createdBy: created.invite.createdBy,
          createdAt: created.invite.createdAt,
          expiresAt: created.invite.expiresAt,
          usedBy: created.invite.usedBy,
          usedAt: created.invite.usedAt,
          revoked: created.invite.revoked,
        },
        inviteCode: created.rawCode,
      });
    }
  );

  app.delete(
    '/api/admin/authority-invites/:inviteId',
    requireAuth,
    requireAuthority('manage_admins'),
    (req: Request, res: Response) => {
      const ctx = req.authContext!;
      const inviteId = String(req.params.inviteId);
      const ok = revokeAuthorityInvite(inviteId, ctx.username);
      if (!ok) {
        res.status(404).json({ error: 'Authority invite not found.' });
        return;
      }
      res.json({ ok: true });
    }
  );

  // --- AI Feature Endpoints (Authoritative Server Credit Enforcement + Gemini API) ---

  app.post('/api/ai/chat', requireAuth, requireStudioAuthority('studio_chat'), async (req: Request, res: Response) => {
    const ctx = req.authContext!;
    const { message, history, systemPrompt } = (req.body || {}) as {
      message?: string;
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
      systemPrompt?: string;
    };
    if (!message || !message.trim()) {
      res.status(400).json({ error: 'Message prompt cannot be empty.' });
      return;
    }

    const charge = chargeForOperation({
      actorType: ctx.actorType,
      uid: ctx.uid,
      username: ctx.username,
      email: ctx.email,
      cost: FEATURE_COSTS.chat,
      feature: 'AI Chat',
      model: 'gemini-4-hydrogen',
    });
    if (!charge.ok) {
      res.status(charge.status).json({ error: charge.error });
      return;
    }

    try {
      const result = await runAiChat({
        message: message.trim(),
        history: Array.isArray(history) ? history : [],
        systemPrompt,
      });
      res.json({
        reply: result.reply,
        model: result.model,
        creditsRemaining: charge.balanceAfter,
        unlimited: charge.unlimited,
      });
    } catch (err) {
      refundFailedOperation({
        actorType: ctx.actorType,
        uid: ctx.uid,
        cost: FEATURE_COSTS.chat,
        feature: 'AI Chat',
      });
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/ai/text-tools', requireAuth, requireStudioAuthority('studio_text'), async (req: Request, res: Response) => {
    const ctx = req.authContext!;
    const { mode, input, tone, targetLanguage, contentType } = (req.body || {}) as {
      mode?: 'rewrite' | 'translate' | 'generate';
      input?: string;
      tone?: string;
      targetLanguage?: string;
      contentType?: string;
    };
    if (!mode || !input || !input.trim()) {
      res.status(400).json({ error: 'Mode and input text are required.' });
      return;
    }

    const featureLabel =
      mode === 'rewrite' ? 'Text Rewrite' : mode === 'translate' ? 'Language Translation' : 'Content Generation';

    const charge = chargeForOperation({
      actorType: ctx.actorType,
      uid: ctx.uid,
      username: ctx.username,
      email: ctx.email,
      cost: FEATURE_COSTS.text_tool,
      feature: featureLabel,
      model: 'gemini-4-hydrogen',
    });
    if (!charge.ok) {
      res.status(charge.status).json({ error: charge.error });
      return;
    }

    try {
      const result = await runTextTool({
        mode,
        input: input.trim(),
        tone,
        targetLanguage,
        contentType,
      });
      res.json({
        output: result.output,
        model: result.model,
        creditsRemaining: charge.balanceAfter,
        unlimited: charge.unlimited,
      });
    } catch (err) {
      refundFailedOperation({
        actorType: ctx.actorType,
        uid: ctx.uid,
        cost: FEATURE_COSTS.text_tool,
        feature: featureLabel,
      });
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/ai/image/edit', requireAuth, requireStudioAuthority('studio_photo_edit'), async (req: Request, res: Response) => {
    const ctx = req.authContext!;
    const { imageBase64, mimeType, operation, instruction } = (req.body || {}) as {
      imageBase64?: string;
      mimeType?: string;
      operation?: 'edit' | 'remove_bg' | 'enhance';
      instruction?: string;
    };
    if (!imageBase64) {
      res.status(400).json({ error: 'Source image data is required.' });
      return;
    }

    const op = operation || 'edit';
    const cost =
      op === 'remove_bg'
        ? FEATURE_COSTS.bg_remove
        : op === 'enhance'
        ? FEATURE_COSTS.photo_enhance
        : FEATURE_COSTS.image_edit;
    const featureLabel =
      op === 'remove_bg'
        ? 'Background Removal'
        : op === 'enhance'
        ? 'Photo Quality Enhancement'
        : 'AI Photo Edit';

    const charge = chargeForOperation({
      actorType: ctx.actorType,
      uid: ctx.uid,
      username: ctx.username,
      email: ctx.email,
      cost,
      feature: featureLabel,
      model: 'gemini-3.1-flash-lite-image',
    });
    if (!charge.ok) {
      res.status(charge.status).json({ error: charge.error });
      return;
    }

    try {
      const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
      const result = await runImageEdit({
        imageBase64: cleanBase64,
        mimeType: mimeType || 'image/png',
        operation: op,
        instruction,
      });
      res.json({
        imageDataUrl: result.imageDataUrl,
        note: result.note,
        model: result.model,
        creditsRemaining: charge.balanceAfter,
        unlimited: charge.unlimited,
      });
    } catch (err) {
      refundFailedOperation({
        actorType: ctx.actorType,
        uid: ctx.uid,
        cost,
        feature: featureLabel,
      });
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/ai/video/edit', requireAuth, requireStudioAuthority('studio_video_edit'), async (req: Request, res: Response) => {
    const ctx = req.authContext!;
    const { videoBase64, mimeType, instruction } = (req.body || {}) as {
      videoBase64?: string;
      mimeType?: string;
      instruction?: string;
    };
    if (!videoBase64) {
      res.status(400).json({ error: 'Please upload a video first before editing.' });
      return;
    }

    const effectiveInstruction = normalizeVideoEditInstruction(instruction || 'Edit it');

    const charge = chargeForOperation({
      actorType: ctx.actorType,
      uid: ctx.uid,
      username: ctx.username,
      email: ctx.email,
      cost: FEATURE_COSTS.video_edit,
      feature: 'AI Video Edit',
      model: 'gemini-omni-1.2-flash',
    });
    if (!charge.ok) {
      res.status(charge.status).json({ error: charge.error });
      return;
    }

    try {
      const cleanVideo = videoBase64.includes(',') ? videoBase64.split(',')[1] : videoBase64;
      const result = await runVideoEdit({
        videoBase64: cleanVideo,
        mimeType: mimeType || 'video/mp4',
        instruction: effectiveInstruction,
      });
      res.json({
        videoDataUrl: result.videoDataUrl,
        model: result.model,
        creditsRemaining: charge.balanceAfter,
        unlimited: charge.unlimited,
      });
    } catch (err) {
      refundFailedOperation({
        actorType: ctx.actorType,
        uid: ctx.uid,
        cost: FEATURE_COSTS.video_edit,
        feature: 'AI Video Edit',
      });
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/ai/video/subtitles', requireAuth, requireStudioAuthority('studio_video_edit'), async (req: Request, res: Response) => {
    const ctx = req.authContext!;
    const { videoBase64, mimeType, language } = (req.body || {}) as {
      videoBase64?: string;
      mimeType?: string;
      language?: string;
    };
    if (!videoBase64) {
      res.status(400).json({ error: 'Source video is required to generate subtitles.' });
      return;
    }

    const charge = chargeForOperation({
      actorType: ctx.actorType,
      uid: ctx.uid,
      username: ctx.username,
      email: ctx.email,
      cost: FEATURE_COSTS.video_subtitles,
      feature: 'AI Video Subtitles',
      model: 'gemini-4-hydrogen',
    });
    if (!charge.ok) {
      res.status(charge.status).json({ error: charge.error });
      return;
    }

    try {
      const cleanVideo = videoBase64.includes(',') ? videoBase64.split(',')[1] : videoBase64;
      const result = await runVideoSubtitles({
        videoBase64: cleanVideo,
        mimeType: mimeType || 'video/mp4',
        language,
      });
      res.json({
        subtitles: result.subtitles,
        model: result.model,
        creditsRemaining: charge.balanceAfter,
        unlimited: charge.unlimited,
      });
    } catch (err) {
      refundFailedOperation({
        actorType: ctx.actorType,
        uid: ctx.uid,
        cost: FEATURE_COSTS.video_subtitles,
        feature: 'AI Video Subtitles',
      });
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // --- Vite / Static Frontend Serving ---
  const distDir = path.resolve(process.cwd(), 'dist');
  const isProd =
    process.env.NODE_ENV === 'production' ||
    (process.env.npm_lifecycle_event === 'start' &&
      fs.existsSync(path.join(distDir, 'index.html')));
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`KeyAi server running on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start KeyAi server:', err);
  process.exit(1);
});
