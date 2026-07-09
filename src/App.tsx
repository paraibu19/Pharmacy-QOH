import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Layout from './components/Layout';
import PharmacistView from './pages/PharmacistView';
import GeneralView from './pages/GeneralView';
import OrderView from './pages/OrderView';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import AdminInventory from './pages/AdminInventory';
import AdminExpiryCheck from './pages/AdminExpiryCheck';
import AdminEntryMistakes from './pages/AdminEntryMistakes';
import ApplicationStorage from './pages/ApplicationStorage';
import AdminTableOcr from './pages/AdminTableOcr';
import AdminDutyRoster from './pages/AdminDutyRoster';
import AdminWorkload from './pages/AdminWorkload';
import { auth } from './lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { storage } from './lib/storage';

export default function App() {
  const [isAdmin, setIsAdmin] = useState(() => {
    return storage.getItem('admin_session') === 'true';
  });
  const [authLoading, setAuthLoading] = useState(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      if (path === '/' || path === '/pharmacist' || path === '/order') return false;
      if (storage.getItem('admin_session') === 'true') return false;
    }
    return true;
  });

  useEffect(() => {
    // Shorter safety timeout if Firebase hangs in iframe/sandbox environments
    const timeout = setTimeout(() => {
      setAuthLoading(false);
    }, 800);

    if (!auth) {
      clearTimeout(timeout);
      setAuthLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      clearTimeout(timeout);
      // If signed in via Google, also set isAdmin to true automatically
      const isGoogleAdmin = !!user && (user.email === 'ahmedmohammedsalah@gmail.com' || user.email?.endsWith('@gmail.com'));
      if (isGoogleAdmin) {
        setIsAdmin(true);
        storage.setItem('admin_session', 'true');
      }
      setAuthLoading(false);
    });

    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, []);

  // Real-time synchronization EventSource listener
  useEffect(() => {
    let sse: EventSource | null = null;
    let reconnectTimeout: any = null;

    const updateSSEStatus = (connected: boolean, lastEvent?: { type: string; time: Date }) => {
      if (typeof window === 'undefined') return;
      const current = (window as any).__sseStatus || {
        connected: false,
        lastEventTimestamp: null,
        lastEventType: null,
        connectedAt: null,
        reconnectCount: 0
      };

      const nextStatus = {
        connected,
        lastEventTimestamp: lastEvent ? lastEvent.time.toISOString() : current.lastEventTimestamp,
        lastEventType: lastEvent ? lastEvent.type : current.lastEventType,
        connectedAt: connected && !current.connected ? new Date().toISOString() : current.connectedAt,
        reconnectCount: !connected && current.connected ? current.reconnectCount + 1 : current.reconnectCount
      };

      (window as any).__sseStatus = nextStatus;
      window.dispatchEvent(new CustomEvent('sse-status-change', { detail: nextStatus }));
    };

    const connectSSE = () => {
      if (typeof window === 'undefined') return;
      
      console.log('[SSE] Connecting to real-time synchronization stream...');
      sse = new EventSource('/api/sync-stream');
      
      sse.onopen = () => {
        console.log('[SSE] Stream connected successfully.');
        updateSSEStatus(true);
      };

      sse.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload && payload.type) {
            if (payload.type !== 'connected') {
              console.log(`[SSE] Real-time event received: ${payload.type}`);
              // Dispatch global event for hooks/components to intercept
              window.dispatchEvent(new CustomEvent('sync-update', { detail: payload }));
              updateSSEStatus(true, { type: payload.type, time: new Date() });
            } else {
              // Initial connection acknowledgment
              updateSSEStatus(true, { type: 'heartbeat/connection', time: new Date() });
            }
          }
        } catch (e) {
          console.error('[SSE] Failed to parse message:', e);
        }
      };

      sse.onerror = (err) => {
        console.warn('[SSE] Sync stream disconnected. Reconnecting in 3 seconds...', err);
        updateSSEStatus(false);
        if (sse) {
          sse.close();
          sse = null;
        }
        clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(connectSSE, 3000);
      };
    };

    connectSSE();

    return () => {
      if (sse) sse.close();
      clearTimeout(reconnectTimeout);
    };
  }, []);

  const adminLogout = async () => {
    if (auth) {
      await signOut(auth).catch(() => {});
    }
    storage.removeItem('admin_session');
    setIsAdmin(false);
  };

  const adminLogin = () => {
    storage.setItem('admin_session', 'true');
    setIsAdmin(true);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-12 h-12 border-4 border-[#141414]/5 border-t-[#F27D26] rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Homepage */}
        <Route path="/" element={
          <Layout>
            <GeneralView />
          </Layout>
        } />
        
        {/* Pharmacist View -> Self Protected */}
        <Route path="/pharmacist" element={
          <Layout>
            <PharmacistView />
          </Layout>
        } />
        
        <Route path="/order" element={
          <Layout>
            <OrderView />
          </Layout>
        } />
        
        <Route path="/admin/login" element={
          <Layout>
            <AdminLogin onLogin={adminLogin} />
          </Layout>
        } />

        <Route 
          path="/admin/dashboard" 
          element={
            isAdmin 
              ? <Layout isAdmin onLogout={adminLogout}><AdminDashboard /></Layout> 
              : <Navigate to="/admin/login" />
          } 
        />

        <Route 
          path="/admin/inventory" 
          element={
            isAdmin 
              ? <Layout isAdmin onLogout={adminLogout}><AdminInventory /></Layout> 
              : <Navigate to="/admin/login" />
          } 
        />

        <Route 
          path="/admin/expiry-check" 
          element={
            isAdmin 
              ? <Layout isAdmin onLogout={adminLogout}><AdminExpiryCheck /></Layout> 
              : <Navigate to="/admin/login" />
          } 
        />

        <Route 
          path="/admin/entry-mistakes" 
          element={
            isAdmin 
              ? <Layout isAdmin onLogout={adminLogout}><AdminEntryMistakes /></Layout> 
              : <Navigate to="/admin/login" />
          } 
        />

        <Route 
          path="/admin/application-storage" 
          element={
            isAdmin 
              ? <Layout isAdmin onLogout={adminLogout}><ApplicationStorage /></Layout> 
              : <Navigate to="/admin/login" />
          } 
        />

        <Route 
          path="/admin/pdf-ocr" 
          element={
            isAdmin 
              ? <Layout isAdmin onLogout={adminLogout}><AdminTableOcr /></Layout> 
              : <Navigate to="/admin/login" />
          } 
        />

        <Route 
          path="/admin/duty-roster" 
          element={
            isAdmin 
              ? <Layout isAdmin onLogout={adminLogout}><AdminDutyRoster /></Layout> 
              : <Navigate to="/admin/login" />
          } 
        />

        <Route 
          path="/admin/workload" 
          element={
            isAdmin 
              ? <Layout isAdmin onLogout={adminLogout}><AdminWorkload /></Layout> 
              : <Navigate to="/admin/login" />
          } 
        />
      </Routes>
    </BrowserRouter>
  );
}
