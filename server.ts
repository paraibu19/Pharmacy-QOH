import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { GoogleGenAI } from "@google/genai";
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

dotenv.config();

// Initialize Firebase Admin for persistent Firestore synchronization
let adminDb: any = null;
try {
  let projectId: string | undefined = undefined;
  let databaseId: string | undefined = undefined;
  
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    projectId = config.projectId;
    databaseId = config.firestoreDatabaseId;
  }
  
  if (!projectId) {
    projectId = process.env.GOOGLE_CLOUD_PROJECT;
  }
  
  if (projectId) {
    let adminApp;
    if (getApps().length === 0) {
      adminApp = initializeApp({
        projectId: projectId
      });
    } else {
      adminApp = getApps()[0];
    }
    adminDb = databaseId ? getFirestore(adminApp, databaseId) : getFirestore(adminApp);
    console.log(`[Firebase Admin Sync] Firestore initialized successfully for project: ${projectId}, database: ${databaseId || '(default)'}`);
  } else {
    console.warn('[Firebase Admin Sync] No project ID found. Running in local-only storage fallback.');
  }
} catch (err: any) {
  console.warn('[Firebase Admin Sync] Graceful initialization failure:', err.message);
}

let aiClient: any = null;
function getGeminiClient() {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not configured. Please add it to Settings > Secrets in AI Studio.");
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

const app = express();
const PORT = 3000;
const DATA_DIR = path.join(process.cwd(), 'data');
const MEDS_FILE = path.join(DATA_DIR, 'medications.json');
const AUDITS_FILE = path.join(DATA_DIR, 'audits.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const TRANSLATION_CACHE_FILE = path.join(DATA_DIR, 'translation_cache.json');
const ENTRY_MISTAKES_DB_FILE = path.join(DATA_DIR, 'entry_mistakes_db.json');
const APPLICATION_STORAGE_FILE = path.join(DATA_DIR, 'application_storage.json');
const METADATA_SYNC_FILE = path.join(DATA_DIR, 'metadata_sync.json');

// Real-time SSE synchronization state
const sseClients = new Set<any>();
let isRealtimeListeningActive = false;
let activeUnsubscribes: (() => void)[] = [];

function notifyClients(type: string, data?: any) {
  const payload = JSON.stringify({ type, timestamp: new Date().toISOString(), data });
  console.log(`[SSE] Broadcasting event "${type}" to ${sseClients.size} connected clients.`);
  for (const client of sseClients) {
    try {
      client.res.write(`data: ${payload}\n\n`);
    } catch (err) {
      sseClients.delete(client);
    }
  }
}

function getTranslationHashSync(text: string): string {
  const clean = (text || '').trim().toLowerCase();
  if (!clean) return '';
  try {
    const hash = crypto.createHash('sha256').update(clean).digest('hex');
    return 'tc_' + hash.slice(0, 50);
  } catch (e) {
    let h1 = 5381;
    let h2 = 127;
    for (let i = 0; i < clean.length; i++) {
      const char = clean.charCodeAt(i);
      h1 = (h1 * 33) ^ char;
      h2 = (h2 * 37) ^ char;
    }
    return 'tcfb_' + Math.abs(h1).toString(36) + '_' + Math.abs(h2).toString(36);
  }
}

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

// Ensure translation cache file exists
if (!fs.existsSync(TRANSLATION_CACHE_FILE)) {
  fs.writeFileSync(TRANSLATION_CACHE_FILE, '{}');
}

// Ensure files exist
if (!fs.existsSync(MEDS_FILE)) {
  fs.writeFileSync(MEDS_FILE, '[]');
}

if (!fs.existsSync(AUDITS_FILE)) fs.writeFileSync(AUDITS_FILE, '[]');
if (!fs.existsSync(SETTINGS_FILE)) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify({
    adminPassword: 'admin123',
    pharmacistPassword: 'pharmacist123',
    orderPassword: 'order123',
    adminEmail: 'admin@halth-org.com'
  }, null, 2));
}

// Auth & Settings Routes (Memory store for verification codes removed)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.post('/api/auth/admin', (req, res) => {
  const { password } = req.body;
  const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  if (password === settings.adminPassword) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: 'Invalid password' });
  }
});

app.post('/api/auth/change-password', (req, res) => {
  const { currentPassword, newPassword, role } = req.body;
  const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  
  // To change any password, you must provide the current ADMIN password
  if (!currentPassword || currentPassword !== settings.adminPassword) {
    return res.status(401).json({ success: false, error: 'Admin password incorrect' });
  }

  if (newPassword) {
    if (role === 'pharmacist') {
      settings.pharmacistPassword = newPassword;
    } else if (role === 'order') {
      settings.orderPassword = newPassword;
    } else {
      settings.adminPassword = newPassword;
    }
  }
  
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  res.json({ success: true });
});

app.post('/api/auth/verify-admin', (req, res) => {
  const { password } = req.body;
  const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  if (password === settings.adminPassword) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: 'Invalid admin password' });
  }
});

app.get('/api/auth/settings', (req, res) => {
  const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  res.json({ 
    adminEmail: settings.adminEmail 
  });
});

// Firestore Sync Helpers and Converters
function convertTimestampToISO(val: any): string {
  if (!val) return new Date().toISOString();
  if (typeof val.toDate === 'function') {
    return val.toDate().toISOString();
  }
  if (val._seconds !== undefined) {
    return new Date(val._seconds * 1000).toISOString();
  }
  return typeof val === 'string' ? val : new Date(val).toISOString();
}

function parseFirestoreDoc(doc: any): any {
  const data = doc.data();
  const res = { ...data, id: doc.id };
  if (res.addedAt) res.addedAt = convertTimestampToISO(res.addedAt);
  if (res.lastUpdatedAt) res.lastUpdatedAt = convertTimestampToISO(res.lastUpdatedAt);
  if (res.auditedAt) res.auditedAt = convertTimestampToISO(res.auditedAt);
  if (res.savedAt) res.savedAt = convertTimestampToISO(res.savedAt);
  return res;
}

function handleAdminDbError(err: any, context: string) {
  const errMsg = err.message || String(err);
  const isPermissionDenied = errMsg.includes('PERMISSION_DENIED') || 
                             errMsg.includes('insufficient permissions') || 
                             errMsg.includes(' 7 ') ||
                             errMsg.startsWith('7 ') ||
                             errMsg.includes(': 7') ||
                             errMsg.includes('Status code: 7');
  
  if (isPermissionDenied) {
    if (adminDb) {
      console.warn(`[Firebase Sync Fallback] Server credentials do not have permission to sync (${context}). Gracefully disabling live server-side Firestore sync and using local filesystem storage fallback.`);
      adminDb = null;
    }
  } else {
    console.error(`[Firebase Sync] Failed: ${context}:`, errMsg);
  }
}

async function syncMedicationsFromFirestore(): Promise<any[]> {
  if (!adminDb) return JSON.parse(fs.readFileSync(MEDS_FILE, 'utf8'));
  try {
    const snapshot = await adminDb.collection('medications').get();
    const meds: any[] = [];
    snapshot.forEach(doc => {
      meds.push(parseFirestoreDoc(doc));
    });
    
    // Keep local cache up to date
    if (meds.length > 0) {
      meds.sort((a, b) => (a.itemName || '').localeCompare(b.itemName || ''));
      fs.writeFileSync(MEDS_FILE, JSON.stringify(meds, null, 2));
    }
    return meds;
  } catch (err: any) {
    handleAdminDbError(err, 'sync medications');
    return JSON.parse(fs.readFileSync(MEDS_FILE, 'utf8'));
  }
}

async function saveMedicationToFirestore(item: any): Promise<void> {
  if (!adminDb) return;
  try {
    const { id, addedAt, lastUpdatedAt, ...rest } = item;
    const docRef = adminDb.collection('medications').doc(id);
    await docRef.set({
      ...rest,
      id: id,
      addedAt: addedAt || new Date().toISOString(),
      lastUpdatedAt: lastUpdatedAt || new Date().toISOString(),
      updatedBy: rest.updatedBy || 'system'
    }, { merge: true });
  } catch (err: any) {
    handleAdminDbError(err, 'save medication');
  }
}

async function saveMedicationsBulkToFirestore(items: any[]): Promise<void> {
  if (!adminDb) return;
  try {
    let batch = adminDb.batch();
    let count = 0;
    for (const item of items) {
      const { id, addedAt, lastUpdatedAt, ...rest } = item;
      const docRef = adminDb.collection('medications').doc(id);
      batch.set(docRef, {
        ...rest,
        id: id,
        addedAt: addedAt || new Date().toISOString(),
        lastUpdatedAt: lastUpdatedAt || new Date().toISOString(),
        updatedBy: rest.updatedBy || 'system'
      }, { merge: true });
      
      count++;
      if (count >= 500) {
        await batch.commit();
        batch = adminDb.batch();
        count = 0;
      }
    }
    if (count > 0) {
      await batch.commit();
    }
  } catch (err: any) {
    handleAdminDbError(err, 'bulk-save medications');
  }
}

async function deleteMedicationFromFirestore(id: string): Promise<void> {
  if (!adminDb) return;
  try {
    await adminDb.collection('medications').doc(id).delete();
  } catch (err: any) {
    handleAdminDbError(err, 'delete medication');
  }
}

async function syncAuditsFromFirestore(): Promise<any[]> {
  if (!adminDb) return JSON.parse(fs.readFileSync(AUDITS_FILE, 'utf8'));
  try {
    const snapshot = await adminDb.collection('inventory_audits').get();
    const audits: any[] = [];
    snapshot.forEach(doc => {
      audits.push(parseFirestoreDoc(doc));
    });
    
    if (audits.length > 0) {
      audits.sort((a, b) => new Date(b.auditedAt || 0).getTime() - new Date(a.auditedAt || 0).getTime());
      fs.writeFileSync(AUDITS_FILE, JSON.stringify(audits, null, 2));
    }
    return audits;
  } catch (err: any) {
    handleAdminDbError(err, 'sync audits');
    return JSON.parse(fs.readFileSync(AUDITS_FILE, 'utf8'));
  }
}

async function saveAuditToFirestore(item: any): Promise<void> {
  if (!adminDb) return;
  try {
    const { id, auditedAt, ...rest } = item;
    await adminDb.collection('inventory_audits').doc(id).set({
      ...rest,
      id: id,
      auditedAt: auditedAt ? Timestamp.fromDate(new Date(auditedAt)) : FieldValue.serverTimestamp(),
      auditedBy: rest.auditedBy || 'system'
    });
  } catch (err: any) {
    handleAdminDbError(err, 'save audit');
  }
}

async function syncEntryMistakesDbFromFirestore(): Promise<any> {
  if (!adminDb) {
    if (fs.existsSync(ENTRY_MISTAKES_DB_FILE)) {
      return JSON.parse(fs.readFileSync(ENTRY_MISTAKES_DB_FILE, 'utf8'));
    }
    return null;
  }
  try {
    const docRef = adminDb.collection('entry_mistakes_configs').doc('global');
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      const data = docSnap.data();
      fs.writeFileSync(ENTRY_MISTAKES_DB_FILE, JSON.stringify(data, null, 2));
      return data;
    }
  } catch (err: any) {
    handleAdminDbError(err, 'sync parameters DB');
  }
  if (fs.existsSync(ENTRY_MISTAKES_DB_FILE)) {
    return JSON.parse(fs.readFileSync(ENTRY_MISTAKES_DB_FILE, 'utf8'));
  }
  return null;
}

async function syncSystemMetadataFromFirestore(): Promise<any> {
  if (!adminDb) {
    if (fs.existsSync(METADATA_SYNC_FILE)) {
      return JSON.parse(fs.readFileSync(METADATA_SYNC_FILE, 'utf8'));
    }
    return null;
  }
  try {
    const docRef = adminDb.collection('system').doc('metadata');
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      const data = docSnap.data();
      const lastDataUpdateStr = data.lastDataUpdate 
        ? (data.lastDataUpdate.toDate ? data.lastDataUpdate.toDate().toISOString() : new Date(data.lastDataUpdate).toISOString())
        : new Date().toISOString();
      
      const metaPayload = {
        lastDataUpdate: lastDataUpdateStr,
        isMesaieedHidden: data.isMesaieedHidden !== undefined ? !!data.isMesaieedHidden : false,
        updatedBy: data.updatedBy || 'system'
      };
      fs.writeFileSync(METADATA_SYNC_FILE, JSON.stringify(metaPayload, null, 2));
      return metaPayload;
    }
  } catch (err: any) {
    handleAdminDbError(err, 'sync system metadata');
  }
  if (fs.existsSync(METADATA_SYNC_FILE)) {
    return JSON.parse(fs.readFileSync(METADATA_SYNC_FILE, 'utf8'));
  }
  return null;
}

async function updateSystemMetadataInFirestore(): Promise<void> {
  const now = new Date().toISOString();
  const metaPayload = {
    lastDataUpdate: now,
    isMesaieedHidden: false,
    updatedBy: 'server'
  };
  if (fs.existsSync(METADATA_SYNC_FILE)) {
    try {
      const current = JSON.parse(fs.readFileSync(METADATA_SYNC_FILE, 'utf8'));
      metaPayload.isMesaieedHidden = !!current.isMesaieedHidden;
    } catch (e) {}
  }
  fs.writeFileSync(METADATA_SYNC_FILE, JSON.stringify(metaPayload, null, 2));
  notifyClients('metadata', metaPayload);

  if (adminDb) {
    try {
      await adminDb.collection('system').doc('metadata').set({
        lastDataUpdate: new Date(),
        updatedBy: 'server'
      }, { merge: true });
    } catch (err: any) {
      console.error('[Firebase Admin] Failed to update global metadata:', err.message);
    }
  }
}

async function saveEntryMistakesDbToFirestore(dbState: any): Promise<void> {
  if (!adminDb) return;
  try {
    await adminDb.collection('entry_mistakes_configs').doc('global').set(dbState);
  } catch (err: any) {
    handleAdminDbError(err, 'save parameters DB');
  }
}

async function deleteEntryMistakesDbFromFirestore(): Promise<void> {
  if (!adminDb) return;
  try {
    await adminDb.collection('entry_mistakes_configs').doc('global').delete();
  } catch (err: any) {
    handleAdminDbError(err, 'delete parameters DB');
  }
}

async function syncApplicationStorageFromFirestore(): Promise<any[]> {
  if (!adminDb) {
    if (fs.existsSync(APPLICATION_STORAGE_FILE)) {
      return JSON.parse(fs.readFileSync(APPLICATION_STORAGE_FILE, 'utf8'));
    }
    return [];
  }
  try {
    const snapshot = await adminDb.collection('application_storage').get();
    const items: any[] = [];
    snapshot.forEach(doc => {
      items.push(parseFirestoreDoc(doc));
    });
    
    if (items.length > 0) {
      items.sort((a, b) => new Date(b.savedAt || 0).getTime() - new Date(a.savedAt || 0).getTime());
      fs.writeFileSync(APPLICATION_STORAGE_FILE, JSON.stringify(items, null, 2));
    }
    return items;
  } catch (err: any) {
    handleAdminDbError(err, 'sync application storage');
    if (fs.existsSync(APPLICATION_STORAGE_FILE)) {
      return JSON.parse(fs.readFileSync(APPLICATION_STORAGE_FILE, 'utf8'));
    }
    return [];
  }
}

async function saveMismatchesBulkToFirestore(items: any[]): Promise<void> {
  if (!adminDb) return;
  try {
    let batch = adminDb.batch();
    let count = 0;
    for (const item of items) {
      const id = item.id || `${item.mrnOrganization || ''}_${item.actionDateTime || ''}_${item.itemNumber || ''}`.replace(/[^a-zA-Z0-9_\-]/g, '_');
      const docRef = adminDb.collection('application_storage').doc(id);
      batch.set(docRef, {
        ...item,
        id: id,
        savedAt: item.savedAt || new Date().toISOString()
      }, { merge: true });
      
      count++;
      if (count >= 500) {
        await batch.commit();
        batch = adminDb.batch();
        count = 0;
      }
    }
    if (count > 0) {
      await batch.commit();
    }
  } catch (err: any) {
    console.error('[Firebase Sync] Failed bulk-save mismatches to Firestore:', err.message);
  }
}

async function deleteMismatchFromFirestore(item: any): Promise<void> {
  if (!adminDb) return;
  try {
    const id = item.id || `${item.mrnOrganization || ''}_${item.actionDateTime || ''}_${item.itemNumber || ''}`.replace(/[^a-zA-Z0-9_\-]/g, '_');
    await adminDb.collection('application_storage').doc(id).delete();
  } catch (err: any) {
    console.error('[Firebase Sync] Failed to delete mismatch from Firestore:', err.message);
  }
}

async function resetApplicationStorageInFirestore(): Promise<void> {
  if (!adminDb) return;
  try {
    const snapshot = await adminDb.collection('application_storage').get();
    let batch = adminDb.batch();
    let count = 0;
    for (const doc of snapshot.docs) {
      batch.delete(doc.ref);
      count++;
      if (count >= 500) {
        await batch.commit();
        batch = adminDb.batch();
        count = 0;
      }
    }
    if (count > 0) {
      await batch.commit();
    }
  } catch (err: any) {
    console.error('[Firebase Sync] Failed to reset application storage in Firestore:', err.message);
  }
}

async function syncAllFromFirestoreAtStartup() {
  if (!adminDb) {
    console.log('[Firebase Startup Sync] Firestore admin database not active. Skipping startup pull.');
    return;
  }
  console.log('[Firebase Startup Sync] Loading persistent data from Firestore...');
  try {
    await Promise.all([
      syncMedicationsFromFirestore().catch(e => console.error('Startup medications sync failed:', e.message)),
      syncAuditsFromFirestore().catch(e => console.error('Startup audits sync failed:', e.message)),
      syncEntryMistakesDbFromFirestore().catch(e => console.error('Startup parameters DB sync failed:', e.message)),
      syncApplicationStorageFromFirestore().catch(e => console.error('Startup application storage sync failed:', e.message)),
      syncSystemMetadataFromFirestore().catch(e => console.error('Startup system metadata sync failed:', e.message))
    ]);
    console.log('[Firebase Startup Sync] All persistent data loaded successfully!');
  } catch (err: any) {
    console.error('[Firebase Startup Sync] Error during startup fetch:', err.message);
  }
}

function setupFirestoreListeners() {
  if (!adminDb) {
    console.warn('[Firebase Admin Sync] Admin database not active. Skipping real-time listener setup.');
    return;
  }
  
  console.log('[Firebase Admin Sync] Setting up real-time listeners for instant container synchronization...');
  
  try {
    // 1. Listen to medications
    const unsubMeds = adminDb.collection('medications').onSnapshot((snapshot: any) => {
      try {
        const meds: any[] = [];
        snapshot.forEach((doc: any) => {
          meds.push(parseFirestoreDoc(doc));
        });
        meds.sort((a, b) => (a.itemName || '').localeCompare(b.itemName || ''));
        fs.writeFileSync(MEDS_FILE, JSON.stringify(meds, null, 2));
        console.log(`[Firebase Admin Sync] Real-time Medications Sync: Updated ${meds.length} items.`);
        notifyClients('medications', meds);
      } catch (err: any) {
        console.error('[Firebase Admin Sync] Error processing medications snapshot:', err.message);
      }
    }, (err: any) => {
      handleAdminDbError(err, 'listen medications');
      isRealtimeListeningActive = false;
    });
    activeUnsubscribes.push(unsubMeds);
    
    // 2. Listen to audits
    const unsubAudits = adminDb.collection('inventory_audits').onSnapshot((snapshot: any) => {
      try {
        const audits: any[] = [];
        snapshot.forEach((doc: any) => {
          audits.push(parseFirestoreDoc(doc));
        });
        audits.sort((a, b) => new Date(b.auditedAt || 0).getTime() - new Date(a.auditedAt || 0).getTime());
        fs.writeFileSync(AUDITS_FILE, JSON.stringify(audits, null, 2));
        console.log(`[Firebase Admin Sync] Real-time Audits Sync: Updated ${audits.length} items.`);
        notifyClients('audits', audits);
      } catch (err: any) {
        console.error('[Firebase Admin Sync] Error processing audits snapshot:', err.message);
      }
    }, (err: any) => {
      handleAdminDbError(err, 'listen audits');
      isRealtimeListeningActive = false;
    });
    activeUnsubscribes.push(unsubAudits);

    // 3. Listen to entry mistakes configs
    const unsubMistakesConfig = adminDb.collection('entry_mistakes_configs').doc('global').onSnapshot((docSnap: any) => {
      try {
        if (docSnap.exists) {
          const data = docSnap.data();
          fs.writeFileSync(ENTRY_MISTAKES_DB_FILE, JSON.stringify(data, null, 2));
          console.log('[Firebase Admin Sync] Real-time Entry Mistakes Config Sync: Updated.');
          notifyClients('entry-mistakes', data);
        }
      } catch (err: any) {
        console.error('[Firebase Admin Sync] Error processing entry mistakes config snapshot:', err.message);
      }
    }, (err: any) => {
      handleAdminDbError(err, 'listen entry mistakes config');
      isRealtimeListeningActive = false;
    });
    activeUnsubscribes.push(unsubMistakesConfig);

    // 4. Listen to application storage
    const unsubAppStorage = adminDb.collection('application_storage').onSnapshot((snapshot: any) => {
      try {
        const items: any[] = [];
        snapshot.forEach((doc: any) => {
          items.push(parseFirestoreDoc(doc));
        });
        items.sort((a, b) => new Date(b.savedAt || 0).getTime() - new Date(a.savedAt || 0).getTime());
        fs.writeFileSync(APPLICATION_STORAGE_FILE, JSON.stringify(items, null, 2));
        console.log(`[Firebase Admin Sync] Real-time Application Storage Sync: Updated ${items.length} items.`);
        notifyClients('application-storage', items);
      } catch (err: any) {
        console.error('[Firebase Admin Sync] Error processing application storage snapshot:', err.message);
      }
    }, (err: any) => {
      handleAdminDbError(err, 'listen application storage');
      isRealtimeListeningActive = false;
    });
    activeUnsubscribes.push(unsubAppStorage);

    // 5. Listen to system metadata
    const unsubSystemMeta = adminDb.collection('system').doc('metadata').onSnapshot((docSnap: any) => {
      try {
        if (docSnap.exists) {
          const data = docSnap.data();
          const lastDataUpdateStr = data.lastDataUpdate 
            ? (data.lastDataUpdate.toDate ? data.lastDataUpdate.toDate().toISOString() : new Date(data.lastDataUpdate).toISOString())
            : new Date().toISOString();
          
          const metaPayload = {
            lastDataUpdate: lastDataUpdateStr,
            isMesaieedHidden: data.isMesaieedHidden !== undefined ? !!data.isMesaieedHidden : false,
            updatedBy: data.updatedBy || 'system'
          };
          
          fs.writeFileSync(METADATA_SYNC_FILE, JSON.stringify(metaPayload, null, 2));
          console.log('[Firebase Admin Sync] Real-time System Metadata Sync: Updated.', metaPayload);
          notifyClients('metadata', metaPayload);
        }
      } catch (err: any) {
        console.error('[Firebase Admin Sync] Error processing system metadata snapshot:', err.message);
      }
    }, (err: any) => {
      handleAdminDbError(err, 'listen system metadata');
      isRealtimeListeningActive = false;
    });
    activeUnsubscribes.push(unsubSystemMeta);

    isRealtimeListeningActive = true;
    console.log('[Firebase Admin Sync] Real-time listeners active and running.');
  } catch (err: any) {
    console.error('[Firebase Admin Sync] Failed to initialize real-time listeners:', err.message);
    isRealtimeListeningActive = false;
  }
}

async function resetAllInFirestore(): Promise<void> {
  if (!adminDb) return;
  try {
    // Delete medications
    const medsSnap = await adminDb.collection('medications').get();
    let batch = adminDb.batch();
    let count = 0;
    for (const doc of medsSnap.docs) {
      batch.delete(doc.ref);
      count++;
      if (count >= 500) {
        await batch.commit();
        batch = adminDb.batch();
        count = 0;
      }
    }
    if (count > 0) await batch.commit();

    // Delete audits
    const auditsSnap = await adminDb.collection('inventory_audits').get();
    batch = adminDb.batch();
    count = 0;
    for (const doc of auditsSnap.docs) {
      batch.delete(doc.ref);
      count++;
      if (count >= 500) {
        await batch.commit();
        batch = adminDb.batch();
        count = 0;
      }
    }
    if (count > 0) await batch.commit();

    // Delete entry mistakes config doc
    await adminDb.collection('entry_mistakes_configs').doc('global').delete();
  } catch (err: any) {
    console.error('[Firebase Sync] Failed to clear Firestore collections during system reset:', err.message);
  }
}

// SSE stream for real-time synchronization between clients & environments
app.get('/api/sync-stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no' // Disable buffering for responsive SSE
  });
  
  // Establish connection with a lightweight handshake
  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);
  
  const client = { res };
  sseClients.add(client);
  console.log(`[SSE] Client connected. Total active SSE clients: ${sseClients.size}`);
  
  req.on('close', () => {
    sseClients.delete(client);
    console.log(`[SSE] Client disconnected. Total active SSE clients: ${sseClients.size}`);
  });
});

// Broadcast testing endpoint for Admin Diagnostic Panel
app.post('/api/sync-test-broadcast', (req, res) => {
  const sender = req.body?.sender || 'Admin Diagnostic Dashboard';
  console.log(`[SSE] Received manual diagnostic test-ping from ${sender}. Broadcasting to clients...`);
  notifyClients('test-ping', { sender, timestamp: new Date().toISOString() });
  res.json({ success: true, message: 'Test broadcast signal transmitted to all connected SSE clients.' });
});

// API Routes
app.get('/api/medications', async (req, res) => {
  if (adminDb && !isRealtimeListeningActive) {
    await syncMedicationsFromFirestore().catch(err => console.error(err));
  }
  const data = fs.readFileSync(MEDS_FILE, 'utf8');
  res.json(JSON.parse(data));
});

app.post('/api/medications', async (req, res) => {
  try {
    const meds = JSON.parse(fs.readFileSync(MEDS_FILE, 'utf8'));
    const newMed = {
      ...req.body,
      id: Math.random().toString(36).substring(2, 15),
      addedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString()
    };
    meds.push(newMed);
    fs.writeFileSync(MEDS_FILE, JSON.stringify(meds, null, 2));

    if (adminDb) {
      await saveMedicationToFirestore(newMed).catch(err => console.error(err));
    }

    await updateSystemMetadataInFirestore().catch(err => console.error(err));

    res.status(201).json(newMed);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/medications/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const meds = JSON.parse(fs.readFileSync(MEDS_FILE, 'utf8'));
    const index = meds.findIndex((m: any) => m.id === id);
    if (index !== -1) {
      meds[index] = { ...meds[index], ...req.body, lastUpdatedAt: new Date().toISOString() };
      fs.writeFileSync(MEDS_FILE, JSON.stringify(meds, null, 2));

      if (adminDb) {
        await saveMedicationToFirestore(meds[index]).catch(err => console.error(err));
      }

      await updateSystemMetadataInFirestore().catch(err => console.error(err));

      res.json(meds[index]);
    } else {
      res.status(404).send('Not found');
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/medications/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let meds = JSON.parse(fs.readFileSync(MEDS_FILE, 'utf8'));
    meds = meds.filter((m: any) => m.id !== id);
    fs.writeFileSync(MEDS_FILE, JSON.stringify(meds, null, 2));

    if (adminDb) {
      await deleteMedicationFromFirestore(id).catch(err => console.error(err));
    }

    await updateSystemMetadataInFirestore().catch(err => console.error(err));

    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/medications/bulk', async (req, res) => {
  try {
    const meds = JSON.parse(fs.readFileSync(MEDS_FILE, 'utf8'));
    const { items, options } = req.body;
    
    const itemsToProcess = Array.isArray(items) ? items : req.body; // fallback for old format
    
    if (!Array.isArray(itemsToProcess)) {
      return res.status(400).json({ error: 'Body must contain an array of medications' });
    }

    // Pre-calculate photo map for efficiency
    const globalPhotoMap: Record<string, string> = {};
    if (options?.photoStrategy === 'keep') {
      meds.forEach((m: any) => {
        if (m.imageUrl) globalPhotoMap[m.itemCode] = m.imageUrl;
      });
    }

    // Load translation cache
    let translationCache: Record<string, any> = {};
    try {
      if (fs.existsSync(TRANSLATION_CACHE_FILE)) {
        translationCache = JSON.parse(fs.readFileSync(TRANSLATION_CACHE_FILE, 'utf8'));
      }
    } catch (e) {
      console.warn('Failed to parse translation cache inside bulk endpoint:', e);
    }

    const newMeds = itemsToProcess.map((m: any) => {
      const existingIndex = meds.findIndex((em: any) => em.locationId === m.locationId && em.itemCode === m.itemCode);
      const existing = existingIndex !== -1 ? meds[existingIndex] : null;
      
      let imageUrl = m.imageUrl;
      if (options?.photoStrategy === 'keep') {
        if (!imageUrl) {
          imageUrl = globalPhotoMap[m.itemCode];
        }
      } else if (options?.photoStrategy === 'remove') {
        imageUrl = null;
      }

      // Check translation cache on the server
      const itemText = (m.enIndications && m.enIndications.trim() !== '') ? m.enIndications.trim() : m.arIndications?.trim() || '';
      let cachedTrans: any = null;
      if (itemText) {
        const hash = getTranslationHashSync(itemText);
        if (hash && translationCache[hash]) {
          cachedTrans = translationCache[hash];
        }
      }

      const getCachedField = (key: string, backupKey: string) => {
        if (!cachedTrans) return '';
        return cachedTrans[key] || cachedTrans[backupKey] || '';
      };

      const transFields = {
        hiIndications: m.hiIndications || existing?.hiIndications || getCachedField('hiIndications', 'hi') || '',
        urIndications: m.urIndications || existing?.urIndications || getCachedField('urIndications', 'ur') || '',
        mlIndications: m.mlIndications || existing?.mlIndications || getCachedField('mlIndications', 'ml') || '',
        bnIndications: m.bnIndications || existing?.bnIndications || getCachedField('bnIndications', 'bn') || '',
        tlIndications: m.tlIndications || existing?.tlIndications || getCachedField('tlIndications', 'tl') || ''
      };

      if (existingIndex !== -1) {
        meds[existingIndex] = { 
          ...meds[existingIndex], 
          ...m, 
          ...transFields,
          imageUrl: options?.photoStrategy === 'remove' ? null : (imageUrl || meds[existingIndex].imageUrl),
          lastUpdatedAt: new Date().toISOString() 
        };
        return meds[existingIndex];
      } else {
        const nm = {
          ...m,
          ...transFields,
          imageUrl: imageUrl || null,
          id: Math.random().toString(36).substring(2, 11),
          addedAt: new Date().toISOString(),
          lastUpdatedAt: new Date().toISOString()
        };
        meds.push(nm);
        return nm;
      }
    });

    fs.writeFileSync(MEDS_FILE, JSON.stringify(meds, null, 2));

    if (adminDb) {
      await saveMedicationsBulkToFirestore(meds).catch(err => console.error(err));
    }

    await updateSystemMetadataInFirestore().catch(err => console.error(err));

    res.json({ count: newMeds.length });
  } catch (err: any) {
    console.error('Bulk import error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/audits', async (req, res) => {
  if (adminDb && !isRealtimeListeningActive) {
    await syncAuditsFromFirestore().catch(err => console.error(err));
  }
  const data = fs.readFileSync(AUDITS_FILE, 'utf8');
  res.json(JSON.parse(data));
});

app.post('/api/audits', async (req, res) => {
  try {
    const audits = JSON.parse(fs.readFileSync(AUDITS_FILE, 'utf8'));
    const newAudit = {
      ...req.body,
      id: Math.random().toString(36).substring(2, 11),
      auditedAt: new Date().toISOString()
    };
    audits.push(newAudit);
    fs.writeFileSync(AUDITS_FILE, JSON.stringify(audits, null, 2));

    if (adminDb) {
      await saveAuditToFirestore(newAudit).catch(err => console.error(err));
    }

    await updateSystemMetadataInFirestore().catch(err => console.error(err));

    res.status(201).json(newAudit);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/translation_cache', (req, res) => {
  try {
    const data = fs.readFileSync(TRANSLATION_CACHE_FILE, 'utf8');
    res.json(JSON.parse(data));
  } catch (err) {
    res.status(500).json({ error: 'Failed to read translation cache' });
  }
});

app.post('/api/translation_cache', (req, res) => {
  try {
    const cache = JSON.parse(fs.readFileSync(TRANSLATION_CACHE_FILE, 'utf8'));
    const updates = req.body;
    Object.assign(cache, updates);
    fs.writeFileSync(TRANSLATION_CACHE_FILE, JSON.stringify(cache, null, 2));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to write translation cache' });
  }
});

app.post('/api/system/reset', async (req, res) => {
  try {
    fs.writeFileSync(MEDS_FILE, '[]');
    fs.writeFileSync(AUDITS_FILE, '[]');
    fs.writeFileSync(TRANSLATION_CACHE_FILE, '{}');
    if (fs.existsSync(ENTRY_MISTAKES_DB_FILE)) {
      fs.unlinkSync(ENTRY_MISTAKES_DB_FILE);
    }

    if (adminDb) {
      await resetAllInFirestore().catch(err => console.error(err));
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/entry-mistakes/db', async (req, res) => {
  try {
    if (adminDb && !isRealtimeListeningActive) {
      await syncEntryMistakesDbFromFirestore().catch(err => console.error(err));
    }
    if (fs.existsSync(ENTRY_MISTAKES_DB_FILE)) {
      const data = fs.readFileSync(ENTRY_MISTAKES_DB_FILE, 'utf8');
      res.json(JSON.parse(data));
    } else {
      res.json({ configured: false, parameters: [], pharmacists: [] });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/entry-mistakes/db', async (req, res) => {
  try {
    const { parameters, pharmacists } = req.body;
    const dbState = {
      configured: true,
      lastUpdated: new Date().toISOString(),
      parameters: parameters || [],
      pharmacists: pharmacists || []
    };
    fs.writeFileSync(ENTRY_MISTAKES_DB_FILE, JSON.stringify(dbState, null, 2));

    if (adminDb) {
      await saveEntryMistakesDbToFirestore(dbState).catch(err => console.error(err));
    }

    await updateSystemMetadataInFirestore().catch(err => console.error(err));

    res.json({ success: true, dbState });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/entry-mistakes/db', async (req, res) => {
  try {
    const adminPassword = req.headers['x-admin-password'] || req.body?.adminPassword || req.query?.adminPassword;
    const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    if (adminPassword !== settings.adminPassword) {
      return res.status(401).json({ error: 'Incorrect administrator password. Action unauthorized.' });
    }

    if (fs.existsSync(ENTRY_MISTAKES_DB_FILE)) {
      fs.unlinkSync(ENTRY_MISTAKES_DB_FILE);
    }

    if (adminDb) {
      await deleteEntryMistakesDbFromFirestore().catch(err => console.error(err));
    }

    await updateSystemMetadataInFirestore().catch(err => console.error(err));

    res.json({ success: true, configured: false, parameters: [], pharmacists: [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET current system metadata (cached from Firestore or updated locally)
app.get('/api/system/metadata', async (req, res) => {
  try {
    if (adminDb && !isRealtimeListeningActive) {
      await syncSystemMetadataFromFirestore().catch(err => console.error(err));
    }
    if (fs.existsSync(METADATA_SYNC_FILE)) {
      const data = fs.readFileSync(METADATA_SYNC_FILE, 'utf8');
      res.json(JSON.parse(data));
    } else {
      res.json({
        lastDataUpdate: new Date().toISOString(),
        isMesaieedHidden: false
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST to update system settings
app.post('/api/system/metadata/settings', async (req, res) => {
  try {
    const { isMesaieedHidden } = req.body;
    let currentPayload: any = {};
    if (fs.existsSync(METADATA_SYNC_FILE)) {
      currentPayload = JSON.parse(fs.readFileSync(METADATA_SYNC_FILE, 'utf8'));
    }
    currentPayload.isMesaieedHidden = !!isMesaieedHidden;
    currentPayload.lastSettingUpdate = new Date().toISOString();
    
    fs.writeFileSync(METADATA_SYNC_FILE, JSON.stringify(currentPayload, null, 2));
    
    if (adminDb) {
      await adminDb.collection('system').doc('metadata').set({
        isMesaieedHidden: !!isMesaieedHidden,
        lastSettingUpdate: new Date()
      }, { merge: true });
    }
    
    notifyClients('metadata', currentPayload);
    res.json({ success: true, metadata: currentPayload });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET all stored application mistakes
app.get('/api/application-storage', async (req, res) => {
  try {
    if (adminDb && !isRealtimeListeningActive) {
      await syncApplicationStorageFromFirestore().catch(err => console.error(err));
    }
    if (fs.existsSync(APPLICATION_STORAGE_FILE)) {
      const data = fs.readFileSync(APPLICATION_STORAGE_FILE, 'utf8');
      res.json(JSON.parse(data));
    } else {
      res.json([]);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST to save a mismatch mistake to Application Storage (Supports both single object and array of objects for bulk uploads)
app.post('/api/application-storage', async (req, res) => {
  try {
    const body = req.body;
    const itemsToSave = Array.isArray(body) ? body : [body];
    
    let items = [];
    if (fs.existsSync(APPLICATION_STORAGE_FILE)) {
      items = JSON.parse(fs.readFileSync(APPLICATION_STORAGE_FILE, 'utf8'));
    }
    
    let addedCount = 0;
    const newlyAddedItems: any[] = [];
    for (const item of itemsToSave) {
      // De-duplicate items by id or composite key (mrn + date + itemNumber)
      const isDup = items.some((x: any) => 
        x.id === item.id || 
        (x.mrnOrganization === item.mrnOrganization && 
         x.actionDateTime === item.actionDateTime && 
         x.itemNumber === item.itemNumber)
      );
      
      if (!isDup) {
        const itemWithTime = {
          ...item,
          savedAt: new Date().toISOString()
        };
        items.push(itemWithTime);
        newlyAddedItems.push(itemWithTime);
        addedCount++;
      }
    }
    
    if (addedCount > 0) {
      fs.writeFileSync(APPLICATION_STORAGE_FILE, JSON.stringify(items, null, 2));
      if (adminDb) {
        await saveMismatchesBulkToFirestore(newlyAddedItems).catch(err => console.error(err));
      }
      await updateSystemMetadataInFirestore().catch(err => console.error(err));
    }
    res.json({ success: true, count: items.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST to delete an item (Requires Admin Password in request body)
app.post('/api/application-storage/delete', async (req, res) => {
  try {
    const { id, mrnOrganization, actionDateTime, itemNumber, adminPassword } = req.body;
    const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    if (adminPassword !== settings.adminPassword) {
      return res.status(401).json({ error: 'Incorrect administrator password. Action unauthorized.' });
    }
    
    if (!fs.existsSync(APPLICATION_STORAGE_FILE)) {
      return res.status(400).json({ error: 'Storage file does not exist.' });
    }
    
    let items = JSON.parse(fs.readFileSync(APPLICATION_STORAGE_FILE, 'utf8'));
    const itemToDelete = items.find((x: any) => {
      if (id && x.id === id) return true;
      if (x.mrnOrganization === mrnOrganization && x.actionDateTime === actionDateTime && x.itemNumber === itemNumber) {
        return true;
      }
      return false;
    });

    if (itemToDelete) {
      items = items.filter((x: any) => x !== itemToDelete);
      fs.writeFileSync(APPLICATION_STORAGE_FILE, JSON.stringify(items, null, 2));
      
      if (adminDb) {
        await deleteMismatchFromFirestore(itemToDelete).catch(err => console.error(err));
      }
      await updateSystemMetadataInFirestore().catch(err => console.error(err));
    }
    
    res.json({ success: true, count: items.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST to reset entire storage (Requires Admin Password inside body)
app.post('/api/application-storage/reset', async (req, res) => {
  try {
    const { adminPassword } = req.body;
    const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    if (adminPassword !== settings.adminPassword) {
      return res.status(401).json({ error: 'Incorrect administrator password. Action unauthorized.' });
    }
    
    fs.writeFileSync(APPLICATION_STORAGE_FILE, '[]');

    if (adminDb) {
      await resetApplicationStorageInFirestore().catch(err => console.error(err));
    }

    await updateSystemMetadataInFirestore().catch(err => console.error(err));

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/translate', async (req, res) => {
  const finalResults: Record<string, Record<string, string>> = {};
  try {
    const { items, targetLanguages } = req.body;
    if (!Array.isArray(items) || !Array.isArray(targetLanguages)) {
      return res.status(400).json({ error: 'Missing items array or targetLanguages array' });
    }

    const validItems = items.filter(item => item.text && item.text.trim());
    if (validItems.length === 0) {
      return res.json({});
    }

    // Load server-side translation cache
    let translationCache: Record<string, any> = {};
    try {
      if (fs.existsSync(TRANSLATION_CACHE_FILE)) {
        translationCache = JSON.parse(fs.readFileSync(TRANSLATION_CACHE_FILE, 'utf8'));
      }
    } catch (e) {
      console.warn('Failed to read translation cache inside /api/translate:', e);
    }

    // Separate cached items from newly added items
    const itemsToProcess: { id: string; text: string; hash: string }[] = [];

    validItems.forEach(item => {
      const hash = getTranslationHashSync(item.text);
      const cached = translationCache[hash];
      if (cached && (cached.hi || cached.hiIndications || cached.ur || cached.urIndications)) {
        // Cache hit! Map keys properly
        finalResults[item.id] = {
          hi: cached.hi || cached.hiIndications || '',
          ur: cached.ur || cached.urIndications || '',
          ml: cached.ml || cached.mlIndications || '',
          bn: cached.bn || cached.bnIndications || '',
          tl: cached.tl || cached.tlIndications || ''
        };
      } else {
        itemsToProcess.push({ id: item.id, text: item.text, hash });
      }
    });

    if (itemsToProcess.length === 0) {
      console.log('All requested items successfully resolved from server-side translation cache. 0 Gemini API calls were made.');
      return res.json(finalResults);
    }

    // Lazy initialization of Gemini
    const ai = getGeminiClient();

    // Deduplicate the items to process to save Gemini quota
    const textToIds: Record<string, string[]> = {};
    itemsToProcess.forEach(item => {
      if (!textToIds[item.text]) textToIds[item.text] = [];
      textToIds[item.text].push(item.id);
    });

    const uniqueTexts = Object.keys(textToIds);
    const uniqueItems = uniqueTexts.map((text, idx) => ({ id: `unique_${idx}`, text }));

    const prompt = `Translate the following medical drug indications from English to these languages: ${targetLanguages.join(', ')}.
    
    I will provide a list of items with their IDs and the English text. 
    Return a JSON object where the keys are the item IDs. 
    Each value should be another object where the keys are the language codes (${targetLanguages.join(', ')}) and the values are the translations.
    
    Items to translate:
    ${uniqueItems.map(item => `ID: "${item.id}"\nText: "${item.text}"`).join('\n---\n')}
    
    Format your response like this:
    {
      "unique_0": {
        "hi": "...",
        "ur": "...",
        "ml": "...",
        "bn": "...",
        "tl": "..."
      },
      "unique_1": { ... }
    }`;

    console.log(`Translating ${uniqueItems.length} newly added unique items with Gemini API...`);
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    let responseText = response.text || '{}';
    if (responseText.includes('```')) {
      responseText = responseText.replace(/```json\n?|```/g, '').trim();
    }

    const uniqueResults = JSON.parse(responseText);
    let cacheUpdated = false;

    uniqueItems.forEach(uItem => {
      const trans = uniqueResults[uItem.id];
      if (trans) {
        const hash = getTranslationHashSync(uItem.text);
        if (hash) {
          translationCache[hash] = {
            hi: trans.hi || '',
            ur: trans.ur || '',
            ml: trans.ml || '',
            bn: trans.bn || '',
            tl: trans.tl || '',
            hiIndications: trans.hi || '',
            urIndications: trans.ur || '',
            mlIndications: trans.ml || '',
            bnIndications: trans.bn || '',
            tlIndications: trans.tl || '',
            sourceText: uItem.text,
            updatedAt: new Date().toISOString()
          };
          cacheUpdated = true;
        }

        textToIds[uItem.text].forEach(originalId => {
          finalResults[originalId] = trans;
        });
      }
    });

    if (cacheUpdated) {
      try {
        fs.writeFileSync(TRANSLATION_CACHE_FILE, JSON.stringify(translationCache, null, 2));
        console.log(`Successfully stored ${Object.keys(uniqueItems).length} new translations on the server.`);
      } catch (writeErr) {
        console.warn('Failed to save translation cache file:', writeErr);
      }
    }

    res.json(finalResults);
  } catch (error: any) {
    let errMsg = error.message || 'Internal translation failure';
    const lowerMsg = errMsg.toLowerCase();
    const isQuotaExhausted = 
      lowerMsg.includes('prepayment') || 
      lowerMsg.includes('depleted') || 
      lowerMsg.includes('resource_exhausted') || 
      lowerMsg.includes('429') || 
      lowerMsg.includes('quota') || 
      lowerMsg.includes('billing');

    if (isQuotaExhausted) {
      console.warn('Translation endpoint gracefully handled Gemini API quota/pre-payment limit.');
    } else {
      console.error('Translation endpoint error:', error);
    }
    
    // Graceful fallback: return already cached items, and empty translations for the remaining requested items
    const fallbackResults: Record<string, Record<string, string>> = {};
    const reqItems = req.body.items || [];
    const targetLangs = req.body.targetLanguages || [];
    reqItems.forEach((item: any) => {
      if (item && item.id) {
        if (finalResults[item.id]) {
          fallbackResults[item.id] = finalResults[item.id];
        } else {
          fallbackResults[item.id] = targetLangs.reduce((acc: any, lang: string) => {
            acc[lang] = '';
            return acc;
          }, {});
        }
      }
    });

    res.json(fallbackResults);
  }
});

// Static assets from public folder (fallback)
app.use(express.static(path.join(process.cwd(), 'public'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.svg') || path.endsWith('.webmanifest')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

async function startServer() {
  const isProd = process.env.NODE_ENV === "production" && fs.existsSync(path.join(process.cwd(), 'dist/index.html'));

  // Run startup sync to fetch persistent Firestore state down into local cache
  await syncAllFromFirestoreAtStartup().catch(err => {
    console.error('[Firebase Startup Sync Init] Failed to run startup fetch:', err.message);
  });

  // Setup real-time Firestore listeners for immediate bidirectional synchronization
  setupFirestoreListeners();

  // Vite middleware for development
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
