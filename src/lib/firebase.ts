import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  getDocFromServer,
  getFirestore,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();

export async function syncCreationToFirestore(params: {
  type:
    | 'image_edit'
    | 'bg_remove'
    | 'photo_enhance'
    | 'video_edit'
    | 'text_tool';
  prompt: string;
  model: string;
  aspectRatio?: string;
  summary?: string;
}): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) {
    return;
  }
  const path = 'creations';
  try {
    await addDoc(collection(db, path), {
      userId: currentUser.uid,
      type: params.type,
      prompt: params.prompt.slice(0, 2000) || 'KeyAi creation',
      model: params.model.slice(0, 64),
      ...(params.aspectRatio ? { aspectRatio: params.aspectRatio.slice(0, 16) } : {}),
      ...(params.summary ? { summary: params.summary.slice(0, 1000) } : {}),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Missing or insufficient permissions')) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }
}

export async function syncVerifiedUserProfileToFirestore(params: {
  uid: string;
  email: string;
  username: string;
  displayName: string;
}): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified || currentUser.uid !== params.uid) {
    return;
  }
  const path = `users/${params.uid}`;
  try {
    const existingSnap = await getDocFromServer(doc(db, 'users', params.uid)).catch(() => null);
    if (!existingSnap || !existingSnap.exists()) {
      await setDoc(doc(db, 'users', params.uid), {
        uid: params.uid,
        email: params.email.slice(0, 254),
        username: params.username.slice(0, 40) || 'Creator',
        displayName: params.displayName.slice(0, 80) || 'Creator',
        role: 'user',
        credits: 50,
        unlimitedCredits: false,
        status: 'active',
        lastCreditReset: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('Missing or insufficient permissions')) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }
}
