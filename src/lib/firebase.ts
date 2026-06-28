import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
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

export const db = app ? getFirestore(app, firebaseConfig.firestoreDatabaseId) : null;
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

// Connection test - Disabled to save read quota
/*
async function testConnection() {
  if (!app || !db) {
    console.warn("Firebase is not yet configured. Please complete the setup in AI Studio.");
    return;
  }

  try {
    // Prefer cached doc if available
    await getDoc(doc(db, 'test', 'connection'));
    console.log("Firebase connected successfully");
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration or click 'Accept' in the setup panel.");
    }
  }
}

if (isConfigValid) {
  testConnection();
}
*/

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
