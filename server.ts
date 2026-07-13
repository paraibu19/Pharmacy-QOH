import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import readline from 'readline';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import { 
  initializeApp as initializeClientApp, 
  getApps, 
  getApp 
} from 'firebase/app';
import { 
  getFirestore as getClientFirestore, 
  initializeFirestore,
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  writeBatch, 
  onSnapshot,
  Timestamp,
  serverTimestamp,
  query,
  limit,
  orderBy
} from 'firebase/firestore';

const FieldValue = {
  serverTimestamp: () => serverTimestamp()
};

class ClientFirestoreAdapter {
  private db: any;

  constructor(firebaseConfig: any) {
    const app = getApps().length > 0 ? getApp() : initializeClientApp(firebaseConfig);
    try {
      this.db = initializeFirestore(app, { 
        experimentalForceLongPolling: true,
        useFetchStreams: false
      } as any, firebaseConfig.firestoreDatabaseId);
    } catch (e) {
      this.db = getClientFirestore(app, firebaseConfig.firestoreDatabaseId);
    }
  }

  settings(settings: any) {
    // No-op
  }

  collection(collectionPath: string) {
    return new CollectionRefAdapter(this.db, collectionPath);
  }

  batch() {
    return new WriteBatchAdapter(this.db);
  }
}

class CollectionRefAdapter {
  private db: any;
  private path: string;

  constructor(db: any, path: string) {
    this.db = db;
    this.path = path;
  }

  doc(docId: string) {
    return new DocumentRefAdapter(this.db, this.path, docId);
  }

  async get() {
    const colRef = collection(this.db, this.path);
    let q: any = colRef;
    if (this.path === 'application_storage') {
      q = query(colRef, orderBy('savedAt', 'desc'), limit(1000));
    }
    const snap = await getDocs(q);
    return new QuerySnapshotAdapter(snap);
  }

  onSnapshot(onNext: any, onError: any) {
    const colRef = collection(this.db, this.path);
    let q: any = colRef;
    if (this.path === 'application_storage') {
      q = query(colRef, orderBy('savedAt', 'desc'), limit(1000));
    }
    return onSnapshot(q, (snap) => {
      onNext(new QuerySnapshotAdapter(snap));
    }, onError);
  }
}

class DocumentRefAdapter {
  private db: any;
  private colPath: string;
  private docId: string;

  constructor(db: any, colPath: string, docId: string) {
    this.db = db;
    this.colPath = colPath;
    this.docId = docId;
  }

  get ref() {
    return doc(this.db, this.colPath, this.docId);
  }

  async get() {
    const snap = await getDoc(this.ref);
    return new DocumentSnapshotAdapter(snap);
  }

  async set(data: any, options?: any) {
    if (options) {
      await setDoc(this.ref, data, options);
    } else {
      await setDoc(this.ref, data);
    }
  }

  async delete() {
    await deleteDoc(this.ref);
  }

  onSnapshot(onNext: any, onError: any) {
    return onSnapshot(this.ref, (snap) => {
      onNext(new DocumentSnapshotAdapter(snap));
    }, onError);
  }
}

class DocumentSnapshotAdapter {
  private snap: any;

  constructor(snap: any) {
    this.snap = snap;
  }

  get exists() {
    return this.snap.exists();
  }

  get id() {
    return this.snap.id;
  }

  get ref() {
    return this.snap.ref;
  }

  data() {
    return this.snap.data();
  }
}

class QuerySnapshotAdapter {
  private snap: any;

  constructor(snap: any) {
    this.snap = snap;
  }

  get docs() {
    return this.snap.docs.map((docSnap: any) => new DocumentSnapshotAdapter(docSnap));
  }

  forEach(callback: (doc: DocumentSnapshotAdapter) => void) {
    this.snap.forEach((docSnap: any) => {
      callback(new DocumentSnapshotAdapter(docSnap));
    });
  }
}

class WriteBatchAdapter {
  private batch: any;

  constructor(db: any) {
    this.batch = writeBatch(db);
  }

  set(docRefAdapter: any, data: any, options?: any) {
    const nativeRef = docRefAdapter.ref || docRefAdapter;
    if (options) {
      this.batch.set(nativeRef, data, options);
    } else {
      this.batch.set(nativeRef, data);
    }
  }

  delete(docRefAdapter: any) {
    const nativeRef = docRefAdapter.ref || docRefAdapter;
    this.batch.delete(nativeRef);
  }

  async commit() {
    await this.batch.commit();
  }
}

dotenv.config();

// Initialize Firebase Client sync adapter
let adminDb: any = null;
try {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    adminDb = new ClientFirestoreAdapter(config);
    console.log(`[Firebase Client Sync] Firestore initialized successfully with client credentials for project: ${config.projectId}`);
  } else {
    console.warn('[Firebase Client Sync] No configuration file found. Running in local-only fallback.');
  }
} catch (err: any) {
  console.warn('[Firebase Client Sync] Graceful initialization failure:', err.message);
}

function cleanServerUndefined(obj: any): any {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) {
    return obj.map(item => cleanServerUndefined(item));
  }
  if (typeof obj === 'object') {
    const cleaned: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const val = obj[key];
        if (val !== undefined) {
          cleaned[key] = cleanServerUndefined(val);
        }
      }
    }
    return cleaned;
  }
  return obj;
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
const ROSTERS_FILE = path.join(DATA_DIR, 'rosters.json');
const WORKLOAD_RECORDS_FILE = path.join(DATA_DIR, 'workload_records.json');
const UPLOADED_FILES_FILE = path.join(DATA_DIR, 'uploaded_files.json');

// Real-time SSE synchronization state
const sseClients = new Set<any>();
let isRealtimeListeningActive = false;
let activeUnsubscribes: (() => void)[] = [];
let reconnectTimeout: NodeJS.Timeout | null = null;

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

// Sanitize and normalize location IDs on startup
try {
  if (fs.existsSync(MEDS_FILE)) {
    const raw = fs.readFileSync(MEDS_FILE, 'utf8');
    const meds = JSON.parse(raw);
    let dirty = false;
    for (const med of meds) {
      if (med.locationId === 'adult') {
        med.locationId = 'adult-emergency';
        dirty = true;
      }
    }
    if (dirty) {
      fs.writeFileSync(MEDS_FILE, JSON.stringify(meds, null, 2));
      console.log('[Startup Sanitization] Standardized legacy "adult" locationId values to "adult-emergency".');
    }
  }
} catch (e: any) {
  console.warn('[Startup Sanitization] Failed to normalize location IDs:', e.message);
}

function migrateWorkloadFileToNdjson() {
  if (fs.existsSync(WORKLOAD_RECORDS_FILE)) {
    try {
      const content = fs.readFileSync(WORKLOAD_RECORDS_FILE, 'utf8').trim();
      if (content.startsWith('[')) {
        console.log('[Migration] Converting legacy workload records JSON array to NDJSON...');
        let items: any[] = [];
        try {
          items = JSON.parse(content);
        } catch {
          items = [];
        }
        const ndjson = items.map((item: any) => JSON.stringify(item)).join('\n') + (items.length > 0 ? '\n' : '');
        fs.writeFileSync(WORKLOAD_RECORDS_FILE, ndjson);
        console.log(`[Migration] Legacy JSON array converted. ${items.length} records written.`);
      }
    } catch (e: any) {
      console.error('[Migration Error] Failed to migrate workload file:', e.message);
    }
  } else {
    fs.writeFileSync(WORKLOAD_RECORDS_FILE, '');
  }
}

function parseRecordDateServer(dateStr: string): Date {
  if (!dateStr) return new Date(0);
  try {
    if (dateStr.includes('T')) return new Date(dateStr);
    const cleaned = dateStr.replace(/\//g, '-').trim();
    if (cleaned.length >= 10) {
      const parts = cleaned.split(' ');
      const dateParts = parts[0].split('-');
      let day = 0;
      let month = 0;
      let year = 0;
      
      if (dateParts[0].length === 4) {
        // Format is YYYY-MM-DD
        year = parseInt(dateParts[0], 10);
        month = parseInt(dateParts[1], 10) - 1;
        day = parseInt(dateParts[2], 10);
      } else {
        // Format is DD-MM-YYYY
        day = parseInt(dateParts[0], 10);
        month = parseInt(dateParts[1], 10) - 1;
        year = parseInt(dateParts[2], 10);
      }
      
      if (parts.length > 1) {
        const timeParts = parts[1].split(':');
        const hours = parseInt(timeParts[0], 10);
        const minutes = parseInt(timeParts[1], 10);
        return new Date(year, month, day, hours, minutes);
      }
      return new Date(year, month, day);
    }
    return new Date(dateStr);
  } catch {
    return new Date(0);
  }
}

if (!fs.existsSync(AUDITS_FILE)) fs.writeFileSync(AUDITS_FILE, '[]');
if (!fs.existsSync(WORKLOAD_RECORDS_FILE)) {
  fs.writeFileSync(WORKLOAD_RECORDS_FILE, '');
} else {
  migrateWorkloadFileToNdjson();
}
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

// AI Studio Dev Proxy: Proxy all /api requests from ais-dev- to ais-pre-
app.use('/api', async (req, res, next) => {
  const host = req.get('host') || '';
  if (host.startsWith('ais-dev-') && !req.path.startsWith('/sync-test-broadcast')) {
    const targetHost = host.replace('ais-dev-', 'ais-pre-');
    const targetUrl = `https://${targetHost}${req.originalUrl}`;
    
    console.log(`[AI Studio Dev Proxy] Intercepted ${req.method} ${req.path}. Forwarding to ${targetUrl}`);

    // SSE stream endpoint special handling
    if (req.path === '/sync-stream') {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      if (res.flushHeaders) {
        res.flushHeaders();
      }
      
      try {
        const response = await fetch(targetUrl, {
          headers: {
            'Accept': 'text/event-stream'
          }
        });
        
        if (!response.body) {
          res.end();
          return;
        }
        
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        res.end();
      } catch (err: any) {
        console.error('[AI Studio Dev Proxy] SSE Stream proxy error:', err.message);
        res.end();
      }
      return;
    }
    
    // Standard API proxy
    try {
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === 'string' && key.toLowerCase() !== 'host') {
          headers[key] = value;
        }
      }
      
      const options: RequestInit = {
        method: req.method,
        headers,
      };
      
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        if (req.body !== undefined) {
          options.body = typeof req.body === 'object' ? JSON.stringify(req.body) : req.body;
        }
      }
      
      const response = await fetch(targetUrl, options);
      
      res.status(response.status);
      for (const [key, value] of response.headers.entries()) {
        res.setHeader(key, value);
      }
      
      const blob = await response.blob();
      const buffer = Buffer.from(await blob.arrayBuffer());
      res.send(buffer);
    } catch (err: any) {
      console.error(`[AI Studio Dev Proxy] Failed to proxy API request ${req.method} ${req.path}:`, err.message);
      res.status(500).json({ error: 'Dev Proxy Error', details: err.message, targetUrl });
    }
    return;
  }
  next();
});

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
  const lowerMsg = errMsg.toLowerCase();
  
  const isFallbackTrigger = (
    errMsg.includes('PERMISSION_DENIED') || 
    errMsg.includes('insufficient permissions') || 
    lowerMsg.includes('quota') || 
    lowerMsg.includes('exhausted') || 
    (lowerMsg.includes('limit') && !lowerMsg.includes('128.00 mib') && !lowerMsg.includes('payload size') && !lowerMsg.includes('query failed')) || 
    lowerMsg.includes('over-quota') ||
    lowerMsg.includes('unavailable') ||
    errMsg.includes(' 7 ') ||
    errMsg.startsWith('7 ') ||
    errMsg.includes(': 7') ||
    errMsg.includes('Status code: 7')
  );
  
  if (isFallbackTrigger) {
    if (adminDb) {
      console.warn(`[Firebase Sync Fallback] Server credentials, quota, or service state triggered fallback (${context}). Gracefully disabling live server-side Firestore sync and using local filesystem storage fallback.`);
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
    const cleaned = cleanServerUndefined({
      ...rest,
      id: id,
      addedAt: addedAt || new Date().toISOString(),
      lastUpdatedAt: lastUpdatedAt || new Date().toISOString(),
      updatedBy: rest.updatedBy || 'system'
    });
    await docRef.set(cleaned, { merge: true });
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
      const cleaned = cleanServerUndefined({
        ...rest,
        id: id,
        addedAt: addedAt || new Date().toISOString(),
        lastUpdatedAt: lastUpdatedAt || new Date().toISOString(),
        updatedBy: rest.updatedBy || 'system'
      });
      batch.set(docRef, cleaned, { merge: true });
      
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
    const cleaned = cleanServerUndefined({
      ...rest,
      id: id,
      auditedAt: auditedAt ? Timestamp.fromDate(new Date(auditedAt)) : FieldValue.serverTimestamp(),
      auditedBy: rest.auditedBy || 'system'
    });
    await adminDb.collection('inventory_audits').doc(id).set(cleaned);
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
    await adminDb.collection('entry_mistakes_configs').doc('global').set(cleanServerUndefined(dbState));
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

async function syncUploadedFilesFromFirestore(): Promise<any> {
  if (!adminDb) {
    if (fs.existsSync(UPLOADED_FILES_FILE)) {
      return JSON.parse(fs.readFileSync(UPLOADED_FILES_FILE, 'utf8'));
    }
    return [];
  }
  try {
    const docRef = adminDb.collection('system').doc('uploaded_files');
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      const data = docSnap.data();
      if (Array.isArray(data.files)) {
        fs.writeFileSync(UPLOADED_FILES_FILE, JSON.stringify(data.files, null, 2));
        return data.files;
      }
    }
  } catch (err: any) {
    console.error('[Firebase Admin Sync] Failed to sync uploaded files:', err.message);
  }
  if (fs.existsSync(UPLOADED_FILES_FILE)) {
    return JSON.parse(fs.readFileSync(UPLOADED_FILES_FILE, 'utf8'));
  }
  return [];
}

function logUploadedFiles(filenames: string[], recordCount: number, addedCount: number) {
  try {
    if (!filenames || filenames.length === 0) return;
    let list: any[] = [];
    if (fs.existsSync(UPLOADED_FILES_FILE)) {
      try {
        list = JSON.parse(fs.readFileSync(UPLOADED_FILES_FILE, 'utf8'));
      } catch (e) {
        list = [];
      }
    }
    const now = new Date().toISOString();
    for (const name of filenames) {
      // Check if this file was already logged within the last 5 seconds to prevent duplicates
      const isDuplicateSession = list.some(item => item.filename === name && Math.abs(new Date(item.uploadedAt).getTime() - new Date(now).getTime()) < 5000);
      if (!isDuplicateSession) {
        list.push({
          filename: name,
          uploadedAt: now,
          recordCount,
          addedCount
        });
      }
    }
    fs.writeFileSync(UPLOADED_FILES_FILE, JSON.stringify(list, null, 2));
    
    // Also sync to firestore if adminDb is configured
    if (adminDb) {
      adminDb.collection('system').doc('uploaded_files').set({ files: list }).catch((err: any) => {
        console.error('[Firebase Admin] Failed to sync uploaded files list:', err.message);
      });
    }
  } catch (err: any) {
    console.error('[Storage] Failed to log uploaded files:', err.message);
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
      items.sort((a, b) => {
        const sa = a.savedAt || '';
        const sb = b.savedAt || '';
        return sa > sb ? -1 : (sa < sb ? 1 : 0);
      });
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
      const cleaned = cleanServerUndefined({
        ...item,
        id: id,
        savedAt: item.savedAt || new Date().toISOString()
      });
      batch.set(docRef, cleaned, { merge: true });
      
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

async function syncRostersFromFirestore(): Promise<any[]> {
  if (!adminDb) {
    if (fs.existsSync(ROSTERS_FILE)) {
      try {
        return JSON.parse(fs.readFileSync(ROSTERS_FILE, 'utf8'));
      } catch {
        return [];
      }
    }
    return [];
  }
  try {
    const snapshot = await adminDb.collection('rosters').get();
    const items: any[] = [];
    snapshot.forEach(doc => {
      items.push(parseFirestoreDoc(doc));
    });
    
    items.sort((a, b) => {
      const sa = a.uploadedAt || '';
      const sb = b.uploadedAt || '';
      return sa > sb ? -1 : (sa < sb ? 1 : 0);
    });
    fs.writeFileSync(ROSTERS_FILE, JSON.stringify(items, null, 2));
    return items;
  } catch (err: any) {
    handleAdminDbError(err, 'sync rosters');
    if (fs.existsSync(ROSTERS_FILE)) {
      try {
        return JSON.parse(fs.readFileSync(ROSTERS_FILE, 'utf8'));
      } catch {
        return [];
      }
    }
    return [];
  }
}

async function saveRosterToFirestore(roster: any): Promise<void> {
  if (!adminDb) return;
  try {
    const docRef = adminDb.collection('rosters').doc(roster.id);
    const cleaned = cleanServerUndefined(roster);
    await docRef.set(cleaned);
  } catch (err: any) {
    console.error('[Firebase Sync] Failed to save roster to Firestore:', err.message);
  }
}

async function deleteRosterFromFirestore(id: string): Promise<void> {
  if (!adminDb) return;
  try {
    await adminDb.collection('rosters').doc(id).delete();
  } catch (err: any) {
    console.error('[Firebase Sync] Failed to delete roster from Firestore:', err.message);
  }
}

let isDeduplicating = false;

async function deduplicateWorkloadRecords(): Promise<{ totalBefore: number; totalAfter: number; removedCount: number }> {
  if (isDeduplicating) {
    console.log('[Deduplication] Already running. Skipping concurrent run.');
    return { totalBefore: 0, totalAfter: 0, removedCount: 0 };
  }
  isDeduplicating = true;
  try {
    if (!fs.existsSync(WORKLOAD_RECORDS_FILE)) {
      return { totalBefore: 0, totalAfter: 0, removedCount: 0 };
    }

    const existingKeys = new Set<string>();
    const uniqueRecords: any[] = [];
    let totalBefore = 0;

    const fileStream = fs.createReadStream(WORKLOAD_RECORDS_FILE);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line);
        totalBefore++;
        
        const id = rec.id || `workload-rec-${Math.random().toString(36).substring(2, 15)}-${Date.now()}`;
        const compositeKey = `${rec.mrnOrganization || ''}|||${rec.actionDateTime || ''}|||${rec.itemNumber || ''}|||${rec.pharmacyLocation || ''}`;
        
        const isDup = existingKeys.has(id) || existingKeys.has(compositeKey);
        if (!isDup) {
          rec.id = id;
          uniqueRecords.push(rec);
          existingKeys.add(id);
          existingKeys.add(compositeKey);
        }
      } catch {}
    }

    const removedCount = totalBefore - uniqueRecords.length;
    if (removedCount > 0) {
      console.log(`[Deduplication] Found and removing ${removedCount} duplicates in workload records. Total before: ${totalBefore}, Total after: ${uniqueRecords.length}`);
      const ndjson = uniqueRecords.map((item: any) => JSON.stringify(item)).join('\n') + (uniqueRecords.length > 0 ? '\n' : '');
      fs.writeFileSync(WORKLOAD_RECORDS_FILE, ndjson);
      
      // Regenerate workload summary
      await generateWorkloadSummary().catch(err => console.error('[Deduplication] Failed to generate workload summary:', err.message));
      
      // Save to Firestore in background
      if (adminDb) {
        saveWorkloadRecordsBulkToFirestoreNdjson().catch(err => {
          console.error('[Background Firebase Sync Error during deduplication] Failed to save workload records:', err.message);
        });
      }
      
      notifyClients('workload-records', { updated: true });
    } else {
      console.log(`[Deduplication] No duplicates found in workload records. Total records: ${totalBefore}`);
    }

    return { totalBefore, totalAfter: uniqueRecords.length, removedCount };
  } catch (err: any) {
    console.error('[Deduplication Error]:', err.message);
    return { totalBefore: 0, totalAfter: 0, removedCount: 0 };
  } finally {
    isDeduplicating = false;
  }
}

function getPharmacyLocationKey(pharmacyLocation: string): string {
  const loc = (pharmacyLocation || '').toLowerCase();
  if (loc.includes('adult')) return 'adult-emergency';
  if (loc.includes('pediatric')) return 'pediatric';
  if (
    loc.includes('mesaieed') ||
    loc.includes('aw ms gopd rx') ||
    loc.includes('aw ms gopd') ||
    loc.includes('gopd') ||
    loc.includes('ms gopd')
  ) {
    return 'mesaieed-opd';
  }
  return '';
}

async function generateWorkloadSummary(): Promise<any> {
  const summary = {
    total: 0,
    mismatches: 0,
    rate: '0.0',
    uniqueMrnsCount: 0,
    activeStaffCount: 0,
    lastActionStr: 'No Data',
    topMedications: [] as any[],
    topStaff: [] as any[],
    locationBreakdown: {
      'adult-emergency': { total: 0, mismatches: 0 },
      'pediatric': { total: 0, mismatches: 0 },
      'mesaieed-opd': { total: 0, mismatches: 0 }
    } as any,
    workloadTrend: [] as any[]
  };

  if (!fs.existsSync(WORKLOAD_RECORDS_FILE)) {
    return summary;
  }

  const fileStream = fs.createReadStream(WORKLOAD_RECORDS_FILE);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const mrnsSet = new Set<string>();
  const staffSet = new Set<string>();
  const medCounts: Record<string, { desc: string, count: number }> = {};
  const staffCounts: Record<string, number> = {};
  const days: Record<string, number> = {};
  let maxDate = new Date(0);

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line);
      summary.total++;
      if (rec.isMismatch) {
        summary.mismatches++;
      }

      if (rec.mrnOrganization) mrnsSet.add(rec.mrnOrganization);
      if (rec.actionPersonnelPharmacy) staffSet.add(rec.actionPersonnelPharmacy);

      // Location breakdown
      const key = getPharmacyLocationKey(rec.pharmacyLocation);

      if (key) {
        summary.locationBreakdown[key].total++;
        if (rec.isMismatch) {
          summary.locationBreakdown[key].mismatches++;
        }
      }

      // Med counts
      const num = rec.itemNumber;
      if (num) {
        if (!medCounts[num]) {
          medCounts[num] = { desc: rec.labelDescription || 'Unknown', count: 0 };
        }
        medCounts[num].count++;
      }

      // Staff counts
      const name = rec.actionPersonnelPharmacy;
      if (name) {
        staffCounts[name] = (staffCounts[name] || 0) + 1;
      }

      // Trend
      const dateStr = rec.actionDateTime;
      if (dateStr) {
        let formattedDay = '';
        if (dateStr.includes('T')) {
          formattedDay = dateStr.substring(0, 10);
        } else {
          const parts = dateStr.split(' ');
          if (parts[0] && parts[0].includes('-')) {
            const dateParts = parts[0].split('-');
            if (dateParts.length === 3 && dateParts[2].length === 4) {
              formattedDay = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
            }
          }
        }
        if (formattedDay) {
          days[formattedDay] = (days[formattedDay] || 0) + 1;
        }

        try {
          const d = parseRecordDateServer(dateStr);
          if (d.getTime() > 0 && d > maxDate) {
            maxDate = d;
            summary.lastActionStr = dateStr;
          }
        } catch {}
      }
    } catch {}
  }

  summary.uniqueMrnsCount = mrnsSet.size;
  summary.activeStaffCount = staffSet.size;
  summary.rate = summary.total > 0 ? ((summary.mismatches / summary.total) * 100).toFixed(1) : '0.0';

  // Sort and slice top meds
  summary.topMedications = Object.entries(medCounts)
    .map(([num, val]) => ({ itemNumber: num, desc: val.desc, count: val.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Sort and slice top staff
  summary.topStaff = Object.entries(staffCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Workload trend
  summary.workloadTrend = Object.entries(days)
    .map(([day, val]) => ({ day, count: val }))
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(-10);

  fs.writeFileSync(path.join(DATA_DIR, 'workload_summary.json'), JSON.stringify(summary, null, 2));
  return summary;
}

async function syncWorkloadRecordsFromFirestore(): Promise<any[]> {
  if (!adminDb) {
    return [];
  }
  try {
    const chunksSnapshot = await adminDb.collection('workload_records').get();
    const docs = chunksSnapshot.docs.filter((d: any) => d.id.startsWith('chunk_'));
    if (docs.length > 0) {
      console.log(`[Firebase Workload Sync] Found ${docs.length} chunks. Downloading into NDJSON store...`);
      const writeStream = fs.createWriteStream(WORKLOAD_RECORDS_FILE);
      
      docs.sort((a, b) => {
        return a.id.localeCompare(b.id);
      });
      
      for (const doc of docs) {
        const data = doc.data();
        if (Array.isArray(data.records)) {
          for (const rec of data.records) {
            writeStream.write(JSON.stringify(rec) + '\n');
          }
        }
      }
      
      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', () => resolve());
        writeStream.on('error', (err) => reject(err));
        writeStream.end();
      });
      
      console.log('[Firebase Workload Sync] Hydrated local NDJSON workload records file successfully.');
      await deduplicateWorkloadRecords().catch(err => console.error('[Sync Deduplication Error]:', err.message));
    }
    return [];
  } catch (err: any) {
    handleAdminDbError(err, 'sync workload records');
    return [];
  }
}

async function saveWorkloadRecordsBulkToFirestore(allItems: any[]): Promise<void> {
  await saveWorkloadRecordsBulkToFirestoreNdjson();
}

async function saveWorkloadRecordsBulkToFirestoreNdjson(): Promise<void> {
  if (!adminDb) return;
  try {
    const CHUNK_SIZE = 1000;
    let chunkIdx = 0;
    let currentChunk: any[] = [];
    
    if (!fs.existsSync(WORKLOAD_RECORDS_FILE)) return;
    
    console.log(`[Firebase Sync] Saving workload records from NDJSON file to 'workload_records' (as chunks) with chunk size ${CHUNK_SIZE}...`);
    
    const fileStream = fs.createReadStream(WORKLOAD_RECORDS_FILE);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line);
        currentChunk.push(rec);
        
        if (currentChunk.length >= CHUNK_SIZE) {
          const chunkDocId = `chunk_${chunkIdx}`;
          const docRef = adminDb.collection('workload_records').doc(chunkDocId);
          const chunkData = {
            chunkId: chunkIdx,
            updatedAt: new Date().toISOString(),
            records: cleanServerUndefined(currentChunk)
          };
          // Save chunk document individually to prevent exceeding WriteBatch payload size limit of 10MB
          await docRef.set(chunkData, { merge: false });
          
          chunkIdx++;
          currentChunk = [];
        }
      } catch {}
    }
    
    if (currentChunk.length > 0) {
      const chunkDocId = `chunk_${chunkIdx}`;
      const docRef = adminDb.collection('workload_records').doc(chunkDocId);
      const chunkData = {
        chunkId: chunkIdx,
        updatedAt: new Date().toISOString(),
        records: cleanServerUndefined(currentChunk)
      };
      await docRef.set(chunkData, { merge: false });
      chunkIdx++;
    }
    
    const lastWrittenIdx = chunkIdx - 1;
    let cleanupBatch = adminDb.batch();
    let cleanupCount = 0;
    for (let i = lastWrittenIdx + 1; i < lastWrittenIdx + 200; i++) {
      const extraDocRef = adminDb.collection('workload_records').doc(`chunk_${i}`);
      cleanupBatch.delete(extraDocRef);
      cleanupCount++;
      
      if (cleanupCount >= 400) {
        await cleanupBatch.commit().catch(() => {});
        cleanupBatch = adminDb.batch();
        cleanupCount = 0;
      }
    }
    if (cleanupCount > 0) {
      await cleanupBatch.commit().catch(() => {});
    }
    
    console.log(`[Firebase Sync] Successfully saved ${chunkIdx} chunks to 'workload_records'.`);
  } catch (err: any) {
    console.error('[Firebase Sync] Failed chunk-save workload records to Firestore:', err.message);
  }
}

async function resetWorkloadRecordsInFirestore(): Promise<void> {
  if (!adminDb) return;
  try {
    const chunksSnapshot = await adminDb.collection('workload_records').get();
    let batch = adminDb.batch();
    let count = 0;
    for (const doc of chunksSnapshot.docs) {
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
    console.log('[Firebase Sync] Purged all items and chunks from the workload_records collection.');
  } catch (err: any) {
    console.error('[Firebase Sync] Failed to reset workload records in Firestore:', err.message);
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
      syncSystemMetadataFromFirestore().catch(e => console.error('Startup system metadata sync failed:', e.message)),
      syncRostersFromFirestore().catch(e => console.error('Startup rosters sync failed:', e.message)),
      syncWorkloadRecordsFromFirestore().catch(e => console.error('Startup workload records sync failed:', e.message)),
      syncUploadedFilesFromFirestore().catch(e => console.error('Startup uploaded files sync failed:', e.message))
    ]);
    console.log('[Firebase Startup Sync] All persistent data loaded successfully!');
  } catch (err: any) {
    console.error('[Firebase Startup Sync] Error during startup fetch:', err.message);
  }
}

function cleanupFirestoreListeners() {
  console.log('[Firebase Admin Sync] Cleaning up existing listeners...');
  for (const unsub of activeUnsubscribes) {
    try {
      unsub();
    } catch (err: any) {
      console.warn('[Firebase Admin Sync] Error unsubscribing:', err.message);
    }
  }
  activeUnsubscribes = [];
  isRealtimeListeningActive = false;
}

function setupFirestoreListeners() {
  if (!adminDb) {
    console.warn('[Firebase Admin Sync] Admin database not active. Skipping real-time listener setup.');
    return;
  }
  
  if (isRealtimeListeningActive) {
    console.log('[Firebase Admin Sync] Real-time listeners already active.');
    return;
  }

  // Clear any pending reconnects
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  
  console.log('[Firebase Admin Sync] Setting up real-time listeners for instant container synchronization...');
  
  // Clean up any old dangling subscriptions just in case
  cleanupFirestoreListeners();

  let hasFailed = false;

  const handleListenerError = (err: any, context: string) => {
    const errMsg = err.message || String(err);
    console.warn(`[Firebase Admin Sync] Listener error received for ${context}:`, errMsg);

    // Check if we should fall back completely (e.g. permission denied)
    const isFatal = errMsg.includes('PERMISSION_DENIED') || 
                    errMsg.includes('insufficient permissions') || 
                    errMsg.toLowerCase().includes('over-quota');

    if (isFatal) {
      handleAdminDbError(err, context);
      cleanupFirestoreListeners();
    } else {
      // Non-fatal error (e.g., Code 13 / INTERNAL / RST_STREAM / UNAVAILABLE / stream reset)
      // Trigger a graceful reconnection attempt if we haven't already
      if (!hasFailed) {
        hasFailed = true;
        console.warn(`[Firebase Admin Sync] Non-fatal stream error (${context}). Scheduling reconnection in 5 seconds...`);
        cleanupFirestoreListeners();
        
        if (!reconnectTimeout) {
          reconnectTimeout = setTimeout(() => {
            reconnectTimeout = null;
            setupFirestoreListeners();
          }, 5000);
        }
      }
    }
  };

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
      handleListenerError(err, 'listen medications');
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
      handleListenerError(err, 'listen audits');
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
      handleListenerError(err, 'listen entry mistakes config');
    });
    activeUnsubscribes.push(unsubMistakesConfig);

    // 4. Listen to application storage
    const unsubAppStorage = adminDb.collection('application_storage').onSnapshot((snapshot: any) => {
      try {
        const items: any[] = [];
        snapshot.forEach((doc: any) => {
          items.push(parseFirestoreDoc(doc));
        });
        items.sort((a, b) => {
          const sa = a.savedAt || '';
          const sb = b.savedAt || '';
          return sa > sb ? -1 : (sa < sb ? 1 : 0);
        });
        fs.writeFileSync(APPLICATION_STORAGE_FILE, JSON.stringify(items, null, 2));
        console.log(`[Firebase Admin Sync] Real-time Application Storage Sync: Updated ${items.length} items.`);
        notifyClients('application-storage', items);
      } catch (err: any) {
        console.error('[Firebase Admin Sync] Error processing application storage snapshot:', err.message);
      }
    }, (err: any) => {
      handleListenerError(err, 'listen application storage');
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
      handleListenerError(err, 'listen system metadata');
    });
    activeUnsubscribes.push(unsubSystemMeta);

    // 6. Listen to duty rosters
    const unsubRosters = adminDb.collection('rosters').onSnapshot((snapshot: any) => {
      try {
        const rosters: any[] = [];
        snapshot.forEach((doc: any) => {
          rosters.push(parseFirestoreDoc(doc));
        });
        rosters.sort((a, b) => {
          const sa = a.uploadedAt || '';
          const sb = b.uploadedAt || '';
          return sa > sb ? -1 : (sa < sb ? 1 : 0);
        });
        fs.writeFileSync(ROSTERS_FILE, JSON.stringify(rosters, null, 2));
        console.log(`[Firebase Admin Sync] Real-time Rosters Sync: Updated ${rosters.length} items.`);
        notifyClients('rosters', rosters);
      } catch (err: any) {
        console.error('[Firebase Admin Sync] Error processing rosters snapshot:', err.message);
      }
    }, (err: any) => {
      handleListenerError(err, 'listen rosters');
    });
    activeUnsubscribes.push(unsubRosters);

    // 7. Listen to workload records chunks (only log update notifications, no local OOM sync)
    const unsubWorkloadRecords = adminDb.collection('workload_records').onSnapshot((snapshot: any) => {
      try {
        console.log('[Firebase Admin Sync] Real-time Workload Records Sync: Notification received.');
        notifyClients('workload-records', { updated: true });
      } catch (err: any) {
        console.error('[Firebase Admin Sync] Error processing workload records chunks snapshot:', err.message);
      }
    }, (err: any) => {
      handleListenerError(err, 'listen workload records chunks');
    });
    activeUnsubscribes.push(unsubWorkloadRecords);

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

      // Filter out averageCost and totalValue from incoming item to ensure they are not changed
      const { averageCost: _incomingAvgCost, totalValue: _incomingTotalVal, ...mFiltered } = m;

      // Check translation cache on the server
      const itemText = (mFiltered.enIndications && mFiltered.enIndications.trim() !== '') ? mFiltered.enIndications.trim() : mFiltered.arIndications?.trim() || '';
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
        hiIndications: mFiltered.hiIndications || existing?.hiIndications || getCachedField('hiIndications', 'hi') || '',
        urIndications: mFiltered.urIndications || existing?.urIndications || getCachedField('urIndications', 'ur') || '',
        mlIndications: mFiltered.mlIndications || existing?.mlIndications || getCachedField('mlIndications', 'ml') || '',
        bnIndications: mFiltered.bnIndications || existing?.bnIndications || getCachedField('bnIndications', 'bn') || '',
        tlIndications: mFiltered.tlIndications || existing?.tlIndications || getCachedField('tlIndications', 'tl') || ''
      };

      if (existingIndex !== -1) {
        // Explicitly preserve existing averageCost and totalValue
        const preservedCost = meds[existingIndex].averageCost;
        const preservedValue = meds[existingIndex].totalValue;

        meds[existingIndex] = { 
          ...meds[existingIndex], 
          ...mFiltered, 
          ...transFields,
          imageUrl: options?.photoStrategy === 'remove' ? null : (imageUrl || meds[existingIndex].imageUrl),
          lastUpdatedAt: new Date().toISOString() 
        };

        if (preservedCost !== undefined) {
          meds[existingIndex].averageCost = preservedCost;
        } else {
          delete meds[existingIndex].averageCost;
        }

        if (preservedValue !== undefined) {
          meds[existingIndex].totalValue = preservedValue;
        } else {
          delete meds[existingIndex].totalValue;
        }

        return meds[existingIndex];
      } else {
        const nm = {
          ...mFiltered,
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

app.post('/api/medications/oracle-qoh', async (req, res) => {
  try {
    const { locationId, items } = req.body;
    if (!locationId || !Array.isArray(items)) {
      return res.status(400).json({ error: 'locationId and items array are required' });
    }

    const meds = JSON.parse(fs.readFileSync(MEDS_FILE, 'utf8'));
    const updatedMeds: any[] = [];
    const createdMeds: any[] = [];

    for (const item of items) {
      const existingIndex = meds.findIndex((em: any) => em.locationId === locationId && em.itemCode === item.itemCode);
      if (existingIndex !== -1) {
        const existing = meds[existingIndex];
        const hasDiff = 
          existing.qoh !== item.qoh ||
          existing.averageCost !== item.averageCost ||
          existing.totalValue !== item.totalValue;

        if (hasDiff) {
          meds[existingIndex] = {
            ...existing,
            qoh: item.qoh,
            averageCost: item.averageCost,
            totalValue: item.totalValue,
            lastUpdatedAt: new Date().toISOString(),
            updatedBy: 'Oracle QOH Upload'
          };
          updatedMeds.push(meds[existingIndex]);
        }
      }
    }

    fs.writeFileSync(MEDS_FILE, JSON.stringify(meds, null, 2));

    if (adminDb) {
      const allToSync = [...updatedMeds, ...createdMeds];
      await saveMedicationsBulkToFirestore(allToSync).catch(err => console.error('[Oracle QOH] Firestore save error:', err));
    }

    await updateSystemMetadataInFirestore().catch(err => console.error('[Oracle QOH] Metadata update error:', err));

    notifyClients('medications', meds);

    res.json({
      success: true,
      updatedCount: updatedMeds.length,
      createdCount: createdMeds.length,
      totalCount: items.length
    });
  } catch (err: any) {
    console.error('[Oracle QOH] Server error:', err);
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
    
    let payload: any = {
      lastDataUpdate: new Date().toISOString(),
      isMesaieedHidden: false,
      firebaseActive: adminDb !== null,
      realtimeListening: isRealtimeListeningActive
    };

    if (fs.existsSync(METADATA_SYNC_FILE)) {
      const data = JSON.parse(fs.readFileSync(METADATA_SYNC_FILE, 'utf8'));
      payload = {
        ...payload,
        ...data,
        firebaseActive: adminDb !== null,
        realtimeListening: isRealtimeListeningActive
      };
    }
    res.json(payload);
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

// Memory store to buffer incoming chunked uploads
const pendingUploads = new Map<string, any[]>();

// POST to initiate a chunked upload session
app.post('/api/workload-records/upload/start', (req, res) => {
  try {
    const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    pendingUploads.set(uploadId, []);
    console.log(`[Chunked Upload] Initialized upload session ${uploadId}`);
    res.json({ uploadId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST to receive a chunk of workload records
app.post('/api/workload-records/upload/chunk', (req, res) => {
  try {
    const { uploadId, items } = req.body;
    if (!uploadId || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Missing uploadId or items array.' });
    }
    const list = pendingUploads.get(uploadId);
    if (!list) {
      return res.status(404).json({ error: 'Upload session not found or expired.' });
    }
    list.push(...items);
    console.log(`[Chunked Upload] Session ${uploadId}: Received chunk of ${items.length} records. Total buffered: ${list.length}`);
    res.json({ success: true, count: items.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST to finalize the chunked upload, merge records, and persist
app.post('/api/workload-records/upload/end', async (req, res) => {
  try {
    const { uploadId, filenames } = req.body;
    if (!uploadId) {
      return res.status(400).json({ error: 'Missing uploadId.' });
    }
    const itemsToSave = pendingUploads.get(uploadId);
    if (!itemsToSave) {
      return res.status(404).json({ error: 'Upload session not found or expired.' });
    }
    
    pendingUploads.delete(uploadId);
    console.log(`[Chunked Upload] Finalizing session ${uploadId} with ${itemsToSave.length} total buffered records.`);

    // Read existing keys to prevent duplicates
    const existingKeys = new Set<string>();
    if (fs.existsSync(WORKLOAD_RECORDS_FILE)) {
      const fileStream = fs.createReadStream(WORKLOAD_RECORDS_FILE);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });
      for await (const line of rl) {
        if (!line.trim()) continue;
        try {
          const x = JSON.parse(line);
          if (x.id) existingKeys.add(x.id);
          if (x.mrnOrganization && x.actionDateTime && x.itemNumber && x.pharmacyLocation) {
            existingKeys.add(`${x.mrnOrganization}|||${x.actionDateTime}|||${x.itemNumber}|||${x.pharmacyLocation}`);
          }
        } catch {}
      }
    }
    
    let addedCount = 0;
    const appendStream = fs.createWriteStream(WORKLOAD_RECORDS_FILE, { flags: 'a' });
    
    for (const item of itemsToSave) {
      const id = item.id || `workload-rec-${Math.random().toString(36).substring(2, 15)}-${Date.now()}`;
      const compositeKey = `${item.mrnOrganization || ''}|||${item.actionDateTime || ''}|||${item.itemNumber || ''}|||${item.pharmacyLocation || ''}`;
      
      const isDup = existingKeys.has(id) || existingKeys.has(compositeKey);
      
      if (!isDup) {
        const cleanedItem = {
          ...item,
          id,
          savedAt: item.savedAt || new Date().toISOString()
        };
        appendStream.write(JSON.stringify(cleanedItem) + '\n');
        existingKeys.add(id);
        existingKeys.add(compositeKey);
        addedCount++;
      }
    }
    
    await new Promise<void>((resolve) => {
      appendStream.on('finish', () => resolve());
      appendStream.end();
    });

    if (Array.isArray(filenames) && filenames.length > 0) {
      logUploadedFiles(filenames, itemsToSave.length, addedCount);
    }
    
    if (addedCount > 0) {
      await generateWorkloadSummary().catch(err => console.error(err));
      if (adminDb) {
        saveWorkloadRecordsBulkToFirestoreNdjson().catch(err => {
          console.error('[Background Firebase Sync Error] Failed to save workload records:', err.message);
        });
      }
      updateSystemMetadataInFirestore().catch(err => {
        console.error('[Background Firebase Sync Error] Failed to update system metadata:', err.message);
      });
    }
    
    notifyClients('workload-records', { updated: true });
    res.json({ success: true, added: addedCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET all stored workload records
app.get('/api/workload-records', async (req, res) => {
  try {
    if (adminDb && !isRealtimeListeningActive) {
      await syncWorkloadRecordsFromFirestore().catch(err => console.error(err));
    }
    
    let uploadedFilesList: any[] = [];
    if (fs.existsSync(UPLOADED_FILES_FILE)) {
      try {
        uploadedFilesList = JSON.parse(fs.readFileSync(UPLOADED_FILES_FILE, 'utf8'));
      } catch (e) {}
    }
    const totalUploadedFiles = uploadedFilesList.length;

    const { location, mismatchOnly, search, startDate, endDate, trendLocation } = req.query;
    
    const hasFilters = location || mismatchOnly === 'true' || search || startDate || endDate || (trendLocation && trendLocation !== 'all');
    
    // If there are no filters at all, we serve the pre-calculated summary from workload_summary.json
    // along with the first 100 records as a fast preview!
    if (!hasFilters) {
      const summaryFile = path.join(DATA_DIR, 'workload_summary.json');
      let summary: any = null;
      if (fs.existsSync(summaryFile)) {
        try {
          summary = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
          // Self-healing: if summary reports 0 records but the records file is non-empty, force regeneration!
          if (summary && summary.total === 0 && fs.existsSync(WORKLOAD_RECORDS_FILE)) {
            const stats = fs.statSync(WORKLOAD_RECORDS_FILE);
            if (stats.size > 10) {
              summary = null;
            }
          }
        } catch {}
      }
      
      if (!summary) {
        summary = await generateWorkloadSummary();
      }
      
      const records: any[] = [];
      if (fs.existsSync(WORKLOAD_RECORDS_FILE)) {
        const fileStream = fs.createReadStream(WORKLOAD_RECORDS_FILE);
        const rl = readline.createInterface({
          input: fileStream,
          crlfDelay: Infinity
        });
        let count = 0;
        for await (const line of rl) {
          if (!line.trim()) continue;
          try {
            records.push(JSON.parse(line));
            count++;
            if (count >= 100) break;
          } catch {}
        }
      }
      
      return res.json({
        records,
        summary: {
          total: summary.total,
          mismatches: summary.mismatches,
          rate: summary.rate,
          uniqueMrns: summary.uniqueMrnsCount,
          activeStaff: summary.activeStaffCount,
          lastActionStr: summary.lastActionStr,
          totalUploadedFiles
        },
        uploadedFilesList,
        topMedications: summary.topMedications,
        topStaff: summary.topStaff,
        locationBreakdown: summary.locationBreakdown,
        workloadTrend: summary.workloadTrend
      });
    }
    
    // If there are filters, we do a streaming filter pass over the NDJSON file
    const filteredRecords: any[] = [];
    const mrnsSet = new Set<string>();
    const staffSet = new Set<string>();
    const medCounts: Record<string, { desc: string, count: number }> = {};
    const staffCounts: Record<string, number> = {};
    const days: Record<string, number> = {};
    let maxDate = new Date(0);
    let lastActionStr = 'No Data';
    let totalMismatches = 0;
    
    if (fs.existsSync(WORKLOAD_RECORDS_FILE)) {
      const fileStream = fs.createReadStream(WORKLOAD_RECORDS_FILE);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });
      
      const searchStr = typeof search === 'string' ? search.toLowerCase().trim() : '';
      const searchTokens = searchStr ? searchStr.split(/\s+/) : [];
      const filterLocation = typeof location === 'string' ? location.toLowerCase() : '';
      const filterTrendLocation = typeof trendLocation === 'string' ? trendLocation.toLowerCase() : '';
      const filterMismatchOnly = mismatchOnly === 'true';
      const startDateTime = startDate ? new Date(startDate + 'T00:00:00') : null;
      const endDateTime = endDate ? new Date(endDate + 'T23:59:59') : null;
      
      for await (const line of rl) {
        if (!line.trim()) continue;
        try {
          const rec = JSON.parse(line);
          
          if (filterLocation && filterLocation !== 'all') {
            const key = getPharmacyLocationKey(rec.pharmacyLocation);
            const matched = (filterLocation === 'adult' && key === 'adult-emergency') ||
                            (filterLocation === 'pediatric' && key === 'pediatric') ||
                            (filterLocation === 'mesaieed' && key === 'mesaieed-opd');
            if (!matched) continue;
          }
          
          if (filterMismatchOnly && !rec.isMismatch) continue;
          
          if (searchTokens.length > 0) {
            const matchAll = searchTokens.every(token => 
              (rec.personNameFull || '').toLowerCase().includes(token) ||
              (rec.mrnOrganization || '').toLowerCase().includes(token) ||
              (rec.itemNumber || '').toLowerCase().includes(token) ||
              (rec.labelDescription || '').toLowerCase().includes(token) ||
              (rec.actionPersonnelPharmacy || '').toLowerCase().includes(token) ||
              (rec.actionType || '').toLowerCase().includes(token)
            );
            if (!matchAll) continue;
          }
          
          let recDateObj: Date | null = null;
          if (startDateTime || endDateTime) {
            recDateObj = parseRecordDateServer(rec.actionDateTime);
            if (recDateObj.getTime() === 0) continue;
            
            if (startDateTime && recDateObj < startDateTime) continue;
            if (endDateTime && recDateObj > endDateTime) continue;
          }
          
          if (rec.isMismatch) totalMismatches++;
          if (rec.mrnOrganization) mrnsSet.add(rec.mrnOrganization);
          if (rec.actionPersonnelPharmacy) staffSet.add(rec.actionPersonnelPharmacy);
          
          const num = rec.itemNumber;
          if (num) {
            if (!medCounts[num]) {
              medCounts[num] = { desc: rec.labelDescription || 'Unknown', count: 0 };
            }
            medCounts[num].count++;
          }
          
          const name = rec.actionPersonnelPharmacy;
          if (name) {
            staffCounts[name] = (staffCounts[name] || 0) + 1;
          }
          
          const dateStr = rec.actionDateTime;
          if (dateStr) {
            let formattedDay = '';
            if (dateStr.includes('T')) {
              formattedDay = dateStr.substring(0, 10);
            } else {
              const parts = dateStr.split(' ');
              if (parts[0] && parts[0].includes('-')) {
                const dateParts = parts[0].split('-');
                if (dateParts.length === 3 && dateParts[2].length === 4) {
                  formattedDay = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
                }
              }
            }
            if (formattedDay) {
              let matchesTrend = true;
              if (filterTrendLocation && filterTrendLocation !== 'all') {
                const key = getPharmacyLocationKey(rec.pharmacyLocation);
                const matched = (filterTrendLocation === 'adult' && key === 'adult-emergency') ||
                                (filterTrendLocation === 'pediatric' && key === 'pediatric') ||
                                (filterTrendLocation === 'mesaieed' && key === 'mesaieed-opd');
                if (!matched) {
                  matchesTrend = false;
                }
              }
              if (matchesTrend) {
                days[formattedDay] = (days[formattedDay] || 0) + 1;
              }
            }
            
            try {
              const d = recDateObj || parseRecordDateServer(dateStr);
              if (d > maxDate) {
                maxDate = d;
                lastActionStr = dateStr;
              }
            } catch {}
          }
          
          // Return up to 5,000 matches safely over HTTP
          if (filteredRecords.length < 5000) {
            filteredRecords.push(rec);
          }
        } catch {}
      }
    }
    
    const topMedications = Object.entries(medCounts)
      .map(([num, val]) => ({ itemNumber: num, desc: val.desc, count: val.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
      
    const topStaff = Object.entries(staffCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
      
    const workloadTrend = Object.entries(days)
      .map(([day, val]) => ({ day, count: val }))
      .sort((a, b) => a.day.localeCompare(b.day))
      .slice(-10);
      
    const locationBreakdown = {
      'adult-emergency': { total: 0, mismatches: 0 },
      'pediatric': { total: 0, mismatches: 0 },
      'mesaieed-opd': { total: 0, mismatches: 0 }
    };
    for (const rec of filteredRecords) {
      const key = getPharmacyLocationKey(rec.pharmacyLocation);
      
      if (key) {
        locationBreakdown[key as keyof typeof locationBreakdown].total++;
        if (rec.isMismatch) {
          locationBreakdown[key as keyof typeof locationBreakdown].mismatches++;
        }
      }
    }
    
    const total = filteredRecords.length;
    const rate = total > 0 ? ((totalMismatches / total) * 100).toFixed(1) : '0.0';
    
    res.json({
      records: filteredRecords,
      summary: {
        total,
        mismatches: totalMismatches,
        rate,
        uniqueMrns: mrnsSet.size,
        activeStaff: staffSet.size,
        lastActionStr,
        totalUploadedFiles
      },
      uploadedFilesList,
      topMedications,
      topStaff,
      locationBreakdown,
      workloadTrend
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST to bulk save workload records (append-only style with duplicate checks)
app.post('/api/workload-records', async (req, res) => {
  try {
    const body = req.body;
    let itemsToSave: any[] = [];
    let filenames: string[] = [];
    
    if (Array.isArray(body)) {
      itemsToSave = body;
    } else if (body && Array.isArray(body.records)) {
      itemsToSave = body.records;
      filenames = body.filenames || [];
    } else if (body) {
      itemsToSave = [body];
    }
    
    const existingKeys = new Set<string>();
    if (fs.existsSync(WORKLOAD_RECORDS_FILE)) {
      const fileStream = fs.createReadStream(WORKLOAD_RECORDS_FILE);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });
      for await (const line of rl) {
        if (!line.trim()) continue;
        try {
          const x = JSON.parse(line);
          if (x.id) existingKeys.add(x.id);
          if (x.mrnOrganization && x.actionDateTime && x.itemNumber && x.pharmacyLocation) {
            existingKeys.add(`${x.mrnOrganization}|||${x.actionDateTime}|||${x.itemNumber}|||${x.pharmacyLocation}`);
          }
        } catch {}
      }
    }
    
    let addedCount = 0;
    const appendStream = fs.createWriteStream(WORKLOAD_RECORDS_FILE, { flags: 'a' });
    
    for (const item of itemsToSave) {
      const id = item.id || `workload-rec-${Math.random().toString(36).substring(2, 15)}-${Date.now()}`;
      const compositeKey = `${item.mrnOrganization || ''}|||${item.actionDateTime || ''}|||${item.itemNumber || ''}|||${item.pharmacyLocation || ''}`;
      
      const isDup = existingKeys.has(id) || existingKeys.has(compositeKey);
      
      if (!isDup) {
        const cleanedItem = {
          ...item,
          id,
          savedAt: item.savedAt || new Date().toISOString()
        };
        appendStream.write(JSON.stringify(cleanedItem) + '\n');
        existingKeys.add(id);
        existingKeys.add(compositeKey);
        addedCount++;
      }
    }
    
    await new Promise<void>((resolve) => {
      appendStream.on('finish', () => resolve());
      appendStream.end();
    });

    if (filenames.length > 0) {
      logUploadedFiles(filenames, itemsToSave.length, addedCount);
    }
    
    if (addedCount > 0) {
      await generateWorkloadSummary().catch(err => console.error(err));
      if (adminDb) {
        saveWorkloadRecordsBulkToFirestoreNdjson().catch(err => {
          console.error('[Background Firebase Sync Error] Failed to save workload records:', err.message);
        });
      }
    }
    
    notifyClients('workload-records', { updated: true });
    res.json({ success: true, added: addedCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST to reset/clear all stored workload records
app.post('/api/workload-records/reset', async (req, res) => {
  try {
    const { adminPassword } = req.body;
    const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    if (adminPassword !== settings.adminPassword) {
      return res.status(401).json({ error: 'Incorrect administrator password. Action unauthorized.' });
    }
    
    fs.writeFileSync(WORKLOAD_RECORDS_FILE, '');
    fs.writeFileSync(UPLOADED_FILES_FILE, '[]');
    
    const summaryFile = path.join(DATA_DIR, 'workload_summary.json');
    if (fs.existsSync(summaryFile)) {
      try {
        fs.unlinkSync(summaryFile);
      } catch {}
    }
    
    if (adminDb) {
      await resetWorkloadRecordsInFirestore().catch(err => console.error(err));
      await adminDb.collection('system').doc('uploaded_files').set({ files: [] }).catch((err: any) => {
        console.error('[Firebase Reset Error] Failed to reset uploaded files in Firestore:', err.message);
      });
    }
    
    await updateSystemMetadataInFirestore().catch(err => console.error(err));
    notifyClients('workload-records', { updated: true });
    res.json({ success: true, message: 'All workload records and uploaded logs purged successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST to generate AI analytical reporting insights
app.post('/api/workload-records/ai-analysis', async (req, res) => {
  try {
    const { total, mismatches, rate, location, startDate, endDate, topMedications, topStaff, mismatchSamples } = req.body;
    
    const client = getGeminiClient();
    
    const contextStr = `
Pharmacy Location Filter: ${location || 'All'}
Date Range: ${startDate || 'None'} to ${endDate || 'None'}
Total Audited Workloads: ${total || 0}
Total Discrepancies/Mismatches: ${mismatches || 0}
Error / Mismatch Rate: ${rate || '0.0'}%

Top Dispensed Medications:
${(topMedications || []).map((m: any, idx: number) => `${idx + 1}. ${m.desc} (Code: ${m.itemNumber}) - ${m.count} actions`).join('\n')}

Top Active Staff Personnel:
${(topStaff || []).map((s: any, idx: number) => `${idx + 1}. ${s.name} - ${s.count} actions`).join('\n')}

Sample Discrepancy Incidents:
${(mismatchSamples || []).map((m: any, idx: number) => `- Event: ${m.actionDateTime || 'Unknown Date'} | Location: ${m.pharmacyLocation || 'Unknown'} | Dispensed Item: ${m.labelDescription} (${m.itemNumber}) by ${m.actionPersonnelPharmacy || 'Unknown'} | Discrepancy details: ${(m.reasons || []).join(', ')}`).join('\n')}
`;

    const systemPrompt = `You are an expert Clinical Pharmacy Auditor and Healthcare Quality Assurance consultant.
Your role is to analyze a summarized audit of pharmacy dispensing workloads from Al Wakra & Mesaieed Pharmacy (HBKMC) and generate deep, actionable reporting insights.

Generate a comprehensive clinical workload audit report with the following structure:
1. **Executive Summary**: A concise summary of the workload quality, focusing on the mismatch rate, volume, and location comparison.
2. **Systemic Vulnerabilities & Root Causes**: Based on the mismatch sample logs and top medications, identify the main error patterns (e.g., Brand vs Generic dispensing for non-Qataris, roster compliance, or unregistered items).
3. **Personnel & Location Risk Index**: Highlight if any specific locations or staffing patterns present elevated risk.
4. **Actionable Recommendations**: Clear, professional, and practical steps to reduce dispensing mistakes at HBKMC. These should be numbered or bulleted and align with Joint Commission International (JCI) and pharmacy safety standards.

Use elegant Markdown, deep medical domain expertise, and clear formatting. Keep the tone clinical, professional, and constructive. DO NOT use unverified or overly dramatic branding terms.`;

    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        { text: contextStr }
      ],
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.3,
      }
    });
    
    res.json({ analysis: response.text });
  } catch (err: any) {
    console.error('[Gemini AI Analysis Error]:', err);
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
      try {
        const fileContent = fs.readFileSync(APPLICATION_STORAGE_FILE, 'utf8');
        if (fileContent.trim()) {
          const parsed = JSON.parse(fileContent);
          if (Array.isArray(parsed)) {
            items = parsed;
          }
        }
      } catch (e: any) {
        console.warn('[Storage] Failed to parse APPLICATION_STORAGE_FILE:', e.message);
      }
    }
    
    // Build a Set of existing composite keys for fast O(1) lookup
    const existingKeys = new Set<string>();
    for (const x of items) {
      if (x && x.id) {
        existingKeys.add(x.id);
      }
      if (x && x.mrnOrganization && x.actionDateTime && x.itemNumber) {
        existingKeys.add(`${x.mrnOrganization}|||${x.actionDateTime}|||${x.itemNumber}`);
      }
    }
    
    let addedCount = 0;
    const newlyAddedItems: any[] = [];
    for (const item of itemsToSave) {
      if (!item) continue;
      const compositeKey = `${item.mrnOrganization || ''}|||${item.actionDateTime || ''}|||${item.itemNumber || ''}`;
      
      const isDup = (item.id && existingKeys.has(item.id)) || existingKeys.has(compositeKey);
      
      if (!isDup) {
        const itemWithTime = {
          ...item,
          savedAt: new Date().toISOString()
        };
        items.push(itemWithTime);
        newlyAddedItems.push(itemWithTime);
        if (item.id) {
          existingKeys.add(item.id);
        }
        existingKeys.add(compositeKey);
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

    console.log(`Translating ${uniqueItems.length} newly added unique items with Gemini API (optimized speed)...`);
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.MINIMAL
        }
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

// PDF Table OCR and Excel Merger API Route
app.post('/api/pdf-ocr/parse', async (req, res) => {
  try {
    const { base64, filename, mimeType } = req.body;
    if (!base64) {
      return res.status(400).json({ error: "Missing base64 PDF data." });
    }

    const ai = getGeminiClient();
    
    const filePart = {
      inlineData: {
        mimeType: mimeType || "application/pdf",
        data: base64
      }
    };

    const prompt = `You are a high-precision pharmaceutical inventory OCR system. 
Your job is to read this entire PDF document, find any and all tables containing medication or drug inventories, packing lists, invoices, or stock reports, and extract every single row and column exactly.

We need you to extract the tabular data as a clean, standardized JSON array of objects.

Make a best effort to identify and map common medication table headers into these standardized column keys:
- "itemCode" (representing product code, item code, barcode, or ID)
- "itemName" (representing name, description, drug name, or product name)
- "qoh" (representing quantity, quantity on hand, physical count, or stock)
- "expiryDate" (representing expiry, expiration date, exp)
- "batchNo" (representing batch, lot, batch number, or lot number)
- "price" (representing cost, price, rate, or unit price)

If a column doesn't match any of these standard headers, keep its original name exactly (as a custom header).

Return a JSON object structured exactly like this:
{
  "headers": ["itemCode", "itemName", "qoh", "expiryDate", "batchNo", "price"],
  "rows": [
    {
      "itemCode": "Value",
      "itemName": "Value",
      "qoh": 100, // as a clean number if possible, or string
      "expiryDate": "Value",
      "batchNo": "Value",
      "price": 10.5 // as a clean number if possible, or string
    }
  ]
}

If other custom columns are found, you may append them to the "headers" list and include them in the "rows" objects.

CRITICAL RULES:
1. Extract ALL rows in the tables. Do not omit, truncate, or summarize anything.
2. Be extremely precise. Double-check all numbers and spelling.
3. If some rows don't have certain values, map them as null or empty string.
4. Output MUST be valid, parseable JSON conforming to the structure above. No markdown wrap.`;

    console.log(`[PDF OCR] Processing file "${filename}" with Gemini 3.5 Flash (optimized speed)...`);
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [filePart, prompt],
      config: {
        responseMimeType: "application/json",
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.MINIMAL
        }
      }
    });

    let responseText = response.text || '{}';
    if (responseText.includes('```')) {
      responseText = responseText.replace(/```json\n?|```/g, '').trim();
    }

    try {
      const result = JSON.parse(responseText);
      res.json(result);
    } catch (parseError) {
      console.error("[PDF OCR Parsing Failed] Raw Response was:", responseText);
      throw new Error("Gemini returned invalid JSON: " + responseText.substring(0, 200));
    }
  } catch (error: any) {
    console.error("[PDF OCR Error]", error);
    res.status(500).json({ error: error.message || "Failed to process PDF table OCR" });
  }
});

// GET all stored duty rosters
app.get('/api/rosters', async (req, res) => {
  try {
    if (adminDb && !isRealtimeListeningActive) {
      await syncRostersFromFirestore().catch(err => console.error(err));
    }
    if (fs.existsSync(ROSTERS_FILE)) {
      const data = fs.readFileSync(ROSTERS_FILE, 'utf8');
      res.json(JSON.parse(data));
    } else {
      res.json([]);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST to save a duty roster
app.post('/api/rosters', async (req, res) => {
  try {
    const roster = req.body;
    if (!roster || !roster.id) {
      return res.status(400).json({ error: "Invalid roster data" });
    }

    if (roster.entries && Array.isArray(roster.entries)) {
      roster.entries.sort((a: any, b: any) => (a.date || '').localeCompare(b.date || ''));
    }

    let rosters = [];
    if (fs.existsSync(ROSTERS_FILE)) {
      try {
        rosters = JSON.parse(fs.readFileSync(ROSTERS_FILE, 'utf8'));
      } catch {
        rosters = [];
      }
    }

    // Overwrite if same ID or add new
    rosters = rosters.filter((r: any) => r.id !== roster.id);
    roster.uploadedAt = roster.uploadedAt || new Date().toISOString();
    rosters.unshift(roster);

    fs.writeFileSync(ROSTERS_FILE, JSON.stringify(rosters, null, 2));

    if (adminDb) {
      await saveRosterToFirestore(roster).catch(err => console.error(err));
    }
    await updateSystemMetadataInFirestore().catch(err => console.error(err));
    notifyClients('rosters', rosters);

    res.json({ success: true, count: rosters.length, roster });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST to parse a Monthly Pharmacist Duty Roster PDF using Gemini OCR
app.post('/api/rosters/parse', async (req, res) => {
  try {
    const { base64, filename, mimeType } = req.body;
    if (!base64) {
      return res.status(400).json({ error: "Missing base64 PDF data." });
    }

    const ai = getGeminiClient();

    const filePart = {
      inlineData: {
        mimeType: mimeType || "application/pdf",
        data: base64
      }
    };

    const prompt = `You are a professional, high-precision medical scheduling and pharmacist duty roster parsing system.
Your job is to read this Monthly Pharmacists Duty Roster PDF, extract all shifts and assignments for EVERY SINGLE pharmacist listed across ALL pages of the document, and output a clean, standardized, compact JSON format.

CRITICAL INSTRUCTIONS:
1. There are usually around 35 to 50 unique pharmacists listed in the duty roster document (e.g., 42 pharmacists) across multiple pages.
2. Scan EVERY SINGLE page of the PDF sequentially from page 1 to the end. Every page contains rows of different pharmacists. Do NOT stop after the first page or the first few rows! Keep scanning and compiling all rows until you have extracted EVERY single pharmacist listed in the roster.
3. We need ALL 42+ pharmacists. Under no circumstances should you truncate, summarize, or skip names. Every name and their corresponding roster of daily shifts is extremely important.
4. Do NOT stop after the first page or first 3 rows. If there are 42 pharmacists in the PDF, your returned JSON "pharmacists" array MUST contain all 42 elements. Under-extraction is a critical failure.
5. Represent the daily shifts for each pharmacist as a compact SPACE-SEPARATED string of shift abbreviation codes for days 1 to 30 or 31 (e.g., "O O Aa Ba Ca L SL O"). This saves massive output token space, prevents the AI from getting lazy or cutting off early, and ensures we can load all 42+ pharmacists successfully.

SHIFT ABBREVIATION CODES REFERENCE:
- Aa  --> Morning Shift Adult Pharmacy
- Ap  --> Morning Shift Pediatric Pharmacy
- Ba  --> Evening Shift Adult Pharmacy
- Bp  --> Evening Shift Pediatric Pharmacy (1-9 PM)
- Ca  --> Night Shift Adult Pharmacy
- Cp  --> Night Shift Pediatric Pharmacy
- Ao  --> Morning Shift AWH OPD Pharmacy
- Amo --> Morning Shift Mesaieed OPD Pharmacy
- Ai  --> Morning Shift Inpatient Pharmacy
- Av  --> Morning Shift IV Pharmacy
- Ar  --> Morning Extemporaneous Preparations
- An  --> Morning Narcotic Pharmacy
- Bi  --> Evening Shift Inpatient Pharmacy
- Ci  --> Night Shift Inpatient Pharmacy
- L   --> Annual Leave
- A*  --> Casual Leave
- SL  --> Sick Leave
- O   --> OFF Day / No Shift

If there are days with no shifts or when a pharmacist is OFF, use "O" as the shift code.`;

    console.log(`[Duty Roster OCR] Parsing PDF "${filename}" with Gemini 3.5 Flash...`);
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [filePart, prompt],
      config: {
        systemInstruction: "You are a professional, high-precision medical scheduling and pharmacist duty roster parsing system. Your absolute highest priority is complete coverage: you must extract and output EVERY SINGLE pharmacist listed in the duty roster document across all pages. Never truncate or stop early. There are normally 35 to 50 unique pharmacists listed. Scan EVERY SINGLE PAGE of the PDF. If you output fewer than 35 pharmacists, you have failed the task.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            month: {
              type: Type.STRING,
              description: "The month and year of the roster (e.g. 'July 2026'). If not specified, default to 'July 2026'."
            },
            pharmacists: {
              type: Type.ARRAY,
              description: "The complete list of all pharmacists found across ALL pages of the PDF. Do not skip any names or truncate this array. Must contain every single pharmacist listed on every page (usually 35 to 50 pharmacists).",
              items: {
                type: Type.OBJECT,
                properties: {
                  pharmacistName: {
                    type: Type.STRING,
                    description: "Full name of the pharmacist as written in the roster."
                  },
                  shifts: {
                    type: Type.STRING,
                    description: "A space-separated string of shift abbreviation codes for each day of the month (e.g. 'O O Aa Ba Ca L SL O O ...'). Must contain exactly 30 or 31 shift codes."
                  }
                },
                required: ["pharmacistName", "shifts"]
              }
            }
          },
          required: ["month", "pharmacists"]
        },
        temperature: 0.0,
        maxOutputTokens: 8192,
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.MINIMAL
        }
      }
    });

    let responseText = response.text || '{}';
    if (responseText.includes('```')) {
      responseText = responseText.replace(/```json\n?|```/g, '').trim();
    }

    try {
      const result = JSON.parse(responseText);
      
      // Expand compact layout into flat array for frontend backward compatibility
      const monthStr = result.month || "July 2026";
      let year = 2026;
      let monthIndex = 6; // July
      const monthNames = [
        "january", "february", "march", "april", "may", "june",
        "july", "august", "september", "october", "november", "december"
      ];
      
      const lowerMonthStr = monthStr.toLowerCase();
      for (let i = 0; i < 12; i++) {
        if (lowerMonthStr.includes(monthNames[i])) {
          monthIndex = i;
          break;
        }
      }
      const yearMatch = monthStr.match(/\d{4}/);
      if (yearMatch) {
        year = parseInt(yearMatch[0]);
      }
      
      const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
      
      const shiftDict: Record<string, string> = {
        "Aa": "Morning Shift Adult Pharmacy",
        "Ap": "Morning Shift Pediatric Pharmacy",
        "Ba": "Evening Shift Adult Pharmacy",
        "Bp": "Evening Shift Pediatric Pharmacy",
        "Ca": "Night Shift Adult Pharmacy",
        "Cp": "Night Shift Pediatric Pharmacy",
        "Ao": "Morning Shift AWH OPD Pharmacy",
        "Amo": "Morning Shift Mesaieed OPD Pharmacy",
        "Ai": "Morning Shift Inpatient Pharmacy",
        "Av": "Morning Shift IV Pharmacy",
        "Ar": "Morning Extemporaneous Preparations",
        "An": "Morning Narcotic Pharmacy",
        "Bi": "Evening Shift Inpatient Pharmacy",
        "Ci": "Night Shift Inpatient Pharmacy",
        "L": "Annual Leave",
        "A*": "Casual Leave",
        "SL": "Sick Leave",
        "O": "OFF Day",
        "OFF": "OFF Day"
      };

      const entries: any[] = [];
      const pharmacistsArray = result.pharmacists || [];
      
      for (const ph of pharmacistsArray) {
        const phName = ph.pharmacistName || "Unknown Pharmacist";
        const rawShifts = ph.shifts;
        let shifts: string[] = [];
        
        if (Array.isArray(rawShifts)) {
          shifts = rawShifts;
        } else if (typeof rawShifts === 'string') {
          // split by spaces, commas or any whitespace sequence
          shifts = rawShifts.split(/[\s,]+/).map((s: string) => s.trim()).filter(Boolean);
        }
        
        for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
          const shiftCode = shifts[dayNum - 1] || "O";
          
          let shiftName = shiftDict[shiftCode] || shiftCode || "OFF Day";
          if (shiftName === "" || shiftName === "O" || shiftName === "OFF") {
            shiftName = "OFF Day";
          }
          
          let location = "Al Wakra";
          if (shiftCode.toLowerCase().includes("mo")) {
            location = "Mesaieed";
          } else if (shiftName === "OFF Day" || shiftCode === "O" || shiftCode === "OFF") {
            location = "None";
          }
          
          const dd = String(dayNum).padStart(2, '0');
          const mm = String(monthIndex + 1).padStart(2, '0');
          const dateStr = `${year}-${mm}-${dd}`;
          
          const dateObj = new Date(year, monthIndex, dayNum);
          const dayNamesOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
          const dayName = dayNamesOfWeek[dateObj.getDay()];
          
          entries.push({
            date: dateStr,
            day: dayName,
            pharmacistName: phName,
            shift: shiftName,
            location: location,
            notes: ""
          });
        }
      }
      
      entries.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

      const suggestedFilters = {
        pharmacists: Array.from(new Set(entries.map(e => e.pharmacistName).filter(Boolean))),
        shifts: Array.from(new Set(entries.map(e => e.shift).filter(Boolean))),
        locations: Array.from(new Set(entries.map(e => e.location).filter(Boolean)))
      };
      
      const expandedResult = {
        month: monthStr,
        entries: entries,
        suggestedFilters: suggestedFilters
      };

      res.json(expandedResult);
    } catch (parseError) {
      console.error("[Duty Roster Parsing Failed] Raw Response was:", responseText);
      throw new Error("Gemini returned invalid duty roster JSON");
    }
  } catch (error: any) {
    console.error("[Duty Roster OCR Error]", error);
    res.status(500).json({ error: error.message || "Failed to process duty roster PDF OCR" });
  }
});

// POST to delete a duty roster (Requires Admin Password)
app.post('/api/rosters/delete', async (req, res) => {
  try {
    const { id, adminPassword } = req.body;
    const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    if (adminPassword !== settings.adminPassword) {
      return res.status(401).json({ error: 'Incorrect administrator password. Action unauthorized.' });
    }

    if (!fs.existsSync(ROSTERS_FILE)) {
      return res.status(400).json({ error: 'Rosters storage file does not exist.' });
    }

    let rosters = JSON.parse(fs.readFileSync(ROSTERS_FILE, 'utf8'));
    const itemToDelete = rosters.find((r: any) => r.id === id);

    if (itemToDelete) {
      rosters = rosters.filter((r: any) => r.id !== id);
      fs.writeFileSync(ROSTERS_FILE, JSON.stringify(rosters, null, 2));

      if (adminDb) {
        await deleteRosterFromFirestore(id).catch(err => console.error(err));
      }
      await updateSystemMetadataInFirestore().catch(err => console.error(err));
      notifyClients('rosters', rosters);
    }

    res.json({ success: true, count: rosters.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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

  // Run startup sync to fetch persistent Firestore state down into local cache asynchronously so it never blocks the server from listening
  syncAllFromFirestoreAtStartup()
    .then(async () => {
      // Setup real-time Firestore listeners after initial sync completes
      setupFirestoreListeners();
      // Automatically clean and deduplicate stored workload records on startup
      await deduplicateWorkloadRecords().catch(err => console.error('[Startup Deduplication Error]:', err.message));
    })
    .catch(async err => {
      console.error('[Firebase Startup Sync Init] Failed to run startup fetch:', err.message);
      // Ensure listeners are still set up even if startup fetch fails
      setupFirestoreListeners();
      // Automatically clean and deduplicate stored workload records on startup even on sync failure
      await deduplicateWorkloadRecords().catch(err => console.error('[Startup Deduplication Error]:', err.message));
    });

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
