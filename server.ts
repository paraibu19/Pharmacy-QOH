import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { GoogleGenAI } from "@google/genai";
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue as AdminFieldValue, Timestamp as AdminTimestamp } from 'firebase-admin/firestore';

import { initializeApp as initClientApp, getApps as getClientApps } from 'firebase/app';
import { 
  getFirestore as getClientFirestore, 
  collection as clientCollection, 
  doc as clientDoc, 
  getDocs as clientGetDocs, 
  getDoc as clientGetDoc, 
  setDoc as clientSetDoc, 
  deleteDoc as clientDeleteDoc, 
  writeBatch as clientWriteBatch,
  onSnapshot as clientOnSnapshot,
  Timestamp as ClientTimestamp,
  serverTimestamp as clientServerTimestamp,
  setLogLevel
} from 'firebase/firestore';

let FieldValue: any = AdminFieldValue;
let Timestamp: any = AdminTimestamp;

class ClientDocRef {
  private colName: string;
  private docId: string;
  private clientDb: any;
  
  constructor(clientDb: any, colName: string, docId: string) {
    this.clientDb = clientDb;
    this.colName = colName;
    this.docId = docId || '';
  }

  get id() {
    return this.docId;
  }

  get _ref() {
    return clientDoc(this.clientDb, this.colName, this.docId);
  }

  async get() {
    const snap = await clientGetDoc(this._ref);
    return {
      id: snap.id,
      exists: snap.exists(),
      data: () => snap.data()
    };
  }

  async set(data: any, options?: any) {
    const merge = options && options.merge !== undefined ? options.merge : true;
    await clientSetDoc(this._ref, data, { merge });
    return {};
  }

  async delete() {
    await clientDeleteDoc(this._ref);
    return {};
  }

  async update(data: any) {
    await clientSetDoc(this._ref, data, { merge: true });
    return {};
  }

  onSnapshot(onNext: any, onError: any) {
    return clientOnSnapshot(this._ref, (snap: any) => {
      onNext({
        id: snap.id,
        exists: snap.exists(),
        data: () => snap.data()
      });
    }, onError);
  }
}

class ClientCollectionRef {
  private colName: string;
  private clientDb: any;

  constructor(clientDb: any, colName: string) {
    this.clientDb = clientDb;
    this.colName = colName;
  }

  doc(id?: string) {
    let actualId = id;
    if (!actualId) {
      actualId = clientDoc(clientCollection(this.clientDb, this.colName)).id;
    }
    return new ClientDocRef(this.clientDb, this.colName, actualId);
  }

  async get() {
    const snap = await clientGetDocs(clientCollection(this.clientDb, this.colName));
    const docs = snap.docs.map(docSnap => ({
      id: docSnap.id,
      exists: docSnap.exists(),
      data: () => docSnap.data(),
      ref: new ClientDocRef(this.clientDb, this.colName, docSnap.id)
    }));
    return {
      docs,
      forEach: (callback: any) => docs.forEach(callback)
    };
  }
}

class ClientBatchRef {
  private batch: any;
  constructor(clientDb: any) {
    this.batch = clientWriteBatch(clientDb);
  }

  set(docRef: ClientDocRef, data: any, options?: any) {
    const merge = options && options.merge !== undefined ? options.merge : true;
    this.batch.set(docRef._ref, data, { merge });
  }

  delete(docRef: ClientDocRef) {
    this.batch.delete(docRef._ref);
  }

  update(docRef: ClientDocRef, data: any) {
    this.batch.update(docRef._ref, data);
  }

  async commit() {
    await this.batch.commit();
  }
}

class ClientDbWrapper {
  private clientDb: any;
  constructor(clientDb: any) {
    this.clientDb = clientDb;
  }

  collection(colName: string) {
    return new ClientCollectionRef(this.clientDb, colName);
  }

  batch() {
    return new ClientBatchRef(this.clientDb);
  }
}

dotenv.config();

// Robustly use process.cwd() as the project root directory
const PROJECT_ROOT = process.cwd();

// Initialize Firebase Admin for persistent Firestore synchronization
let adminDb: any = null;
try {
  let projectId: string | undefined = undefined;
  let databaseId: string | undefined = undefined;
  
  const configPath = path.join(PROJECT_ROOT, 'firebase-applet-config.json');
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
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const MEDS_FILE = path.join(DATA_DIR, 'medications.json');
const AUDITS_FILE = path.join(DATA_DIR, 'audits.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const TRANSLATION_CACHE_FILE = path.join(DATA_DIR, 'translation_cache.json');
const ENTRY_MISTAKES_DB_FILE = path.join(DATA_DIR, 'entry_mistakes_db.json');
const APPLICATION_STORAGE_FILE = path.join(DATA_DIR, 'application_storage.json');
const LAST_RESET_FILE = path.join(DATA_DIR, 'last_reset.json');
const ITEM_REGISTRY_FILE = path.join(DATA_DIR, 'item_reference_registry.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

if (!fs.existsSync(ITEM_REGISTRY_FILE)) {
  fs.writeFileSync(ITEM_REGISTRY_FILE, '{}');
}

if (!fs.existsSync(LAST_RESET_FILE)) {
  fs.writeFileSync(LAST_RESET_FILE, JSON.stringify({ lastResetTime: "" }));
}

let localLastResetTime = "";
try {
  const resetData = JSON.parse(fs.readFileSync(LAST_RESET_FILE, 'utf8'));
  localLastResetTime = resetData.lastResetTime || "";
} catch (e: any) {
  console.warn('[Firebase Sync Init] Failed to read last_reset.json:', e.message);
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

app.post('/api/auth/admin', async (req, res) => {
  const { password } = req.body;
  if (adminDb) {
    await syncSettingsFromFirestore().catch(err => console.error(err));
  }
  const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  if (password === settings.adminPassword) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: 'Invalid password' });
  }
});

app.post('/api/auth/change-password', async (req, res) => {
  const { currentPassword, newPassword, role } = req.body;
  if (adminDb) {
    await syncSettingsFromFirestore().catch(err => console.error(err));
  }
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
  if (adminDb) {
    saveSettingsToFirestore(settings).catch(err => console.error('[Firebase Sync] Failed to update password/settings in Firestore:', err.message));
  }
  res.json({ success: true });
});

app.post('/api/auth/verify-admin', async (req, res) => {
  const { password } = req.body;
  if (adminDb) {
    await syncSettingsFromFirestore().catch(err => console.error(err));
  }
  const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  if (password === settings.adminPassword) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: 'Invalid admin password' });
  }
});

app.get('/api/auth/settings', async (req, res) => {
  await checkAndSyncFromFirestoreOnDemand().catch(err => console.error(err));
  if (adminDb) {
    await syncSettingsFromFirestore().catch(err => console.error(err));
  }
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

function switchToClientSdkFallback() {
  try {
    const configPath = path.join(PROJECT_ROOT, 'firebase-applet-config.json');
    if (!fs.existsSync(configPath)) {
      console.error('[Firebase Sync Fallback] Cannot fallback to Web Client SDK - config file missing.');
      adminDb = null;
      return;
    }
    
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!config.apiKey || !config.projectId) {
      console.error('[Firebase Sync Fallback] Cannot fallback to Web Client SDK - invalid config.');
      adminDb = null;
      return;
    }

    let clientApp;
    const existingApps = getClientApps();
    if (existingApps.length === 0) {
      clientApp = initClientApp(config);
    } else {
      clientApp = existingApps[0];
    }

    try {
      setLogLevel('error');
    } catch (e) {
      // Ignore if setLogLevel isn't allowed to call again
    }

    const clientFirestore = config.firestoreDatabaseId 
      ? getClientFirestore(clientApp, config.firestoreDatabaseId) 
      : getClientFirestore(clientApp);

    adminDb = new ClientDbWrapper(clientFirestore);
    
    // Override FieldValue and Timestamp helpers to use client equivalents
    FieldValue = {
      serverTimestamp: () => clientServerTimestamp()
    };
    Timestamp = {
      fromDate: (date: Date) => ClientTimestamp.fromDate(date)
    };

    console.log('[Firebase Sync Fallback] SUCCESSFULLY initialized Web Client SDK as fallback Firestore client (uses API key rules). Continuing sync.');
    
    // Proactively load files from cloud
    syncAllFromFirestoreAtStartup().catch(err => {
      console.error('[Firebase Sync Fallback] Startup fetch after fallback failed:', err.message);
    });
    
    // Start real-time metadata sync
    setupRealtimeMetadataListener();

  } catch (err: any) {
    console.error('[Firebase Sync Fallback] Failed to initialize Web Client SDK fallback:', err.message);
    adminDb = null;
  }
}

let firestoreFailureBackoffUntil = 0;

function handleAdminDbError(err: any, context: string) {
  const errMsg = err.message || String(err);
  const isPermissionDenied = errMsg.includes('PERMISSION_DENIED') || 
                             errMsg.includes('insufficient permissions') || 
                             errMsg.includes(' 7 ') ||
                             errMsg.startsWith('7 ') ||
                             errMsg.includes(': 7') ||
                             errMsg.includes('Status code: 7');
  
  const isQuotaExceeded = errMsg.toLowerCase().includes('quota') || 
                          errMsg.toLowerCase().includes('limit exceeded') || 
                          errMsg.toLowerCase().includes('resource_exhausted') ||
                          errMsg.toLowerCase().includes('exceeded') ||
                          errMsg.toLowerCase().includes('too many requests');

  if (isQuotaExceeded) {
    if (adminDb) {
      console.warn(`[Firebase Sync Fallback] Firestore quota exceeded (${context})! Gracefully disabling live server-side Firestore sync and operating 100% in local server file mode to protect the ecosystem. Error: ${errMsg}`);
      adminDb = null;
    }
    // Set 4-hour backoff to prevent any further reconnect attempts during quota exhaustion
    firestoreFailureBackoffUntil = Date.now() + 4 * 60 * 60 * 1000;
  } else if (isPermissionDenied) {
    if (adminDb) {
      if (!(adminDb instanceof ClientDbWrapper)) {
        console.warn(`[Firebase Sync Fallback] Server credentials do not have permission to sync (${context}). Instantiating API-key-powered Web Client SDK client-wrapper work-around...`);
        switchToClientSdkFallback();
      } else {
        // Even the client fallback wrapper with API Key rules failed! This is a permanent rules or project restriction issue.
        console.warn(`[Firebase Sync Fallback] Web Client SDK work-around also lacks permissions to sync (${context}). Operating in 100% offline local server file mode.`);
        adminDb = null;
        // Backoff for 4 hours to silence permission logs
        firestoreFailureBackoffUntil = Date.now() + 4 * 60 * 60 * 1000;
      }
    }
  } else {
    console.error(`[Firebase Sync] Failed: ${context}:`, errMsg);
  }
}

async function syncMedicationsFromFirestore(enableSeeding: boolean = false): Promise<any[]> {
  if (!adminDb) return JSON.parse(fs.readFileSync(MEDS_FILE, 'utf8'));
  try {
    const snapshot = await adminDb.collection('medications').get();
    const meds: any[] = [];
    let needsMigration = false;
    let batch = adminDb.batch();
    let migrationCount = 0;

    snapshot.forEach(doc => {
      const parsed = parseFirestoreDoc(doc);
      if (parsed.locationId === 'adult' || parsed.locationId === 'mesaieed') {
        needsMigration = true;
        parsed.locationId = parsed.locationId === 'adult' ? 'adult-emergency' : 'mesaieed-opd';
        
        const docRef = adminDb.collection('medications').doc(doc.id);
        batch.update(docRef, { locationId: parsed.locationId });
        migrationCount++;
      }
      meds.push(parsed);
    });

    if (needsMigration && migrationCount > 0) {
      console.log(`[Firebase Migration] Upgrading ${migrationCount} medications to use 'adult-emergency' / 'mesaieed-opd' location IDs...`);
      await batch.commit();
      console.log(`[Firebase Migration] Upgraded medications successfully!`);
    }
    
    // Keep local cache up to date
    if (meds.length > 0) {
      meds.sort((a, b) => (a.itemName || '').localeCompare(b.itemName || ''));
      fs.writeFileSync(MEDS_FILE, JSON.stringify(meds, null, 2));
    } else {
      if (enableSeeding) {
        // If Firestore is empty but our local JSON has medications, seed Firestore!
        const localDataStr = fs.readFileSync(MEDS_FILE, 'utf8');
        const localMeds = JSON.parse(localDataStr);
        if (localMeds && localMeds.length > 0) {
          console.log(`[Firebase Seed] Firestore 'medications' is empty. Seeding Firestore with ${localMeds.length} items from local medications.json...`);
          let batch = adminDb.batch();
          let count = 0;
          for (const med of localMeds) {
            const { id, addedAt, lastUpdatedAt, ...rest } = med;
            const docRef = adminDb.collection('medications').doc(id);
            batch.set(docRef, {
              ...rest,
              id: id,
              addedAt: addedAt || new Date().toISOString(),
              lastUpdatedAt: lastUpdatedAt || new Date().toISOString(),
              updatedBy: rest.updatedBy || 'system'
            }, { merge: true });
            count++;
            if (count >= 400) {
              await batch.commit();
              batch = adminDb.batch();
              count = 0;
            }
          }
          if (count > 0) {
            await batch.commit();
          }
          console.log(`[Firebase Seed] Seeding completed for ${localMeds.length} medications.`);
          return localMeds;
        }
      } else {
        // Otherwise, Firestore is genuinely empty, so reset local cache
        fs.writeFileSync(MEDS_FILE, '[]');
      }
    }
    if (meds.length > 0) {
      await updateItemReferenceRegistry(meds).catch(err => handleAdminDbError(err, 'background item_reference_registry sync'));
    }
    return meds;
  } catch (err: any) {
    handleAdminDbError(err, 'sync medications');
    return JSON.parse(fs.readFileSync(MEDS_FILE, 'utf8'));
  }
}

async function updateItemReferenceRegistry(medsToUpdate: any[]): Promise<void> {
  const fileContent = fs.readFileSync(ITEM_REGISTRY_FILE, 'utf8');
  const registry = JSON.parse(fileContent);
  const updatedEntries: Record<string, any> = {};

  for (const item of medsToUpdate) {
    const code = (item.itemCode || '').trim();
    if (!code) continue;

    const hasPhoto = !!item.imageUrl;
    const hasTranslations = !!(
      item.arIndications ||
      item.hiIndications ||
      item.urIndications ||
      item.mlIndications ||
      item.bnIndications ||
      item.tlIndications
    );

    if (hasPhoto || hasTranslations) {
      const existing = registry[code] || {};
      const updated = {
        itemCode: code,
        itemName: item.itemName || existing.itemName || '',
        imageUrl: item.imageUrl || existing.imageUrl || null,
        enIndications: item.enIndications || existing.enIndications || '',
        arIndications: item.arIndications || existing.arIndications || '',
        hiIndications: item.hiIndications || existing.hiIndications || '',
        urIndications: item.urIndications || existing.urIndications || '',
        mlIndications: item.mlIndications || existing.mlIndications || '',
        bnIndications: item.bnIndications || existing.bnIndications || '',
        tlIndications: item.tlIndications || existing.tlIndications || '',
        lastUpdatedAt: new Date().toISOString()
      };
      registry[code] = updated;
      updatedEntries[code] = updated;
    }
  }

  if (Object.keys(updatedEntries).length > 0) {
    fs.writeFileSync(ITEM_REGISTRY_FILE, JSON.stringify(registry, null, 2));

    if (adminDb) {
      try {
        let batch = adminDb.batch();
        let count = 0;
        for (const [code, data] of Object.entries(updatedEntries)) {
          const docRef = adminDb.collection('item_reference_registry').doc(code);
          batch.set(docRef, data, { merge: true });
          count++;
          if (count >= 400) {
            await batch.commit();
            batch = adminDb.batch();
            count = 0;
          }
        }
        if (count > 0) {
          await batch.commit();
        }
      } catch (err: any) {
        handleAdminDbError(err, 'write item_reference_registry');
      }
    }
  }
}

async function syncItemReferenceRegistryFromFirestore(): Promise<void> {
  if (!adminDb) return;
  try {
    const snapshot = await adminDb.collection('item_reference_registry').get();
    const registry: Record<string, any> = {};
    snapshot.forEach(doc => {
      const parsed = parseFirestoreDoc(doc);
      if (parsed.itemCode) {
        registry[parsed.itemCode] = parsed;
      }
    });
    if (Object.keys(registry).length > 0) {
      let localRegistry: Record<string, any> = {};
      if (fs.existsSync(ITEM_REGISTRY_FILE)) {
        try {
          localRegistry = JSON.parse(fs.readFileSync(ITEM_REGISTRY_FILE, 'utf8'));
        } catch (e) {}
      }
      const finalRegistry = { ...localRegistry, ...registry };
      fs.writeFileSync(ITEM_REGISTRY_FILE, JSON.stringify(finalRegistry, null, 2));
      console.log(`[Firebase Startup Sync] Synchronized ${Object.keys(registry).length} item reference entries from Firestore.`);
    }
  } catch (err: any) {
    handleAdminDbError(err, 'startup registry sync');
  }
}

async function saveMedicationToFirestore(item: any): Promise<void> {
  if (!adminDb) return;
  try {
    const { id, addedAt, lastUpdatedAt, ...rest } = item;
    let locationId = rest.locationId;
    if (locationId === 'adult') locationId = 'adult-emergency';
    else if (locationId === 'mesaieed') locationId = 'mesaieed-opd';
    
    const docRef = adminDb.collection('medications').doc(id);
    await docRef.set({
      ...rest,
      locationId,
      id: id,
      addedAt: addedAt || new Date().toISOString(),
      lastUpdatedAt: lastUpdatedAt || new Date().toISOString(),
      updatedBy: rest.updatedBy || 'system'
    }, { merge: true });
    await updateServerMetadataFirestore().catch(err => console.error('[Realtime Sync Update Error]', err));
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
      let locationId = rest.locationId;
      if (locationId === 'adult') locationId = 'adult-emergency';
      else if (locationId === 'mesaieed') locationId = 'mesaieed-opd';
      
      const docRef = adminDb.collection('medications').doc(id);
      batch.set(docRef, {
        ...rest,
        locationId,
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
    await updateServerMetadataFirestore().catch(err => console.error('[Realtime Sync Update Error]', err));
  } catch (err: any) {
    handleAdminDbError(err, 'bulk-save medications');
  }
}

async function deleteMedicationFromFirestore(id: string): Promise<void> {
  if (!adminDb) return;
  try {
    await adminDb.collection('medications').doc(id).delete();
    await updateServerMetadataFirestore().catch(err => console.error('[Realtime Sync Update Error]', err));
  } catch (err: any) {
    handleAdminDbError(err, 'delete medication');
  }
}

async function syncAuditsFromFirestore(enableSeeding: boolean = false): Promise<any[]> {
  if (!adminDb) return JSON.parse(fs.readFileSync(AUDITS_FILE, 'utf8'));
  try {
    const snapshot = await adminDb.collection('inventory_audits').get();
    const audits: any[] = [];
    let needsMigration = false;
    let batch = adminDb.batch();
    let migrationCount = 0;

    snapshot.forEach(doc => {
      const parsed = parseFirestoreDoc(doc);
      if (parsed.locationId === 'adult' || parsed.locationId === 'mesaieed') {
        needsMigration = true;
        parsed.locationId = parsed.locationId === 'adult' ? 'adult-emergency' : 'mesaieed-opd';
        
        const docRef = adminDb.collection('inventory_audits').doc(doc.id);
        batch.update(docRef, { locationId: parsed.locationId });
        migrationCount++;
      }
      audits.push(parsed);
    });

    if (needsMigration && migrationCount > 0) {
      console.log(`[Firebase Migration] Upgrading ${migrationCount} audits to use 'adult-emergency' / 'mesaieed-opd' location IDs...`);
      await batch.commit();
      console.log(`[Firebase Migration] Upgraded audits successfully!`);
    }
    
    if (audits.length > 0) {
      audits.sort((a, b) => new Date(b.auditedAt || 0).getTime() - new Date(a.auditedAt || 0).getTime());
      fs.writeFileSync(AUDITS_FILE, JSON.stringify(audits, null, 2));
    } else {
      if (enableSeeding) {
        // Seed audits from local JSON
        const localDataStr = fs.readFileSync(AUDITS_FILE, 'utf8');
        const localAudits = JSON.parse(localDataStr);
        if (localAudits && localAudits.length > 0) {
          console.log(`[Firebase Seed] Firestore 'inventory_audits' is empty. Seeding Firestore with ${localAudits.length} items...`);
          let batch = adminDb.batch();
          let count = 0;
          for (const item of localAudits) {
            const { id, auditedAt, ...rest } = item;
            const docRef = adminDb.collection('inventory_audits').doc(id);
            batch.set(docRef, {
              ...rest,
              id: id,
              auditedAt: auditedAt ? Timestamp.fromDate(new Date(auditedAt)) : FieldValue.serverTimestamp(),
              auditedBy: rest.auditedBy || 'system'
            }, { merge: true });
            count++;
            if (count >= 400) {
              await batch.commit();
              batch = adminDb.batch();
              count = 0;
            }
          }
          if (count > 0) {
            await batch.commit();
          }
          console.log(`[Firebase Seed] Seeding completed for ${localAudits.length} audits.`);
          return localAudits;
        }
      } else {
        // Otherwise, Firestore is empty, so wipe local file
        fs.writeFileSync(AUDITS_FILE, '[]');
      }
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
    await updateServerMetadataFirestore().catch(err => console.error('[Realtime Sync Update Error]', err));
  } catch (err: any) {
    handleAdminDbError(err, 'save audit');
  }
}

async function syncEntryMistakesDbFromFirestore(enableSeeding: boolean = false): Promise<any> {
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
      const meta = docSnap.data();
      // If it's a chunked storage
      if (meta.isChunked) {
        // Fetch pharmacists
        let pharmacists: any[] = [];
        const pharmDoc = await adminDb.collection('entry_mistakes_configs').doc('pharmacists').get();
        if (pharmDoc.exists) {
          pharmacists = pharmDoc.data().pharmacists || [];
        }
        
        // Fetch all parameter chunks
        const paramsSnap = await adminDb.collection('entry_mistakes_parameters').get();
        let parameters: any[] = [];
        
        // Match chunk documents and merge items
        const chunkDocs: any[] = [];
        paramsSnap.forEach((doc: any) => {
          chunkDocs.push(doc.data());
        });
        
        // Sort chunks by index to maintain insertion/uploaded order if needed
        chunkDocs.sort((a, b) => (a.index || 0) - (b.index || 0));
        
        chunkDocs.forEach((chunk) => {
          if (chunk && Array.isArray(chunk.items)) {
            parameters = parameters.concat(chunk.items);
          }
        });
        
        const dbState = {
          configured: meta.configured,
          lastUpdated: meta.lastUpdated,
          parameters,
          pharmacists
        };
        fs.writeFileSync(ENTRY_MISTAKES_DB_FILE, JSON.stringify(dbState, null, 2));
        return dbState;
      } else {
        // Legacy single-doc storage
        fs.writeFileSync(ENTRY_MISTAKES_DB_FILE, JSON.stringify(meta, null, 2));
        return meta;
      }
    } else {
      if (enableSeeding) {
        // Seed entry_mistakes_configs if local exists
        if (fs.existsSync(ENTRY_MISTAKES_DB_FILE)) {
          const localDataStr = fs.readFileSync(ENTRY_MISTAKES_DB_FILE, 'utf8');
          try {
            const localData = JSON.parse(localDataStr);
            if (localData && localData.configured) {
              console.log(`[Firebase Seed] Firestore 'entry_mistakes_configs/global' is empty. Seeding Firestore with chunked local parameters...`);
              await saveEntryMistakesDbToFirestore(localData);
              return localData;
            }
          } catch (e: any) {
            console.warn("Error parsing local entry mistakes JSON file during seeding:", e.message);
          }
        }
      } else {
        // Otherwise, Firestore is empty (cleared on reset), so delete local config file
        if (fs.existsSync(ENTRY_MISTAKES_DB_FILE)) {
          fs.unlinkSync(ENTRY_MISTAKES_DB_FILE);
        }
      }
    }
  } catch (err: any) {
    handleAdminDbError(err, 'sync parameters DB');
  }
  if (fs.existsSync(ENTRY_MISTAKES_DB_FILE)) {
    return JSON.parse(fs.readFileSync(ENTRY_MISTAKES_DB_FILE, 'utf8'));
  }
  return null;
}

async function saveEntryMistakesDbToFirestore(dbState: any): Promise<void> {
  if (!adminDb) return;
  try {
    const { parameters = [], pharmacists = [], configured, lastUpdated } = dbState;
    console.log(`[Firebase Sync] Saving parameter database to Firestore with chunked format. Total parameters: ${parameters.length}, pharmacists: ${pharmacists.length}`);

    // Clean up any old parameter chunks first to avoid dangling chunks if the count decreased
    const oldParamsSnap = await adminDb.collection('entry_mistakes_parameters').get();
    const deleteBatch = adminDb.batch();
    let deleteCount = 0;
    oldParamsSnap.forEach((doc: any) => {
      deleteBatch.delete(doc.ref);
      deleteCount++;
    });
    if (deleteCount > 0) {
      await deleteBatch.commit();
      console.log(`[Firebase Sync] Purged ${deleteCount} old parameters chunks.`);
    }

    // Chunk parameters to prevent Firestore 1MB document limit issue
    const CHUNK_SIZE = 250;
    const chunks: any[][] = [];
    for (let i = 0; i < parameters.length; i += CHUNK_SIZE) {
      chunks.push(parameters.slice(i, i + CHUNK_SIZE));
    }

    // Save parameter chunks
    for (let idx = 0; idx < chunks.length; idx++) {
      await adminDb.collection('entry_mistakes_parameters').doc(`chunk_${idx}`).set({
        index: idx,
        items: chunks[idx],
        savedAt: new Date().toISOString()
      });
    }

    // Save pharmacists in a separate document
    await adminDb.collection('entry_mistakes_configs').doc('pharmacists').set({
      pharmacists: pharmacists,
      savedAt: new Date().toISOString()
    });

    // Save global configuration metadata document
    await adminDb.collection('entry_mistakes_configs').doc('global').set({
      configured: configured || true,
      lastUpdated: lastUpdated || new Date().toISOString(),
      isChunked: true,
      chunkCount: chunks.length,
      pharmacistCount: pharmacists.length,
      parameterCount: parameters.length
    });
    await updateServerMetadataFirestore().catch(err => console.error('[Realtime Sync Update Error]', err));
    console.log(`[Firebase Sync] Successfully synced chunked parameters database to Firestore!`);
  } catch (err: any) {
    handleAdminDbError(err, 'save parameters DB');
  }
}

async function deleteEntryMistakesDbFromFirestore(): Promise<void> {
  if (!adminDb) return;
  try {
    // Delete metadata and pharmacists docs
    await adminDb.collection('entry_mistakes_configs').doc('global').delete();
    await adminDb.collection('entry_mistakes_configs').doc('pharmacists').delete();

    // Delete parameter chunk documents
    const paramsSnap = await adminDb.collection('entry_mistakes_parameters').get();
    const batch = adminDb.batch();
    let count = 0;
    paramsSnap.forEach((doc: any) => {
      batch.delete(doc.ref);
      count++;
    });
    if (count > 0) {
      await batch.commit();
    }
    await updateServerMetadataFirestore().catch(err => console.error('[Realtime Sync Update Error]', err));
    console.log(`[Firebase Sync] Parameters database deleted from Firestore. Purged ${count} chunks.`);
  } catch (err: any) {
    handleAdminDbError(err, 'delete parameters DB');
  }
}

async function syncSettingsFromFirestore(): Promise<any> {
  if (!adminDb) {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    }
    return {};
  }
  try {
    const docRef = adminDb.collection('app_settings').doc('global');
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      const data = docSnap.data();
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2));
      console.log('[Firebase Sync] Restored settings from Firestore.');
      return data;
    } else {
      if (fs.existsSync(SETTINGS_FILE)) {
        const localData = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
        await docRef.set(localData);
        console.log('[Firebase Sync] Initialized Firestore app_settings with local settings.');
        return localData;
      }
    }
  } catch (err: any) {
    console.error('[Firebase Sync] Failed to sync settings from Firestore:', err.message);
  }
  return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
}

async function saveSettingsToFirestore(settings: any): Promise<void> {
  if (!adminDb) return;
  try {
    await adminDb.collection('app_settings').doc('global').set(settings);
    await updateServerMetadataFirestore().catch(err => console.error('[Realtime Sync Update Error]', err));
    console.log('[Firebase Sync] Saved settings successfully to Firestore.');
  } catch (err: any) {
    console.error('[Firebase Sync] Failed to save settings to Firestore:', err.message);
  }
}

async function syncTranslationCacheFromFirestore(enableSeeding: boolean = false): Promise<Record<string, any>> {
  if (!adminDb) {
    if (fs.existsSync(TRANSLATION_CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(TRANSLATION_CACHE_FILE, 'utf8'));
    }
    return {};
  }
  try {
    const snapshot = await adminDb.collection('translation_cache').get();
    const cache: Record<string, any> = {};
    snapshot.forEach(doc => {
      cache[doc.id] = doc.data();
    });
    if (Object.keys(cache).length > 0) {
      fs.writeFileSync(TRANSLATION_CACHE_FILE, JSON.stringify(cache, null, 2));
      console.log(`[Firebase Sync] Synchronized ${Object.keys(cache).length} cached translations from Firestore.`);
    } else {
      if (enableSeeding) {
        // Seed Firestore from local translation_cache if it exists and has records
        if (fs.existsSync(TRANSLATION_CACHE_FILE)) {
          try {
            const localCache = JSON.parse(fs.readFileSync(TRANSLATION_CACHE_FILE, 'utf8'));
            const localKeys = Object.keys(localCache);
            if (localKeys.length > 0) {
              console.log(`[Firebase Seed] Firestore 'translation_cache' is empty. Seeding ${localKeys.length} records...`);
              let batch = adminDb.batch();
              let count = 0;
              for (const [hash, entry] of Object.entries(localCache)) {
                const docRef = adminDb.collection('translation_cache').doc(hash);
                batch.set(docRef, entry);
                count++;
                if (count >= 400) {
                  await batch.commit();
                  batch = adminDb.batch();
                  count = 0;
                }
              }
              if (count > 0) {
                await batch.commit();
              }
              console.log(`[Firebase Seed] Loaded ${localKeys.length} translation records to cloud.`);
            }
          } catch (e: any) {
            console.warn('[Firebase Seed] Failed to parse or seed local translation cache:', e.message);
          }
        }
      } else {
        // Otherwise, Firestore is genuinely empty, so reset local cache
        fs.writeFileSync(TRANSLATION_CACHE_FILE, '{}');
      }
    }
    return cache;
  } catch (err: any) {
    console.error('[Firebase Sync] Failed to sync translation cache:', err.message);
    if (fs.existsSync(TRANSLATION_CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(TRANSLATION_CACHE_FILE, 'utf8'));
    }
    return {};
  }
}

async function saveTranslationsBulkToFirestore(entries: Record<string, any>): Promise<void> {
  if (!adminDb) return;
  try {
    let batch = adminDb.batch();
    let count = 0;
    for (const [hash, entry] of Object.entries(entries)) {
      const docRef = adminDb.collection('translation_cache').doc(hash);
      batch.set(docRef, entry, { merge: true });
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
    await updateServerMetadataFirestore().catch(err => console.error('[Realtime Sync Update Error]', err));
    console.log(`[Firebase Sync] Saved ${Object.keys(entries).length} translations in bulk.`);
  } catch (err: any) {
    console.error('[Firebase Sync] Failed to save translations in bulk:', err.message);
  }
}

async function syncApplicationStorageFromFirestore(enableSeeding: boolean = false): Promise<any[]> {
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
      items.sort((a, b) => new Date(b.savedAt || 0).getTime() - new Date(a.auditedAt || 0).getTime());
      fs.writeFileSync(APPLICATION_STORAGE_FILE, JSON.stringify(items, null, 2));
    } else {
      if (enableSeeding) {
        // Seed application storage from local JSON file if exists and has records
        if (fs.existsSync(APPLICATION_STORAGE_FILE)) {
          try {
            const localDataStr = fs.readFileSync(APPLICATION_STORAGE_FILE, 'utf8');
            const localItems = JSON.parse(localDataStr);
            if (localItems && localItems.length > 0) {
              console.log(`[Firebase Seed] Firestore 'application_storage' is empty. Seeding Firestore with ${localItems.length} items...`);
              let batch = adminDb.batch();
              let count = 0;
              for (const item of localItems) {
                const { id, savedAt, ...rest } = item;
                const docRef = adminDb.collection('application_storage').doc(id);
                batch.set(docRef, {
                  ...rest,
                  id: id,
                  savedAt: savedAt || new Date().toISOString()
                }, { merge: true });
                count++;
                if (count >= 400) {
                  await batch.commit();
                  batch = adminDb.batch();
                  count = 0;
                }
              }
              if (count > 0) {
                await batch.commit();
              }
              console.log(`[Firebase Seed] Seeding completed for ${localItems.length} application storage records.`);
              return localItems;
            }
          } catch (e: any) {
            console.warn("Error parsing or seeding application_storage from local JSON file:", e.message);
          }
        }
      } else {
        // Otherwise, Firestore is empty (reset), so clear local application_storage cache
        fs.writeFileSync(APPLICATION_STORAGE_FILE, '[]');
      }
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
    await updateServerMetadataFirestore().catch(err => console.error('[Realtime Sync Update Error]', err));
  } catch (err: any) {
    console.error('[Firebase Sync] Failed bulk-save mismatches to Firestore:', err.message);
  }
}

async function deleteMismatchFromFirestore(item: any): Promise<void> {
  if (!adminDb) return;
  try {
    const id = item.id || `${item.mrnOrganization || ''}_${item.actionDateTime || ''}_${item.itemNumber || ''}`.replace(/[^a-zA-Z0-9_\-]/g, '_');
    await adminDb.collection('application_storage').doc(id).delete();
    await updateServerMetadataFirestore().catch(err => console.error('[Realtime Sync Update Error]', err));
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
    await updateServerMetadataFirestore().catch(err => console.error('[Realtime Sync Update Error]', err));
  } catch (err: any) {
    console.error('[Firebase Sync] Failed to reset application storage in Firestore:', err.message);
  }
}

// --- TWO-WAY REAL-TIME INSTANCE SYNCHRONIZATION ---
const SERVER_INSTANCE_ID = crypto.randomBytes(8).toString('hex');
let realtimeSyncTimeout: NodeJS.Timeout | null = null;
let realtimeSyncInProgress = false;

let lastFirestoreReconnectAttempt = 0;
const RECONNECT_COOLDOWN_MS = 60000; // Prevent hammering on quota-exceeded with a 1-minute retry gate

function reconnectFirestore(): boolean {
  const now = Date.now();
  if (now < firestoreFailureBackoffUntil) {
    return false;
  }
  if (now - lastFirestoreReconnectAttempt < RECONNECT_COOLDOWN_MS) {
    return false;
  }
  lastFirestoreReconnectAttempt = now;
  console.log('[Firebase Sync] Realtime fallback state detected. Attempting to restore server connection to Firestore cloud database...');
  
  try {
    let projectId: string | undefined = undefined;
    let databaseId: string | undefined = undefined;
    
    const configPath = path.join(PROJECT_ROOT, 'firebase-applet-config.json');
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
        adminApp = initializeApp({ projectId });
      } else {
        adminApp = getApps()[0];
      }
      
      adminDb = databaseId ? getFirestore(adminApp, databaseId) : getFirestore(adminApp);
      console.log(`[Firebase Sync] Re-initialized Firestore via Admin SDK.`);
      
      // Proactively pull startup sync once re-established
      syncAllFromFirestoreAtStartup().catch(err => {
        console.warn('[Firebase Sync] Startup sync validation failed after Admin SDK reconnect:', err.message);
      });
      setupRealtimeMetadataListener();
      return true;
    }
  } catch (err: any) {
    console.warn('[Firebase Sync] Admin SDK reconnect failed, trying Web Client SDK fallback...', err.message);
    try {
      const configPath = path.join(PROJECT_ROOT, 'firebase-applet-config.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config.apiKey && config.projectId) {
          let clientApp;
          const existingApps = getClientApps();
          if (existingApps.length === 0) {
            clientApp = initClientApp(config);
          } else {
            clientApp = existingApps[0];
          }
          
          try {
            setLogLevel('error');
          } catch (e) {}

          const clientFirestore = config.firestoreDatabaseId 
            ? getClientFirestore(clientApp, config.firestoreDatabaseId) 
            : getClientFirestore(clientApp);

          adminDb = new ClientDbWrapper(clientFirestore);
          FieldValue = {
            serverTimestamp: () => clientServerTimestamp()
          };
          Timestamp = {
            fromDate: (date: Date) => ClientTimestamp.fromDate(date)
          };
          console.log('[Firebase Sync] Re-initialized Firestore via Web Client SDK fallback (uses API Key Rules).');
          
          syncAllFromFirestoreAtStartup().catch(err => {
            console.warn('[Firebase Sync] Startup sync validation failed after Client SDK reconnect:', err.message);
          });
          setupRealtimeMetadataListener();
          return true;
        }
      }
    } catch (clientErr: any) {
      console.error('[Firebase Sync] Web Client SDK fallback reconnect failed too:', clientErr.message);
    }
  }
  return false;
}

// Cached metadata checking variables for on-demand HTTP polling sync
let lastMetadataCheckTime = 0;
const METADATA_CHECK_INTERVAL_MS = 15000; // Check at most once every 15 seconds to safely conserve daily read limit
let onDemandSyncPromise: Promise<void> | null = null;

async function checkAndSyncFromFirestoreOnDemand(): Promise<void> {
  if (!adminDb) {
    const success = reconnectFirestore();
    if (!success) {
      return;
    }
  }
  const now = Date.now();
  if (now - lastMetadataCheckTime < METADATA_CHECK_INTERVAL_MS) {
    return;
  }
  if (onDemandSyncPromise) {
    return onDemandSyncPromise;
  }
  onDemandSyncPromise = (async () => {
    try {
      const metaSnap = await adminDb.collection('system').doc('metadata').get();
      lastMetadataCheckTime = Date.now();
      if (metaSnap.exists) {
        const data = metaSnap.data();
        const firestoreLastResetTime = data.lastResetTime;
        const updatedBy = data.updatedBy;
        
        // Handle reset signal in local cache if we didn't receive/trigger it yet
        if (firestoreLastResetTime && firestoreLastResetTime !== localLastResetTime) {
          console.log(`[Firebase Sync On-Demand] Reset detected (${firestoreLastResetTime}). Resetting local files...`);
          fs.writeFileSync(MEDS_FILE, '[]');
          fs.writeFileSync(AUDITS_FILE, '[]');
          fs.writeFileSync(TRANSLATION_CACHE_FILE, '{}');
          if (fs.existsSync(ENTRY_MISTAKES_DB_FILE)) {
            fs.unlinkSync(ENTRY_MISTAKES_DB_FILE);
          }
          fs.writeFileSync(APPLICATION_STORAGE_FILE, '[]');
          
          localLastResetTime = firestoreLastResetTime;
          fs.writeFileSync(LAST_RESET_FILE, JSON.stringify({ lastResetTime: firestoreLastResetTime }));
        }
        
        // Skip background sync if changes were updated by this server instance
        if (updatedBy === `server_${SERVER_INSTANCE_ID}`) {
          return;
        }
        
        console.log(`[Firebase Sync On-Demand] Detected newer cloud metadata by ${updatedBy}. Syncing background files...`);
        await Promise.all([
          syncMedicationsFromFirestore(false).catch(e => console.error('On-demand medications sync failed:', e.message)),
          syncAuditsFromFirestore(false).catch(e => console.error('On-demand audits sync failed:', e.message)),
          syncEntryMistakesDbFromFirestore(false).catch(e => console.error('On-demand parameters DB sync failed:', e.message)),
          syncApplicationStorageFromFirestore(false).catch(e => console.error('On-demand application storage sync failed:', e.message)),
          syncSettingsFromFirestore().catch(e => console.error('On-demand settings sync failed:', e.message)),
          syncTranslationCacheFromFirestore(false).catch(e => console.error('On-demand translation cache sync failed:', e.message))
        ]);
        console.log('[Firebase Sync On-Demand] Finished syncing cloud data!');
      }
    } catch (err: any) {
      console.warn('[Firebase Sync On-Demand] Graceful error checking metadata:', err.message);
      handleAdminDbError(err, 'on-demand metadata');
    } finally {
      onDemandSyncPromise = null;
    }
  })();
  return onDemandSyncPromise;
}

async function updateServerMetadataFirestore(resetTime?: string): Promise<void> {
  if (!adminDb) return;
  try {
    const metaRef = adminDb.collection('system').doc('metadata');
    const updateData: any = {
      lastDataUpdate: FieldValue.serverTimestamp(),
      updatedBy: `server_${SERVER_INSTANCE_ID}`
    };
    if (resetTime) {
      updateData.lastResetTime = resetTime;
    }
    await metaRef.set(updateData, { merge: true });
    console.log(`[Firebase Realtime Sync] Metadata updated by server instance: ${SERVER_INSTANCE_ID} (reset: ${resetTime || 'no'})`);
  } catch (err: any) {
    console.error('[Firebase Realtime Sync] Failed to update global metadata:', err.message);
    handleAdminDbError(err, 'write metadata');
  }
}

function setupRealtimeMetadataListener() {
  if (!adminDb) return;
  try {
    console.log('[Firebase Realtime Sync] Initializing server-side listener on metadata changes...');
    
    const metadataRef = adminDb.collection('system').doc('metadata');
    
    metadataRef.onSnapshot((docSnap: any) => {
      if (docSnap && docSnap.exists) {
        const data = docSnap.data();
        const serverUpdate = data.lastDataUpdate;
        const updatedBy = data.updatedBy;
        const firestoreLastResetTime = data.lastResetTime;
        
        // Skip self-updates to avoid endless feedback fetch loops
        if (updatedBy === `server_${SERVER_INSTANCE_ID}`) {
          console.log(`[Firebase Realtime Sync] Ignored metadata signal from self-instance: ${SERVER_INSTANCE_ID}`);
          return;
        }

        console.log(`[Firebase Realtime Sync] Received real-time update signal. Triggered by: ${updatedBy}`);
        
        // Check if a reset occurred
        if (firestoreLastResetTime && firestoreLastResetTime !== localLastResetTime) {
          console.log(`[Firebase Realtime Sync] Realtime reset signal detected (${firestoreLastResetTime}). Clearing local files to match...`);
          fs.writeFileSync(MEDS_FILE, '[]');
          fs.writeFileSync(AUDITS_FILE, '[]');
          fs.writeFileSync(TRANSLATION_CACHE_FILE, '{}');
          if (fs.existsSync(ENTRY_MISTAKES_DB_FILE)) {
            fs.unlinkSync(ENTRY_MISTAKES_DB_FILE);
          }
          fs.writeFileSync(APPLICATION_STORAGE_FILE, '[]');
          
          localLastResetTime = firestoreLastResetTime;
          fs.writeFileSync(LAST_RESET_FILE, JSON.stringify({ lastResetTime: firestoreLastResetTime }));
        }
        
        // Debounce fetching to group multiple fast changes together
        if (realtimeSyncTimeout) {
          clearTimeout(realtimeSyncTimeout);
        }
        
        realtimeSyncTimeout = setTimeout(async () => {
          if (realtimeSyncInProgress) {
            console.log('[Firebase Realtime Sync] Sync already in progress, deferred.');
            return;
          }
          
          realtimeSyncInProgress = true;
          console.log('[Firebase Realtime Sync] Loading cloud changes in the background...');
          
          try {
            await Promise.all([
              syncMedicationsFromFirestore(false).catch(e => console.error('BG medications sync failed:', e.message)),
              syncAuditsFromFirestore(false).catch(e => console.error('BG audits sync failed:', e.message)),
              syncEntryMistakesDbFromFirestore(false).catch(e => console.error('BG parameters DB sync failed:', e.message)),
              syncApplicationStorageFromFirestore(false).catch(e => console.error('BG application storage sync failed:', e.message)),
              syncSettingsFromFirestore().catch(e => console.error('BG settings sync failed:', e.message)),
              syncTranslationCacheFromFirestore(false).catch(e => console.error('BG translation cache sync failed:', e.message))
            ]);
            console.log('[Firebase Realtime Sync] Successfully synced background state with Firestore!');
          } catch (syncErr: any) {
            console.error('[Firebase Realtime Sync] Secondary error during background synchronization:', syncErr.message);
          } finally {
            realtimeSyncInProgress = false;
          }
        }, 1000); // 1-second debounce
      }
    }, (err: any) => {
      const errMsg = err?.message || String(err);
      const isBenign = errMsg.includes('CANCELLED') || 
                       errMsg.includes('Disconnecting idle stream') || 
                       err?.code === 'cancelled' || 
                       String(err?.code) === '1';
      if (isBenign) {
        console.log('[Firebase Realtime Sync] Idle listener connection disconnected or timed out; Firestore client will automatically reconnect.');
        return;
      }

      handleAdminDbError(err, 'metadata listener');
      if (adminDb) {
        console.warn('[Firebase Realtime Sync] Metadata listener failed on Firestore, scheduling retry in 10s:', errMsg);
        setTimeout(() => {
          setupRealtimeMetadataListener();
        }, 10000);
      } else {
        console.warn('[Firebase Realtime Sync] Real-time listener disabled gracefully due to permission/initialization failure.');
      }
    });
  } catch (err: any) {
    console.warn('[Firebase Realtime Sync] Failed to register real-time listener:', err.message);
  }
}

async function syncAllFromFirestoreAtStartup() {
  if (!adminDb) {
    console.log('[Firebase Startup Sync] Firestore admin database not active. Skipping startup pull.');
    return;
  }
  console.log('[Firebase Startup Sync] Loading persistent data from Firestore...');
  try {
    const metaSnap = await adminDb.collection('system').doc('metadata').get();
    if (metaSnap.exists) {
      const metaData = metaSnap.data();
      const firestoreLastResetTime = metaData.lastResetTime;
      if (firestoreLastResetTime && firestoreLastResetTime !== localLastResetTime) {
        console.log(`[Firebase Startup Sync] Firestore reset signal found (${firestoreLastResetTime}). Clearing medications and audits to match...`);
        fs.writeFileSync(MEDS_FILE, '[]');
        fs.writeFileSync(AUDITS_FILE, '[]');
        
        localLastResetTime = firestoreLastResetTime;
        fs.writeFileSync(LAST_RESET_FILE, JSON.stringify({ lastResetTime: firestoreLastResetTime }));
      }
    }

    await Promise.all([
      syncMedicationsFromFirestore(true).catch(e => console.error('Startup medications sync failed:', e.message)),
      syncAuditsFromFirestore(true).catch(e => console.error('Startup audits sync failed:', e.message)),
      syncEntryMistakesDbFromFirestore(true).catch(e => console.error('Startup parameters DB sync failed:', e.message)),
      syncApplicationStorageFromFirestore(true).catch(e => console.error('Startup application storage sync failed:', e.message)),
      syncSettingsFromFirestore().catch(e => console.error('Startup settings sync failed:', e.message)),
      syncTranslationCacheFromFirestore(true).catch(e => console.error('Startup translation cache sync failed:', e.message)),
      syncItemReferenceRegistryFromFirestore().catch(e => console.error('Startup reference registry sync failed:', e.message))
    ]);
    console.log('[Firebase Startup Sync] All persistent data loaded successfully!');
  } catch (err: any) {
    console.error('[Firebase Startup Sync] Error during startup fetch:', err.message || err);
    handleAdminDbError(err, 'startup sync');
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
  } catch (err: any) {
    console.error('[Firebase Sync] Failed to clear Firestore collections during system reset:', err.message);
  }
}

// API Routes
app.get('/api/medications', async (req, res) => {
  await checkAndSyncFromFirestoreOnDemand().catch(err => console.error(err));
  if (adminDb) {
    await syncMedicationsFromFirestore().catch(err => console.error(err));
  }
  const data = fs.readFileSync(MEDS_FILE, 'utf8');
  res.json(JSON.parse(data));
});

app.post('/api/medications', async (req, res) => {
  try {
    const meds = JSON.parse(fs.readFileSync(MEDS_FILE, 'utf8'));
    const item = req.body;
    const code = (item.itemCode || '').trim();

    // Auto-fill from registry if exists
    let registryData: any = null;
    if (code && fs.existsSync(ITEM_REGISTRY_FILE)) {
      try {
        const registry = JSON.parse(fs.readFileSync(ITEM_REGISTRY_FILE, 'utf8'));
        if (registry[code]) registryData = registry[code];
      } catch (e) {}
    }

    const filledItem = { ...item };
    if (registryData) {
      if (!filledItem.imageUrl) filledItem.imageUrl = registryData.imageUrl || null;
      
      const transFields = ['arIndications', 'hiIndications', 'urIndications', 'mlIndications', 'bnIndications', 'tlIndications'];
      transFields.forEach(field => {
        if (!filledItem[field]) {
          filledItem[field] = registryData[field] || '';
        }
      });
    }

    const newMed = {
      ...filledItem,
      id: Math.random().toString(36).substring(2, 15),
      addedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString()
    };
    meds.push(newMed);
    fs.writeFileSync(MEDS_FILE, JSON.stringify(meds, null, 2));

    await updateItemReferenceRegistry([newMed]).catch(err => console.error(err));

    if (adminDb) {
      await saveMedicationToFirestore(newMed).catch(err => console.error(err));
    }

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
      const code = (req.body.itemCode || meds[index].itemCode || '').trim();

      // Auto-fill from registry if exists
      let registryData: any = null;
      if (code && fs.existsSync(ITEM_REGISTRY_FILE)) {
        try {
          const registry = JSON.parse(fs.readFileSync(ITEM_REGISTRY_FILE, 'utf8'));
          if (registry[code]) registryData = registry[code];
        } catch (e) {}
      }

      const filledBody = { ...req.body };
      if (registryData) {
        if (!filledBody.imageUrl) filledBody.imageUrl = registryData.imageUrl || null;
        
        const transFields = ['arIndications', 'hiIndications', 'urIndications', 'mlIndications', 'bnIndications', 'tlIndications'];
        transFields.forEach(field => {
          if (!filledBody[field]) {
            filledBody[field] = registryData[field] || '';
          }
        });
      }

      meds[index] = { ...meds[index], ...filledBody, lastUpdatedAt: new Date().toISOString() };
      fs.writeFileSync(MEDS_FILE, JSON.stringify(meds, null, 2));

      await updateItemReferenceRegistry([meds[index]]).catch(err => console.error(err));

      if (adminDb) {
        await saveMedicationToFirestore(meds[index]).catch(err => console.error(err));
      }

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

    // Load reference registry
    let referenceRegistry: Record<string, any> = {};
    if (fs.existsSync(ITEM_REGISTRY_FILE)) {
      try {
        referenceRegistry = JSON.parse(fs.readFileSync(ITEM_REGISTRY_FILE, 'utf8'));
      } catch (e) {}
    }

    // Pre-calculate photo map for efficiency
    const globalPhotoMap: Record<string, string> = {};
    if (options?.photoStrategy === 'keep') {
      meds.forEach((m: any) => {
        if (m.imageUrl) globalPhotoMap[m.itemCode] = m.imageUrl;
      });
      // Also merge in photos from the reference registry!
      Object.entries(referenceRegistry).forEach(([code, data]: any) => {
        if (data.imageUrl && !globalPhotoMap[code]) {
          globalPhotoMap[code] = data.imageUrl;
        }
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
      const code = (m.itemCode || '').trim();
      const existingIndex = meds.findIndex((em: any) => em.locationId === m.locationId && em.itemCode === code);
      const existing = existingIndex !== -1 ? meds[existingIndex] : null;
      
      let imageUrl = m.imageUrl;
      if (options?.photoStrategy === 'keep') {
        if (!imageUrl) {
          imageUrl = globalPhotoMap[code] || referenceRegistry[code]?.imageUrl || null;
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
        hiIndications: m.hiIndications || existing?.hiIndications || referenceRegistry[code]?.hiIndications || getCachedField('hiIndications', 'hi') || '',
        urIndications: m.urIndications || existing?.urIndications || referenceRegistry[code]?.urIndications || getCachedField('urIndications', 'ur') || '',
        mlIndications: m.mlIndications || existing?.mlIndications || referenceRegistry[code]?.mlIndications || getCachedField('mlIndications', 'ml') || '',
        bnIndications: m.bnIndications || existing?.bnIndications || referenceRegistry[code]?.bnIndications || getCachedField('bnIndications', 'bn') || '',
        tlIndications: m.tlIndications || existing?.tlIndications || referenceRegistry[code]?.tlIndications || getCachedField('tlIndications', 'tl') || ''
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

    await updateItemReferenceRegistry(newMeds).catch(err => console.error(err));

    if (adminDb) {
      await saveMedicationsBulkToFirestore(newMeds).catch(err => console.error(err));
    }

    res.json({ count: newMeds.length });
  } catch (err: any) {
    console.error('Bulk import error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/audits', async (req, res) => {
  await checkAndSyncFromFirestoreOnDemand().catch(err => console.error(err));
  if (adminDb) {
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

    res.status(201).json(newAudit);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/translation_cache', async (req, res) => {
  try {
    await checkAndSyncFromFirestoreOnDemand().catch(err => console.error(err));
    if (adminDb) {
      await syncTranslationCacheFromFirestore().catch(err => console.error(err));
    }
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

    const resetStr = new Date().toISOString();
    localLastResetTime = resetStr;
    fs.writeFileSync(LAST_RESET_FILE, JSON.stringify({ lastResetTime: resetStr }));

    if (!adminDb) {
      // Force an attempt of reconnection to Firestore
      reconnectFirestore();
    }

    if (adminDb) {
      await resetAllInFirestore().catch(err => console.error(err));
      await updateServerMetadataFirestore(resetStr).catch(err => console.error(err));
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/entry-mistakes/db', async (req, res) => {
  try {
    await checkAndSyncFromFirestoreOnDemand().catch(err => console.error(err));
    if (adminDb) {
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

    res.json({ success: true, configured: false, parameters: [], pharmacists: [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET all stored application mistakes
app.get('/api/application-storage', async (req, res) => {
  try {
    await checkAndSyncFromFirestoreOnDemand().catch(err => console.error(err));
    if (adminDb) {
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

    const resetStr = new Date().toISOString();
    localLastResetTime = resetStr;
    fs.writeFileSync(LAST_RESET_FILE, JSON.stringify({ lastResetTime: resetStr }));

    if (!adminDb) {
      // Force an attempt of reconnection to Firestore
      reconnectFirestore();
    }

    if (adminDb) {
      await resetApplicationStorageInFirestore().catch(err => console.error(err));
      await updateServerMetadataFirestore(resetStr).catch(err => console.error(err));
    }

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
        if (adminDb) {
          const newEntries: Record<string, any> = {};
          uniqueItems.forEach(uItem => {
            const hash = getTranslationHashSync(uItem.text);
            if (hash && translationCache[hash]) {
              newEntries[hash] = translationCache[hash];
            }
          });
          if (Object.keys(newEntries).length > 0) {
            saveTranslationsBulkToFirestore(newEntries).catch(err => console.error('[Firebase Sync] Failed bulk-saving translations:', err.message));
          }
        }
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
app.use(express.static(path.join(PROJECT_ROOT, 'public'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.svg') || path.endsWith('.webmanifest')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

async function startServer() {
  const isProd = process.env.NODE_ENV === "production" && fs.existsSync(path.join(PROJECT_ROOT, 'dist/index.html'));

  // Run startup sync to fetch persistent Firestore state down into local cache
  await syncAllFromFirestoreAtStartup().catch(err => {
    console.error('[Firebase Startup Sync Init] Failed to run startup fetch:', err.message);
  });

  // Start server-side real-time listener to keep separate instances synchronized
  setupRealtimeMetadataListener();

  // Vite middleware for development
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(PROJECT_ROOT, 'dist');
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
