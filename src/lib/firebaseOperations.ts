import { 
  collection, doc, addDoc, updateDoc, deleteDoc, 
  serverTimestamp, writeBatch, query, where, getDocs, getDoc 
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
      localDb.updateLastUpdateTime();
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
      localDb.updateLastUpdateTime();
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
      localDb.updateLastUpdateTime();
      return result;
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  },

  async bulkAdd(meds: Omit<Medication, 'id' | 'addedAt' | 'lastUpdatedAt'>[]) {
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
      const batch = writeBatch(db);
      const colRef = collection(db, 'medications');

      for (const [locationId, locationMeds] of Object.entries(medsByLocation)) {
        const itemCodes = locationMeds.map(m => m.itemCode);
        
        // chunk 30 for 'in' query
        const chunkSize = 30;
        const existingMeds: Record<string, string> = {}; // itemCode -> docId
        
        for (let i = 0; i < itemCodes.length; i += chunkSize) {
          const chunk = itemCodes.slice(i, i + chunkSize);
          const q = query(
            colRef,
            where('locationId', '==', locationId),
            where('itemCode', 'in', chunk)
          );
          const snapshot = await getDocs(q);
          snapshot.docs.forEach(doc => {
            existingMeds[doc.data().itemCode] = doc.id;
          });
        }

        locationMeds.forEach(m => {
          if (existingMeds[m.itemCode]) {
            // Update - Preserve original addedAt so status naturally changes to '-' after 10 days
            const medRef = doc(db, 'medications', existingMeds[m.itemCode]);
            batch.update(medRef, {
              ...m,
              lastUpdatedAt: serverTimestamp(),
              updatedBy: auth?.currentUser?.uid || 'system',
            });
          } else {
            // Create - Genuinely new item, will show "NEW" for 10 days
            const newDoc = doc(colRef);
            batch.set(newDoc, {
              ...m,
              addedAt: serverTimestamp(),
              lastUpdatedAt: serverTimestamp(),
              updatedBy: auth?.currentUser?.uid || 'system',
            });
          }
        });
      }

      await batch.commit();
      localDb.updateLastUpdateTime();
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
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'audit_reconciliation');
    }
  }
};

export const systemOps = {
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

