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

  async update(id: string, data: Partial<Medication>) {
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
      await systemOps.syncGlobalMetadata();
      return result;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
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
    
    // Group meds by locationId
    const medsByLocation = meds.reduce((acc, med) => {
      if (!acc[med.locationId]) acc[med.locationId] = [];
      acc[med.locationId].push(med);
      return acc;
    }, {} as Record<string, typeof meds>);

    try {
      const colRef = collection(db, 'medications');

      // 1. Parallelize Global Photo Search if strategy is 'keep'
      // We'll build a map: itemCode -> { [locationId]: imageUrl, fallback: string | undefined }
      const photoRegistry: Record<string, { [locId: string]: string; fallback?: string }> = {};
      if (options.photoStrategy === 'keep') {
        const uniqueCodes = [...new Set(meds.map(m => m.itemCode))];
        const chunkSize = 30;
        const photoSearchPromises = [];

        for (let i = 0; i < uniqueCodes.length; i += chunkSize) {
          photoSearchPromises.push(getDocs(query(colRef, where('itemCode', 'in', uniqueCodes.slice(i, i + chunkSize)))));
        }

        const snapshots = await Promise.all(photoSearchPromises);
        snapshots.forEach(snapshot => {
          snapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.imageUrl) {
              if (!photoRegistry[data.itemCode]) photoRegistry[data.itemCode] = {};
              photoRegistry[data.itemCode][data.locationId] = data.imageUrl;
              // First one found becomes global fallback if none set
              if (!photoRegistry[data.itemCode].fallback) photoRegistry[data.itemCode].fallback = data.imageUrl;
            }
          });
        });
      }

      // 2. Parallelize existence check for ALL items in their respective locations
      const existingEntries: Record<string, Record<string, { id: string; hasPhoto: boolean }>> = {};
      const searchPromises: Promise<any>[] = [];
      const searchMeta: { locationId: string }[] = [];

      Object.entries(medsByLocation).forEach(([locationId, locationMeds]) => {
        const itemCodes = [...new Set(locationMeds.map(m => m.itemCode))];
        const chunkSize = 30;
        
        for (let i = 0; i < itemCodes.length; i += chunkSize) {
          const chunk = itemCodes.slice(i, i + chunkSize);
          searchMeta.push({ locationId });
          searchPromises.push(getDocs(query(
            colRef,
            where('locationId', '==', locationId),
            where('itemCode', 'in', chunk)
          )));
        }
      });

      const searchSnapshots = await Promise.all(searchPromises);
      searchSnapshots.forEach((snapshot, idx) => {
        const { locationId } = searchMeta[idx];
        if (!existingEntries[locationId]) existingEntries[locationId] = {};
        
        snapshot.docs.forEach(doc => {
          const data = doc.data();
          existingEntries[locationId][data.itemCode] = {
            id: doc.id,
            hasPhoto: !!data.imageUrl
          };
        });
      });

      // 3. Process writes in batches of 500 (Firestore limit)
      let currentBatch = writeBatch(db);
      let opCount = 0;

      for (const m of meds) {
        const registry = photoRegistry[m.itemCode];
        // Priority: 1. Photo in THIS location, 2. Global fallback from other locations
        const bestPhoto = registry?.[m.locationId] || registry?.fallback;

        const locationExisting = existingEntries[m.locationId] || {};
        
        if (locationExisting[m.itemCode]) {
          const entry = locationExisting[m.itemCode];
          const medRef = doc(db, 'medications', entry.id);
          const updateData: any = {
            ...m,
            lastUpdatedAt: serverTimestamp(),
            updatedBy: auth?.currentUser?.uid || 'system',
          };

          if (options.photoStrategy === 'remove') {
            updateData.imageUrl = null;
          } else if (options.photoStrategy === 'keep' && !entry.hasPhoto && bestPhoto) {
            updateData.imageUrl = bestPhoto;
          }

          currentBatch.update(medRef, updateData);
        } else {
          const newDoc = doc(colRef);
          const createData: any = {
            ...m,
            addedAt: serverTimestamp(),
            lastUpdatedAt: serverTimestamp(),
            updatedBy: auth?.currentUser?.uid || 'system',
          };

          if (options.photoStrategy === 'keep' && bestPhoto) {
            createData.imageUrl = bestPhoto;
          }

          currentBatch.set(newDoc, createData);
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

