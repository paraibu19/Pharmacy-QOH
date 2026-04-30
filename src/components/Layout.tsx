import { ReactNode } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { Pill, ShieldCheck, ClipboardList, LayoutDashboard, CloudOff, Cloud } from 'lucide-react';
import { PharmacyLocation, PHARMACY_NAMES } from '../types';
import { db } from '../lib/firebase';

interface LayoutProps {
  children: ReactNode;
  isAdmin?: boolean;
  onLogout?: () => void;
}

export default function Layout({ children, isAdmin, onLogout }: LayoutProps) {
  const isCloudConnected = !!db;

  return (
    <div className="min-h-screen bg-[#FDFCFB] text-[#141414] font-sans">
      <nav className="border-b border-[#141414]/10 bg-white sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-4">
              <Link to="/" className="flex items-center gap-2 group">
                <Pill className="w-6 h-6 text-[#F27D26] group-hover:rotate-12 transition-transform" />
                <span className="font-bold text-lg tracking-tight">Aw-Pharmacy</span>
              </Link>
              
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${isCloudConnected ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'}`}>
                {isCloudConnected ? (
                  <>
                    <Cloud className="w-3 h-3" />
                    Cloud Sync Active
                  </>
                ) : (
                  <>
                    <CloudOff className="w-3 h-3" />
                    Local Mode (Sync Blocked)
                  </>
                )}
              </div>
            </div>
            
            <div className="flex gap-4 items-center">
              {isAdmin ? (
                <>
                  <NavLink 
                    to="/admin/dashboard" 
                    className={({ isActive }) => 
                      `flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${isActive ? 'bg-[#141414] text-white' : 'hover:bg-[#141414]/5 text-[#141414]/60'}`
                    }
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    Management
                  </NavLink>
                  <NavLink 
                    to="/admin/inventory" 
                    className={({ isActive }) => 
                      `flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${isActive ? 'bg-[#141414] text-white' : 'hover:bg-[#141414]/5 text-[#141414]/60'}`
                    }
                  >
                    <ClipboardList className="w-4 h-4" />
                    Inventory Audit
                  </NavLink>
                  {onLogout && (
                    <button 
                      onClick={onLogout}
                      className="ml-2 flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium text-red-500 hover:bg-red-50 transition-colors"
                    >
                      Logout
                    </button>
                  )}
                </>
              ) : (
                <Link 
                  to="/admin/login" 
                  className="flex items-center gap-1 px-4 py-1.5 border border-[#141414]/20 rounded-full text-sm font-medium hover:bg-[#141414] hover:text-white hover:border-[#141414] transition-all"
                >
                  <ShieldCheck className="w-4 h-4" />
                  Admin Login
                </Link>
              )}
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      <footer className="border-t border-[#141414]/10 py-8 mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-xs text-[#141414]/40 uppercase tracking-widest font-mono">
            &copy; 2026 Aw-Pharmacy Inventory Management System
          </p>
        </div>
      </footer>
    </div>
  );
}
