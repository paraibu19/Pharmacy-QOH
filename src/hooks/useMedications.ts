import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Medication, PharmacyLocation } from '../types';
import { localDb } from '../lib/localStorageDb';

export function useMedications(locationId?: PharmacyLocation) {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!db) {
      const loadLocal = () => {
        let items = localDb.getMedications();
        if (locationId) {
          items = items.filter(m => m.locationId === locationId);
        }
        // Simple sort since it's local
        items.sort((a, b) => a.itemName.localeCompare(b.itemName));
        setMedications(items);
        setLoading(false);
      };

      loadLocal();
      
      // Listen for local updates
      window.addEventListener('local-storage-update', loadLocal);
      return () => window.removeEventListener('local-storage-update', loadLocal);
    }

    setLoading(true);
    const medsRef = collection(db, 'medications');
    let q = query(medsRef, orderBy('itemName', 'asc'));

    if (locationId) {
      q = query(medsRef, where('locationId', '==', locationId), orderBy('itemName', 'asc'));
    }

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: Medication[] = [];
        snapshot.forEach((doc) => {
          items.push({ id: doc.id, ...doc.data() } as Medication);
        });
        setMedications(items);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
        handleFirestoreError(err, OperationType.LIST, 'medications');
      }
    );

    return () => unsubscribe();
  }, [locationId]);

  return { medications, loading, error };
}
