import { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, query, where, orderBy, getDocsFromCache, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, auth } from '../lib/firebase';
import { Medication, PharmacyLocation } from '../types';
import { sharedDb } from '../lib/sharedDb';
import { storage, sessionStorage, safeReload } from '../lib/storage';

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
      // For Cloud DB, perform a real query to force-update and bypass any snapshot latency/cache
      try {
        const medsRef = collection(db, 'medications');
        let q = query(medsRef, orderBy('itemName', 'asc'));
        if (locationId) {
          q = query(medsRef, where('locationId', '==', locationId), orderBy('itemName', 'asc'));
        }
        const snap = await getDocs(q);
        const items: Medication[] = [];
        snap.forEach((doc) => {
          items.push({ id: doc.id, ...doc.data() } as Medication);
        });
        setMedications(items);
        setLastSynced(new Date());
        hasInitialData.current = true;
      } catch (err: any) {
        console.warn("Manual Firestore refresh failed:", err);
      } finally {
        if (showLoading) setIsSyncing(false);
      }
    }
  };

  useEffect(() => {
    if (!db) {
      const loadShared = async () => {
        if (!hasInitialData.current) {
          setLoading(true);
        }
        await refresh();
        setLoading(false);
      };

      loadShared();
      
      const handleSyncUpdate = (e: Event) => {
        const customEvent = e as CustomEvent;
        if (customEvent.detail && customEvent.detail.type === 'medications') {
          if (customEvent.detail.data) {
            let items = customEvent.detail.data as Medication[];
            if (locationId) {
              items = items.filter(m => m.locationId === locationId);
            }
            items.sort((a, b) => a.itemName.localeCompare(b.itemName));
            setMedications(items);
            setLastSynced(new Date());
            hasInitialData.current = true;
          } else {
            refresh();
          }
        }
      };

      window.addEventListener('sync-update', handleSyncUpdate);
      
      const interval = setInterval(() => {
        const isSseConnected = typeof window !== 'undefined' && (window as any).__sseStatus?.connected;
        if (!isSseConnected) {
          // Fallback poll if real-time stream is disconnected
          refresh();
        }
      }, 15000);

      return () => {
        clearInterval(interval);
        window.removeEventListener('sync-update', handleSyncUpdate);
      };
    }

    if (!hasInitialData.current) {
      setLoading(true);
    }
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
        
        const lowerMsg = err.message.toLowerCase();
        const isFallbackTrigger = lowerMsg.includes('quota') || 
                                   lowerMsg.includes('limit') || 
                                   lowerMsg.includes('exhausted') ||
                                   lowerMsg.includes('resource_exhausted') ||
                                   lowerMsg.includes('unavailable') ||
                                   lowerMsg.includes('could not reach') ||
                                   lowerMsg.includes('offline') ||
                                   (err as any).code === 'unavailable';
        
        if (isFallbackTrigger) {
          console.warn("[Firestore Auto-Fallback] Client-side Firestore error triggered local fallback:", err.message);
          sessionStorage.setItem('firestore_fallback', 'true');
          // Note: We intentionally DO NOT set 'manual_local_mode' here, so that the client can auto-recover back to 
          // Cloud mode when the quota resets or becomes available again, as managed by useSystemMetadata.ts.
          safeReload("client_quota_limit_fallback");
          return;
        }

        // Try to fetch once from local cache if we hit a quota limit
        if (lowerMsg.includes('quota') || lowerMsg.includes('limit')) {
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
