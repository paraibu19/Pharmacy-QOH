import React, { useState, useMemo } from 'react';
import { 
  Search, Download, MapPin, Sparkles, Filter, Loader2, X, 
  RefreshCw, ArrowUpDown, AlertTriangle, Lock, LogIn, Edit3, Save, FileSpreadsheet
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PharmacyLocation, PHARMACY_NAMES, Medication } from '../types';
import { LOCATIONS } from '../constants';
import { format, differenceInDays } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useMedications } from '../hooks/useMedications';
import { medicationOps } from '../lib/firebaseOperations';

type SortField = 'itemName' | 'itemCode' | 'qoh' | 'orderQty';
type SortOrder = 'asc' | 'desc';

export default function TechnicianView() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [selectedLocation, setSelectedLocation] = useState<PharmacyLocation>(PharmacyLocation.ADULT);
  const [searchQuery, setSearchQuery] = useState('');
  const [qohThreshold, setQohThreshold] = useState<number | ''>('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [expStart, setExpStart] = useState('');
  const [expEnd, setExpEnd] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [sortField, setSortField] = useState<SortField>('itemName');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  
  const [showSuggestions, setShowSuggestions] = useState(false);
  const { medications, loading, refresh, lastSynced, isSyncing } = useMedications(selectedLocation);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMin, setEditMin] = useState<string>('');
  const [editMax, setEditMax] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'tech123') { // Sample password
      setIsAuthenticated(true);
      setAuthError('');
    } else {
      setAuthError('Invalid password. Access denied.');
    }
  };

  const parseExpDate = (dateStr: string) => {
    if (!dateStr || dateStr === '-' || dateStr === '.') return null;
    try {
      const parts = dateStr.split(/[-/.]/);
      if (parts.length === 3) {
        const d = parseInt(parts[0]);
        const m = parseInt(parts[1]);
        const y = parseInt(parts[2]);
        const fullYear = y < 100 ? 2000 + y : y;
        const date = new Date(fullYear, m - 1, d);
        if (!isNaN(date.getTime())) return date;
      } else if (parts.length === 2) {
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

  const calculateOrder = (med: Medication) => {
    const qoh = med.qoh || 0;
    const max = med.maxQty || 0;
    const min = med.minQty || 0;
    
    if (max === 0 || min === 0) return 0;
    
    if (max <= qoh || (max - qoh) <= min) {
      return 0;
    }
    
    // Formula: FLOOR(Max-QOH, Min)
    return Math.floor((max - qoh) / min) * min;
  };

  const suggestions = useMemo(() => {
    if (searchQuery.length < 1) return [];
    const lowerQuery = searchQuery.toLowerCase();
    return medications.filter(m => 
      m.itemCode.toLowerCase().startsWith(lowerQuery) || 
      m.itemName.toLowerCase().startsWith(lowerQuery)
    ).slice(0, 5);
  }, [medications, searchQuery]);

  const sortedMeds = useMemo(() => {
    let result = medications;
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(m => 
        m.itemName.toLowerCase().includes(q) || 
        m.itemCode.toLowerCase().includes(q)
      );
    }

    if (qohThreshold !== '') {
      result = result.filter(m => m.qoh <= qohThreshold);
    }

    if (lowStockOnly) {
      result = result.filter(m => m.qoh < 10);
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
      orderQty: calculateOrder(m),
      isNew: m.addedAt ? differenceInDays(new Date(), (m.addedAt as any).toDate?.() || new Date(m.addedAt)) < 10 : false
    }));

    return mapped.sort((a, b) => {
      const multiplier = sortOrder === 'asc' ? 1 : -1;
      if (sortField === 'qoh' || sortField === 'orderQty') {
        return (a[sortField] - b[sortField]) * multiplier;
      }
      return a[sortField].localeCompare(b[sortField]) * multiplier;
    });
  }, [medications, searchQuery, qohThreshold, lowStockOnly, expStart, expEnd, sortField, sortOrder]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const startEdit = (med: Medication) => {
    setEditingId(med.id);
    setEditMin(String(med.minQty || 0));
    setEditMax(String(med.maxQty || 0));
  };

  const saveEdit = async (id: string) => {
    setIsUpdating(true);
    try {
      await medicationOps.update(id, {
        minQty: Number(editMin),
        maxQty: Number(editMax)
      });
      setEditingId(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsUpdating(false);
    }
  };

  const downloadCSV = () => {
    const orderItems = sortedMeds.filter(m => m.orderQty > 0);
    const headers = ['Serial no.', 'Item code', 'Item name', 'Order quantity', 'Exp1'];
    const rows = orderItems.map((m, i) => [
      i + 1,
      m.itemCode,
      m.itemName,
      m.orderQty,
      m.expiration1 || '-'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(field => `"${field}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Store_Order_${PHARMACY_NAMES[selectedLocation].replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  const downloadPDF = () => {
    const doc = new jsPDF() as any;
    const orderItems = sortedMeds.filter(m => m.orderQty > 0);
    
    doc.setFontSize(20);
    doc.text('Pharmacy Store Order', 14, 22);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Location: ${PHARMACY_NAMES[selectedLocation]}`, 14, 30);
    doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}`, 14, 35);
    doc.text(`Total Items to Order: ${orderItems.length}`, 14, 40);

    const headers = [['S.No', 'Item Code', 'Item Name', 'Order Qty', 'Exp 1']];
    const data = orderItems.map((m, i) => [
      i + 1,
      m.itemCode,
      m.itemName,
      m.orderQty,
      m.expiration1 || '-'
    ]);

    autoTable(doc, {
      startY: 45,
      head: headers,
      body: data,
      theme: 'grid',
      headStyles: { fillColor: [242, 125, 38], textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 3 },
      columnStyles: {
        0: { cellWidth: 15 },
        1: { cellWidth: 25 },
        3: { cellWidth: 20 },
        4: { cellWidth: 25 },
      }
    });

    doc.save(`Store_Order_${PHARMACY_NAMES[selectedLocation].replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
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
          <h1 className="text-2xl font-bold text-center mb-2">Technician View</h1>
          <p className="text-[#141414]/50 text-center text-sm mb-8">Please enter the technician access password</p>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">Password</label>
              <div className="relative">
                <input 
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-4 pr-10 py-3 bg-[#141414]/5 border-none rounded-xl focus:ring-2 focus:ring-[#F27D26]/20 transition-all font-medium"
                  placeholder="••••••••"
                  autoFocus
                />
                <LogIn className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#141414]/20" />
              </div>
              {authError && <p className="mt-2 text-red-500 text-xs font-bold ml-1">{authError}</p>}
            </div>
            
            <button 
              type="submit"
              className="w-full py-4 bg-[#141414] text-white rounded-xl font-bold hover:bg-[#F27D26] transition-all flex items-center justify-center gap-2"
            >
              Access View
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-4xl font-bold tracking-tight">Technician View</h1>
            <span className="px-2.5 py-1 bg-[#F27D26]/10 text-[#F27D26] border border-[#F27D26]/20 rounded-full text-[10px] font-bold uppercase tracking-widest">
              Advanced Tools
            </span>
          </div>
          <p className="text-[#141414]/60 max-w-xl">
            Manage min/max stock quantities and generate automated store orders.
          </p>
        </div>
        
        <div className="flex gap-3">
          <button 
            onClick={() => refresh(true)}
            disabled={isSyncing}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${
              isSyncing ? 'bg-[#141414]/5 text-[#141414]/40' : 'bg-[#141414]/5 text-[#141414]/40 hover:bg-[#141414]/10'
            }`}
          >
            {isSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Synced {format(lastSynced, 'HH:mm')}
          </button>

          <div className="flex items-center gap-1 bg-[#141414]/5 p-1 rounded-full border border-[#141414]/10">
            <button 
              onClick={downloadCSV}
              className="px-4 py-2 bg-white text-[#141414] rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-50 hover:text-emerald-600 transition-all shadow-sm flex items-center gap-2 border border-[#141414]/5"
            >
              <FileSpreadsheet className="w-3 h-3" />
              CSV Order
            </button>
            <button 
              onClick={downloadPDF}
              className="px-4 py-2 bg-white text-[#141414] rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-red-50 hover:text-red-600 transition-all shadow-sm flex items-center gap-2 border border-[#141414]/5"
            >
              <Download className="w-3 h-3" />
              PDF Order
            </button>
          </div>
        </div>
      </div>

      {(qohThreshold !== '' || lowStockOnly || expStart || expEnd) && (
        <div className="flex flex-wrap items-center gap-2 p-3 bg-[#F27D26]/5 rounded-xl border border-[#F27D26]/10 animate-in slide-in-from-top-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#F27D26]/60 flex items-center gap-2">
            <Filter className="w-3 h-3" />
            Active Filters:
          </span>
          {qohThreshold !== '' && (
            <span className="px-2 py-1 bg-white rounded-lg text-[10px] font-bold shadow-sm border border-[#F27D26]/10">
              Max QOH: <span className="text-[#F27D26]">{qohThreshold}</span>
            </span>
          )}
          {lowStockOnly && (
            <span className="px-2 py-1 bg-white rounded-lg text-[10px] font-bold shadow-sm border border-[#F27D26]/10">
              Low Stock ({'< 10'})
            </span>
          )}
          <button 
            onClick={() => { setQohThreshold(''); setLowStockOnly(false); setExpStart(''); setExpEnd(''); }}
            className="ml-auto text-[10px] font-bold text-red-500 hover:underline"
          >
            Clear All
          </button>
        </div>
      )}

      {/* Controls */}
      <div className="bg-white p-6 rounded-3xl border border-[#141414]/10 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            {LOCATIONS.map(loc => (
              <button
                key={loc.id}
                onClick={() => setSelectedLocation(loc.id as PharmacyLocation)}
                className={`px-6 py-2.5 rounded-2xl text-xs font-bold transition-all ${
                  selectedLocation === loc.id 
                    ? 'bg-[#141414] text-white shadow-lg' 
                    : 'bg-[#141414]/5 text-[#141414]/60 hover:bg-[#141414]/10'
                }`}
              >
                {loc.name.replace('Aw-', '')}
              </button>
            ))}
          </div>

          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold transition-all ${
              showFilters || lowStockOnly || qohThreshold !== '' || expStart || expEnd
              ? 'bg-[#F27D26] text-white shadow-lg'
              : 'bg-[#141414]/5 text-[#141414]/60 hover:bg-[#141414]/10'
            }`}
          >
            <Filter className="w-4 h-4" />
            {showFilters ? 'Hide Filters' : 'Advanced Filters'}
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#141414]/30" />
          <input 
            type="text"
            placeholder="Search item name or code..."
            value={searchQuery}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-4 bg-[#141414]/[0.03] border-none rounded-2xl focus:ring-2 focus:ring-[#F27D26]/20 transition-all text-sm font-medium"
          />

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
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 p-4 bg-[#141414]/5 rounded-2xl border border-[#141414]/10">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 ml-1">Threshold</label>
                  <input
                    type="number"
                    value={qohThreshold}
                    onChange={(e) => setQohThreshold(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="Max QOH"
                    className="w-full px-4 py-2.5 bg-white border border-[#141414]/10 rounded-xl text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 ml-1">Quick filter</label>
                  <button
                    onClick={() => setLowStockOnly(!lowStockOnly)}
                    className={`w-full px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                      lowStockOnly ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-white border border-[#141414]/10 text-[#141414]/60'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4" />
                    Low Stock ({'< 10'})
                  </button>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 ml-1">Exp. Start</label>
                  <input
                    type="date"
                    value={expStart}
                    onChange={(e) => setExpStart(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-[#141414]/10 rounded-xl text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 ml-1">Exp. End</label>
                  <input
                    type="date"
                    value={expEnd}
                    onChange={(e) => setExpEnd(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-[#141414]/10 rounded-xl text-sm"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={() => { setQohThreshold(''); setLowStockOnly(false); setExpStart(''); setExpEnd(''); setSearchQuery(''); }}
                    className="w-full py-2.5 text-red-500 text-xs font-bold hover:bg-red-50 rounded-xl border border-transparent hover:border-red-100 transition-all flex items-center justify-center gap-2"
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

      {/* Main Table */}
      <div className="bg-white rounded-3xl border border-[#141414]/10 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-24 flex flex-col items-center justify-center gap-4">
            <Loader2 className="w-10 h-10 text-[#141414]/20 animate-spin" />
            <p className="text-sm font-bold text-[#141414]/40 uppercase tracking-widest">Inventory Loading...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#141414]/5 border-bottom border-[#141414]/10">
                  <th 
                    className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 cursor-pointer hover:bg-[#141414]/5 transition-colors"
                    onClick={() => toggleSort('itemCode')}
                  >
                    <div className="flex items-center gap-1">
                      Item Code
                      {sortField === 'itemCode' && <ArrowUpDown className="w-3 h-3 text-[#F27D26]" />}
                    </div>
                  </th>
                  <th 
                    className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 cursor-pointer hover:bg-[#141414]/5 transition-colors"
                    onClick={() => toggleSort('itemName')}
                  >
                    <div className="flex items-center gap-1">
                      Item Name
                      {sortField === 'itemName' && <ArrowUpDown className="w-3 h-3 text-[#F27D26]" />}
                    </div>
                  </th>
                  <th 
                    className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 cursor-pointer hover:bg-[#141414]/5 transition-colors"
                    onClick={() => toggleSort('qoh')}
                  >
                    <div className="flex items-center gap-1">
                      QOH
                      {sortField === 'qoh' && <ArrowUpDown className="w-3 h-3 text-[#F27D26]" />}
                    </div>
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 bg-[#F27D26]/[0.02]">Min</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 bg-[#F27D26]/[0.02]">Max</th>
                  <th 
                    className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 cursor-pointer hover:bg-[#141414]/5 transition-colors bg-emerald-50/30"
                    onClick={() => toggleSort('orderQty')}
                  >
                    <div className="flex items-center gap-1">
                      Order Qty
                      {sortField === 'orderQty' && <ArrowUpDown className="w-3 h-3 text-emerald-500" />}
                    </div>
                  </th>
                  <th className="px-6 py-4 text-right text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedMeds.map((med) => {
                  const isEditing = editingId === med.id;
                  const isOrdered = med.orderQty > 0;
                  
                  return (
                    <motion.tr 
                      layout
                      key={med.id} 
                      className={`group border-b border-[#141414]/5 transition-colors hover:bg-[#141414]/[0.02] ${isOrdered ? 'bg-emerald-50/10' : ''}`}
                    >
                      <td className="px-6 py-4 font-mono text-xs text-[#141414]/50">{med.itemCode}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#141414]">{med.itemName}</span>
                          {med.isNew && (
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[9px] font-black uppercase tracking-widest">
                              NEW
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-black ${
                          med.qoh < 10 ? 'bg-red-100 text-red-600' : 'bg-[#141414]/5 text-[#141414]'
                        }`}>
                          {med.qoh.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-6 py-4 bg-[#F27D26]/[0.02]">
                        {isEditing ? (
                          <input 
                            type="number"
                            value={editMin}
                            onChange={(e) => setEditMin(e.target.value)}
                            className="w-16 px-2 py-1 bg-white border border-[#F27D26]/30 rounded text-xs font-bold focus:ring-1 focus:ring-[#F27D26]"
                          />
                        ) : (
                          <span className="font-medium text-[#141414]/60">{med.minQty || 0}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 bg-[#F27D26]/[0.02]">
                        {isEditing ? (
                          <input 
                            type="number"
                            value={editMax}
                            onChange={(e) => setEditMax(e.target.value)}
                            className="w-16 px-2 py-1 bg-white border border-[#F27D26]/30 rounded text-xs font-bold focus:ring-1 focus:ring-[#F27D26]"
                          />
                        ) : (
                          <span className="font-medium text-[#141414]/60">{med.maxQty || 0}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 bg-emerald-50/30">
                        {isOrdered ? (
                          <span className="flex items-center gap-2 text-emerald-600 font-black">
                            <span className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-xs">
                              {med.orderQty.toLocaleString()}
                            </span>
                          </span>
                        ) : (
                          <span className="text-[#141414]/20 text-xs">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={() => saveEdit(med.id)}
                              disabled={isUpdating}
                              className="w-8 h-8 bg-[#141414] text-white rounded-lg flex items-center justify-center hover:bg-emerald-500 transition-all disabled:opacity-50"
                            >
                              {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            </button>
                            <button 
                              onClick={() => setEditingId(null)}
                              className="w-8 h-8 bg-black/5 text-[#141414] rounded-lg flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-all"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <button 
                            onClick={() => startEdit(med)}
                            className="w-8 h-8 opacity-0 group-hover:opacity-100 bg-[#141414]/5 text-[#141414]/40 rounded-lg flex items-center justify-center hover:bg-[#F27D26] hover:text-white transition-all mx-auto"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {sortedMeds.length === 0 && !loading && (
        <div className="text-center py-24 bg-white rounded-3xl border border-[#141414]/10 p-12">
          <div className="w-20 h-20 bg-[#141414]/5 rounded-full flex items-center justify-center mx-auto mb-6">
            <Search className="w-10 h-10 text-[#141414]/20" />
          </div>
          <h2 className="text-xl font-bold mb-2">No items found</h2>
          <p className="text-[#141414]/40 max-w-xs mx-auto">Try adjusting your search query or location filters to see results.</p>
        </div>
      )}
    </div>
  );
}
