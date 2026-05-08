import { ReactNode, useState, useEffect } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { Pill, ShieldCheck, ClipboardList, LayoutDashboard, CloudOff, Cloud, Wrench, CalendarDays, Menu, X as XIcon, LogOut, RefreshCw, UploadCloud } from 'lucide-react';
import { format } from 'date-fns';
import { PharmacyLocation, PHARMACY_NAMES } from '../types';
import { db } from '../lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { onSnapshotsInSync } from 'firebase/firestore';
import { localDb } from '../lib/localStorageDb';

interface LayoutProps {
  children: ReactNode;
  isAdmin?: boolean;
  onLogout?: () => void;
}

export default function Layout({ children, isAdmin, onLogout }: LayoutProps) {
  const [isSynced, setIsSynced] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(localDb.getLastUpdateTime());

  useEffect(() => {
    const handleUpdate = () => {
      setLastUpdate(localDb.getLastUpdateTime());
    };

    window.addEventListener('local-storage-update', handleUpdate);
    return () => window.removeEventListener('local-storage-update', handleUpdate);
  }, []);

  useEffect(() => {
    if (!db) return;

    // Monitor when Firestore completes a sync operation
    const unsubscribe = onSnapshotsInSync(db, () => {
      setIsSynced(true);
      // Flash the synced state briefly
      const timer = setTimeout(() => setIsSynced(false), 3000);
      return () => clearTimeout(timer);
    });

    return () => unsubscribe();
  }, []);

  const NavLinks = () => (
    <>
      <NavLink 
        to="/" 
        onClick={() => setIsMobileMenuOpen(false)}
        className={({ isActive }) => 
          `flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${isActive ? 'bg-[#141414] text-white shadow-lg' : 'hover:bg-[#141414]/5 text-[#141414]/60'}`
        }
      >
        Homepage
      </NavLink>

      <NavLink 
        to="/pharmacist" 
        onClick={() => setIsMobileMenuOpen(false)}
        className={({ isActive }) => 
          `flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${isActive ? 'bg-[#141414] text-white shadow-lg' : 'hover:bg-[#141414]/5 text-[#141414]/60'}`
        }
      >
        <Pill className="w-4 h-4" />
        Pharmacist
      </NavLink>

      <NavLink 
        to="/order" 
        onClick={() => setIsMobileMenuOpen(false)}
        className={({ isActive }) => 
          `flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${isActive ? 'bg-[#141414] text-white shadow-lg' : 'hover:bg-[#141414]/5 text-[#141414]/60'}`
        }
      >
        <Wrench className="w-4 h-4" />
        Order
      </NavLink>

      {isAdmin && (
        <>
          <NavLink 
            to="/admin/dashboard" 
            onClick={() => setIsMobileMenuOpen(false)}
            className={({ isActive }) => 
              `flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${isActive ? 'bg-[#141414] text-white shadow-lg' : 'hover:bg-[#141414]/5 text-[#141414]/60'}`
            }
          >
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </NavLink>
          <NavLink 
            to="/admin/inventory" 
            onClick={() => setIsMobileMenuOpen(false)}
            className={({ isActive }) => 
              `flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${isActive ? 'bg-[#141414] text-white shadow-lg' : 'hover:bg-[#141414]/5 text-[#141414]/60'}`
            }
          >
            <ClipboardList className="w-4 h-4" />
            Inventory
          </NavLink>
        </>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-[#FDFCFB] text-[#141414] font-sans flex flex-col">
      <nav className="border-b border-[#141414]/10 bg-white sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-20 items-center">
            <div className="flex items-center gap-4">
              <Link to="/" className="flex items-center gap-2 group">
                <div className="p-2 bg-[#F27D26]/10 rounded-xl">
                  <Pill className="w-6 h-6 text-[#F27D26] group-hover:rotate-12 transition-transform" />
                </div>
                <div className="flex flex-col">
                  <span className="font-bold text-lg tracking-tight leading-none text-[#141414]">AW-PharmaStock</span>
                  <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-[#F27D26]">Pro Edition</span>
                </div>
              </Link>
              
              <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#141414]/10 rounded-full shadow-sm select-none">
                <div className="flex items-center gap-2">
                  <div className={`relative flex h-2 w-2`}>
                    <span className={`absolute inline-flex h-full w-full rounded-full bg-emerald-400 ${isSynced ? 'animate-ping' : 'animate-pulse'} opacity-75`}></span>
                    <span className={`relative inline-flex rounded-full h-2 w-2 bg-emerald-500`}></span>
                  </div>
                  <div className="flex flex-col -space-y-1">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-[#141414]/60">
                      Live Portal
                    </span>
                    <span className="text-[7px] text-[#141414]/30 font-mono uppercase tracking-tighter">
                      Instance Connected
                    </span>
                  </div>
                </div>
              </div>

              <div className="hidden xl:flex items-center gap-2 px-3 py-1 bg-[#F27D26]/5 rounded-full text-[10px] font-bold text-[#F27D26] uppercase tracking-widest border border-[#F27D26]/10">
                <UploadCloud className="w-3 h-3" />
                <span className="opacity-60 mr-1 text-[#141414]">Last Update:</span>
                {lastUpdate ? format(new Date(lastUpdate), 'EEEE, dd-MM-yyyy hh:mm a') : 'No Data Uploaded'}
              </div>
            </div>
            
            {/* Desktop Nav */}
            <div className="hidden lg:flex gap-4 items-center">
              <NavLinks />

              <div className="w-px h-6 bg-[#141414]/10 mx-2" />

              {onLogout ? (
                <button 
                  onClick={onLogout}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-red-500 hover:bg-red-50 transition-all active:scale-95"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              ) : !isAdmin && (
                <Link 
                  to="/admin/login" 
                  className="flex items-center gap-2 px-5 py-2.5 bg-[#141414] text-white border border-[#141414] rounded-xl text-sm font-bold hover:shadow-lg hover:shadow-black/20 transition-all active:scale-95"
                >
                  <ShieldCheck className="w-4 h-4" />
                  Admin Login
                </Link>
              )}
            </div>

            {/* Mobile Menu Toggle */}
            <button 
              className="lg:hidden p-2.5 bg-[#141414]/5 rounded-xl text-[#141414] hover:bg-[#141414]/10 transition-colors"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <XIcon className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Nav Overlay */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="lg:hidden border-t border-[#141414]/10 bg-white overflow-hidden shadow-xl"
            >
              <div className="px-4 pt-4 pb-8 space-y-3">
                <div className="flex lg:hidden items-center justify-between px-4 py-2 border border-[#141414]/10 rounded-xl bg-white shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="relative flex h-2 w-2">
                      <span className={`absolute inline-flex h-full w-full rounded-full bg-emerald-400 ${isSynced ? 'animate-ping' : 'animate-pulse'} opacity-75`}></span>
                      <span className={`relative inline-flex rounded-full h-2 w-2 bg-emerald-500`}></span>
                    </div>
                    <div className="flex flex-col -space-y-0.5">
                      <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#141414]/60">
                        Live Portal
                      </span>
                      <span className="text-[8px] text-[#141414]/40 font-mono font-bold uppercase tracking-widest">Instance Connected</span>
                    </div>
                  </div>
                  <RefreshCw className={`w-3.5 h-3.5 text-[#141414]/20 ${isSynced ? 'animate-spin' : ''}`} />
                </div>

                <div className="flex lg:hidden items-center gap-2 px-4 py-2 bg-[#F27D26]/5 rounded-xl text-[10px] font-bold text-[#F27D26] uppercase tracking-widest border border-[#F27D26]/10">
                  <UploadCloud className="w-3 h-3" />
                  <span className="opacity-60 mr-1 text-[#141414]">Last Update:</span>
                  {lastUpdate ? format(new Date(lastUpdate), 'EEEE, dd-MM-yyyy hh:mm a') : 'No Data Uploaded'}
                </div>
                
                <NavLinks />

                <div className="pt-4 border-t border-[#141414]/10">
                  {onLogout ? (
                    <button 
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        onLogout();
                      }}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-sm font-bold text-red-500 bg-red-50 hover:bg-red-100 transition-all"
                    >
                      <LogOut className="w-4 h-4" />
                      Logout
                    </button>
                  ) : !isAdmin && (
                    <Link 
                      to="/admin/login" 
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-[#141414] text-white rounded-xl text-sm font-bold hover:shadow-lg transition-all"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      Admin Login
                    </Link>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex-grow">
        {children}
      </main>

      <footer className="border-t border-[#141414]/10 py-10 bg-white mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <Link to="/" className="inline-flex items-center gap-2 group mb-6">
            <Pill className="w-5 h-5 text-[#F27D26]/40" />
            <span className="font-bold text-sm tracking-tight text-[#141414]/40">AW-PharmaStock Pro</span>
          </Link>
          <p className="text-[10px] text-[#141414]/30 uppercase tracking-[0.3em] font-bold mb-2">
            Advanced Inventory System
          </p>
          <p className="text-[10px] text-[#141414]/20 font-mono">
            &copy; 2026 Al Wakra & Mesaieed Pharmacy Portals. Protected by IT Security.
          </p>
        </div>
      </footer>
    </div>
  );
}
