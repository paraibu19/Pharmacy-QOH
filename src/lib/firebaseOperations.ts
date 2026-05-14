import { 
  collection, doc, addDoc, updateDoc, deleteDoc, 
  serverTimestamp, writeBatch, query, where, getDocs, getDoc, setDoc 
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import { Medication, PharmacyLocation } from '../types';
import { sharedDb } from './sharedDb';
import { localDb } from './localStorageDb';

export const medicationOps = {
  async add(med: Omit<Medication, 'id' | 'addedAt' | 'lastUpdatedAt'>) {
    if (!db) {
      return sharedDb.addMedication(med);
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

      const result = await addDoc(collection(db, path), {
        ...med,
        addedAt: serverTimestamp(),
        lastUpdatedAt: serverTimestamp(),
        updatedBy: auth?.currentUser?.uid || 'system',
      });
      await systemOps.syncGlobalMetadata();
      return result;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  },

  async update(id: string, data: Partial<Medication>, skipSync = false) {
    if (!db) {
      return sharedDb.updateMedication(id, data);
    }
    const path = `medications/${id}`;
    try {
      const result = await updateDoc(doc(db, 'medications', id), {
        ...data,
        lastUpdatedAt: serverTimestamp(),
        updatedBy: auth?.currentUser?.uid || 'system',
      });
      if (!skipSync) await systemOps.syncGlobalMetadata();
      return result;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  async bulkUpdate(updates: { id: string; data: Partial<Medication> }[]) {
    if (!db) {
      for (const u of updates) {
        await sharedDb.updateMedication(u.id, u.data);
      }
      return;
    }

    if (updates.length === 0) return;

    try {
      let batch = writeBatch(db);
      let count = 0;

      for (const u of updates) {
        const medRef = doc(db, 'medications', u.id);
        batch.update(medRef, {
          ...u.data,
          lastUpdatedAt: serverTimestamp(),
          updatedBy: auth?.currentUser?.uid || 'system',
        });

        count++;
        if (count >= 500) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }

      if (count > 0) {
        await batch.commit();
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
      const result = await deleteDoc(doc(db, 'medications', id));
      await systemOps.syncGlobalMetadata();
      return result;
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  },

  async bulkAdd(meds: Omit<Medication, 'id' | 'addedAt' | 'lastUpdatedAt'>[], options: { photoStrategy: 'keep' | 'remove' } = { photoStrategy: 'keep' }) {
    if (!db) {
      return sharedDb.bulkAdd(meds);
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
          registryPromises.push(getDocs(query(colRef, where('itemCode', 'in', chunk))));
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

      for (const m of meds) {
        const existing = existingInLocation[m.locationId]?.[m.itemCode];
        const registry = globalRegistry[m.itemCode] || {};
        
        const baseData: any = {
          ...m,
          lastUpdatedAt: serverTimestamp(),
          updatedBy: auth?.currentUser?.uid || 'system',
        };

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
          currentBatch.update(medRef, baseData);
        } else {
          const newDoc = doc(colRef);
          currentBatch.set(newDoc, {
            ...baseData,
            addedAt: serverTimestamp(),
          });
        }

        opCount++;
        if (opCount >= 500) {
          await currentBatch.commit();
          currentBatch = writeBatch(db);
          opCount = 0;
        }
      }

      if (opCount > 0) {
        await currentBatch.commit();
      }
      
      await systemOps.syncGlobalMetadata();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'medications/bulk');
    }
  }
};

export const auditOps = {
  async reconcille(medId: string, physicalCount: number, locationId: PharmacyLocation, itemCode: string, itemName: string, recordedQoh: number, auditedBy: string = 'System') {
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
      });
    }

    const batch = writeBatch(db);
    
    // 1. Update medication QOH
    const medRef = doc(db, 'medications', medId);
    batch.update(medRef, {
      qoh: physicalCount,
      lastUpdatedAt: serverTimestamp(),
    });

    // 2. Log audit
    const auditRef = doc(collection(db, 'inventory_audits'));
    batch.set(auditRef, {
      itemCode,
      itemName,
      locationId,
      physicalCount,
      recordedQoh,
      variance: physicalCount - recordedQoh,
      auditedAt: serverTimestamp(),
      auditedBy: auth?.currentUser?.uid || auditedBy,
    });

    try {
      await batch.commit();
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
      await setDoc(metaRef, {
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
    const collections = ['medications', 'inventory_audits'];
    
    try {
      for (const colName of collections) {
        const colRef = collection(db, colName);
        const snapshot = await getDocs(colRef);
        
        if (snapshot.empty) continue;

        // Delete in batches of 500 (Firestore limit)
        let batch = writeBatch(db);
        let count = 0;

        for (const d of snapshot.docs) {
          batch.delete(d.ref);
          count++;
          
          if (count >= 500) {
            await batch.commit();
            batch = writeBatch(db);
            count = 0;
          }
        }

        if (count > 0) {
          await batch.commit();
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
          await updateDoc(docRef, { password: defaultPass, updatedAt: serverTimestamp() }).catch(async (e) => {
             // If update fails because it doesn't exist, try set
             const batch = writeBatch(db);
             batch.set(docRef, { password: defaultPass, updatedAt: serverTimestamp() });
             await batch.commit();
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
      await updateDoc(doc(db, 'settings', `${portal}_portal`), {
        password: newPassword,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }
};

