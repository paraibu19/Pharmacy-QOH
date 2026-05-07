import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, Download, MapPin, Sparkles, Filter, Loader2, X as XIcon, 
  RefreshCw, ArrowUpDown, AlertTriangle, FileSpreadsheet, KeyRound, 
  Key, Eye, EyeOff, Lock, LogOut, ThermometerSnowflake
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PharmacyLocation, PHARMACY_NAMES, Medication } from '../types';
import { LOCATIONS } from '../constants';
import { format, differenceInDays } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { useMedications } from '../hooks/useMedications';
import { formatNumber } from '../lib/formatters';
import { technicianAuthOps } from '../lib/firebaseOperations';
import LinkedItemsModal from '../components/LinkedItemsModal';

type SortField = 'itemName' | 'itemCode' | 'qoh' | 'isNew' | 'expiration1' | 'expiration2' | 'expiration3';
type SortOrder = 'asc' | 'desc';

export default function UserHome() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [persistedPassword, setPersistedPassword] = useState('pharmacist123');
  const [authError, setAuthError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [selectedLocation, setSelectedLocation] = useState<PharmacyLocation>(PharmacyLocation.ADULT);
  const [searchQuery, setSearchQuery] = useState('');
  const [availableGenericsOnly, setAvailableGenericsOnly] = useState(false);
  const [availableBrandsOnly, setAvailableBrandsOnly] = useState(false);
  const [stockFilter, setStockFilter] = useState<'all' | 'in' | 'low' | 'out'>('all');
  const [expStart, setExpStart] = useState('');
  const [expEnd, setExpEnd] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  
  const [sortField, setSortField] = useState<SortField>('itemName');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showSyncPulse, setShowSyncPulse] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedMedForLinks, setSelectedMedForLinks] = useState<Medication | null>(null);
  
  // Password change states
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isAdminVerified, setIsAdminVerified] = useState(false);
  const [adminPasswordAttempt, setAdminPasswordAttempt] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changeError, setChangeError] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  
  const { medications, loading, error: fetchError, refresh, lastSynced, isSyncing } = useMedications(selectedLocation);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (fetchError) {
      setError(`Fetch Error: ${fetchError}`);
    }
  }, [fetchError]);

  // Visual feedback for real-time sync
  useEffect(() => {
    setShowSyncPulse(true);
    const timer = setTimeout(() => setShowSyncPulse(false), 2000);
    return () => clearTimeout(timer);
  }, [lastSynced]);

  useEffect(() => {
    technicianAuthOps.getPassword('pharmacist')
      .then(setPersistedPassword)
      .catch(() => setPersistedPassword('pharmacist123'));
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === persistedPassword) {
      setIsAuthenticated(true);
      setAuthError('');
    } else {
      setAuthError('Invalid password. Access denied.');
    }
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const suggestions = useMemo(() => {
    if (searchQuery.length < 1) return [];
    const lowerQuery = searchQuery.toLowerCase();
    return medications.filter(m => 
      m.itemCode.toLowerCase().startsWith(lowerQuery) || 
      m.itemName.toLowerCase().startsWith(lowerQuery) ||
      (m.generic && m.generic.toLowerCase().startsWith(lowerQuery))
    ).slice(0, 5); // Limit suggestions
  }, [medications, searchQuery]);

  const parseExpDate = (dateStr: string) => {
    if (!dateStr || dateStr === '-' || dateStr === '.') return null;
    try {
      // Try parsing dd-mm-yyyy explicitly first
      const parts = dateStr.split(/[-/.]/);
      if (parts.length === 3) {
        const d = parseInt(parts[0]);
        const m = parseInt(parts[1]);
        const y = parseInt(parts[2]);
        // Handle 2-digit years if they appear
        const fullYear = y < 100 ? 2000 + y : y;
        const date = new Date(fullYear, m - 1, d);
        if (!isNaN(date.getTime())) return date;
      } else if (parts.length === 2) {
        // Handle mm-yyyy
        const m = parseInt(parts[0]);
        const y = parseInt(parts[1]);
        const fullYear = y < 100 ? 2000 + y : y;
        const date = new Date(fullYear, m - 1, 1);
        if (!isNaN(date.getTime())) return date;
      }
      
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) return d;
    } catch { }
    return null;
  };

  const filteredMeds = useMemo(() => {
    let result = medications;
    
    if (searchQuery.length >= 1) {
      const lowerQuery = searchQuery.toLowerCase();
      result = result.filter(m => 
        m.itemCode.toLowerCase().includes(lowerQuery) || 
        m.itemName.toLowerCase().includes(lowerQuery) ||
        (m.generic && m.generic.toLowerCase().includes(lowerQuery)) ||
        (lowerQuery === 'refrig' && m.isRefrigerated) ||
        (lowerQuery === 'refridge' && m.isRefrigerated) ||
        (lowerQuery === 'refrigerated' && m.isRefrigerated)
      );
    }

    if (availableGenericsOnly) {
      result = result.filter(m => m.generic && m.qoh > 0);
    }

    if (availableBrandsOnly) {
      result = result.filter(m => m.to && m.qoh > 0);
    }

    if (stockFilter !== 'all') {
      result = result.filter(m => {
        const isOut = m.qoh <= 0;
        const isLow = !isOut && m.maxQty > 0 && m.qoh < m.maxQty * 0.3;
        const isIn = !isOut && !isLow;
        
        if (stockFilter === 'in') return isIn;
        if (stockFilter === 'low') return isLow;
        if (stockFilter === 'out') return isOut;
        return true;
      });
    }

    if (expStart || expEnd) {
      const start = expStart ? new Date(expStart) : null;
      const end = expEnd ? new Date(expEnd) : null;

      result = result.filter(m => {
        const dates = [m.expiration1, m.expiration2, m.expiration3]
          .map(parseExpDate)
          .filter(d => d !== null) as Date[];

        if (dates.length === 0) return !expStart && !expEnd;

        return dates.some(d => {
          let matches = true;
          if (start && d < start) matches = false;
          if (end && d > end) matches = false;
          return matches;
        });
      });
    }
    
    const mapped = result.map(m => ({
      ...m,
      isNew: m.addedAt ? differenceInDays(new Date(), (m.addedAt as any).toDate?.() || new Date(m.addedAt)) < 10 : false
    }));

    return mapped.sort((a, b) => {
      const multiplier = sortOrder === 'asc' ? 1 : -1;
      
      if (sortField === 'qoh') {
        return (a.qoh - b.qoh) * multiplier;
      }
      
      if (sortField === 'isNew') {
        return (Number(b.isNew) - Number(a.isNew)) * multiplier;
      }

      if (sortField.startsWith('expiration')) {
        const dateA = parseExpDate(a[sortField as keyof Medication] as string);
        const dateB = parseExpDate(b[sortField as keyof Medication] as string);
        
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1 * multiplier;
        if (!dateB) return -1 * multiplier;
        
        return (dateA.getTime() - dateB.getTime()) * multiplier;
      }

      return a[sortField as keyof typeof a].localeCompare(b[sortField as keyof typeof b]) * multiplier;
    });
  }, [medications, searchQuery, availableGenericsOnly, availableBrandsOnly, stockFilter, expStart, expEnd, sortField, sortOrder]);

  const availableGenericsCount = useMemo(() => {
    return medications.filter(m => m.generic && m.qoh > 0).length;
  }, [medications]);

  const availableBrandsCount = useMemo(() => {
    return medications.filter(m => m.to && m.qoh > 0).length;
  }, [medications]);

  // Handle PDF Export
  const downloadCSV = () => {
    const headers = ['Item Code', 'Item Name', 'QOH', 'Exp 1', 'Exp 2', 'Exp 3', 'Status'];
    const rows = filteredMeds.map(m => [
      m.itemCode,
      m.itemName,
      formatNumber(m.qoh),
      m.expiration1 || '-',
      m.expiration2 || '-',
      m.expiration3 || '-',
      (m.qoh <= 0) ? 'Out of Stock' : (m.maxQty > 0 && m.qoh < m.maxQty * 0.3) ? 'Low Stock' : 'In Stock'
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(r => r.map(field => `"${String(field).replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    const locationName = LOCATIONS.find(l => l.id === selectedLocation)?.name || selectedLocation;
    link.setAttribute("href", url);
    link.setAttribute("download", `${locationName}_Inventory_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadExcel = () => {
    const headers = ['Item Code', 'Item Name', 'QOH', 'Exp 1', 'Exp 2', 'Exp 3', 'Status'];
    const data = filteredMeds.map(m => ({
      'Item Code': m.itemCode,
      'Item Name': m.itemName,
      'QOH': m.qoh,
      'Exp 1': m.expiration1 || '-',
      'Exp 2': m.expiration2 || '-',
      'Exp 3': m.expiration3 || '-',
      'Status': (m.qoh <= 0) ? 'Out of Stock' : (m.maxQty > 0 && m.qoh < m.maxQty * 0.3) ? 'Low Stock' : 'In Stock'
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventory");
    
    const locationName = LOCATIONS.find(l => l.id === selectedLocation)?.name || selectedLocation;
    XLSX.writeFile(wb, `${locationName}_Inventory_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const downloadPDF = () => {
    const doc = new jsPDF();
    const locationName = PHARMACY_NAMES[selectedLocation];
    const displayDate = format(new Date(), "eeee, dd-MM-yyyy, hh:mm a");

    doc.setFontSize(18);
    doc.text(locationName, 14, 15);
    doc.setFontSize(10);
    doc.text(`Last Updated: ${displayDate}`, 14, 22);

    const tableData = filteredMeds.map(m => [
      m.itemCode,
      m.itemName,
      formatNumber(m.qoh),
      m.expiration1 || '-',
      m.expiration2 || '-',
      m.expiration3 || '-',
      m.isNew ? 'NEW' : 'Existing'
    ]);

    autoTable(doc, {
      startY: 30,
      head: [['Code', 'Name', 'QOH', 'Exp 1', 'Exp 2', 'Exp 3', 'Status']],
      body: tableData,
      headStyles: { fillColor: [20, 20, 20] },
      alternateRowStyles: { fillColor: [245, 245, 245] },
    });

    doc.save(`${locationName}_Inventory_${format(new Date(), 'yyyyMMdd')}.pdf`);
  };

  const handleVerifyAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    const currentAdminPassword = localStorage.getItem('adminPassword') || 'admin123';
    if (adminPasswordAttempt.trim() === currentAdminPassword) {
      setIsAdminVerified(true);
      setChangeError('');
      setAdminPasswordAttempt('');
    } else {
      setChangeError('Invalid Admin Password');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 4) {
      setChangeError('Minimum 4 characters required.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setChangeError('Passwords do not match.');
      return;
    }

    setIsSavingPassword(true);
    try {
      await technicianAuthOps.updatePassword('pharmacist', newPassword);
      setIsChangingPassword(false);
      setIsAdminVerified(false);
      setNewPassword('');
      setConfirmPassword('');
      setChangeError('');
      setPersistedPassword(newPassword);
    } catch (err) {
      setChangeError('Failed to update password.');
    } finally {
      setIsSavingPassword(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white p-8 rounded-3xl border border-[#141414]/10 shadow-xl"
        >
          <div className="w-16 h-16 bg-[#F27D26]/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Lock className="w-8 h-8 text-[#F27D26]" />
          </div>
          <h1 className="text-2xl font-bold text-center mb-2">Pharmacist Access</h1>
          <p className="text-[#141414]/50 text-center text-sm mb-8">Please enter the security password</p>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">Password</label>
              <div className="relative">
                <input 
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-4 pr-12 py-3 bg-[#141414]/5 border-none rounded-xl focus:ring-2 focus:ring-[#F27D26]/20 transition-all font-medium"
                  placeholder="••••••••"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-[#141414]/20 hover:text-[#141414]/40 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {authError && (
                <div className="mt-2 px-1">
                  <p className="text-red-500 text-xs font-bold">{authError}</p>
                </div>
              )}
            </div>
            
            <button 
              type="submit"
              className="w-full py-4 bg-[#141414] text-white rounded-xl font-bold hover:bg-[#F27D26] transition-all flex items-center justify-center gap-2"
            >
              Sign In
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Hero / Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 md:gap-6">
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Pharmacist View</h1>
                <div className="px-3 py-1 bg-[#141414]/5 rounded-full text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest border border-[#141414]/5">
                  {format(new Date(), 'eeee, dd-MM-yyyy')}
                </div>
              </div>
              <p className="text-[#141414]/60 max-w-xl text-sm md:text-base">
                Real-time medication availability at Alwakra emergency pharmacies and Mesaieed OPD pharmacy.
              </p>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2 w-full md:w-auto">
            <button 
              onClick={() => setIsAuthenticated(false)}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-red-100 rounded-full text-[10px] font-bold uppercase tracking-widest text-red-500 hover:bg-red-50 transition-all shadow-sm"
            >
              <LogOut className="w-3 h-3" />
              Logout
            </button>
            <button 
              onClick={() => refresh(true)}
            disabled={isSyncing}
            className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-3 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all relative ${
              showSyncPulse 
                ? 'bg-[#141414]/10 text-[#141414] border border-[#141414]/20 shadow-sm' 
                : 'bg-[#141414]/5 text-[#141414]/60 border border-[#141414]/10'
            }`}
          >
            {isSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            {showSyncPulse ? 'Live Updated' : `Synced ${format(lastSynced, 'HH:mm:ss')}`}
          </button>

          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold transition-all ${
              showFilters || availableGenericsOnly || stockFilter !== 'all' || expStart || expEnd
              ? 'bg-[#F27D26] text-white shadow-lg shadow-[#F27D26]/20'
              : 'bg-white border border-[#141414]/10 text-[#141414]/60 hover:bg-[#141414]/5'
            }`}
          >
            <Filter className="w-4 h-4" />
            <span className="hidden sm:inline">{showFilters ? 'Hide' : 'Show'} Filters</span>
            <span className="sm:hidden">Filters</span>
            {(availableGenericsOnly || stockFilter !== 'all' || expStart || expEnd) && (
              <span className="ml-1 w-2 h-2 bg-white rounded-full animate-pulse" />
            )}
          </button>
          
          <div className="flex bg-white border border-[#141414]/10 rounded-full p-1 shadow-sm">
            <button 
              onClick={() => {
                setIsChangingPassword(true);
                setIsAdminVerified(false);
                setAdminPasswordAttempt('');
                setChangeError('');
              }}
              title="Security Settings"
              className="p-2 hover:bg-[#F27D26]/10 hover:text-[#F27D26] rounded-full transition-colors text-[#141414]/60 mr-1"
            >
              <KeyRound className="w-4 h-4" />
            </button>
            <button 
              onClick={downloadPDF}
              title="Download PDF"
              className="p-2 hover:bg-[#141414]/5 rounded-full transition-colors text-[#141414]/60"
            >
              <Download className="w-4 h-4" />
            </button>
            <button 
              onClick={downloadCSV}
              title="Download CSV"
              className="p-2 hover:bg-[#141414]/5 rounded-full transition-colors text-[#141414]/60 border-l border-[#141414]/5"
            >
              <FileSpreadsheet className="w-4 h-4" />
            </button>
            <button 
              onClick={downloadExcel}
              title="Download Excel"
              className="p-2 hover:bg-[#141414]/5 rounded-full transition-colors text-[#141414]/60 border-l border-[#141414]/5"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            </button>
          </div>
        </div>
      </div>

      {/* Active Filters Bar */}
      {(availableGenericsOnly || availableBrandsOnly || stockFilter !== 'all' || expStart || expEnd) && (
        <div className="flex flex-wrap items-center gap-2 p-3 bg-[#F27D26]/5 rounded-xl border border-[#F27D26]/10 animate-in slide-in-from-top-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#F27D26]/60 flex items-center gap-2">
            <Filter className="w-3 h-3" />
            Active Filters:
          </span>
          {stockFilter !== 'all' && (
            <span className="px-2 py-1 bg-white rounded-lg text-[10px] font-bold shadow-sm border border-[#F27D26]/10">
              Stock: <span className="text-[#F27D26] uppercase">{stockFilter}</span>
            </span>
          )}
          {availableGenericsOnly && (
            <span className="px-2 py-1 bg-white rounded-lg text-[10px] font-bold shadow-sm flex items-center gap-1.5 border border-[#F27D26]/10">
              In-Stock Generics
            </span>
          )}
          {availableBrandsOnly && (
            <span className="px-2 py-1 bg-white rounded-lg text-[10px] font-bold shadow-sm flex items-center gap-1.5 border border-[#F27D26]/10">
              Available Brands
            </span>
          )}
          {(expStart || expEnd) && (
            <span className="px-2 py-1 bg-white rounded-lg text-[10px] font-bold shadow-sm flex items-center gap-1.5 border border-[#F27D26]/10">
              Expiry: <span className="text-[#F27D26]">{expStart || 'Any'}</span> – <span className="text-[#F27D26]">{expEnd || 'Any'}</span>
            </span>
          )}
          <button 
            onClick={() => { setAvailableGenericsOnly(false); setAvailableBrandsOnly(false); setStockFilter('all'); setExpStart(''); setExpEnd(''); }}
            className="ml-auto text-[10px] font-bold text-red-500 hover:underline"
          >
            Clear All
          </button>
        </div>
      )}

      {/* Controls */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center bg-white p-4 md:p-6 rounded-2xl border border-[#141414]/10 shadow-sm">
          <div className="lg:col-span-1">
            <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-[#141414]/40 mb-2 ml-1">
              Select Pharmacy Location
            </label>
            <div className="flex flex-wrap gap-2">
              {LOCATIONS.map(loc => (
                <button
                  key={loc.id}
                  onClick={() => setSelectedLocation(loc.id as PharmacyLocation)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all ${
                    selectedLocation === loc.id 
                      ? loc.id === PharmacyLocation.ADULT
                        ? 'bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-md shadow-emerald-700/10'
                        : loc.id === PharmacyLocation.PEDIATRIC
                          ? 'bg-sky-100 text-sky-700 border border-sky-200 shadow-md shadow-sky-700/10'
                          : loc.id === PharmacyLocation.MESAIEED
                            ? 'bg-orange-100 text-orange-700 border border-orange-200 shadow-md shadow-orange-700/10'
                            : 'bg-[#F27D26] text-white shadow-md shadow-[#F27D26]/20' 
                      : 'bg-[#141414]/5 text-[#141414]/60 hover:bg-[#141414]/10'
                  }`}
                >
                  <MapPin className="w-3 h-3" />
                  {loc.id === PharmacyLocation.ADULT ? 'Adult' : loc.id === PharmacyLocation.PEDIATRIC ? 'Pediatric' : 'Mesaieed'}
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2 relative">
            <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-[#141414]/40 mb-2 ml-1">
              Search Medication (Code or Name)
            </label>
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#141414]/30 group-focus-within:text-[#F27D26] transition-colors" />
              <input
                type="text"
                placeholder="Start typing item code or name..."
                value={searchQuery}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-[#141414]/5 border border-transparent rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F27D26]/20 focus:border-[#F27D26] transition-all placeholder:text-[#141414]/30 text-sm font-medium"
              />
              {searchQuery && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-1.5 px-2 py-0.5 bg-[#141414]/5 rounded text-[10px] font-bold text-[#141414]/40">
                  <Filter className="w-3 h-3" />
                  {formatNumber(filteredMeds.length)} Match
                </div>
              )}

              <AnimatePresence>
                {showSuggestions && suggestions.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute left-0 right-0 top-full mt-2 bg-white border border-[#141414]/10 rounded-xl shadow-xl z-50 overflow-hidden"
                  >
                    {suggestions.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          setSearchQuery(s.itemName);
                          setShowSuggestions(false);
                        }}
                        className="w-full px-4 py-3 text-left hover:bg-[#141414]/5 flex items-center justify-between transition-colors border-b border-[#141414]/5 last:border-0"
                      >
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-[#141414]">{s.itemName}</span>
                            {s.isRefrigerated && (
                              <ThermometerSnowflake size={10} className="text-blue-500" />
                            )}
                          </div>
                          <span className="text-[10px] font-mono text-[#141414]/40">{s.itemCode}</span>
                        </div>
                        <div className="text-[10px] font-bold text-[#F27D26] bg-[#F27D26]/10 px-2 py-0.5 rounded-full">
                          {formatNumber(s.qoh)} in stock
                        </div>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="flex flex-col gap-4 bg-[#141414]/5 p-4 rounded-2xl border border-[#141414]/10">
                <div className="flex flex-wrap gap-2">
                  <span className="w-full text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 mb-1 ml-1">Stock Status</span>
                  {[
                    { id: 'all', label: 'All', color: 'gray' },
                    { id: 'in', label: 'In Stock', color: 'emerald' },
                    { id: 'low', label: 'Low Stock', color: 'amber' },
                    { id: 'out', label: 'Out of Stock', color: 'red' }
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setStockFilter(f.id as any)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                        stockFilter === f.id
                          ? f.id === 'in' ? 'bg-emerald-500 text-white border-emerald-500' :
                            f.id === 'low' ? 'bg-amber-500 text-white border-amber-500' :
                            f.id === 'out' ? 'bg-red-500 text-white border-red-500' :
                            'bg-[#141414] text-white border-[#141414]'
                          : 'bg-white text-[#141414]/60 border-[#141414]/10 hover:bg-[#141414]/5'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 pt-4 border-t border-[#141414]/5">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 ml-1">
                      Generics filter
                    </label>
                    <button
                      onClick={() => setAvailableGenericsOnly(!availableGenericsOnly)}
                      className={`w-full px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                        availableGenericsOnly 
                          ? 'bg-yellow-400 text-white shadow-lg ring-2 ring-yellow-400/20' 
                          : 'bg-yellow-50 text-yellow-700 border border-yellow-100 hover:bg-yellow-100'
                      }`}
                    >
                      <Sparkles className="w-4 h-4" />
                      Available Generics ({availableGenericsCount})
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 ml-1">
                      Brands filter
                    </label>
                    <button
                      onClick={() => setAvailableBrandsOnly(!availableBrandsOnly)}
                      className={`w-full px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                        availableBrandsOnly 
                          ? 'bg-orange-400 text-white shadow-lg ring-2 ring-orange-400/20' 
                          : 'bg-orange-50 text-orange-700 border border-orange-100 hover:bg-orange-100'
                      }`}
                    >
                      <Sparkles className="w-4 h-4" />
                      Available Brands ({availableBrandsCount})
                    </button>
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 ml-1">
                      Exp. Range (Start)
                    </label>
                    <input
                      type="date"
                      value={expStart}
                      onChange={(e) => setExpStart(e.target.value)}
                      className="w-full px-4 py-2.5 bg-white border border-[#141414]/10 rounded-xl text-sm focus:ring-2 focus:ring-[#F27D26]/20 transition-all font-medium"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 ml-1">
                      Exp. Range (End)
                    </label>
                    <input
                      type="date"
                      value={expEnd}
                      onChange={(e) => setExpEnd(e.target.value)}
                      className="w-full px-4 py-2.5 bg-white border border-[#101414]/10 rounded-xl text-sm focus:ring-2 focus:ring-[#F27D26]/20 transition-all font-medium"
                    />
                  </div>

                  <div className="flex items-end">
                    <button
                      onClick={() => {
                        setAvailableGenericsOnly(false);
                        setStockFilter('all');
                        setExpStart('');
                        setExpEnd('');
                        setSearchQuery('');
                      }}
                      className="w-full h-10 flex items-center justify-center gap-2 bg-white border border-red-100 text-red-500 rounded-xl text-xs font-bold hover:bg-red-50 transition-all"
                    >
                      <XIcon className="w-4 h-4" />
                      Reset
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Security Modal */}
      <AnimatePresence>
        {isChangingPassword && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white p-8 rounded-3xl shadow-2xl max-w-sm w-full"
            >
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#F27D26]/10 text-[#F27D26] rounded-xl flex items-center justify-center">
                    {isAdminVerified ? <KeyRound className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
                  </div>
                  <h3 className="text-xl font-bold">Portal Security</h3>
                </div>
                <button 
                  onClick={() => setIsChangingPassword(false)}
                  className="p-2 hover:bg-[#141414]/5 rounded-full transition-colors"
                >
                  <XIcon className="w-5 h-5 text-[#141414]/20" />
                </button>
              </div>

              {!isAdminVerified ? (
                <form onSubmit={handleVerifyAdmin} className="space-y-4">
                  <div className="p-4 bg-[#F27D26]/5 rounded-2xl border border-[#F27D26]/10 mb-4">
                    <p className="text-[10px] font-bold text-[#F27D26] uppercase tracking-widest leading-relaxed">
                      Admin authorization required to modify portal access.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">Admin Password</label>
                    <div className="relative">
                      <input 
                        type={showAdminPassword ? "text" : "password"}
                        value={adminPasswordAttempt}
                        onChange={(e) => setAdminPasswordAttempt(e.target.value)}
                        className="w-full px-4 py-3 bg-[#141414]/5 border-none rounded-xl focus:ring-2 focus:ring-[#F27D26]/20 transition-all font-bold tracking-widest text-sm"
                        placeholder="••••••••"
                        required
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setShowAdminPassword(!showAdminPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#141414]/20 hover:text-[#141414]/40"
                      >
                        {showAdminPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {changeError && (
                    <p className="text-red-500 text-[10px] font-bold uppercase tracking-tight">{changeError}</p>
                  )}

                  <button 
                    type="submit"
                    className="w-full py-4 bg-[#141414] text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-[#F27D26] transition-all flex items-center justify-center gap-2"
                  >
                    Verify Admin
                  </button>
                </form>
              ) : (
                <form onSubmit={handleChangePassword} className="space-y-4">
                  <p className="text-[10px] font-extrabold text-[#F27D26] uppercase tracking-[0.2em] mb-4">
                    CHANGING PORTAL ACCESS
                  </p>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">New Password</label>
                    <div className="relative">
                      <input 
                        type={showPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full px-4 py-3 bg-[#141414]/5 border-none rounded-xl focus:ring-2 focus:ring-[#F27D26]/20 transition-all font-bold tracking-widest text-sm"
                        placeholder="••••"
                        required
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#141414]/20 hover:text-[#141414]/40"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">Confirm Password</label>
                    <input 
                      type={showPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-4 py-3 bg-[#141414]/5 border-none rounded-xl focus:ring-2 focus:ring-[#F27D26]/20 transition-all font-bold tracking-widest text-sm"
                      placeholder="••••"
                      required
                    />
                  </div>

                  {changeError && (
                    <p className="text-red-500 text-[10px] font-bold uppercase tracking-tight">{changeError}</p>
                  )}

                  <button 
                    type="submit"
                    disabled={isSavingPassword}
                    className="w-full py-4 bg-[#141414] text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-[#F27D26] transition-all disabled:opacity-20 flex items-center justify-center gap-2"
                  >
                    {isSavingPassword ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>Update Access Code</>
                    )}
                  </button>
                </form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content View - Table on desktop, Cards on mobile */}
      <div className="bg-white rounded-2xl border border-[#141414]/10 shadow-sm overflow-hidden min-h-[400px]">
        {/* Desktop View Table */}
        <div className="hidden md:block overflow-x-auto max-h-[75vh]">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-20 bg-white shadow-sm">
              <tr className="bg-[#141414]/5 border-b border-[#141414]/10">
                <th 
                  className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 cursor-pointer hover:bg-[#141414]/5 transition-colors sticky top-0 bg-[#F9F9F9]"
                  onClick={() => toggleSort('isNew')}
                >
                  <div className="flex items-center gap-1">
                    Status
                    {sortField === 'isNew' && <ArrowUpDown className="w-3 h-3 text-[#F27D26]" />}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 cursor-pointer hover:bg-[#141414]/5 transition-colors sticky top-0 bg-[#F9F9F9]"
                  onClick={() => toggleSort('itemCode')}
                >
                  <div className="flex items-center gap-1">
                    Item Code
                    {sortField === 'itemCode' && <ArrowUpDown className="w-3 h-3 text-[#F27D26]" />}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 cursor-pointer hover:bg-[#141414]/5 transition-colors sticky top-0 bg-[#F9F9F9]"
                  onClick={() => toggleSort('itemName')}
                >
                  <div className="flex items-center gap-1">
                    Item Name
                    {sortField === 'itemName' && <ArrowUpDown className="w-3 h-3 text-[#F27D26]" />}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 cursor-pointer hover:bg-[#141414]/5 transition-colors sticky top-0 bg-[#F9F9F9]"
                  onClick={() => toggleSort('qoh')}
                >
                  <div className="flex items-center gap-1">
                    QOH
                    {sortField === 'qoh' && <ArrowUpDown className="w-3 h-3 text-[#F27D26]" />}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 cursor-pointer hover:bg-[#141414]/5 transition-colors sticky top-0 bg-[#F9F9F9]"
                  onClick={() => toggleSort('expiration1')}
                >
                  <div className="flex items-center gap-1">
                    Exp 1
                    {sortField === 'expiration1' && <ArrowUpDown className="w-3 h-3 text-[#F27D26]" />}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 cursor-pointer hover:bg-[#141414]/5 transition-colors sticky top-0 bg-[#F9F9F9]"
                  onClick={() => toggleSort('expiration2')}
                >
                  <div className="flex items-center gap-1">
                    Exp 2
                    {sortField === 'expiration2' && <ArrowUpDown className="w-3 h-3 text-[#F27D26]" />}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 cursor-pointer hover:bg-[#141414]/5 transition-colors sticky top-0 bg-[#F9F9F9]"
                  onClick={() => toggleSort('expiration3')}
                >
                  <div className="flex items-center gap-1">
                    Exp 3
                    {sortField === 'expiration3' && <ArrowUpDown className="w-3 h-3 text-[#F27D26]" />}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#141414]/5">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-2 opacity-50">
                      <Loader2 className="w-8 h-8 animate-spin text-[#F27D26]" />
                      <p className="font-bold text-xs uppercase tracking-widest">Loading Inventory...</p>
                    </div>
                  </td>
                </tr>
              )}
              <AnimatePresence mode="popLayout">
                {!loading && filteredMeds.map((med) => (
                  <motion.tr 
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    key={med.id} 
                    className="hover:bg-[#141414]/[0.02] transition-colors group"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      {med.isNew ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#F27D26]/10 text-[#F27D26] text-[10px] font-bold rounded-full">
                          <Sparkles className="w-3 h-3" />
                          NEW
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-[#141414]/20 ml-2">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm font-mono font-medium text-[#141414]/80">{med.itemCode}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        {med.imageUrl && (
                          <button 
                            onClick={() => setSelectedImage(med.imageUrl!)}
                            className="w-10 h-10 bg-[#141414]/5 rounded-xl border border-[#141414]/10 overflow-hidden hover:scale-105 transition-transform"
                          >
                            <img src={med.imageUrl} alt={med.itemName} className="w-full h-full object-cover" />
                          </button>
                        )}
                        <button 
                          onClick={() => med.to ? setSelectedMedForLinks(med) : null}
                          className={`flex flex-col text-left transition-all ${med.to ? 'cursor-pointer hover:opacity-80 group/link' : 'cursor-default'}`}
                        >
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-bold text-[#141414] ${med.to ? 'group-hover/link:text-[#F27D26]' : ''}`}>{med.itemName}</span>
                              {med.to && (
                                <ArrowUpDown size={10} className="text-[#F27D26] animate-pulse" />
                              )}
                            </div>
                            {med.isRefrigerated && (
                              <div className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-100/50 text-blue-700 rounded-md text-[9px] font-black uppercase tracking-tighter w-fit border border-blue-200/50 shadow-sm">
                                <ThermometerSnowflake size={10} className="text-blue-500" />
                                REFRIGERATED
                              </div>
                            )}
                          </div>
                          {med.generic && (
                            <span className="text-[10px] italic text-[#141414]/40 leading-tight group-hover/link:text-[#F27D26]/60 transition-colors">{med.generic}</span>
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <span className={`text-sm font-bold ${
                          med.qoh <= 0 
                            ? 'text-red-600' 
                            : (med.maxQty > 0 && med.qoh < med.maxQty * 0.3)
                            ? 'text-amber-600'
                            : 'text-emerald-600'
                        }`}>
                          {formatNumber(med.qoh)}
                        </span>
                        <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded w-fit ${
                          med.qoh <= 0 ? 'bg-red-100 text-red-600' : (med.maxQty > 0 && med.qoh < med.maxQty * 0.3) ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'
                        }`}>
                          {med.qoh <= 0 ? 'Out of Stock' : (med.maxQty > 0 && med.qoh < med.maxQty * 0.3 ? 'Low Stock' : 'In Stock')}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs font-medium text-[#141414]/60">{med.expiration1 || '-'}</td>
                    <td className="px-6 py-4 text-xs font-medium text-[#141414]/60">{med.expiration2 || '-'}</td>
                    <td className="px-6 py-4 text-xs font-medium text-[#141414]/60">{med.expiration3 || '-'}</td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {/* Mobile View Cards */}
        <div className="md:hidden divide-y divide-[#141414]/5">
          {loading && (
            <div className="p-12 text-center flex flex-col items-center gap-2 opacity-50">
              <Loader2 className="w-8 h-8 animate-spin text-[#F27D26]" />
              <p className="font-bold text-xs uppercase tracking-widest">Loading Inventory...</p>
            </div>
          )}
          
          <AnimatePresence mode="popLayout">
            {!loading && filteredMeds.map((med) => (
              <motion.div 
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                key={med.id}
                className="p-4 space-y-3"
              >
                <div className="flex justify-between items-start">
                  <div className="flex gap-4 items-start">
                    {med.imageUrl && (
                      <button 
                        onClick={() => setSelectedImage(med.imageUrl!)}
                        className="w-12 h-12 flex-shrink-0 bg-[#141414]/5 rounded-xl border border-[#141414]/10 overflow-hidden"
                      >
                        <img src={med.imageUrl} alt={med.itemName} className="w-full h-full object-cover" />
                      </button>
                    )}
                    <div className="space-y-1">
                      <div 
                        className="flex flex-col cursor-pointer"
                        onClick={() => med.to ? setSelectedMedForLinks(med) : null}
                      >
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-[#141414] leading-tight group-active:text-[#F27D26] transition-colors">{med.itemName}</h3>
                            {med.to && (
                              <ArrowUpDown size={10} className="text-[#F27D26] animate-pulse" />
                            )}
                          </div>
                          {med.isRefrigerated && (
                            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-500 text-white rounded-full text-[8px] font-black uppercase tracking-tighter shadow-sm w-fit">
                              <ThermometerSnowflake size={8} />
                              REF
                            </div>
                          )}
                        </div>
                        {med.generic && (
                          <p className="text-[10px] italic text-[#141414]/40 leading-tight">{med.generic}</p>
                        )}
                        {med.isNew && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#F27D26]/10 text-[#F27D26] text-[8px] font-bold rounded-full w-fit">
                            NEW
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-mono text-[#141414]/40 uppercase">{med.itemCode}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-lg font-black ${
                      med.qoh <= 0 
                        ? 'text-red-600' 
                        : (med.maxQty > 0 && med.qoh < med.maxQty * 0.3)
                        ? 'text-amber-600'
                        : 'text-[#141414]'
                    }`}>
                      {formatNumber(med.qoh)}
                    </div>
                    <p className={`text-[10px] font-bold uppercase tracking-widest ${
                      med.qoh <= 0 ? 'text-red-500' : (med.maxQty > 0 && med.qoh < med.maxQty * 0.3) ? 'text-amber-500' : 'text-emerald-500'
                    }`}>
                      {med.qoh <= 0 ? 'Out of Stock' : (med.maxQty > 0 && med.qoh < med.maxQty * 0.3 ? 'Low Stock' : 'In Stock')}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 p-2 bg-[#141414]/[0.02] rounded-xl border border-[#141414]/5">
                  <div className="text-center">
                    <p className="text-[8px] font-bold uppercase tracking-wider text-[#141414]/40 mb-0.5">Exp 1</p>
                    <p className="text-[10px] font-bold text-[#141414]/60">{med.expiration1 || '-'}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[8px] font-bold uppercase tracking-wider text-[#141414]/40 mb-0.5">Exp 2</p>
                    <p className="text-[10px] font-bold text-[#141414]/60">{med.expiration2 || '-'}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[8px] font-bold uppercase tracking-wider text-[#141414]/40 mb-0.5">Exp 3</p>
                    <p className="text-[10px] font-bold text-[#141414]/60">{med.expiration3 || '-'}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        
        {filteredMeds.length === 0 && !loading && (
          <div className="p-20 text-center flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-[#141414]/5 rounded-full flex items-center justify-center">
              <Search className="w-8 h-8 text-[#141414]/20" />
            </div>
            <p className="font-bold text-[#141414]/40 uppercase tracking-widest text-sm">No results found</p>
          </div>
        )}
      </div>
      {/* Image Preview Modal */}
      <AnimatePresence>
        {selectedImage && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm shadow-2xl">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-2xl w-full bg-white rounded-3xl overflow-hidden shadow-2xl"
            >
              <button 
                onClick={() => setSelectedImage(null)}
                className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full z-10 transition-colors"
              >
                <XIcon size={24} />
              </button>
              <div className="aspect-square md:aspect-video w-full bg-[#141414] flex items-center justify-center">
                <img 
                  src={selectedImage} 
                  alt="Medication Preview" 
                  className="w-full h-full object-contain"
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {selectedMedForLinks && (
          <LinkedItemsModal 
            medication={selectedMedForLinks}
            allMedications={medications}
            onClose={() => setSelectedMedForLinks(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
