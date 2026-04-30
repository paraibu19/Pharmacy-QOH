import { 
  collection, doc, addDoc, updateDoc, deleteDoc, 
  serverTimestamp, writeBatch, query, where, getDocs 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { Medication, PharmacyLocation, InventoryAudit } from '../types';

export const medicationOps = {
  async add(med: Omit<Medication, 'id' | 'addedAt' | 'lastUpdatedAt'>) {
    if (!db) throw new Error("Database not initialized");
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

      return await addDoc(collection(db, path), {
        ...med,
        addedAt: serverTimestamp(),
        lastUpdatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  },

  async update(id: string, data: Partial<Medication>) {
    if (!db) throw new Error("Database not initialized");
    const path = `medications/${id}`;
    try {
      return await updateDoc(doc(db, 'medications', id), {
        ...data,
        lastUpdatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  async delete(id: string) {
    if (!db) throw new Error("Database not initialized");
    const path = `medications/${id}`;
    try {
      return await deleteDoc(doc(db, 'medications', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  },

  async bulkAdd(meds: Omit<Medication, 'id' | 'addedAt' | 'lastUpdatedAt'>[]) {
    if (!db) throw new Error("Database not initialized");
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
        
        // Firestore 'in' query supports up to 30 values.
        const chunkSize = 30;
        const existingCodes: string[] = [];
        
        for (let i = 0; i < itemCodes.length; i += chunkSize) {
          const chunk = itemCodes.slice(i, i + chunkSize);
          const q = query(
            colRef,
            where('locationId', '==', locationId),
            where('itemCode', 'in', chunk)
          );
          const snapshot = await getDocs(q);
          snapshot.docs.forEach(doc => existingCodes.push(doc.data().itemCode));
        }

        if (existingCodes.length > 0) {
          throw new Error(`Item codes already exist in ${locationId}: ${existingCodes.join(', ')}`);
        }

        locationMeds.forEach(m => {
          const newDoc = doc(colRef);
          batch.set(newDoc, {
            ...m,
            addedAt: serverTimestamp(),
            lastUpdatedAt: serverTimestamp(),
          });
        });
      }

      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'medications/bulk');
    }
  }
};

export const auditOps = {
  async reconcille(medId: string, physicalCount: number, locationId: PharmacyLocation, itemCode: string, itemName: string, recordedQoh: number) {
    if (!db) throw new Error("Database not initialized");
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
    });

    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'audit_reconciliation');
    }
  }
};
