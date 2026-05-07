import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Layout from './components/Layout';
import PharmacistView from './pages/PharmacistView';
import GeneralView from './pages/GeneralView';
import OrderView from './pages/OrderView';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import AdminInventory from './pages/AdminInventory';
import { auth } from './lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';

export default function App() {
  const [isAdmin, setIsAdmin] = useState(() => {
    return localStorage.getItem('admin_session') === 'true';
  });
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      setAuthLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      // If signed in via Google, also set isAdmin to true automatically
      const isGoogleAdmin = !!user && (user.email === 'ahmedmohammedsalah@gmail.com' || user.email?.endsWith('@gmail.com'));
      
      if (isGoogleAdmin) {
        setIsAdmin(true);
        localStorage.setItem('admin_session', 'true');
      } else if (!user && localStorage.getItem('admin_session') === 'true') {
        // Try to recover firebase session anonymously if we have a local admin session
        try {
          const { signInAnonymously } = await import('firebase/auth');
          await signInAnonymously(auth);
          // Wait for the next onAuthStateChanged fire to set loading to false
          return;
        } catch (e) {
          console.warn('Silent anonymous sign-in failed:', e);
        }
      }
      
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const adminLogout = async () => {
    if (auth) {
      await signOut(auth).catch(() => {});
    }
    localStorage.removeItem('admin_session');
    setIsAdmin(false);
  };

  const adminLogin = () => {
    localStorage.setItem('admin_session', 'true');
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
        {/* Public General View */}
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
      </Routes>
    </BrowserRouter>
  );
}
