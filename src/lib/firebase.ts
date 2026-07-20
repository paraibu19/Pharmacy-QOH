import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
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
  ? initializeFirestore(app, {}, firebaseConfig.firestoreDatabaseId) 
  : null;
export const auth = app ? getAuth(app) : null;
export const googleProvider = new GoogleAuthProvider();

// Offline persistence is disabled to prevent sticky offline write queue stream exhaustion in iframe environments

// Connection test - Enabled to validate Firestore connection and trigger fallback
import { doc, getDoc } from 'firebase/firestore';
import { safeReload } from './storage';

async function testConnection() {
  if (!app || !db) {
    return;
  }

  try {
    // Attempt to fetch from server with a timeout to prevent hanging when offline/exhausted
    const connectionPromise = getDoc(doc(db, 'system', 'metadata'));
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Connection timeout - Firestore service took too long to respond')), 4500)
    );
    
    await Promise.race([connectionPromise, timeoutPromise]);
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
                               lowerMsg.includes('timeout') ||
                               error?.code === 'unavailable' ||
                               error?.code === 'resource-exhausted';
                               
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
  const lowerMsg = errMsg.toLowerCase();
  
  const isFallbackTrigger = lowerMsg.includes('quota') || 
                             lowerMsg.includes('limit') || 
                             lowerMsg.includes('exhausted') ||
                             lowerMsg.includes('resource_exhausted') ||
                             lowerMsg.includes('unavailable') ||
                             lowerMsg.includes('could not reach') ||
                             lowerMsg.includes('offline') ||
                             lowerMsg.includes('timeout') ||
                             (error && (error as any).code === 'unavailable') ||
                             (error && (error as any).code === 'resource-exhausted');

  if (isFallbackTrigger) {
    console.warn("[Firestore Auto-Fallback] Critical Firestore operation error. Activating local fallback:", errMsg);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('firestore_fallback', 'true');
      safeReload("client_critical_fallback_" + operationType);
    }
  }

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
