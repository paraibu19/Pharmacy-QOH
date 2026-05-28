import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { sharedDb } from '../lib/sharedDb';

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
      const interval = setInterval(() => loadSharedAudits(), 6000);
      return () => clearInterval(interval);
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
        
        if (
          err.message.toLowerCase().includes('quota') || 
          err.message.toLowerCase().includes('limit') || 
          err.message.toLowerCase().includes('exceeded') || 
          err.message.toLowerCase().includes('permission-denied')
        ) {
          if (typeof window !== 'undefined') {
            if (window.localStorage.getItem('firestore_fallback')) {
              window.localStorage.removeItem('firestore_fallback');
            }
            window.sessionStorage.setItem('firestore_fallback', 'true');
            console.warn('Auto-switching useAudits to Local Server database mode.');
            setTimeout(() => {
              window.location.reload();
            }, 800);
          }
        }
        
        handleFirestoreError(err, OperationType.LIST, 'inventory_audits');
      }
    );

    return () => unsubscribe();
  }, [maxItems]);

  return { audits, loading, error };
}
