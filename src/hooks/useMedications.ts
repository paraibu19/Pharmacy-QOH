import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Medication, PharmacyLocation } from '../types';

export function useMedications(locationId?: PharmacyLocation) {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
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
