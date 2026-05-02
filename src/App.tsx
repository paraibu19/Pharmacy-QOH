import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Layout from './components/Layout';
import PharmacistView from './pages/PharmacistView';
import GeneralView from './pages/GeneralView';
import OrderView from './pages/OrderView';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import AdminInventory from './pages/AdminInventory';

// Simple auth simulation until Firebase is ready
const useAuth = (key: string) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  useEffect(() => {
    const loggedIn = localStorage.getItem(key) === 'true';
    setIsAuthenticated(loggedIn);
  }, [key]);

  const login = () => {
    localStorage.setItem(key, 'true');
    setIsAuthenticated(true);
  };

  const logout = () => {
    localStorage.removeItem(key);
    setIsAuthenticated(false);
  };

  return { isAuthenticated, login, logout };
};

export default function App() {
  const { isAuthenticated: isAdmin, login: adminLogin, logout: adminLogout } = useAuth('admin_session');

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
