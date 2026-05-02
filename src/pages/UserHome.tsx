import { useState, useMemo, useEffect } from 'react';
import { Search, Download, MapPin, Sparkles, Filter, Loader2, X, RefreshCw, ArrowUpDown, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PharmacyLocation, PHARMACY_NAMES, Medication } from '../types';
import { LOCATIONS } from '../constants';
import { format, differenceInDays } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { useMedications } from '../hooks/useMedications';
import { formatNumber } from '../lib/formatters';

type SortField = 'itemName' | 'itemCode' | 'qoh' | 'isNew' | 'expiration1' | 'expiration2' | 'expiration3';
type SortOrder = 'asc' | 'desc';

export default function UserHome() {
  const [selectedLocation, setSelectedLocation] = useState<PharmacyLocation>(PharmacyLocation.ADULT);
  const [searchQuery, setSearchQuery] = useState('');
  const [availableGenericsOnly, setAvailableGenericsOnly] = useState(false);
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [expStart, setExpStart] = useState('');
  const [expEnd, setExpEnd] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  
  const [sortField, setSortField] = useState<SortField>('itemName');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showSyncPulse, setShowSyncPulse] = useState(false);
  
  const { medications, loading, refresh, lastSynced, isSyncing } = useMedications(selectedLocation);

  // Visual feedback for real-time sync
  useEffect(() => {
    setShowSyncPulse(true);
    const timer = setTimeout(() => setShowSyncPulse(false), 2000);
    return () => clearTimeout(timer);
  }, [lastSynced]);

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
        (m.generic && m.generic.toLowerCase().includes(lowerQuery))
      );
    }

    if (availableGenericsOnly) {
      result = result.filter(m => m.generic && m.qoh > 0);
    }

    if (lowStockOnly) {
      result = result.filter(m => m.maxQty > 0 && m.qoh < m.maxQty * 0.3);
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
  }, [medications, searchQuery, availableGenericsOnly, lowStockOnly, expStart, expEnd, sortField, sortOrder]);

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
      (m.maxQty > 0 && m.qoh < m.maxQty * 0.3) ? 'Low Stock' : 'Available'
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
      'Status': (m.maxQty > 0 && m.qoh < m.maxQty * 0.3) ? 'Low Stock' : 'Available'
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
    const now = format(new Date(), "eeee, dd-MM-yyyy, hh:mm a");
    // User requested format: DayName, dd-mm-yyyy, HH:MM AM/PM
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

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Hero / Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 md:gap-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">User View</h1>
            <div className="px-3 py-1 bg-[#141414]/5 rounded-full text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest border border-[#141414]/5">
              {format(new Date(), 'eeee, dd-MM-yyyy')}
            </div>
          </div>
          <p className="text-[#141414]/60 max-w-xl text-sm md:text-base">
            Real-time medication availability at Alwakra emergency pharmacies and Mesaieed OPD pharmacy.
          </p>
        </div>
        
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
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
              showFilters || availableGenericsOnly || lowStockOnly || expStart || expEnd
              ? 'bg-[#F27D26] text-white shadow-lg shadow-[#F27D26]/20'
              : 'bg-white border border-[#141414]/10 text-[#141414]/60 hover:bg-[#141414]/5'
            }`}
          >
            <Filter className="w-4 h-4" />
            <span className="hidden sm:inline">{showFilters ? 'Hide' : 'Show'} Filters</span>
            <span className="sm:hidden">Filters</span>
            {(availableGenericsOnly || lowStockOnly || expStart || expEnd) && (
              <span className="ml-1 w-2 h-2 bg-white rounded-full animate-pulse" />
            )}
          </button>
          
          <div className="flex bg-white border border-[#141414]/10 rounded-full p-1 shadow-sm">
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

      {(availableGenericsOnly || lowStockOnly || expStart || expEnd) && (
        <div className="flex flex-wrap items-center gap-2 p-3 bg-[#F27D26]/5 rounded-xl border border-[#F27D26]/10 animate-in slide-in-from-top-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#F27D26]/60 flex items-center gap-2">
            <Filter className="w-3 h-3" />
            Active Filters:
          </span>
          {availableGenericsOnly && (
            <span className="px-2 py-1 bg-white rounded-lg text-[10px] font-bold shadow-sm flex items-center gap-1.5 border border-[#F27D26]/10">
              In-Stock Generics
            </span>
          )}
          {lowStockOnly && (
            <span className="px-2 py-1 bg-white rounded-lg text-[10px] font-bold shadow-sm flex items-center gap-1.5 border border-[#F27D26]/10">
              Low Stock Only ({'< 30% Max'})
            </span>
          )}
          {(expStart || expEnd) && (
            <span className="px-2 py-1 bg-white rounded-lg text-[10px] font-bold shadow-sm flex items-center gap-1.5 border border-[#F27D26]/10">
              Expiry: <span className="text-[#F27D26]">{expStart || 'Any'}</span> – <span className="text-[#F27D26]">{expEnd || 'Any'}</span>
            </span>
          )}
          <button 
            onClick={() => { setAvailableGenericsOnly(false); setLowStockOnly(false); setExpStart(''); setExpEnd(''); }}
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
                          <span className="text-sm font-bold text-[#141414]">{s.itemName}</span>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 bg-[#141414]/5 p-4 rounded-2xl border border-[#141414]/10">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 ml-1">
                    Pharmacy filters
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
                    Available Generics
                  </button>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 ml-1">
                    Quick filter
                  </label>
                  <button
                    onClick={() => setLowStockOnly(!lowStockOnly)}
                    className={`w-full px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                      lowStockOnly ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-white border border-[#141414]/10 text-[#141414]/60'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4" />
                    Low Stock ({'< 30% Max'})
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
                    className="w-full px-4 py-2.5 bg-white border border-[#141414]/10 rounded-xl text-sm focus:ring-2 focus:ring-[#F27D26]/20 transition-all font-medium"
                  />
                </div>

                <div className="flex items-end">
                  <button
                    onClick={() => {
                      setAvailableGenericsOnly(false);
                      setLowStockOnly(false);
                      setExpStart('');
                      setExpEnd('');
                      setSearchQuery('');
                    }}
                    className="w-full h-10 flex items-center justify-center gap-2 bg-white border border-red-100 text-red-500 rounded-xl text-xs font-bold hover:bg-red-50 transition-all"
                  >
                    <X className="w-4 h-4" />
                    Reset
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

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
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-[#141414]">{med.itemName}</span>
                        {med.generic && (
                          <span className="text-[10px] italic text-[#141414]/40 leading-tight">{med.generic}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-sm font-bold ${(med.maxQty > 0 && med.qoh < med.maxQty * 0.3) ? 'text-red-500' : 'text-[#141414]'}`}>
                        {formatNumber(med.qoh)}
                      </span>
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
                  <div className="space-y-1">
                    <div className="flex flex-col">
                      <h3 className="font-bold text-[#141414]">{med.itemName}</h3>
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
                  <div className="text-right">
                    <div className={`text-lg font-black ${(med.maxQty > 0 && med.qoh < med.maxQty * 0.3) ? 'text-red-500' : 'text-[#141414]'}`}>
                      {formatNumber(med.qoh)}
                    </div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">In Stock</p>
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
    </div>
  );
}
