import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { sharedDb } from '../lib/sharedDb';
import { storage, sessionStorage } from '../lib/storage';

export interface AuditLog {
  id: string;
  itemCode: string;
  itemName: string;
  locationId: string;
  physicalCount: number;
  recordedQoh: number;
  variance: number;
  auditedAt: any;
  auditedBy: string;
}

export function useAudits(maxItems: number = 50) {
  const [audits, setAudits] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!db) {
      const loadSharedAudits = async () => {
        try {
          setLoading(true);
          const data = await sharedDb.getAudits();
          const mapped: AuditLog[] = data.map((d: any) => ({
            ...d,
            // Convert string ISO-8601 to Firestore-like field or Date
            auditedAt: d.auditedAt ? { toDate: () => new Date(d.auditedAt), seconds: Math.floor(new Date(d.auditedAt).getTime() / 1000) } : null
          }));
          // Sort descending
          mapped.sort((a, b) => {
            const dateA = a.auditedAt ? a.auditedAt.toDate().getTime() : 0;
            const dateB = b.auditedAt ? b.auditedAt.toDate().getTime() : 0;
            return dateB - dateA;
          });
          setAudits(mapped.slice(0, maxItems));
        } catch (err: any) {
          setError(err.message || 'Failed to load local audits.');
        } finally {
          setLoading(false);
        }
      };
      
      loadSharedAudits();
      
      const handleSyncUpdate = (e: Event) => {
        const customEvent = e as CustomEvent;
        if (customEvent.detail && customEvent.detail.type === 'audits') {
          if (customEvent.detail.data) {
            const data = customEvent.detail.data;
            const mapped: AuditLog[] = data.map((d: any) => ({
              ...d,
              auditedAt: d.auditedAt ? { toDate: () => new Date(d.auditedAt), seconds: Math.floor(new Date(d.auditedAt).getTime() / 1000) } : null
            }));
            mapped.sort((a, b) => {
              const dateA = a.auditedAt ? a.auditedAt.toDate().getTime() : 0;
              const dateB = b.auditedAt ? b.auditedAt.toDate().getTime() : 0;
              return dateB - dateA;
            });
            setAudits(mapped.slice(0, maxItems));
          } else {
            loadSharedAudits();
          }
        }
      };

      window.addEventListener('sync-update', handleSyncUpdate);
      
      const interval = setInterval(() => {
        const isSseConnected = typeof window !== 'undefined' && (window as any).__sseStatus?.connected;
        if (!isSseConnected) {
          // Fallback poll if real-time stream is disconnected
          loadSharedAudits();
        }
      }, 15000);

      return () => {
        clearInterval(interval);
        window.removeEventListener('sync-update', handleSyncUpdate);
      };
    }

    const auditsRef = collection(db, 'inventory_audits');
    const q = query(auditsRef, orderBy('auditedAt', 'desc'), limit(maxItems));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: AuditLog[] = [];
        snapshot.forEach((doc) => {
          items.push({ id: doc.id, ...doc.data() } as AuditLog);
        });
        setAudits(items);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
        handleFirestoreError(err, OperationType.LIST, 'inventory_audits');
      }
    );

    return () => unsubscribe();
  }, [maxItems]);

  return { audits, loading, error };
}
