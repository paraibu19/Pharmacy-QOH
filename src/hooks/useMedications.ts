import { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Medication, PharmacyLocation } from '../types';
import { sharedDb } from '../lib/sharedDb';

export function useMedications(locationId?: PharmacyLocation) {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<Date>(new Date());
  const [isSyncing, setIsSyncing] = useState(false);
  const hasInitialData = useRef(false);

  const refresh = async (showLoading = false) => {
    if (showLoading) setIsSyncing(true);
    if (!db) {
      try {
        let items = await sharedDb.getMedications();
        if (locationId) {
          items = items.filter(m => m.locationId === locationId);
        }
        items.sort((a, b) => a.itemName.localeCompare(b.itemName));
        setMedications(items);
        if (hasInitialData.current) setLastSynced(new Date());
        hasInitialData.current = true;
      } catch (err: any) {
        setError(err.message);
      } finally {
        if (showLoading) setIsSyncing(false);
      }
    } else {
      // For items with DB, we just update the timestamp to show intent
      setLastSynced(new Date());
      if (showLoading) {
        setTimeout(() => setIsSyncing(false), 500);
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
      
      const interval = setInterval(() => refresh(), 5000);
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
        
        // Only trigger "Live" pulse (via lastSynced change) if it's not the initial state
        if (hasInitialData.current) {
          setLastSynced(new Date());
        }
        
        hasInitialData.current = true;
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

  return { medications, loading, error, refresh, lastSynced, isSyncing };
}
