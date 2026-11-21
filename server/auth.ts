import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };
import {
  DEFAULT_USER_AUTHORITIES,
  getAdminByEmail,
  getAdminById,
  getUserById,
  isAdminRole,
  type UserRole,
} from './store.ts';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const SECRET_FILE = path.join(DATA_DIR, 'keyai-session.key');

function getSessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) {
    return process.env.SESSION_SECRET;
  }
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (fs.existsSync(SECRET_FILE)) {
    return fs.readFileSync(SECRET_FILE, 'utf-8').trim();
  }
  const generated = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_FILE, generated, 'utf-8');
  return generated;
}

const SESSION_SECRET = getSessionSecret();

export interface AdminTokenPayload {
  type: 'admin';
  adminId: string;
  username: string;
  email: string;
  role: 'super_admin' | 'admin' | 'moderator';
  permissions: string[];
  iat: number;
  exp: number;
}

export interface UserTokenPayload {
  type: 'user';
  uid: string;
  email: string;
  iat: number;
  exp: number;
}

export interface AuthContext {
  actorType: 'admin' | 'user';
  uid: string;
  email: string;
  username: string;
  role: UserRole;
  permissions: string[];
  unlimitedCredits: boolean;
  isAdmin: boolean;
}

declare global {
  namespace Express {
    interface Request {
      authContext?: AuthContext;
    }
  }
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((input.length + 3) % 4);
  return Buffer.from(padded, 'base64');
}

export function signAdminToken(payload: Omit<AdminTokenPayload, 'type' | 'iat' | 'exp'>): string {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: AdminTokenPayload = {
    type: 'admin',
    ...payload,
    iat: now,
    exp: now + 60 * 60 * 24 * 7, // 7 days
  };
  const headerB64 = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadB64 = base64UrlEncode(JSON.stringify(fullPayload));
  const data = `${headerB64}.${payloadB64}`;
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest();
  return `${data}.${base64UrlEncode(sig)}`;
}

export function verifyAdminToken(token: string): AdminTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;
  const data = `${headerB64}.${payloadB64}`;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest();
  const actualSig = base64UrlDecode(sigB64);
  if (expectedSig.length !== actualSig.length || !crypto.timingSafeEqual(expectedSig, actualSig)) {
    return null;
  }
  try {
    const parsed = JSON.parse(base64UrlDecode(payloadB64).toString('utf-8')) as AdminTokenPayload;
    if (parsed.type !== 'admin') return null;
    const now = Math.floor(Date.now() / 1000);
    if (!parsed.exp || parsed.exp < now) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function signUserToken(payload: { uid: string; email: string }): string {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: UserTokenPayload = {
    type: 'user',
    uid: payload.uid,
    email: payload.email,
    iat: now,
    exp: now + 60 * 60 * 24 * 7,
  };
  const headerB64 = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadB64 = base64UrlEncode(JSON.stringify(fullPayload));
  const data = `${headerB64}.${payloadB64}`;
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest();
  return `${data}.${base64UrlEncode(sig)}`;
}

export function verifyUserToken(token: string): UserTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;
  const data = `${headerB64}.${payloadB64}`;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest();
  const actualSig = base64UrlDecode(sigB64);
  if (expectedSig.length !== actualSig.length || !crypto.timingSafeEqual(expectedSig, actualSig)) {
    return null;
  }
  try {
    const parsed = JSON.parse(base64UrlDecode(payloadB64).toString('utf-8')) as UserTokenPayload;
    if (parsed.type !== 'user') return null;
    const now = Math.floor(Date.now() / 1000);
    if (!parsed.exp || parsed.exp < now) return null;
    return parsed;
  } catch {
    return null;
  }
}

// --- Firebase ID Token Verification using Google Public X.509 Certs ---
let cachedCerts: Record<string, string> = {};
let certsExpireAt = 0;

async function getGooglePublicCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (certsExpireAt > now && Object.keys(cachedCerts).length > 0) {
    return cachedCerts;
  }
  const res = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
  );
  if (!res.ok) {
    throw new Error('Failed to fetch Firebase public verification keys.');
  }
  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAgeSeconds = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  cachedCerts = (await res.json()) as Record<string, string>;
  certsExpireAt = now + maxAgeSeconds * 1000;
  return cachedCerts;
}

export interface VerifiedFirebaseToken {
  uid: string;
  email: string;
  emailVerified: boolean;
  name?: string;
}

export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseToken> {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed Firebase ID token.');
  }
  const [headerB64, payloadB64, sigB64] = parts;
  const header = JSON.parse(base64UrlDecode(headerB64).toString('utf-8')) as {
    alg?: string;
    kid?: string;
  };
  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Invalid Firebase token header.');
  }

  const certs = await getGooglePublicCerts();
  const certPem = certs[header.kid];
  if (!certPem) {
    throw new Error('Unknown Firebase signing key.');
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();
  const isValid = verifier.verify(certPem, base64UrlDecode(sigB64));
  if (!isValid) {
    throw new Error('Invalid Firebase token signature.');
  }

  const payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf-8')) as {
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    email?: string;
    email_verified?: boolean;
    name?: string;
  };

  const now = Math.floor(Date.now() / 1000);
  const expectedIssuer = `https://securetoken.google.com/${firebaseConfig.projectId}`;
  if (payload.aud !== firebaseConfig.projectId) {
    throw new Error('Firebase token audience mismatch.');
  }
  if (payload.iss !== expectedIssuer) {
    throw new Error('Firebase token issuer mismatch.');
  }
  if (!payload.sub || typeof payload.sub !== 'string') {
    throw new Error('Firebase token missing subject.');
  }
  if (!payload.exp || payload.exp < now) {
    throw new Error('Firebase token expired.');
  }
  if (payload.iat && payload.iat > now + 300) {
    throw new Error('Firebase token issued in the future.');
  }

  return {
    uid: payload.sub,
    email: payload.email || '',
    emailVerified: Boolean(payload.email_verified),
    name: payload.name,
  };
}

function extractBearerOrCookie(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').map((c) => c.trim());
    for (const prefix of ['keyai_admin_session=', 'keyai_user_session=']) {
      for (const c of cookies) {
        if (c.startsWith(prefix)) {
          return decodeURIComponent(c.slice(prefix.length));
        }
      }
    }
  }
  return null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = extractBearerOrCookie(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  // 1. Check Server-Signed Admin Session Token first
  const adminPayload = verifyAdminToken(token);
  if (adminPayload) {
    const adminRecord = getAdminById(adminPayload.adminId);
    if (!adminRecord || adminRecord.status === 'suspended') {
      res.status(403).json({ error: 'Admin account is suspended or revoked.' });
      return;
    }
    req.authContext = {
      actorType: 'admin',
      uid: adminRecord.id,
      email: adminRecord.email,
      username: adminRecord.username,
      role: adminRecord.role,
      permissions: adminRecord.permissions,
      unlimitedCredits: true,
      isAdmin: true,
    };
    next();
    return;
  }

  // 2. Check Server-Signed Local User Session Token
  const userPayload = verifyUserToken(token);
  if (userPayload) {
    const user = getUserById(userPayload.uid);
    if (!user) {
      res.status(401).json({ error: 'User account no longer exists.' });
      return;
    }
    if (user.status === 'suspended') {
      res.status(403).json({ error: 'Your account has been suspended by an administrator.' });
      return;
    }
    const linkedAdmin = user.email ? getAdminByEmail(user.email) : undefined;
    const isLinkedAdmin = Boolean(linkedAdmin && linkedAdmin.status === 'active');
    const role: UserRole = isLinkedAdmin && linkedAdmin ? linkedAdmin.role : user.role;
    const isAdmin = isLinkedAdmin || isAdminRole(role);

    req.authContext = {
      actorType: 'user',
      uid: user.uid,
      email: user.email,
      username: user.username,
      role,
      permissions:
        isLinkedAdmin && linkedAdmin
          ? linkedAdmin.permissions
          : user.authorities || [...DEFAULT_USER_AUTHORITIES],
      unlimitedCredits: Boolean(user.unlimitedCredits || isAdmin),
      isAdmin,
    };
    next();
    return;
  }

  // 3. Otherwise verify Firebase ID Token
  try {
    const fbToken = await verifyFirebaseIdToken(token);
    const user = getUserById(fbToken.uid);
    if (user && user.status === 'suspended') {
      res.status(403).json({ error: 'Your account has been suspended by an administrator.' });
      return;
    }

    const linkedAdmin = fbToken.email ? getAdminByEmail(fbToken.email) : undefined;
    const isLinkedAdmin = Boolean(linkedAdmin && linkedAdmin.status === 'active' && fbToken.emailVerified);
    const role: UserRole = isLinkedAdmin && linkedAdmin ? linkedAdmin.role : user?.role || 'user';
    const isAdmin = isLinkedAdmin || isAdminRole(role);

    req.authContext = {
      actorType: 'user',
      uid: fbToken.uid,
      email: fbToken.email,
      username: user?.username || fbToken.name || fbToken.email.split('@')[0] || 'Creator',
      role,
      permissions:
        isLinkedAdmin && linkedAdmin
          ? linkedAdmin.permissions
          : user?.authorities || [...DEFAULT_USER_AUTHORITIES],
      unlimitedCredits: Boolean(user?.unlimitedCredits || isAdmin),
      isAdmin,
    };
    next();
  } catch (err) {
    res.status(401).json({
      error: err instanceof Error ? err.message : 'Invalid or expired authentication token.',
    });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.authContext || !req.authContext.isAdmin) {
    res.status(403).json({ error: 'Forbidden: Authorized administrator access required.' });
    return;
  }
  next();
}

export function requireAuthority(authority: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ctx = req.authContext;
    if (!ctx || !ctx.isAdmin) {
      res.status(403).json({ error: 'Forbidden: Authorized administrator access required.' });
      return;
    }
    if (ctx.role === 'super_admin' || ctx.permissions.includes(authority)) {
      next();
      return;
    }
    res.status(403).json({
      error: `Forbidden: Missing required authority (${authority}).`,
    });
  };
}

export function requireStudioAuthority(authority: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ctx = req.authContext;
    if (!ctx) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (ctx.isAdmin || ctx.permissions.includes(authority)) {
      next();
      return;
    }
    res.status(403).json({
      error: `Your account does not currently hold the "${authority}" authority. Contact an administrator.`,
    });
  };
}
