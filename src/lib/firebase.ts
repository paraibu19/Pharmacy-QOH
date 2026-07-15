import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { storage, sessionStorage } from './storage';

// Check if user manually opted to use Local Server Mode or if Firestore is over quota
const checkQuotaOver = () => {
  if (typeof window !== 'undefined') {
    // Clear legacy permanent local storage fallback so they aren't stuck across sessions
    if (storage.getItem('firestore_fallback') === 'true') {
      storage.removeItem('firestore_fallback');
    }

    return sessionStorage.getItem('firestore_fallback') === 'true';
  }
  return false;
};

export const isFallbackMode = checkQuotaOver();

// Initialize Firebase only if config is valid and not in local fallback mode
const isConfigValid = firebaseConfig && firebaseConfig.apiKey && firebaseConfig.apiKey !== "" && !isFallbackMode;

export const app = isConfigValid 
  ? (getApps().length > 0 ? getApp() : initializeApp(firebaseConfig))
  : null;

export const db = app 
  ? initializeFirestore(app, { 
      experimentalForceLongPolling: true,
      useFetchStreams: false
    } as any, firebaseConfig.firestoreDatabaseId) 
  : null;
export const auth = app ? getAuth(app) : null;
export const googleProvider = new GoogleAuthProvider();

// Enable offline persistence to save on read units (Spark plan limit is 50k reads/day)
try {
  if (db && typeof window !== 'undefined') {
    enableIndexedDbPersistence(db).catch((err) => {
      if (err.code === 'failed-precondition') {
        console.warn("Firestore persistence: Multiple tabs open, only one can have persistence.");
      } else if (err.code === 'unimplemented') {
        console.warn("Firestore persistence: Not supported by this browser.");
      }
    });
  }
} catch (e) {
  console.warn("Firestore persistence: Error initializing IndexedDB or blocked by browser storage security:", e);
}

// Connection test - Enabled to validate Firestore connection and trigger fallback
import { doc, getDoc } from 'firebase/firestore';
import { safeReload } from './storage';

async function testConnection() {
  if (!app || !db) {
    return;
  }

  try {
    // Attempt to fetch from server or cache
    await getDoc(doc(db, 'system', 'metadata'));
    console.log("Firebase connection active");
  } catch (error: any) {
    const errMsg = error?.message || String(error);
    const lowerMsg = errMsg.toLowerCase();
    const isFallbackTrigger = lowerMsg.includes('quota') || 
                               lowerMsg.includes('limit') || 
                               lowerMsg.includes('exhausted') ||
                               lowerMsg.includes('resource_exhausted') ||
                               lowerMsg.includes('unavailable') ||
                               lowerMsg.includes('could not reach') ||
                               lowerMsg.includes('offline') ||
                               error?.code === 'unavailable';
                               
    if (isFallbackTrigger) {
      console.warn("[Firestore Auto-Fallback] Startup connection test failed. Activating local fallback:", errMsg);
      sessionStorage.setItem('firestore_fallback', 'true');
      safeReload("startup_connection_failed");
    }
  }
}

if (isConfigValid) {
  testConnection();
}

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
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMsg = error instanceof Error ? error.message : String(error);
  
  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
    authInfo: {
      userId: auth ? auth.currentUser?.uid : null,
      email: auth ? auth.currentUser?.email : null,
      emailVerified: auth ? auth.currentUser?.emailVerified : null,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
