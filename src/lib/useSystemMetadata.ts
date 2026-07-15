import { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { localDb } from './localStorageDb';
import { storage, sessionStorage, safeReload } from './storage';

export function useSystemMetadata() {
  const [lastUpdate, setLastUpdate] = useState<string | null>(localDb.getLastUpdateTime());
  const [isMesaieedHidden, setIsMesaieedHidden] = useState<boolean>(() => {
    return storage.getItem('aw_pharmacy_hide_mesaieed') === 'true';
  });
  const [isCloudActive, setIsCloudActive] = useState<boolean>(true);

  const setMesaieedHidden = async (hidden: boolean) => {
    try {
      storage.setItem('aw_pharmacy_hide_mesaieed', hidden ? 'true' : 'false');
      setIsMesaieedHidden(hidden);
      window.dispatchEvent(new Event('local-storage-update'));

      if (db) {
        const metaRef = doc(db, 'system', 'metadata');
        await setDoc(metaRef, {
          isMesaieedHidden: hidden,
          lastSettingUpdate: serverTimestamp()
        }, { merge: true });
      } else {
        await fetch('/api/system/metadata/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isMesaieedHidden: hidden })
        }).catch(err => console.warn('Failed to sync setting to server:', err));
      }
    } catch (e) {
      console.warn('Failed to set Mesaieed hidden setting:', e);
    }
  };

  useEffect(() => {
    const fetchMetadata = () => {
      fetch('/api/system/metadata')
        .then(res => {
          if (res.ok) return res.json();
          throw new Error('Failed to fetch metadata');
        })
        .then(data => {
          if (data && data.firebaseActive !== undefined) {
            setIsCloudActive(!!data.firebaseActive);
          }

          if (data && data.lastDataUpdate) {
            const dateObj = new Date(data.lastDataUpdate);
            const timestamp = dateObj.toISOString();
            
            const serverCloudActive = data.firebaseActive !== false;
            const isManualLocal = typeof window !== 'undefined' && window.sessionStorage?.getItem('firestore_fallback') === 'true';
            
            if (serverCloudActive && !isManualLocal) {
              storage.setItem('aw_pharmacy_last_update', timestamp);
              setLastUpdate(timestamp);
            } else {
              const localTime = localDb.getLastUpdateTime();
              if (!localTime || new Date(timestamp) > new Date(localTime)) {
                storage.setItem('aw_pharmacy_last_update', timestamp);
                setLastUpdate(timestamp);
              }
            }
          }
          if (data && data.isMesaieedHidden !== undefined) {
            const hidden = !!data.isMesaieedHidden;
            if (storage.getItem('aw_pharmacy_hide_mesaieed') !== (hidden ? 'true' : 'false')) {
              storage.setItem('aw_pharmacy_hide_mesaieed', hidden ? 'true' : 'false');
              setIsMesaieedHidden(hidden);
            }
          }

          // Auto-synchronize Firestore fallback state between server and client
          // Note: In development/iframe environments, server-side admin SDK initialization may fail due to lack of IAM credentials, 
          // but the client-side JS SDK can connect perfectly using the Web API Key. We only force the client to fall back to 
          // Local Mode if both the server is inactive AND the client itself fails or is explicitly told to use local mode.
          const isDevOrIframe = typeof window !== 'undefined' && 
            (window.location.hostname === 'localhost' || 
             window.location.hostname.includes('127.0.0.1') || 
             window.location.hostname.includes('.run.app') || 
             window.self !== window.top); // Detection for iframe

          if (data && data.firebaseActive === false && db && !isDevOrIframe) {
            console.warn("[Firebase Auto-Fallback] Server is running in local storage mode. Switching client to match.");
            sessionStorage.setItem('firestore_fallback', 'true');
            sessionStorage.setItem('server_fallback', 'true');
            safeReload("server_fallback_triggered");
            return;
          } else if (data && data.firebaseActive === true && !db && sessionStorage.getItem('server_fallback') === 'true') {
            console.info("[Firebase Auto-Recovery] Server's Firestore is active. Switching client back to Cloud DB Mode.");
            sessionStorage.removeItem('firestore_fallback');
            sessionStorage.removeItem('server_fallback');
            safeReload("server_recovery_triggered");
            return;
          }
        })
        .catch(err => console.warn('Error fetching metadata:', err));
    };

    fetchMetadata();
    const interval = setInterval(fetchMetadata, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // 1. Listen to Local Storage (for offline/immediate changes)
    const handleLocalUpdate = () => {
      setLastUpdate(localDb.getLastUpdateTime());
      setIsMesaieedHidden(storage.getItem('aw_pharmacy_hide_mesaieed') === 'true');
    };
    window.addEventListener('local-storage-update', handleLocalUpdate);

    // 2. Listen to real-time sync-update events via SSE (extremely Realtime sync between containers)
    const handleSyncUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && customEvent.detail.type === 'metadata') {
        const data = customEvent.detail.data;
        if (data && data.firebaseActive !== undefined) {
          setIsCloudActive(!!data.firebaseActive);
        }

        if (data && data.lastDataUpdate) {
          try {
            const timestamp = new Date(data.lastDataUpdate).toISOString();
            
            const serverCloudActive = data.firebaseActive !== false;
            const isManualLocal = typeof window !== 'undefined' && window.sessionStorage?.getItem('firestore_fallback') === 'true';

            if (serverCloudActive && !isManualLocal) {
              storage.setItem('aw_pharmacy_last_update', timestamp);
              setLastUpdate(timestamp);
            } else {
              const localTime = localDb.getLastUpdateTime();
              if (!localTime || new Date(timestamp) > new Date(localTime)) {
                storage.setItem('aw_pharmacy_last_update', timestamp);
                setLastUpdate(timestamp);
              }
            }
          } catch (err) {
            console.error('Error parsing SSE metadata timestamp:', err);
          }
        }
        if (data && data.isMesaieedHidden !== undefined) {
          const hidden = !!data.isMesaieedHidden;
          storage.setItem('aw_pharmacy_hide_mesaieed', hidden ? 'true' : 'false');
          setIsMesaieedHidden(hidden);
        }
      }
    };
    window.addEventListener('sync-update', handleSyncUpdate);

    // 3. Listen to Firestore (if in Cloud mode, to ensure direct client synchronization)
    let unsubscribe: (() => void) | null = null;
    if (db) {
      const metaRef = doc(db, 'system', 'metadata');
      unsubscribe = onSnapshot(metaRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data({ serverTimestamps: 'estimate' });
          if (data.lastDataUpdate) {
            try {
              const dateObj = (data.lastDataUpdate as any).toDate ? data.lastDataUpdate.toDate() : new Date(data.lastDataUpdate);
              const timestamp = dateObj.toISOString();
              
              // Since db is active here, always trust and use the official Firestore timestamp
              storage.setItem('aw_pharmacy_last_update', timestamp);
              setLastUpdate(timestamp);
            } catch (e) {
              console.error('Error parsing metadata timestamp:', e);
            }
          }
          if (data.isMesaieedHidden !== undefined) {
            const hidden = !!data.isMesaieedHidden;
            if (storage.getItem('aw_pharmacy_hide_mesaieed') !== (hidden ? 'true' : 'false')) {
              storage.setItem('aw_pharmacy_hide_mesaieed', hidden ? 'true' : 'false');
              setIsMesaieedHidden(hidden);
            }
          }
        }
      }, (err) => {
        console.warn('Metadata listener error:', err);
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
          console.warn("[Firestore Auto-Fallback] Client-side Firestore error in metadata triggered local fallback:", err.message);
          sessionStorage.setItem('firestore_fallback', 'true');
          safeReload("client_quota_limit_fallback");
        }
      });
    }

    return () => {
      window.removeEventListener('local-storage-update', handleLocalUpdate);
      window.removeEventListener('sync-update', handleSyncUpdate);
      if (unsubscribe) unsubscribe();
    };
  }, [db]);

  return { lastUpdate, isMesaieedHidden, setMesaieedHidden, isCloudActive };
}
