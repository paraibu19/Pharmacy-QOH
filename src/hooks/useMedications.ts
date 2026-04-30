import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Medication, PharmacyLocation } from '../types';
import { sharedDb } from '../lib/sharedDb';

export function useMedications(locationId?: PharmacyLocation) {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    if (!db) {
      try {
        let items = await sharedDb.getMedications();
        if (locationId) {
          items = items.filter(m => m.locationId === locationId);
        }
        items.sort((a, b) => a.itemName.localeCompare(b.itemName));
        setMedications(items);
      } catch (err: any) {
        setError(err.message);
      }
    }
  };

  useEffect(() => {
    if (!db) {
      const loadShared = async () => {
        setLoading(true);
        await refresh();
        setLoading(false);
      };

      loadShared();
      
      // Poll for updates every 10 seconds for "synchronization"
      const interval = setInterval(refresh, 10000);
      return () => clearInterval(interval);
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

  return { medications, loading, error, refresh };
}
