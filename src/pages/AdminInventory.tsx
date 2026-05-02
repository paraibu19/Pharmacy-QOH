import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, Download, Save, RefreshCw, AlertTriangle, 
  CheckCircle2, ArrowUpRight, History, Loader2, ArrowUpDown, Filter, X, FileSpreadsheet,
  Sparkles
} from 'lucide-react';
import { PharmacyLocation, Medication, PHARMACY_NAMES } from '../types';
import { LOCATIONS } from '../constants';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { useMedications } from '../hooks/useMedications';
import { auditOps } from '../lib/firebaseOperations';
import { formatNumber } from '../lib/formatters';

type SortField = 'itemName' | 'itemCode' | 'qoh' | 'minQty' | 'physical' | 'variance';
type SortOrder = 'asc' | 'desc';

export default function AdminInventory() {
  const [selectedLocation, setSelectedLocation] = useState<PharmacyLocation>(PharmacyLocation.ADULT);
  const [searchQuery, setSearchQuery] = useState('');
  const [availableGenericsOnly, setAvailableGenericsOnly] = useState(false);
  
  const { medications, loading, refresh, lastSynced, isSyncing } = useMedications(selectedLocation);
  const [physicalCounts, setPhysicalCounts] = useState<Record<string, number>>({});
  const [showSyncPulse, setShowSyncPulse] = useState(false);

  // Visual feedback for real-time sync
  useEffect(() => {
    setShowSyncPulse(true);
    const timer = setTimeout(() => setShowSyncPulse(false), 2000);
    return () => clearTimeout(timer);
  }, [lastSynced]);

  const [sortField, setSortField] = useState<SortField>('itemName');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [expStart, setExpStart] = useState('');
  const [expEnd, setExpEnd] = useState('');
  const [showFilters, setShowFilters] = useState(false);

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

  const sortedMeds = useMemo(() => {
    let result = [...medications];
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(m => 
        m.itemName.toLowerCase().includes(q) || 
        m.itemCode.toLowerCase().includes(q) ||
        (m.generic && m.generic.toLowerCase().includes(q))
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
    
    return result.sort((a, b) => {
      const multiplier = sortOrder === 'asc' ? 1 : -1;
      
      if (sortField === 'qoh' || sortField === 'minQty') {
        const valA = (a[sortField] as number) || 0;
        const valB = (b[sortField] as number) || 0;
        return (valA - valB) * multiplier;
      }
      
      if (sortField === 'physical' || sortField === 'variance') {
        const physA = physicalCounts[a.id] ?? a.qoh;
        const physB = physicalCounts[b.id] ?? b.qoh;
        
        if (sortField === 'physical') {
          return (physA - physB) * multiplier;
        } else {
          const varA = physA - a.qoh;
          const varB = physB - b.qoh;
          return (varA - varB) * multiplier;
        }
      }
      
      return a[sortField].localeCompare(b[sortField]) * multiplier;
    });
  }, [medications, searchQuery, sortField, sortOrder, lowStockOnly, expStart, expEnd, physicalCounts, availableGenericsOnly]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const handlePhysicalCountChange = (id: string, value: string) => {
    setPhysicalCounts(prev => ({
      ...prev,
      [id]: value === '' ? 0 : parseFloat(value)
    }));
  };

  const downloadExcel = () => {
    const data = sortedMeds.map(m => {
      const physical = physicalCounts[m.id] ?? m.qoh;
      const variance = physical - m.qoh;
      return {
        'Item Code': m.itemCode,
        'Item Name': m.itemName,
        'Current QOH': m.qoh,
        'Min': m.minQty || 0,
        'Max': m.maxQty || 0,
        'Physical Count': physical,
        'Variance': variance,
        'Last Updated': format(new Date(m.lastUpdatedAt), 'yyyy-MM-dd HH:mm')
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventory_Audit");
    
    XLSX.writeFile(wb, `Inventory_Audit_${selectedLocation}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const handleAdjust = async (med: Medication) => {
    const physical = physicalCounts[med.id];
    if (physical === undefined) return;
    
    const variance = physical - med.qoh;
    if (confirm(`Adjust QOH for ${med.itemName}? Variance: ${variance > 0 ? '+' : ''}${formatNumber(variance)}`)) {
      await auditOps.reconcille(med.id, physical, selectedLocation, med.itemCode, med.itemName, med.qoh);
      setPhysicalCounts(prev => {
        const next = { ...prev };
        delete next[med.id];
        return next;
      });
    }
  };

  const downloadCSV = () => {
    const headers = ['Item Code', 'Item Name', 'Current QOH', 'Min', 'Max', 'Physical Count', 'Variance', 'Last Updated'];
    const rows = sortedMeds.map(m => {
      const physical = physicalCounts[m.id] ?? m.qoh;
      const variance = physical - m.qoh;
      return [
        m.itemCode,
        m.itemName,
        formatNumber(m.qoh),
        formatNumber(m.minQty || 0),
        formatNumber(m.maxQty || 0),
        formatNumber(physical),
        formatNumber(variance),
        format(new Date(m.lastUpdatedAt), 'yyyy-MM-dd HH:mm')
      ];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map(r => r.map(field => `"${String(field).replace(/"/g, '""')}"`).join(","))
    ].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Inventory_Audit_${selectedLocation}_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold tracking-tight">Inventory Audit</h1>
            <div className="px-3 py-1 bg-[#141414]/5 rounded-full text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest border border-[#141414]/5">
              {format(new Date(), 'eeee, dd-MM-yyyy')}
            </div>
          </div>
          <p className="text-[#141414]/50">Perform physical stock verification and reconcile variances.</p>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => setAvailableGenericsOnly(!availableGenericsOnly)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              availableGenericsOnly 
                ? 'bg-sky-500 text-white shadow-lg ring-2 ring-sky-500/20' 
                : 'bg-white border border-[#141414]/10 text-sky-600 hover:bg-sky-50 shadow-sm'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            Available Generics
          </button>
          <div className="flex bg-[#141414] rounded-xl p-1 shadow-lg shadow-black/20 overflow-hidden shrink-0">
            <button 
              onClick={downloadCSV}
              className="flex items-center gap-2 px-4 py-2 text-white hover:bg-white/10 rounded-lg transition-all text-xs font-bold border-r border-white/5"
              title="Download CSV"
            >
              <Download className="w-4 h-4" />
              CSV
            </button>
            <button 
              onClick={downloadExcel}
              className="flex items-center gap-2 px-4 py-2 text-white hover:bg-white/10 rounded-lg transition-all text-xs font-bold"
              title="Download Excel"
            >
              <FileSpreadsheet className="w-4 h-4 text-[#F27D26]" />
              Excel
            </button>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Total Items', value: formatNumber(sortedMeds.length), icon: History, color: 'blue' },
          { label: 'Variances Tracked', value: formatNumber(Object.keys(physicalCounts).length), icon: AlertTriangle, color: 'orange' },
          { 
            label: 'System Sync', 
            value: showSyncPulse ? 'Live Updated' : format(lastSynced, 'HH:mm:ss'), 
            icon: RefreshCw, 
            color: 'emerald',
            interactive: true,
            onClick: () => refresh(true),
            highlight: showSyncPulse
          },
        ].map((stat, i) => (
          <div 
            key={i} 
            onClick={stat.onClick}
            className={`bg-white p-5 rounded-2xl border flex items-center justify-between shadow-sm transition-all relative overflow-hidden ${
              stat.highlight 
                ? 'border-emerald-500 ring-2 ring-emerald-500/10' 
                : 'border-[#141414]/10'
            } ${stat.interactive ? 'cursor-pointer hover:bg-[#141414]/[0.02] active:scale-[0.98]' : ''}`}
          >
            {stat.highlight && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-x-0 bottom-0 h-1 bg-emerald-500"
              />
            )}
            <div>
              <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${stat.highlight ? 'text-emerald-500' : 'text-[#141414]/40'}`}>
                {stat.label}
              </p>
              <div className="flex items-center gap-2">
                <p className={`text-2xl font-black ${stat.highlight ? 'text-emerald-500' : ''}`}>{stat.value}</p>
                {stat.interactive && (isSyncing || showSyncPulse) && (
                  <Loader2 className={`w-4 h-4 animate-spin ${stat.highlight ? 'text-emerald-500' : 'text-emerald-500'}`} />
                )}
              </div>
            </div>
            <stat.icon className={`w-8 h-8 transition-all ${stat.highlight ? 'text-emerald-500 opacity-20' : 'opacity-20'} ${stat.interactive && isSyncing ? 'animate-spin' : ''}`} />
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white p-6 rounded-2xl border border-[#141414]/10 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex flex-wrap gap-2">
            {LOCATIONS.map(loc => (
              <button
                key={loc.id}
                onClick={() => setSelectedLocation(loc.id as PharmacyLocation)}
                className={`px-5 py-2 rounded-xl text-xs font-bold transition-all ${
                  selectedLocation === loc.id 
                    ? loc.id === PharmacyLocation.ADULT
                      ? 'bg-emerald-100 border border-emerald-200 text-emerald-700 shadow-sm'
                      : loc.id === PharmacyLocation.PEDIATRIC
                        ? 'bg-sky-100 border border-sky-200 text-sky-700 shadow-sm'
                        : loc.id === PharmacyLocation.MESAIEED
                          ? 'bg-orange-100 border border-orange-200 text-orange-700 shadow-sm'
                          : 'bg-[#141414] text-white' 
                    : 'bg-[#141414]/5 text-[#141414]/60 hover:bg-[#141414]/10'
                }`}
              >
                {loc.name.replace('Aw-', '')}
              </button>
            ))}
          </div>

          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              showFilters || availableGenericsOnly || lowStockOnly || expStart || expEnd
              ? 'bg-[#141414] text-white shadow-lg'
              : 'bg-[#141414]/5 text-[#141414]/60 hover:bg-[#141414]/10'
            }`}
          >
            <Filter className="w-4 h-4" />
            {showFilters ? 'Hide Filters' : 'Advanced Filters'}
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#141414]/30" />
          <input
            type="text"
            placeholder="Search by code or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-[#141414]/[0.03] border-none rounded-xl focus:ring-2 focus:ring-[#141414]/5 transition-all text-sm"
          />
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t border-[#141414]/5 animate-in slide-in-from-top-2">
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 ml-1">
                Stock Level
              </label>
              <button
                onClick={() => setLowStockOnly(!lowStockOnly)}
                className={`w-full px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                  lowStockOnly ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-[#141414]/5 text-[#141414]/60'
                }`}
              >
                <AlertTriangle className="w-4 h-4" />
                Low Stock Only ({'< 30% Max'})
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 ml-1">
                Expiry (Start)
              </label>
              <input
                type="date"
                value={expStart}
                onChange={(e) => setExpStart(e.target.value)}
                className="w-full px-4 py-2.5 bg-[#141414]/[0.03] rounded-xl text-sm focus:ring-2 focus:ring-[#141414]/5 transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 ml-1">
                Expiry (End)
              </label>
              <input
                type="date"
                value={expEnd}
                onChange={(e) => setExpEnd(e.target.value)}
                className="w-full px-4 py-2.5 bg-[#141414]/[0.03] rounded-xl text-sm focus:ring-2 focus:ring-[#141414]/5 transition-all"
              />
            </div>

            <div className="flex items-end pb-0.5">
              <button
                onClick={() => { setAvailableGenericsOnly(false); setLowStockOnly(false); setExpStart(''); setExpEnd(''); setSearchQuery(''); }}
                className="w-full py-2.5 text-red-500 text-xs font-bold hover:bg-red-50 rounded-xl transition-all flex items-center justify-center gap-2 border border-transparent hover:border-red-100"
              >
                <X className="w-4 h-4" />
                Clear Filters
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Audit Table */}
      <div className="bg-white rounded-2xl border border-[#141414]/10 shadow-sm overflow-hidden min-h-[400px]">
        <div className="overflow-x-auto max-h-[75vh]">
          <table className="w-full text-left">
            <thead className="sticky top-0 z-20 bg-white shadow-sm">
              <tr className="bg-[#141414]/[0.02] text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 border-b border-[#141414]/10">
                <th 
                  className="px-6 py-4 cursor-pointer hover:bg-[#141414]/[0.02] transition-colors sticky top-0 bg-[#F9F9F9]"
                  onClick={() => toggleSort('itemName')}
                >
                  <div className="flex items-center gap-2">
                    Medication
                    {sortField === 'itemName' && <ArrowUpDown className="w-3 h-3 text-[#141414]" />}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 cursor-pointer hover:bg-[#141414]/[0.02] transition-colors sticky top-0 bg-[#F9F9F9]" 
                  onClick={() => toggleSort('qoh')}
                >
                  <div className="flex items-center gap-2">
                    System QOH
                    {sortField === 'qoh' && <ArrowUpDown className="w-3 h-3 text-[#141414]" />}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 sticky top-0 bg-[#F9F9F9] cursor-pointer hover:bg-[#141414]/5 transition-colors"
                  onClick={() => toggleSort('minQty')}
                >
                  <div className="flex items-center gap-1">
                    Min / Max
                    {sortField === 'minQty' && <ArrowUpDown className="w-3 h-3 text-[#141414]" />}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 sticky top-0 bg-[#F9F9F9] cursor-pointer hover:bg-[#141414]/5 transition-colors"
                  onClick={() => toggleSort('physical')}
                >
                  <div className="flex items-center gap-1">
                    Physical Count
                    {sortField === 'physical' && <ArrowUpDown className="w-3 h-3 text-[#141414]" />}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 sticky top-0 bg-[#F9F9F9] cursor-pointer hover:bg-[#141414]/5 transition-colors"
                  onClick={() => toggleSort('variance')}
                >
                  <div className="flex items-center gap-1">
                    Variance
                    {sortField === 'variance' && <ArrowUpDown className="w-3 h-3 text-[#141414]" />}
                  </div>
                </th>
                <th className="px-6 py-4 text-right sticky top-0 bg-[#F9F9F9]">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#141414]/5">
              {loading && (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-[#141414]/20" />
                  </td>
                </tr>
              )}
              {!loading && sortedMeds.map((med) => {
                const physical = physicalCounts[med.id] ?? med.qoh;
                const variance = physical - med.qoh;
                const hasVariance = variance !== 0;

                return (
                  <tr key={med.id} className="hover:bg-[#141414]/[0.01] transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-mono text-[#141414]/40 mb-0.5">{med.itemCode}</span>
                        <span className="text-sm font-bold text-[#141414]">{med.itemName}</span>
                        {med.generic && (
                          <span className="text-[10px] italic text-[#141414]/40 leading-tight">{med.generic}</span>
                        )}
                        <span className="text-[9px] text-[#141414]/30 mt-1 uppercase italic">
                          Last Updated: {format(new Date(med.lastUpdatedAt), 'dd MMM, HH:mm')}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold bg-[#141414]/5 px-2 py-1 rounded">{formatNumber(med.qoh)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">
                        <span>Min: <span className="text-[#141414]">{formatNumber(med.minQty)}</span></span>
                        <span>Max: <span className="text-[#141414]">{formatNumber(med.maxQty)}</span></span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={physicalCounts[med.id] ?? ''}
                        placeholder={formatNumber(med.qoh)}
                        onChange={(e) => handlePhysicalCountChange(med.id, e.target.value)}
                        className={`w-24 px-3 py-2 bg-transparent border rounded-lg text-sm font-bold transition-all ${
                          hasVariance ? 'border-orange-200 bg-orange-50' : 'border-[#141414]/10 focus:border-[#141414]'
                        }`}
                      />
                    </td>
                    <td className="px-6 py-4">
                      {hasVariance ? (
                        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold w-fit ${
                          variance > 0 ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'
                        }`}>
                          <ArrowUpRight className={`w-3 h-3 ${variance < 0 ? 'rotate-180' : ''}`} />
                          {variance > 0 ? '+' : ''}{formatNumber(variance)}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-bold w-fit">
                          <CheckCircle2 className="w-3 h-3" />
                          MATCH
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleAdjust(med)}
                        disabled={!hasVariance}
                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                          hasVariance 
                            ? 'bg-[#141414] text-white hover:scale-105 active:scale-95 shadow-lg shadow-black/10' 
                            : 'bg-[#141414]/5 text-[#141414]/20 cursor-not-allowed'
                        }`}
                      >
                        <Save className="w-3 h-3" />
                        Reconcile
                      </button>
                    </td>
                  </tr>
                );
              })}
              
              {sortedMeds.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center opacity-30 italic font-medium">
                    No items to audit in this location.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
