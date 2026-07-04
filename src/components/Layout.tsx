import { ReactNode, useState, useEffect } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { Pill, ShieldCheck, ClipboardList, LayoutDashboard, CloudOff, Cloud, Wrench, CalendarDays, Menu, X as XIcon, LogOut, RefreshCw, UploadCloud, Smartphone, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { PharmacyLocation, PHARMACY_NAMES } from '../types';
import { db } from '../lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { onSnapshotsInSync } from 'firebase/firestore';
import { useSystemMetadata } from '../lib/useSystemMetadata';
import { formatSafeDate } from '../lib/formatters';
import InstallGuideModal from './InstallGuideModal';
import { storage, sessionStorage } from '../lib/storage';

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
  const { lastUpdate, isCloudActive } = useSystemMetadata();
  const showAsLocalMode = isLocalMode || !isCloudActive;

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (storage.getItem('firestore_fallback') === 'true') {
        storage.removeItem('firestore_fallback');
      }
      setIsLocalMode(sessionStorage.getItem('firestore_fallback') === 'true');
    }
  }, []);

  const handleToggleDatabaseMode = () => {
    if (typeof window !== 'undefined') {
      if (isLocalMode) {
        sessionStorage.removeItem('firestore_fallback');
        sessionStorage.removeItem('manual_local_mode');
      } else {
        sessionStorage.setItem('firestore_fallback', 'true');
        sessionStorage.setItem('manual_local_mode', 'true');
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

  const NavLinks = ({ variant }: { variant: 'horizontal' | 'vertical-mobile' | 'vertical-sidebar' }) => {
    const isVertical = variant !== 'horizontal';
    
    return (
      <div className={`flex ${variant === 'horizontal' ? 'flex-row gap-2 items-center' : 'flex-col gap-1.5 w-full'}`}>
        <NavLink 
          to="/" 
          onClick={() => setIsMobileMenuOpen(false)}
          className={({ isActive }) => 
            `flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${isVertical ? 'w-full' : ''} ${
              isActive 
                ? 'bg-[#141414] text-white shadow-sm' 
                : 'hover:bg-[#141414]/5 text-[#141414]/60 bg-[#141414]/[0.01]'
            }`
          }
        >
          <ClipboardList className="w-4 h-4 shrink-0" />
          <span>Homepage</span>
        </NavLink>

        <NavLink 
          to="/pharmacist" 
          onClick={() => setIsMobileMenuOpen(false)}
          className={({ isActive }) => 
            `flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${isVertical ? 'w-full' : ''} ${
              isActive 
                ? 'bg-[#141414] text-white shadow-sm' 
                : 'hover:bg-[#141414]/5 text-[#141414]/60 bg-[#141414]/[0.01]'
            }`
          }
        >
          <Pill className="w-4 h-4 shrink-0" />
          <span>Pharmacist</span>
        </NavLink>

        <NavLink 
          to="/order" 
          onClick={() => setIsMobileMenuOpen(false)}
          className={({ isActive }) => 
            `flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${isVertical ? 'w-full' : ''} ${
              isActive 
                ? 'bg-[#141414] text-white shadow-sm' 
                : 'hover:bg-[#141414]/5 text-[#141414]/60 bg-[#141414]/[0.01]'
            }`
          }
        >
          <Wrench className="w-4 h-4 shrink-0" />
          <span>Order</span>
        </NavLink>

        {isAdmin && (
          <>
            <NavLink 
              to="/admin/dashboard" 
              onClick={() => setIsMobileMenuOpen(false)}
              className={({ isActive }) => 
                `flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${isVertical ? 'w-full' : ''} ${
                  isActive 
                    ? 'bg-[#F27D26] text-white shadow-sm' 
                    : 'hover:bg-[#141414]/5 text-[#141414]/60 bg-[#141414]/[0.01]'
                }`
              }
            >
              <LayoutDashboard className="w-4 h-4 shrink-0" />
              <span>Dashboard</span>
            </NavLink>
            <NavLink 
              to="/admin/inventory" 
              onClick={() => setIsMobileMenuOpen(false)}
              className={({ isActive }) => 
                `flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${isVertical ? 'w-full' : ''} ${
                  isActive 
                    ? 'bg-[#141414] text-white shadow-sm' 
                    : 'hover:bg-[#141414]/5 text-[#141414]/60 bg-[#141414]/[0.01]'
                }`
              }
            >
              <ClipboardList className="w-4 h-4 shrink-0" />
              <span>Inventory</span>
            </NavLink>
            <NavLink 
              to="/admin/expiry-check" 
              onClick={() => setIsMobileMenuOpen(false)}
              className={({ isActive }) => 
                `flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${isVertical ? 'w-full' : ''} ${
                  isActive 
                    ? 'bg-[#141414] text-white shadow-sm' 
                    : 'hover:bg-[#141414]/5 text-[#141414]/60 bg-[#141414]/[0.01]'
                }`
              }
            >
              <UploadCloud className="w-4 h-4 shrink-0" />
              <span>Expiry Verification</span>
            </NavLink>
            <NavLink 
              to="/admin/entry-mistakes" 
              onClick={() => setIsMobileMenuOpen(false)}
              className={({ isActive }) => 
                `flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${isVertical ? 'w-full' : ''} ${
                  isActive 
                    ? 'bg-[#141414] text-white shadow-sm' 
                    : 'hover:bg-[#141414]/5 text-[#141414]/60 bg-[#141414]/[0.01]'
                }`
              }
            >
              <AlertCircle className="w-4 h-4 text-[#F27D26] shrink-0" />
              <span>Entry Mistakes</span>
            </NavLink>
            <NavLink 
              to="/admin/application-storage" 
              onClick={() => setIsMobileMenuOpen(false)}
              className={({ isActive }) => 
                `flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${isVertical ? 'w-full' : ''} ${
                  isActive 
                    ? 'bg-[#141414] text-white shadow-sm' 
                    : 'hover:bg-[#141414]/5 text-[#141414]/60 bg-[#141414]/[0.01]'
                }`
              }
            >
              <ShieldCheck className="w-4 h-4 text-indigo-600 animate-pulse shrink-0" />
              <span>Application Storage</span>
            </NavLink>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#FDFCFB] text-[#141414] font-sans flex flex-col lg:flex-row">
      {/* SIDEBAR FOR DESKTOP WINDOWS */}
      <aside className="hidden lg:flex w-72 h-screen sticky top-0 bg-white border-r border-[#141414]/10 p-6 flex-col justify-between overflow-y-auto shrink-0 z-40">
        <div className="flex flex-col">
          {/* Logo / Brand */}
          <div className="flex items-center gap-2 group mb-8">
            <div className="p-2 bg-[#F27D26]/10 rounded-xl">
              <Pill className="w-6 h-6 text-[#F27D26] group-hover:rotate-12 transition-transform" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-lg tracking-tight leading-none text-[#141414]">AW-PharmaStock</span>
              <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-[#F27D26] mt-1.5">Pro Edition</span>
            </div>
          </div>

          {/* Quick Metrics & Actions Widget Box */}
          <div className="space-y-3 mb-6 bg-[#141414]/[0.01] border border-[#141414]/5 rounded-2xl p-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-[8px] font-extrabold text-[#141414]/40 uppercase tracking-widest">Last Update</span>
              <div className="flex items-center gap-1 text-[9px] font-bold text-[#F27D26] uppercase">
                <UploadCloud className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate leading-none">
                  {formatSafeDate(lastUpdate, 'dd-MM-yyyy hh:mm a', 'No Data').toUpperCase()}
                </span>
              </div>
            </div>

            <button
              onClick={handleToggleDatabaseMode}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-[11px] font-bold transition-all border ${
                showAsLocalMode 
                  ? 'bg-amber-50/80 border-amber-200 text-amber-700 hover:bg-amber-100' 
                  : 'bg-emerald-50/80 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
              }`}
              title={showAsLocalMode ? "Switch to Cloud Firestore" : "Switch to Local Offline-First Database"}
            >
              <div className="flex items-center gap-1.5">
                {showAsLocalMode ? <CloudOff className="w-3.5 h-3.5 text-amber-600 shrink-0" /> : <Cloud className="w-3.5 h-3.5 text-emerald-600 animate-pulse shrink-0" />}
                <span>{showAsLocalMode ? 'Local Dev DB' : 'Cloud DB'}</span>
              </div>
              <span className="text-[8px] px-1 py-0.5 rounded bg-white font-extrabold border uppercase tracking-wider leading-none shrink-0">Switch</span>
            </button>

            <div className="grid grid-cols-2 gap-1.5">
              <button 
                onClick={() => window.location.reload()}
                className="flex items-center justify-center gap-1 px-2 py-2 rounded-xl text-[10px] font-bold text-[#F27D26] bg-[#F27D26]/5 hover:bg-[#F27D26]/12 transition-all border border-[#F27D26]/10 active:scale-95"
                title="Refresh App"
              >
                <RefreshCw className="w-3 h-3 shrink-0" />
                <span>Refresh</span>
              </button>
              <button
                onClick={() => setIsInstallGuideOpen(true)}
                className="flex items-center justify-center gap-1 px-2 py-2 bg-orange-50 hover:bg-orange-100 border border-orange-200/60 rounded-xl text-[10px] font-bold text-[#F27D26] transition-all cursor-pointer active:scale-95"
              >
                <Smartphone className="w-3 h-3 shrink-0" />
                <span>Guide</span>
              </button>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="space-y-1.5">
            <span className="text-[9px] font-bold uppercase text-[#141414]/30 tracking-wider">Navigation</span>
            <NavLinks variant="vertical-sidebar" />
          </div>
        </div>

        {/* Sidebar Footer and User Action (Admin Login / Logout) */}
        <div className="mt-8 pt-4 border-t border-[#141414]/10 space-y-3 shrink-0">
          {!isAdmin ? (
            <NavLink 
              to="/admin/login" 
              className={({ isActive }) => 
                `flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all w-full ${
                  isActive ? 'bg-[#F27D26] text-white shadow-lg' : 'hover:bg-[#141414]/5 text-[#141414]/60 bg-[#141414]/[0.02]'
                }`
              }
            >
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Admin Login</span>
            </NavLink>
          ) : (
            onLogout && (
              <button 
                onClick={onLogout}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-red-500 hover:bg-red-50 transition-all w-full active:scale-95 bg-red-50/20"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                <span>Logout</span>
              </button>
            )
          )}
          <div className="text-center">
            <p className="text-[9px] text-[#141414]/30 font-mono tracking-tight leading-none">
              AW-PharmaStock Pro &copy; 2026
            </p>
          </div>
        </div>
      </aside>

      {/* RIGHT SIDE PANELS CONTAINER */}
      <div className="flex-1 flex flex-col min-h-screen overflow-x-hidden">
        {/* Mobile Navigation bar (hidden on lg viewports) */}
        <nav className="lg:hidden border-b border-[#141414]/10 bg-white sticky top-0 z-50 shadow-sm shrink-0">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="flex justify-between h-20 items-center">
              <Link to="/" className="flex items-center gap-2 group">
                <div className="p-2 bg-[#F27D26]/10 rounded-xl">
                  <Pill className="w-6 h-6 text-[#F27D26] group-hover:rotate-12 transition-transform" />
                </div>
                <div className="flex flex-col">
                  <span className="font-bold text-lg tracking-tight leading-none text-[#141414]">AW-PharmaStock</span>
                  <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-[#F27D26]">Pro Edition</span>
                </div>
              </Link>

              {/* Mobile Actions Container */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsInstallGuideOpen(true)}
                  className="relative p-2.5 bg-orange-50 border border-orange-200/60 rounded-xl text-[#F27D26] hover:bg-orange-100 active:scale-95 transition-all cursor-pointer shadow-sm"
                  title="Connect Phone or PC"
                >
                  <Smartphone className="w-5 h-5 text-[#F27D26]" />
                </button>

                <button 
                  onClick={() => window.location.reload()}
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
              <>
                {/* Backdrop */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.4 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="fixed inset-0 bg-black z-40 lg:hidden"
                />

                {/* Side Drawer */}
                <motion.div
                  initial={{ x: '100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '100%' }}
                  transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                  className="fixed top-0 right-0 bottom-0 w-[300px] bg-white z-50 lg:hidden flex flex-col h-screen h-[100dvh] overflow-hidden shadow-2xl border-l border-[#141414]/10"
                >
                  <div className="flex items-center justify-between p-5 border-b border-[#141414]/10 bg-[#FDFCFB] shrink-0">
                    <div className="flex flex-col">
                      <span className="font-bold text-base tracking-tight leading-none text-[#141414]">AW-PharmaStock</span>
                      <span className="text-[9px] uppercase font-bold tracking-[0.2em] text-[#F27D26] mt-1.5">Pro Edition</span>
                    </div>
                    <button 
                      className="p-2 bg-[#141414]/5 rounded-xl text-[#141414] hover:bg-[#141414]/10 transition-colors"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <XIcon className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-6 p-5 custom-scrollbar pb-16 bg-white">
                    <div className="flex flex-col gap-1 px-4 py-3 bg-[#F27D26]/5 rounded-xl border border-[#F27D26]/10">
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
                          showAsLocalMode 
                            ? 'bg-amber-50 border-amber-200 text-amber-700' 
                            : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {showAsLocalMode ? <CloudOff className="w-4 h-4 text-amber-600" /> : <Cloud className="w-4 h-4 text-emerald-600 animate-pulse" />}
                          <span className="font-extrabold">DB Mode: {showAsLocalMode ? 'Local Dev' : 'Cloud DB'}</span>
                        </div>
                        <span className="text-[9px] px-2 py-0.5 rounded bg-white font-black border uppercase tracking-widest">Switch</span>
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
                        <NavLinks variant="vertical-mobile" />
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
              </>
            )}
          </AnimatePresence>
        </nav>

        {/* Main Content Pane */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex-grow min-w-0 max-w-full">
          {children}
        </main>

        {/* Layout Footer */}
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
                <Smartphone className="w-3" />
                Download Mobile App Guide
              </button>
            </div>
          </div>
        </footer>
      </div>

      <InstallGuideModal 
        isOpen={isInstallGuideOpen} 
        onClose={() => setIsInstallGuideOpen(false)} 
      />
    </div>
  );
}
