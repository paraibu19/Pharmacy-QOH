import { 
  collection, doc, addDoc, updateDoc, deleteDoc, 
  serverTimestamp, writeBatch, query, where, getDocs, getDoc, setDoc 
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from './firebase';

class FirestoreWriteQueue {
  private promise: Promise<any> = Promise.resolve();

  async enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const nextPromise = this.promise.then(async () => {
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Firestore operation timed out')), 60000);
        });
        const result = await Promise.race([operation(), timeoutPromise]);
        await new Promise(resolve => setTimeout(resolve, 800));
        return result;
      } catch (err: any) {
        await new Promise(resolve => setTimeout(resolve, 800));
        throw err;
      }
    });
    this.promise = nextPromise.catch(() => {});
    return nextPromise;
  }
}

const firestoreWriteQueue = new FirestoreWriteQueue();

async function queuedAddDoc(colRef: any, data: any) {
  return firestoreWriteQueue.enqueue(() => addDoc(colRef, data));
}

async function queuedUpdateDoc(docRef: any, data: any) {
  return firestoreWriteQueue.enqueue(() => updateDoc(docRef, data));
}

async function queuedDeleteDoc(docRef: any) {
  return firestoreWriteQueue.enqueue(() => deleteDoc(docRef));
}

async function queuedSetDoc(docRef: any, data: any, options?: any) {
  return firestoreWriteQueue.enqueue(() => options ? setDoc(docRef, data, options) : setDoc(docRef, data));
}

async function queuedCommit(batch: any) {
  return firestoreWriteQueue.enqueue(() => batch.commit());
}

import { Medication, PharmacyLocation } from '../types';
import { sharedDb } from './sharedDb';
import { localDb } from './localStorageDb';

function cleanUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => cleanUndefined(item)) as any;
  }
  
  if (typeof obj !== 'object') {
    return obj;
  }
  
  const constructor = (obj as any).constructor;
  const isPlain = typeof constructor === 'function' 
    ? (constructor === Object || constructor.name === 'Object') 
    : (constructor === undefined);

  if (!isPlain) {
    return obj;
  }

  const cleaned: any = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const val = (obj as any)[key];
      if (val !== undefined) {
        cleaned[key] = cleanUndefined(val);
      }
    }
  }
  return cleaned as T;
}

function parseExpDate(dateStr: string) {
  if (!dateStr || dateStr === '-' || dateStr === '.') return null;
  try {
    const parts = dateStr.trim().split(/[-/.]/);
    if (parts.length === 3) {
      let d = parseInt(parts[0]);
      let m = parseInt(parts[1]);
      let y = parseInt(parts[2]);
      
      // If the first part is 4 digits, or the first part is > 31 (cannot be a day),
      // it is in YYYY-MM-DD format!
      if (parts[0].length === 4 || d > 31) {
        y = parseInt(parts[0]);
        m = parseInt(parts[1]);
        d = parseInt(parts[2]);
      }
      
      const fullYear = y < 100 ? 2000 + y : y;
      const date = new Date(fullYear, m - 1, d);
      if (!isNaN(date.getTime())) return date;
    } else if (parts.length === 2) {
      // Could be MM-YYYY or YYYY-MM
      let m = parseInt(parts[0]);
      let y = parseInt(parts[1]);
      if (parts[0].length === 4 || m > 12) {
        y = parseInt(parts[0]);
        m = parseInt(parts[1]);
      }
      const fullYear = y < 100 ? 2000 + y : y;
      const date = new Date(fullYear, m - 1, 1);
      if (!isNaN(date.getTime())) return date;
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d;
  } catch { }
  return null;
}

function rearrangeMedicationExpiries(med: any) {
  if (med.expiration1 === undefined && med.expiration2 === undefined && med.expiration3 === undefined) {
    return null;
  }

  const origExp1 = med.expiration1 || '';
  const origExp2 = med.expiration2 || '';
  const origExp3 = med.expiration3 || '';

  return {
    expiration1: origExp1,
    expiration2: origExp2,
    expiration3: origExp3,
    originalExp1: origExp1,
    originalExp2: origExp2,
    originalExp3: origExp3,
    wasRearranged: false
  };
}

export const medicationOps = {
  async add(med: Omit<Medication, 'id' | 'addedAt' | 'lastUpdatedAt'>) {
    const rearranged = rearrangeMedicationExpiries(med);
    const dataToSave = rearranged ? { ...med, ...rearranged } : med;

    if (!db) {
      return sharedDb.addMedication(dataToSave);
    }
    const path = 'medications';
    
    // Check uniqueness
    try {
      const q = query(
        collection(db, path),
        where('itemCode', '==', med.itemCode),
        where('locationId', '==', med.locationId)
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        throw new Error(`Item code ${med.itemCode} already exists in this location.`);
      }

      const result = await queuedAddDoc(collection(db, path), cleanUndefined({
        ...dataToSave,
        addedAt: serverTimestamp(),
        lastUpdatedAt: serverTimestamp(),
        updatedBy: auth?.currentUser?.uid || 'system',
      }));
      await systemOps.syncGlobalMetadata();
      return result;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  },

  async update(id: string, data: Partial<Medication>, skipSync = false) {
    const rearranged = rearrangeMedicationExpiries(data);
    const dataToSave = rearranged ? { ...data, ...rearranged } : data;

    if (!db) {
      return sharedDb.updateMedication(id, dataToSave);
    }
    const path = `medications/${id}`;
    try {
      const result = await queuedUpdateDoc(doc(db, 'medications', id), cleanUndefined({
        ...dataToSave,
        lastUpdatedAt: serverTimestamp(),
        updatedBy: auth?.currentUser?.uid || 'system',
      }));
      if (!skipSync) await systemOps.syncGlobalMetadata();
      return result;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  async bulkUpdate(updates: { id: string; data: Partial<Medication> }[]) {
    if (!db) {
      for (const u of updates) {
        const rearranged = rearrangeMedicationExpiries(u.data);
        const dataToSave = rearranged ? { ...u.data, ...rearranged } : u.data;
        await sharedDb.updateMedication(u.id, dataToSave);
      }
      return;
    }

    if (updates.length === 0) return;

    try {
      let batch = writeBatch(db);
      let count = 0;

      for (const u of updates) {
        const rearranged = rearrangeMedicationExpiries(u.data);
        const dataToSave = rearranged ? { ...u.data, ...rearranged } : u.data;
        const medRef = doc(db, 'medications', u.id);
        batch.update(medRef, cleanUndefined({
          ...dataToSave,
          lastUpdatedAt: serverTimestamp(),
          updatedBy: auth?.currentUser?.uid || 'system',
        }));

        count++;
        if (count >= 400) {
          await queuedCommit(batch);
          await new Promise(resolve => setTimeout(resolve, 2000)); // Throttling delay to prevent stream exhaustion
          batch = writeBatch(db);
          count = 0;
        }
      }

      if (count > 0) {
        await queuedCommit(batch);
      }
      await systemOps.syncGlobalMetadata();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'medications/bulk');
    }
  },

  async delete(id: string) {
    if (!db) {
      return sharedDb.deleteMedication(id);
    }
    const path = `medications/${id}`;
    try {
      const result = await queuedDeleteDoc(doc(db, 'medications', id));
      await systemOps.syncGlobalMetadata();
      return result;
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  },

  async bulkAdd(
    meds: Omit<Medication, 'id' | 'addedAt' | 'lastUpdatedAt'>[], 
    options: { photoStrategy: 'keep' | 'remove' } = { photoStrategy: 'keep' },
    onProgress?: (progress: { current: number; total: number; stage: string }) => void
  ) {
    if (!db) {
      if (onProgress) {
        onProgress({ current: 50, total: 100, stage: 'Importing data (Local storage / Api)...' });
      }
      const res = await sharedDb.bulkAdd(meds);
      if (onProgress) {
        onProgress({ current: 100, total: 100, stage: 'Data successfully recorded!' });
      }
      return res;
    }

    if (meds.length === 0) return;
    
    try {
      const colRef = collection(db, 'medications');

      // 1. Build a Unified Registry (Photos + Translations) for ALL items being imported
      // This allows items added to new locations to inherit photos/translations from existing ones
      const globalRegistry: Record<string, any> = {};
      const existingInLocation: Record<string, Record<string, any>> = {}; // locationId -> itemCode -> data

      if (options.photoStrategy === 'keep') {
        const uniqueCodes = [...new Set(meds.map(m => m.itemCode))];
        const chunkSize = 30; // Firestore 'in' query limit is 30
        const registryPromises = [];

        for (let i = 0; i < uniqueCodes.length; i += chunkSize) {
          const chunk = uniqueCodes.slice(i, i + chunkSize);
          if (onProgress) {
            onProgress({
              current: i,
              total: uniqueCodes.length,
              stage: `Sync check: Checking existing item codes (${i} / ${uniqueCodes.length})`
            });
          }
          registryPromises.push(getDocs(query(colRef, where('itemCode', 'in', chunk))));
        }

        if (onProgress) {
          onProgress({
            current: uniqueCodes.length,
            total: uniqueCodes.length,
            stage: 'Downloading and building synchronisation indexes...'
          });
        }

        const snapshots = await Promise.all(registryPromises);
        snapshots.forEach(snapshot => {
          snapshot.docs.forEach(doc => {
            const data = doc.data();
            const code = data.itemCode;
            const locId = data.locationId;
            
            // Track per-location existence
            if (!existingInLocation[locId]) existingInLocation[locId] = {};
            existingInLocation[locId][code] = { id: doc.id, ...data };

            // Build global sticky registry
            if (!globalRegistry[code]) globalRegistry[code] = {};
            
            // Stickiness for photos
            if (data.imageUrl && !globalRegistry[code].imageUrl) {
              globalRegistry[code].imageUrl = data.imageUrl;
            }

            // Stickiness for translations (Arabic, English, Hindi, Urdu, Malayalam, Bengali, Tagalog)
            // We preserve these if they exist in ANY location, prioritizing current location if found later
            const transFields = ['enIndications', 'arIndications', 'hiIndications', 'urIndications', 'mlIndications', 'bnIndications', 'tlIndications'];
            transFields.forEach(field => {
              if (data[field] && !globalRegistry[code][field]) {
                globalRegistry[code][field] = data[field];
              }
            });
          });
        });
      }

      // 2. Process writes in batches of 500 (Firestore limit)
      let currentBatch = writeBatch(db);
      let opCount = 0;
      let processedCount = 0;

      for (const m of meds) {
        const existing = existingInLocation[m.locationId]?.[m.itemCode];
        const registry = globalRegistry[m.itemCode] || {};
        
        const baseData: any = {
          ...m,
          lastUpdatedAt: serverTimestamp(),
          updatedBy: auth?.currentUser?.uid || 'system',
        };

        // Filter out averageCost and totalValue to ensure they are not changed during bulk import
        delete baseData.averageCost;
        delete baseData.totalValue;

        // Apply Stickiness/Strategy logic
        if (options.photoStrategy === 'remove') {
          baseData.imageUrl = null;
        } else if (options.photoStrategy === 'keep') {
          // If Excel doesn't have a photo, use registry photo
          if (!m.imageUrl) {
            baseData.imageUrl = existing?.imageUrl || registry.imageUrl || null;
          }
        }

        // Always preserve translations if they are missing in the incoming Excel row
        const transFields = ['enIndications', 'arIndications', 'hiIndications', 'urIndications', 'mlIndications', 'bnIndications', 'tlIndications'];
        transFields.forEach(field => {
          if (!m[field as keyof typeof m]) {
            // Keep from current location if exists, otherwise try global registry
            const stickyVal = existing?.[field] || registry[field];
            if (stickyVal) {
              baseData[field] = stickyVal;
            }
          }
        });

        if (existing) {
          const medRef = doc(db, 'medications', existing.id);
          currentBatch.update(medRef, cleanUndefined(baseData));
        } else {
          const newDoc = doc(colRef);
          currentBatch.set(newDoc, cleanUndefined({
            ...baseData,
            addedAt: serverTimestamp(),
          }));
        }

        opCount++;
        processedCount++;
        if (opCount >= 400) {
          if (onProgress) {
            onProgress({
              current: processedCount,
              total: meds.length,
              stage: `Saving medications: batch commit (${processedCount} / ${meds.length})`
            });
          }
          await queuedCommit(currentBatch);
          await new Promise(resolve => setTimeout(resolve, 2000)); // Throttling delay to prevent stream exhaustion
          currentBatch = writeBatch(db);
          opCount = 0;
        }
      }

      if (opCount > 0) {
        if (onProgress) {
          onProgress({
            current: meds.length,
            total: meds.length,
            stage: `Finalizing bulk import commit (${meds.length} / ${meds.length})`
          });
        }
        await queuedCommit(currentBatch);
      }
      
      if (onProgress) {
        onProgress({
          current: meds.length,
          total: meds.length,
          stage: 'Syncing search catalog...'
        });
      }
      await systemOps.syncGlobalMetadata();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'medications/bulk');
    }
  }
};

export const auditOps = {
  async reconcille(medId: string, physicalCount: number, locationId: PharmacyLocation, itemCode: string, itemName: string, recordedQoh: number, auditedBy: string = 'System', correctionTimestamp?: string) {
    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const now = new Date();
    const dayName = days[now.getDay()];
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const hh = String(hours).padStart(2, '0');
    const defaultTimestamp = `${dayName}, ${dd}-${mm}-${yyyy} ${hh}:${minutes} ${ampm}`;

    const timestampStr = correctionTimestamp || defaultTimestamp;

    if (!db) {
      await sharedDb.updateMedication(medId, { qoh: physicalCount });
      return sharedDb.addAudit({
        itemCode,
        itemName,
        locationId,
        physicalCount,
        recordedQoh,
        variance: physicalCount - recordedQoh,
        auditedBy,
        correctionTimestamp: timestampStr,
      });
    }

    const batch = writeBatch(db);
    
    // 1. Update medication QOH
    const medRef = doc(db, 'medications', medId);
    batch.update(medRef, cleanUndefined({
      qoh: physicalCount,
      lastUpdatedAt: serverTimestamp(),
    }));

    // 2. Log audit
    const auditRef = doc(collection(db, 'inventory_audits'));
    batch.set(auditRef, cleanUndefined({
      itemCode,
      itemName,
      locationId,
      physicalCount,
      recordedQoh,
      variance: physicalCount - recordedQoh,
      auditedAt: serverTimestamp(),
      auditedAtServer: serverTimestamp(),
      auditedBy: auth?.currentUser?.uid || auditedBy,
      correctionTimestamp: timestampStr,
    }));

    try {
      await queuedCommit(batch);
      await systemOps.syncGlobalMetadata();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'audit_reconciliation');
    }
  }
};

export const systemOps = {
  async syncGlobalMetadata() {
    if (!db) return;
    try {
      const metaRef = doc(db, 'system', 'metadata');
      await queuedSetDoc(metaRef, {
        lastDataUpdate: serverTimestamp(),
        updatedBy: auth?.currentUser?.uid || 'system'
      }, { merge: true });
      // Also update local for immediate feedback
      localDb.updateLastUpdateTime();
    } catch (e) {
      console.warn('Failed to sync global metadata', e);
    }
  },

  async resetAll() {
    if (!db) {
      return sharedDb.reset();
    }

    // Reset Firestore Collections
    const collections = ['medications', 'inventory_audits', 'translation_cache'];
    
    try {
      for (const colName of collections) {
        const colRef = collection(db, colName);
        const snapshot = await getDocs(colRef);
        
        if (snapshot.empty) continue;

        // Delete in batches of 150 to prevent stream exhaustion
        let batch = writeBatch(db);
        let count = 0;

        for (const d of snapshot.docs) {
          batch.delete(d.ref);
          count++;
          
          if (count >= 400) {
            await queuedCommit(batch);
            await new Promise(resolve => setTimeout(resolve, 2000)); // Throttling delay to prevent stream exhaustion
            batch = writeBatch(db);
            count = 0;
          }
        }

        if (count > 0) {
          await queuedCommit(batch);
        }
      }
      await systemOps.syncGlobalMetadata();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'system/reset');
    }
  }
};

export const technicianAuthOps = {
  async getPassword(portal: 'pharmacist' | 'order'): Promise<string> {
    const defaultPass = portal === 'pharmacist' ? 'pharmacist123' : 'order123';
    if (!db) return defaultPass;
    
    try {
      const docRef = doc(db, 'settings', `${portal}_portal`);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        // Initialize with default if not exists
        try {
          await queuedUpdateDoc(docRef, { password: defaultPass, updatedAt: serverTimestamp() }).catch(async (e) => {
             // If update fails because it doesn't exist, try set
             const batch = writeBatch(db);
             batch.set(docRef, { password: defaultPass, updatedAt: serverTimestamp() });
             await queuedCommit(batch);
          });
        } catch (e) {
          console.warn(`Could not initialize ${portal} password in Firestore, using default.`);
        }
        return defaultPass;
      }
      return docSnap.data().password;
    } catch (error) {
      console.error(`Error getting ${portal} password:`, error);
      return defaultPass;
    }
  },

  async updatePassword(portal: 'pharmacist' | 'order', newPassword: string): Promise<void> {
    if (!db) return;
    const path = `settings/${portal}_portal`;
    try {
      await queuedUpdateDoc(doc(db, 'settings', `${portal}_portal`), {
        password: newPassword,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }
};

export async function getTranslationHash(text: string): Promise<string> {
  const clean = (text || '').trim().toLowerCase();
  if (!clean) return '';
  try {
    const msg = new TextEncoder().encode(clean);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msg);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return 'tc_' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 50);
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

export const translationCacheOps = {
  async getTranslations(texts: string[]): Promise<Record<string, any>> {
    if (!db) {
      try {
        const res = await fetch(`/api/translation_cache?t=${Date.now()}`);
        const serverCache = await res.json();
        const result: Record<string, any> = {};
        for (const text of texts) {
          const hash = await getTranslationHash(text);
          if (serverCache[hash]) {
            result[text] = serverCache[hash];
          }
        }
        return result;
      } catch (err) {
        console.warn('Failed to fetch translation cache from server:', err);
        return {};
      }
    }

    const result: Record<string, any> = {};
    const textToHash: Record<string, string> = {};
    const hashes: string[] = [];

    for (const text of texts) {
      const hash = await getTranslationHash(text);
      if (hash) {
        textToHash[text] = hash;
        hashes.push(hash);
      }
    }

    if (hashes.length === 0) return {};

    try {
      const chunkSize = 30;
      const promises = [];
      for (let i = 0; i < hashes.length; i += chunkSize) {
        const chunk = hashes.slice(i, i + chunkSize);
        const q = query(
          collection(db, 'translation_cache'),
          where('__name__', 'in', chunk)
        );
        promises.push(getDocs(q));
      }

      const snapshots = await Promise.all(promises);
      const hashToData: Record<string, any> = {};
      snapshots.forEach(snapshot => {
        snapshot.docs.forEach(doc => {
          hashToData[doc.id] = doc.data();
        });
      });

      for (const text of texts) {
        const hash = textToHash[text];
        if (hash && hashToData[hash]) {
          result[text] = hashToData[hash];
        }
      }
    } catch (err) {
      console.warn('Firestore translation cache read failed:', err);
    }

    return result;
  },

  async saveTranslations(entries: Record<string, any>) {
    // Always sync with the server-side cache
    try {
      const serverPayload: Record<string, any> = {};
      for (const [text, data] of Object.entries(entries)) {
        const hash = await getTranslationHash(text);
        if (hash) {
          serverPayload[hash] = data;
        }
      }
      if (Object.keys(serverPayload).length > 0) {
        await fetch('/api/translation_cache', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(serverPayload)
        });
      }
    } catch (err) {
      console.warn('Failed to write translation cache to server:', err);
    }

    if (!db) {
      return;
    }

    try {
      let batch = writeBatch(db);
      let count = 0;

      for (const [text, data] of Object.entries(entries)) {
        const hash = await getTranslationHash(text);
        if (!hash) continue;

        const docRef = doc(db, 'translation_cache', hash);
        batch.set(docRef, {
          ...data,
          sourceText: text,
          updatedAt: serverTimestamp()
        }, { merge: true });

        count++;
        if (count >= 400) {
          await queuedCommit(batch);
          await new Promise(resolve => setTimeout(resolve, 2000)); // Throttling delay to prevent stream exhaustion
          batch = writeBatch(db);
          count = 0;
        }
      }

      if (count > 0) {
        await queuedCommit(batch);
      }
    } catch (err) {
      console.warn('Firestore translation cache write failed:', err);
    }
  }
};

