import { ReactNode, useState, useEffect } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { Pill, ShieldCheck, ClipboardList, LayoutDashboard, CloudOff, Cloud, Wrench, CalendarDays, Menu, X as XIcon, LogOut, RefreshCw, UploadCloud, Smartphone } from 'lucide-react';
import { format } from 'date-fns';
import { PharmacyLocation, PHARMACY_NAMES } from '../types';
import { db } from '../lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { onSnapshotsInSync } from 'firebase/firestore';
import { useSystemMetadata } from '../lib/useSystemMetadata';
import InstallGuideModal from './InstallGuideModal';

interface LayoutProps {
  children: ReactNode;
  isAdmin?: boolean;
  onLogout?: () => void;
}

export default function Layout({ children, isAdmin, onLogout }: LayoutProps) {
  const [isSynced, setIsSynced] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isInstallGuideOpen, setIsInstallGuideOpen] = useState(false);
  const [isLocalMode, setIsLocalMode] = useState(false);
  const { lastUpdate } = useSystemMetadata();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (window.localStorage.getItem('firestore_fallback') === 'true') {
        window.localStorage.removeItem('firestore_fallback');
      }
      setIsLocalMode(window.sessionStorage.getItem('firestore_fallback') === 'true');
    }
  }, []);

  const handleToggleDatabaseMode = () => {
    if (typeof window !== 'undefined') {
      if (isLocalMode) {
        window.sessionStorage.removeItem('firestore_fallback');
      } else {
        window.sessionStorage.setItem('firestore_fallback', 'true');
      }
      window.location.reload();
    }
  };

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

      <button
        onClick={() => {
          setIsMobileMenuOpen(false);
          setIsInstallGuideOpen(true);
        }}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all hover:bg-[#141414]/5 text-[#141414]/60"
      >
        <Smartphone className="w-4 h-4" />
        Mobile App
      </button>

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
              
              <div className="hidden xl:flex items-center gap-2 px-3 py-1 bg-[#F27D26]/5 rounded-full text-[10px] font-bold text-[#F27D26] uppercase tracking-widest border border-[#F27D26]/10">
                <UploadCloud className="w-3 h-3" />
                <span className="opacity-60 mr-1 text-[#141414]">Last Update:</span>
                {lastUpdate ? format(new Date(lastUpdate), 'EEEE, dd-MM-yyyy hh:mm a').toUpperCase() : 'No Data Uploaded'}
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
                <NavLink 
                  to="/admin/login" 
                  className={({ isActive }) => 
                    `flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${isActive ? 'bg-[#141414] text-white shadow-lg' : 'hover:bg-[#141414]/5 text-[#141414]/60'}`
                  }
                >
                  <ShieldCheck className="w-4 h-4" />
                  Admin Login
                </NavLink>
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
                <div className="flex lg:hidden items-center gap-2 px-4 py-2 bg-[#F27D26]/5 rounded-xl text-[10px] font-bold text-[#F27D26] uppercase tracking-widest border border-[#F27D26]/10">
                  <UploadCloud className="w-3 h-3" />
                  <span className="opacity-60 mr-1 text-[#141414]">Last Update:</span>
                  {lastUpdate ? format(new Date(lastUpdate), 'EEEE, dd-MM-yyyy hh:mm a').toUpperCase() : 'No Data Uploaded'}
                </div>
                
                <NavLinks />

                <button 
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    setIsInstallGuideOpen(true);
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-blue-50 text-blue-600 rounded-xl text-sm font-bold border border-blue-100 transition-all hover:bg-blue-100"
                >
                  <Smartphone className="w-4 h-4" />
                  Add Mobile App to Home Screen
                </button>

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
                    <NavLink 
                      to="/admin/login" 
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={({ isActive }) => 
                        `w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-sm font-bold transition-all ${isActive ? 'bg-[#141414] text-white shadow-lg' : 'hover:bg-[#141414]/5 text-[#141414]/60'}`
                      }
                    >
                      <ShieldCheck className="w-4 h-4" />
                      Admin Login
                    </NavLink>
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
          <div className="mt-8">
            <button 
              onClick={() => setIsInstallGuideOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#141414]/5 text-[#141414]/40 rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-[#141414]/10 transition-all border border-transparent hover:border-[#141414]/10"
            >
              <Smartphone className="w-3 h-3" />
              Download Mobile App Guide
            </button>
          </div>
        </div>
      </footer>

      <InstallGuideModal 
        isOpen={isInstallGuideOpen} 
        onClose={() => setIsInstallGuideOpen(false)} 
      />
    </div>
  );
}
