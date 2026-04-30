import { 
  collection, doc, addDoc, updateDoc, deleteDoc, 
  serverTimestamp, writeBatch, query, where, getDocs 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { Medication, PharmacyLocation, InventoryAudit } from '../types';
import { localDb } from './localStorageDb';

export const medicationOps = {
  async add(med: Omit<Medication, 'id' | 'addedAt' | 'lastUpdatedAt'>) {
    if (!db) {
      return localDb.addMedication(med as any);
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
    if (!db) {
      return localDb.updateMedication(id, data);
    }
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
    if (!db) {
      return localDb.deleteMedication(id);
    }
    const path = `medications/${id}`;
    try {
      return await deleteDoc(doc(db, 'medications', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  },

  async bulkAdd(meds: Omit<Medication, 'id' | 'addedAt' | 'lastUpdatedAt'>[]) {
    if (!db) {
      const localMeds = localDb.getMedications();
      const medsToSave = [...localMeds];

      meds.forEach(med => {
        const existingIndex = medsToSave.findIndex(m => m.locationId === med.locationId && m.itemCode === med.itemCode);
        if (existingIndex !== -1) {
          // Update existing - Preserve original addedAt
          medsToSave[existingIndex] = {
            ...medsToSave[existingIndex],
            ...med,
            lastUpdatedAt: new Date().toISOString()
          };
        } else {
          // Add new - Mark as NEW
          medsToSave.push({
            ...med,
            id: Math.random().toString(36).substring(2, 11),
            addedAt: new Date().toISOString(),
            lastUpdatedAt: new Date().toISOString()
          } as Medication);
        }
      });

      localDb.saveMedications(medsToSave);
      return;
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
            });
          } else {
            // Create - Genuinely new item, will show "NEW" for 10 days
            const newDoc = doc(colRef);
            batch.set(newDoc, {
              ...m,
              addedAt: serverTimestamp(),
              lastUpdatedAt: serverTimestamp(),
            });
          }
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
    if (!db) {
      localDb.updateMedication(medId, { qoh: physicalCount });
      const audits = localDb.getAudits();
      audits.push({
        id: Math.random().toString(),
        itemCode,
        itemName,
        locationId,
        physicalCount,
        recordedQoh,
        variance: physicalCount - recordedQoh,
        auditedAt: new Date(),
      } as any);
      localDb.saveAudits(audits);
      return;
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
    });

    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'audit_reconciliation');
    }
  }
};

