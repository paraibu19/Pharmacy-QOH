import { ReactNode, useState, useEffect } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { Pill, ShieldCheck, ClipboardList, LayoutDashboard, CloudOff, Cloud, Wrench, CalendarDays, Menu, X as XIcon, LogOut, RefreshCw, UploadCloud, Smartphone } from 'lucide-react';
import { format } from 'date-fns';
import { PharmacyLocation, PHARMACY_NAMES } from '../types';
import { db } from '../lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { onSnapshotsInSync } from 'firebase/firestore';
import { useSystemMetadata } from '../lib/useSystemMetadata';
import { formatSafeDate } from '../lib/formatters';
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

  const NavLinks = ({ isMobile = false }: { isMobile?: boolean }) => (
    <>
      <NavLink 
        to="/" 
        onClick={() => setIsMobileMenuOpen(false)}
        className={({ isActive }) => 
          `flex items-center gap-2 px-4 py-3 sm:py-2.5 rounded-xl text-sm font-bold transition-all ${isMobile ? 'w-full' : ''} ${isActive ? 'bg-[#141414] text-white shadow-lg' : 'hover:bg-[#141414]/5 text-[#141414]/60 bg-[#141414]/[0.02] sm:bg-transparent'}`
        }
      >
        <span className="flex items-center gap-2">
          <ClipboardList className="w-4 h-4" />
          Homepage
        </span>
      </NavLink>

      <NavLink 
        to="/pharmacist" 
        onClick={() => setIsMobileMenuOpen(false)}
        className={({ isActive }) => 
          `flex items-center gap-2 px-4 py-3 sm:py-2.5 rounded-xl text-sm font-bold transition-all ${isMobile ? 'w-full' : ''} ${isActive ? 'bg-[#141414] text-white shadow-lg' : 'hover:bg-[#141414]/5 text-[#141414]/60 bg-[#141414]/[0.02] sm:bg-transparent'}`
        }
      >
        <Pill className="w-4 h-4" />
        Pharmacist
      </NavLink>

      <NavLink 
        to="/order" 
        onClick={() => setIsMobileMenuOpen(false)}
        className={({ isActive }) => 
          `flex items-center gap-2 px-4 py-3 sm:py-2.5 rounded-xl text-sm font-bold transition-all ${isMobile ? 'w-full' : ''} ${isActive ? 'bg-[#141414] text-white shadow-lg' : 'hover:bg-[#141414]/5 text-[#141414]/60 bg-[#141414]/[0.02] sm:bg-transparent'}`
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
              `flex items-center gap-2 px-4 py-3 sm:py-2.5 rounded-xl text-sm font-bold transition-all ${isMobile ? 'w-full' : ''} ${isActive ? 'bg-[#F27D26] text-white shadow-lg' : 'hover:bg-[#141414]/5 text-[#141414]/60 bg-[#141414]/[0.02] sm:bg-transparent'}`
            }
          >
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </NavLink>
          <NavLink 
            to="/admin/inventory" 
            onClick={() => setIsMobileMenuOpen(false)}
            className={({ isActive }) => 
              `flex items-center gap-2 px-4 py-3 sm:py-2.5 rounded-xl text-sm font-bold transition-all ${isMobile ? 'w-full' : ''} ${isActive ? 'bg-[#141414] text-white shadow-lg' : 'hover:bg-[#141414]/5 text-[#141414]/60 bg-[#141414]/[0.02] sm:bg-transparent'}`
            }
          >
            <ClipboardList className="w-4 h-4" />
            Inventory
          </NavLink>
          <NavLink 
            to="/admin/expiry-check" 
            onClick={() => setIsMobileMenuOpen(false)}
            className={({ isActive }) => 
              `flex items-center gap-2 px-4 py-3 sm:py-2.5 rounded-xl text-sm font-bold transition-all ${isMobile ? 'w-full' : ''} ${isActive ? 'bg-[#141414] text-white shadow-lg' : 'hover:bg-[#141414]/5 text-[#141414]/60 bg-[#141414]/[0.02] sm:bg-transparent'}`
            }
          >
            <UploadCloud className="w-4 h-4" />
            Expiry Verification
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
                {formatSafeDate(lastUpdate, 'EEEE, dd-MM-yyyy hh:mm a', 'No Data Uploaded').toUpperCase()}
              </div>
            </div>
            
            {/* Desktop Nav */}
            <div className="hidden lg:flex gap-4 items-center">
              <button 
                onClick={() => {
                  window.location.reload();
                }}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold text-[#F27D26] bg-[#F27D26]/5 hover:bg-[#F27D26]/12 hover:scale-102 transition-all border border-[#F27D26]/10 active:scale-95 shadow-sm"
                title="Refresh App"
              >
                <RefreshCw className="w-4 h-4 animate-hover-spin" />
                <span>Refresh</span>
              </button>

              <div className="w-px h-6 bg-[#141414]/10" />

              <button
                onClick={handleToggleDatabaseMode}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all border ${
                  isLocalMode 
                    ? 'bg-amber-50/80 border-amber-200 text-amber-700 hover:bg-amber-100' 
                    : 'bg-emerald-50/80 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                }`}
                title={isLocalMode ? "Click to switch back to Cloud Firestore" : "Click to switch to Local Offline-First Database"}
              >
                {isLocalMode ? <CloudOff className="w-3.5 h-3.5 text-amber-600" /> : <Cloud className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />}
                <span>{isLocalMode ? 'Local Dev DB' : 'Cloud DB'}</span>
              </button>

              <div className="w-px h-6 bg-[#141414]/10" />

              <button
                onClick={() => setIsInstallGuideOpen(true)}
                className="relative p-2.5 bg-orange-50 hover:bg-orange-100 border border-orange-200/60 rounded-xl text-[#F27D26] transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-sm group"
                title="Connect Phone or PC - View Setup Instructions"
                id="header-install-guide-btn"
              >
                <Smartphone className="w-5 h-5 text-[#F27D26]" />
              </button>

              <div className="w-px h-6 bg-[#141414]/10" />

              <NavLinks />

              {!isAdmin && (
                <>
                  <div className="w-px h-6 bg-[#141414]/10 mx-2" />
                  <NavLink 
                    to="/admin/login" 
                    className={({ isActive }) => 
                      `flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${isActive ? 'bg-[#F27D26] text-white shadow-lg' : 'hover:bg-[#141414]/5 text-[#141414]/60'}`
                    }
                  >
                    <ShieldCheck className="w-4 h-4" />
                    Admin Login
                  </NavLink>
                </>
              )}

              {onLogout && (
                <>
                  <div className="w-px h-6 bg-[#141414]/10 mx-2" />
                  <button 
                    onClick={onLogout}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-red-500 hover:bg-red-50 transition-all active:scale-95"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                </>
              )}
            </div>

            {/* Mobile Actions Container */}
            <div className="lg:hidden flex items-center gap-2">
              <button
                onClick={() => setIsInstallGuideOpen(true)}
                className="relative p-2.5 bg-orange-50 border border-orange-200/60 rounded-xl text-[#F27D26] hover:bg-orange-100 active:scale-95 transition-all cursor-pointer shadow-sm"
                title="Connect Phone or PC - View Setup Instructions"
                id="mobile-install-guide-btn"
              >
                <Smartphone className="w-5 h-5 text-[#F27D26]" />
              </button>

              <button 
                onClick={() => {
                  window.location.reload();
                }}
                className="p-2.5 bg-[#F27D26]/10 rounded-xl text-[#F27D26] hover:bg-[#F27D26]/20 transition-all active:scale-95 border border-[#F27D26]/10"
                title="Refresh App"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
              
              <button 
                className="p-2.5 bg-[#141414]/5 rounded-xl text-[#141414] hover:bg-[#141414]/10 transition-colors"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              >
                {isMobileMenuOpen ? <XIcon className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
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
              <div className="px-4 pt-4 pb-8 space-y-4">
                <div className="flex lg:hidden flex-col gap-1 px-4 py-3 bg-[#F27D26]/5 rounded-xl border border-[#F27D26]/10">
                  <span className="text-[8px] font-bold text-[#F27D26] uppercase tracking-widest">Metadata Reference</span>
                  <div className="flex items-center gap-1.5 text-[9px] font-bold text-[#141414]/60 uppercase">
                    <UploadCloud className="w-3.5 h-3.5 text-[#F27D26]" />
                    <span>Last Update:</span>
                    <span className="text-[#141414] font-black">
                      {formatSafeDate(lastUpdate, 'dd-MM-yyyy hh:mm a', 'NO DATA').toUpperCase()}
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="px-4 text-[9px] font-extrabold uppercase text-[#141414]/30 tracking-wider">Database Environment</span>
                  <button
                    onClick={handleToggleDatabaseMode}
                    className={`w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl text-xs font-bold transition-all border ${
                      isLocalMode 
                        ? 'bg-amber-50 border-amber-200 text-amber-700' 
                        : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isLocalMode ? <CloudOff className="w-4 h-4 text-amber-600" /> : <Cloud className="w-4 h-4 text-emerald-600 animate-pulse" />}
                      <span className="font-extrabold">DB Mode: {isLocalMode ? 'Local Dev (Offline)' : 'Cloud DB (Live)'}</span>
                    </div>
                    <span className="text-[9px] px-2 py-0.5 rounded bg-white/60 font-black border uppercase tracking-widest">Switch</span>
                  </button>
                </div>

                <div className="space-y-1">
                  <span className="px-4 text-[9px] font-extrabold uppercase text-[#141414]/30 tracking-wider">Device Instructions</span>
                  <button
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      setIsInstallGuideOpen(true);
                    }}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl text-xs font-bold transition-all border border-orange-200 bg-orange-50/50 text-[#F27D26] hover:bg-orange-100 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-[#F27D26]" />
                      <span className="font-extrabold">Phone & PC Installation Guide</span>
                    </div>
                    <span className="text-[9px] px-2 py-0.5 rounded bg-white font-black border uppercase tracking-widest text-[#F27D26]">View</span>
                  </button>
                </div>
                
                <div className="space-y-1">
                  <span className="px-4 text-[9px] font-extrabold uppercase text-[#141414]/30 tracking-wider">Navigation Menu</span>
                  <div className="flex flex-col gap-2">
                    <NavLinks isMobile={true} />
                  </div>
                </div>

                {!isAdmin && (
                  <div className="space-y-2 pt-2 border-t border-[#141414]/5">
                    <NavLink 
                      to="/admin/login" 
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={({ isActive }) => 
                        `w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-sm font-bold transition-all ${isActive ? 'bg-[#F27D26] text-white shadow-lg' : 'bg-[#141414]/5 text-[#141414]/60'}`
                      }
                    >
                      <ShieldCheck className="w-4 h-4" />
                      Admin Login
                    </NavLink>
                  </div>
                )}

                {onLogout && (
                  <div className="pt-2 border-t border-[#141414]/5">
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
                  </div>
                )}
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
