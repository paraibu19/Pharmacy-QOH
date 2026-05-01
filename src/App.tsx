import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Layout from './components/Layout';
import UserHome from './pages/UserHome';
import OrderView from './pages/OrderView';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import AdminInventory from './pages/AdminInventory';

// Simple admin auth simulation until Firebase is ready
const useAuth = () => {
  const [isAdmin, setIsAdmin] = useState(false);
  
  useEffect(() => {
    const loggedIn = localStorage.getItem('admin_session') === 'true';
    setIsAdmin(loggedIn);
  }, []);

  const login = () => {
    localStorage.setItem('admin_session', 'true');
    setIsAdmin(true);
  };

  const logout = () => {
    localStorage.removeItem('admin_session');
    setIsAdmin(false);
  };

  return { isAdmin, login, logout };
};

export default function App() {
  const { isAdmin, login, logout } = useAuth();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={
          <Layout>
            <UserHome />
          </Layout>
        } />
        
        <Route path="/order" element={
          <Layout>
            <OrderView />
          </Layout>
        } />
        
        <Route path="/admin/login" element={
          <Layout>
            <AdminLogin onLogin={login} />
          </Layout>
        } />

        <Route 
          path="/admin/dashboard" 
          element={
            isAdmin 
              ? <Layout isAdmin onLogout={logout}><AdminDashboard /></Layout> 
              : <Navigate to="/admin/login" />
          } 
        />

        <Route 
          path="/admin/inventory" 
          element={
            isAdmin 
              ? <Layout isAdmin onLogout={logout}><AdminInventory /></Layout> 
              : <Navigate to="/admin/login" />
          } 
        />
      </Routes>
    </BrowserRouter>
  );
}
