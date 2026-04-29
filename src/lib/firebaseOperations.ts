import { 
  collection, doc, addDoc, updateDoc, deleteDoc, 
  serverTimestamp, writeBatch 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { Medication, PharmacyLocation, InventoryAudit } from '../types';

export const medicationOps = {
  async add(med: Omit<Medication, 'id' | 'addedAt' | 'lastUpdatedAt'>) {
    if (!db) throw new Error("Database not initialized");
    const path = 'medications';
    try {
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
    const batch = writeBatch(db);
    const colRef = collection(db, 'medications');
    
    meds.forEach(m => {
      const newDoc = doc(colRef);
      batch.set(newDoc, {
        ...m,
        addedAt: serverTimestamp(),
        lastUpdatedAt: serverTimestamp(),
      });
    });

    try {
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
