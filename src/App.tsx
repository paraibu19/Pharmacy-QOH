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
      </Routes>
    </BrowserRouter>
  );
}
