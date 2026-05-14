import { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, query, where, orderBy, getDocsFromCache } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, auth } from '../lib/firebase';
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
        setLastSynced(new Date());
        hasInitialData.current = true;
      } catch (err: any) {
        setError(err.message);
      } finally {
        if (showLoading) setIsSyncing(false);
      }
    } else {
      // For Cloud DB, onSnapshot handles updates. 
      // Manual refresh just triggers a visual "checking" state
      if (showLoading) {
        setTimeout(() => {
          setLastSynced(new Date());
          setIsSyncing(false);
        }, 600);
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
        console.error("Firestore onSnapshot error:", err);
        setError(err.message);
        
        // If we hit quota but have no meds yet, try one last time from cache
        if ((err.message.toLowerCase().includes('quota') || err.message.toLowerCase().includes('limit')) && medications.length === 0) {
          getDocsFromCache(q).then(cacheSnap => {
            const items: Medication[] = [];
            cacheSnap.forEach((doc) => {
              items.push({ id: doc.id, ...doc.data() } as Medication);
            });
            if (items.length > 0) {
              setMedications(items);
              hasInitialData.current = true;
            }
          }).catch(cacheErr => console.warn("Cache fetch failed too", cacheErr));
        }

        setLoading(false);
        // We log it robustly but don't throw to avoid crashing the entire React tree
        const errInfo = {
          error: err.message,
          operationType: OperationType.LIST,
          path: 'medications',
          authInfo: {
            userId: auth?.currentUser?.uid,
            email: auth?.currentUser?.email,
          }
        };
        console.error('Firestore Error Details: ', JSON.stringify(errInfo));
      }
    );

    return () => unsubscribe();
  }, [locationId]);

  return { medications, loading, error, refresh, lastSynced, isSyncing };
}
