import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, Download, Save, RefreshCw, AlertTriangle, 
  CheckCircle2, ArrowUpRight, History, Loader2, ArrowUpDown, Filter, X, FileSpreadsheet,
  Sparkles, ThermometerSnowflake, UploadCloud, ClipboardList
} from 'lucide-react';
import { PharmacyLocation, Medication, PHARMACY_NAMES } from '../types';
import { LOCATIONS } from '../constants';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { useMedications } from '../hooks/useMedications';
import { auditOps } from '../lib/firebaseOperations';
import { formatNumber, parseSafeDate, formatSafeDate } from '../lib/formatters';
import { localDb } from '../lib/localStorageDb';
import { useSystemMetadata } from '../lib/useSystemMetadata';
import { medicationOps } from '../lib/firebaseOperations';
import { translateIndications } from '../services/translationService';
import MedicationFormModal from '../components/MedicationFormModal';
import BrandGenericReportModal from '../components/BrandGenericReportModal';

type SortField = 'itemName' | 'itemCode' | 'qoh' | 'minQty' | 'physical' | 'variance';
type SortOrder = 'asc' | 'desc';

export default function AdminInventory() {
  const { lastUpdate, isMesaieedHidden } = useSystemMetadata();

  const [selectedLocation, setSelectedLocation] = useState<PharmacyLocation>(PharmacyLocation.ADULT);

  // Auto-switch away from Mesaieed if it gets hidden
  useEffect(() => {
    if (isMesaieedHidden && selectedLocation === PharmacyLocation.MESAIEED) {
      setSelectedLocation(PharmacyLocation.ADULT);
    }
  }, [isMesaieedHidden, selectedLocation]);
  const [searchQuery, setSearchQuery] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'in' | 'low' | 'out'>('all');
  const [classificationFilter, setClassificationFilter] = useState<'qatari' | 'restricted' | null>(null);
  const [typeFilter, setTypeFilter] = useState<'generic' | 'brand' | null>(null);
  const [refFilter, setRefFilter] = useState<boolean>(false);
  const [showBrandGenericReport, setShowBrandGenericReport] = useState(false);
  
  const { medications, loading, error: fetchError, refresh, lastSynced, isSyncing } = useMedications(selectedLocation);
  const { medications: allMedications } = useMedications();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (fetchError) {
      setError(`Fetch Error: ${fetchError}`);
    }
  }, [fetchError]);

  const getOtherLocationsAvailability = (itemCode: string, currentLocationId: PharmacyLocation, showQoh: boolean) => {
    const matches = (allMedications || []).filter(m => m.itemCode === itemCode && m.locationId !== currentLocationId);
    const otherLocs = [PharmacyLocation.ADULT, PharmacyLocation.PEDIATRIC, PharmacyLocation.MESAIEED]
      .filter(loc => loc !== currentLocationId && !(isMesaieedHidden && loc === PharmacyLocation.MESAIEED));

    return otherLocs.map(loc => {
      const match = matches.find(m => m.locationId === loc);
      const qoh = match ? match.qoh : 0;
      const name = loc === PharmacyLocation.ADULT ? 'Adult' : loc === PharmacyLocation.PEDIATRIC ? 'Pediatric' : 'Mesaieed';
      
      let label = '';
      let badgeClass = '';

      if (!match) {
        label = `${name}: Not In The List`;
        badgeClass = 'bg-stone-50 text-[#141414]/30 border border-stone-200/40';
      } else if (qoh > 0) {
        if (showQoh) {
          label = `${name}: ${qoh}`;
        } else {
          label = `${name}: Available`;
        }
        badgeClass = 'bg-emerald-50 text-emerald-700 border border-emerald-100';
      } else {
        label = `${name}: Out of Stock`;
        badgeClass = 'bg-red-50 text-red-700 border border-red-100';
      }

      return (
        <span key={loc} className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold ${badgeClass}`}>
          {label}
        </span>
      );
    });
  };

  const [physicalCounts, setPhysicalCounts] = useState<Record<string, number>>({});
  const [showSyncPulse, setShowSyncPulse] = useState(false);

  // Edit Modal State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Medication>>({});
  const [isAdding, setIsAdding] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const startEdit = (med: Medication) => {
    setForm(med);
    setEditingId(med.id);
    setIsAdding(false);
  };

  // Visual feedback for real-time sync
  useEffect(() => {
    setShowSyncPulse(true);
    const timer = setTimeout(() => setShowSyncPulse(false), 2000);
    return () => clearTimeout(timer);
  }, [lastSynced]);

  const [sortField, setSortField] = useState<SortField>('itemName');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  
  const [expStart, setExpStart] = useState('');
  const [expEnd, setExpEnd] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const parseExpDate = (dateStr: string) => {
    if (!dateStr || dateStr === '-' || dateStr === '.') return null;
    try {
      const parts = dateStr.trim().split(/[-/.]/);
      if (parts.length === 3) {
        let d = parseInt(parts[0]);
        let m = parseInt(parts[1]);
        let y = parseInt(parts[2]);
        
        // If the first part is 4 digits, or the first part is > 31 (cannot be a day),
        // it is in YYYY-MM-DD format!
        if (parts[0].length === 4 || d > 31) {
          y = parseInt(parts[0]);
          m = parseInt(parts[1]);
          d = parseInt(parts[2]);
        }
        
        const fullYear = y < 100 ? 2000 + y : y;
        const date = new Date(fullYear, m - 1, d);
        if (!isNaN(date.getTime())) return date;
      } else if (parts.length === 2) {
        // Could be MM-YYYY or YYYY-MM
        let m = parseInt(parts[0]);
        let y = parseInt(parts[1]);
        if (parts[0].length === 4 || m > 12) {
          y = parseInt(parts[0]);
          m = parseInt(parts[1]);
        }
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
        (m.generic && m.generic.toLowerCase().includes(q)) ||
        (q === 'refrig' && m.isRefrigerated) ||
        (q === 'refridge' && m.isRefrigerated) ||
        (q === 'refrigerated' && m.isRefrigerated)
      );
    }

    // Stock Status (Single-select, "all" default)
    if (stockFilter !== 'all') {
      result = result.filter(m => {
        const isOutOfStock = m.qoh <= 0;
        const isLowStock = !isOutOfStock && m.maxQty > 0 && m.qoh < m.maxQty * 0.3;
        const isInStock = !isOutOfStock && !isLowStock;
        
        if (stockFilter === 'in') return isInStock;
        if (stockFilter === 'low') return isLowStock;
        if (stockFilter === 'out') return isOutOfStock;
        return true;
      });
    }

    // Classification (Single-select or unselect)
    if (classificationFilter) {
      result = result.filter(m => {
        const isQatari = !!(m.qatari && (m.qatari.trim().toUpperCase() === 'TRUE' || m.qatari.trim().toUpperCase() === 'QATARI'));
        const isRestricted = !!(m.restriction && m.restriction.trim() !== '');
        
        if (classificationFilter === 'qatari') return isQatari;
        if (classificationFilter === 'restricted') return isRestricted;
        return true;
      });
    }

    // Type (Single-select or unselect)
    if (typeFilter) {
      result = result.filter(m => {
        const isGeneric = !!(m.generic && m.generic.toLowerCase().includes('generic'));
        const isBrand = !!(m.generic && m.generic.toLowerCase().includes('brand'));
        
        if (typeFilter === 'generic') return isGeneric;
        if (typeFilter === 'brand') return isBrand;
        return true;
      });
    }

    // Refrigerated filter (Ref selection or unselect)
    if (refFilter) {
      result = result.filter(m => !!m.isRefrigerated);
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
  }, [medications, searchQuery, sortField, sortOrder, expStart, expEnd, physicalCounts, stockFilter, classificationFilter, typeFilter, refFilter]);

  const filterCounts = useMemo(() => {
    const all = medications.length;
    const inStock = medications.filter(m => m.qoh > 0 && !(m.maxQty > 0 && m.qoh < m.maxQty * 0.3)).length;
    const lowStock = medications.filter(m => m.qoh > 0 && m.maxQty > 0 && m.qoh < m.maxQty * 0.3).length;
    const outOfStock = medications.filter(m => m.qoh <= 0).length;
    const qatari = medications.filter(m => m.qatari && (m.qatari.trim().toUpperCase() === 'TRUE' || m.qatari.trim().toUpperCase() === 'QATARI') && m.qoh > 0).length;
    const restricted = medications.filter(m => m.restriction && m.restriction.trim() !== '' && m.qoh > 0).length;
    const generics = medications.filter(m => m.generic && m.generic.toLowerCase().includes('generic') && m.qoh > 0).length;
    const brands = medications.filter(m => m.generic && m.generic.toLowerCase().includes('brand') && m.qoh > 0).length;
    const refrigerated = medications.filter(m => m.isRefrigerated && m.qoh > 0).length;

    return { all, inStock, lowStock, outOfStock, qatari, restricted, generics, brands, refrigerated };
  }, [medications]);

  const availableGenericsCount = filterCounts.generics;
  const availableBrandsCount = filterCounts.brands;

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
    const displayDate = formatSafeDate(lastUpdate, 'EEEE, dd-MM-yyyy hh:mm a', 'NO DATA').toUpperCase();
    const aoa: any[][] = [
      ['LAST UPDATE:', displayDate],
      [],
      ['Item Code', 'Item Name', 'Current QOH', 'Min', 'Max', 'Physical Count', 'Variance', 'Last Updated']
    ];

    sortedMeds.forEach(m => {
      const physical = physicalCounts[m.id] ?? m.qoh;
      const variance = physical - m.qoh;
      aoa.push([
        m.itemCode,
        m.itemName,
        m.qoh,
        m.minQty || 0,
        m.maxQty || 0,
        physical,
        variance,
        formatSafeDate(m.lastUpdatedAt, 'yyyy-MM-dd HH:mm', '-')
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
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
    const displayDate = formatSafeDate(lastUpdate, 'EEEE, dd-MM-yyyy hh:mm a', 'NO DATA').toUpperCase();
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
        formatSafeDate(m.lastUpdatedAt, 'yyyy-MM-dd HH:mm', '-')
      ];
    });

    const csvContent = [
      `"LAST UPDATE: ${displayDate}"`,
      "",
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
            <div className="flex items-center gap-2 px-3 py-1 bg-[#F27D26]/5 rounded-full text-[10px] font-bold text-[#F27D26] uppercase tracking-widest border border-[#F27D26]/10">
              <UploadCloud className="w-3 h-3" />
              <span className="opacity-60 text-[#141414]">Last Update:</span>
              <span className="text-[#F27D26]">
                {formatSafeDate(lastUpdate, 'EEEE, dd-MM-yyyy hh:mm a', 'No Data').toUpperCase()}
              </span>
            </div>
          </div>
          <p className="text-[#141414]/50">Perform physical stock verification and reconcile variances.</p>
        </div>
        
        <div className="flex gap-2">
            <button
              onClick={() => {
                setTypeFilter(prev => prev === 'generic' ? null : 'generic');
              }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                typeFilter === 'generic' 
                  ? 'bg-yellow-400 text-white shadow-lg ring-2 ring-yellow-400/20' 
                  : 'bg-yellow-50 text-yellow-700 border border-yellow-100 hover:bg-yellow-100 shadow-sm'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              Available Generics ({availableGenericsCount})
            </button>
            <button
              onClick={() => {
                setTypeFilter(prev => prev === 'brand' ? null : 'brand');
              }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                typeFilter === 'brand' 
                  ? 'bg-orange-400 text-white shadow-lg ring-2 ring-orange-400/20' 
                  : 'bg-orange-50 text-orange-700 border border-orange-100 hover:bg-orange-100 shadow-sm'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              Available Brands ({availableBrandsCount})
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
              className="flex items-center gap-2 px-4 py-2 text-white hover:bg-white/10 rounded-lg transition-all text-xs font-bold border-r border-white/5"
              title="Download Excel"
            >
              <FileSpreadsheet className="w-4 h-4 text-[#F27D26]" />
              Excel
            </button>
            <button 
              onClick={() => setShowBrandGenericReport(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-400 to-amber-500 hover:from-orange-500 hover:to-amber-600 rounded-lg transition-all text-white text-xs font-extrabold uppercase tracking-widest px-3"
              title="Brand vs Generic Report"
            >
              <ClipboardList className="w-4 h-4" />
              Brand vs Generic
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
                ? 'border-[#141414]/30 bg-[#141414]/[0.01]' 
                : 'border-[#141414]/10'
            } ${stat.interactive ? 'cursor-pointer hover:bg-[#141414]/[0.02] active:scale-[0.98]' : ''}`}
          >
            {stat.highlight && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-x-0 bottom-0 h-1 bg-[#141414]/10"
              />
            )}
            <div>
              <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${stat.highlight ? 'text-[#141414]' : 'text-[#141414]/40'}`}>
                {stat.label}
              </p>
              <div className="flex items-center gap-2">
                <p className={`text-2xl font-black ${stat.highlight ? 'text-[#141414]' : ''}`}>{stat.value}</p>
                {stat.interactive && isSyncing && (
                  <Loader2 className="w-4 h-4 animate-spin text-[#141414]/40" />
                )}
              </div>
            </div>
            <stat.icon className={`w-8 h-8 transition-all ${stat.highlight ? 'text-[#141414] opacity-20' : 'opacity-20'} ${stat.interactive && isSyncing ? 'animate-spin' : ''}`} />
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white p-6 rounded-2xl border border-[#141414]/10 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex flex-wrap gap-2">
            {LOCATIONS.filter(loc => !(isMesaieedHidden && loc.id === PharmacyLocation.MESAIEED)).map(loc => (
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
              showFilters || stockFilter !== 'all' || classificationFilter !== null || typeFilter !== null || refFilter || expStart || expEnd
              ? 'bg-[#141414] text-white shadow-lg'
              : 'bg-[#141414]/5 text-[#141414]/60 hover:bg-[#141414]/10'
            }`}
          >
            <Filter className="w-4 h-4" />
            {showFilters ? 'Hide Filters' : 'Advanced Filters'}
          </button>
        </div>

        {(stockFilter !== 'all' || classificationFilter !== null || typeFilter !== null || refFilter || expStart || expEnd) && (
          <div className="flex flex-wrap items-center gap-2 p-3 bg-[#141414]/[0.02] rounded-xl border border-[#141414]/5 animate-in slide-in-from-top-2">
            <span className="text-[9px] font-bold uppercase tracking-widest text-[#141414]/40 flex items-center gap-1">
              Active Filters:
            </span>
            {stockFilter !== 'all' && (
              <span className="px-2 py-0.5 bg-white text-[#141414] rounded-md text-[9px] font-bold shadow-sm border border-[#141414]/5">
                Stock: {stockFilter === 'in' ? 'In Stock' : stockFilter === 'low' ? 'Low Stock' : 'Out of Stock'}
              </span>
            )}
            {classificationFilter !== null && (
              <span className="px-2 py-0.5 bg-white text-[#141414] rounded-md text-[9px] font-bold shadow-sm border border-[#141414]/5">
                Class: {classificationFilter === 'qatari' ? 'Qatari' : 'Restricted'}
              </span>
            )}
            {typeFilter !== null && (
              <span className="px-2 py-0.5 bg-white text-[#141414] rounded-md text-[9px] font-bold shadow-sm border border-[#141414]/5">
                Type: {typeFilter === 'generic' ? 'Generics' : 'Brands'}
              </span>
            )}
            {refFilter && (
              <span className="px-2 py-0.5 bg-white text-[#141414] rounded-md text-[9px] font-bold shadow-sm border border-[#141414]/5 flex items-center gap-1">
                <ThermometerSnowflake className="w-2.5 h-2.5 text-[#141414]/60" />
                Storage: Refrigerated
              </span>
            )}
            {(expStart || expEnd) && (
              <span className="px-2 py-0.5 bg-white text-[#141414] rounded-md text-[9px] font-bold shadow-sm border border-[#141414]/5">
                Exp Range: {expStart || '*'} to {expEnd || '*'}
              </span>
            )}
            <button 
              onClick={() => { setStockFilter('all'); setClassificationFilter(null); setTypeFilter(null); setRefFilter(false); setExpStart(''); setExpEnd(''); }}
              className="ml-auto text-[10px] font-bold text-red-500 hover:underline"
            >
              Clear All
            </button>
          </div>
        )}

        {showFilters && (
          <div className="flex flex-col gap-5 pt-4 border-t border-[#141414]/5 animate-in slide-in-from-top-2">
            
            {/* Grid of dynamic selection options */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              
              {/* Stock Status selector */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 ml-1">Stock Status</span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setStockFilter('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                      stockFilter === 'all'
                        ? 'bg-[#141414] text-white border-[#141414]'
                        : 'bg-white text-[#141414]/65 border-[#141414]/5 hover:bg-[#141414]/5'
                    }`}
                  >
                    All ({filterCounts.all})
                  </button>
                  {[
                    { id: 'in', label: 'In Stock', count: filterCounts.inStock, color: 'bg-emerald-500 text-white border-emerald-500' },
                    { id: 'low', label: 'Low Stock', count: filterCounts.lowStock, color: 'bg-amber-500 text-white border-amber-500' },
                    { id: 'out', label: 'Out of Stock', count: filterCounts.outOfStock, color: 'bg-red-500 text-white border-red-500' }
                  ].map(f => {
                    const active = stockFilter === f.id;
                    return (
                      <button
                        key={f.id}
                        onClick={() => setStockFilter(f.id as any)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                          active ? f.color : 'bg-white text-[#141414]/65 border-[#141414]/10 hover:bg-[#141414]/5'
                        }`}
                      >
                        {f.label} ({f.count})
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Classification selector */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 ml-1">Classification</span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: 'qatari', label: 'Qatari', count: filterCounts.qatari, color: 'bg-[#F27D26] text-white border-[#F27D26]' },
                    { id: 'restricted', label: 'Restricted', count: filterCounts.restricted, color: 'bg-blue-500 text-white border-blue-500' }
                  ].map(f => {
                    const active = classificationFilter === f.id;
                    return (
                      <button
                        key={f.id}
                        onClick={() => {
                          setClassificationFilter(prev => prev === f.id ? null : f.id as any);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                          active ? f.color : 'bg-white text-[#141414]/65 border-[#141414]/10 hover:bg-[#141414]/5'
                        }`}
                      >
                        {f.label} ({f.count})
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Type Category selector */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 ml-1">Type</span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: 'generic', label: 'Generics', count: filterCounts.generics, color: 'bg-yellow-500 text-white border-yellow-500' },
                    { id: 'brand', label: 'Brands', count: filterCounts.brands, color: 'bg-orange-500 text-white border-orange-500' }
                  ].map(f => {
                    const active = typeFilter === f.id;
                    return (
                      <button
                        key={f.id}
                        onClick={() => {
                          setTypeFilter(prev => prev === f.id ? null : f.id as any);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                          active ? f.color : 'bg-white text-[#141414]/65 border-[#141414]/10 hover:bg-[#141414]/5'
                        }`}
                      >
                        {f.label} ({f.count})
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Refrigeration (Ref) Category */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 ml-1">Storage</span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setRefFilter(prev => !prev)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border flex items-center gap-1.5 ${
                      refFilter
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'bg-white text-[#141414]/65 border-[#141414]/10 hover:bg-[#141414]/5'
                    }`}
                  >
                    <ThermometerSnowflake className="w-3 h-3" />
                    Ref Storage ({filterCounts.refrigerated})
                  </button>
                </div>
              </div>

            </div>

            {/* Date range selection */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-[#141414]/5">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 ml-1">
                  Exp. Range (Start)
                </label>
                <input
                  type="date"
                  value={expStart}
                  onChange={(e) => setExpStart(e.target.value)}
                  className="w-full px-4 py-2 bg-white border border-[#141414]/10 rounded-xl text-sm focus:ring-2 focus:ring-[#F27D26]/10 transition-all font-medium"
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
                  className="w-full px-4 py-2 bg-white border border-[#141414]/10 rounded-xl text-sm focus:ring-2 focus:ring-[#F27D26]/10 transition-all font-medium"
                />
              </div>

              <div className="flex items-end">
                <button
                  onClick={() => {
                    setStockFilter('all');
                    setClassificationFilter(null);
                    setTypeFilter(null);
                    setRefFilter(false);
                    setExpStart('');
                    setExpEnd('');
                    setSearchQuery('');
                  }}
                  className="w-full h-10 flex items-center justify-center gap-2 bg-red-50 text-red-500 border border-red-100 rounded-xl text-xs font-bold hover:bg-red-100 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                  Reset All Filters
                </button>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* Search Input directly above items table */}
      <div className="relative group mb-4">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#141414]/30 group-focus-within:text-[#F27D26] transition-colors" />
        <input
          type="text"
          placeholder="Search by code or name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-11 pr-10 py-3 bg-white border border-[#141414]/10 rounded-2xl shadow-sm focus:ring-2 focus:ring-[#F27D26]/20 transition-all text-sm font-medium focus:border-transparent"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 hover:bg-[#141414]/5 rounded-lg text-[#141414]/40 transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Audit View - Table on desktop, Cards on mobile */}
      <div className="bg-white rounded-2xl border border-[#141414]/10 shadow-sm overflow-hidden min-h-[400px]">
        {/* Desktop View */}
        <div className="hidden md:block overflow-x-auto max-h-[75vh]">
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
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-[#141414]/20" />
                  </td>
                </tr>
              )}
              {!loading && sortedMeds.map((med, idx) => {
                const physical = physicalCounts[med.id] ?? med.qoh;
                const variance = physical - med.qoh;
                const hasVariance = variance !== 0;

                return (
                  <tr key={`${med.id || 'med'}-${med.locationId || ''}-${idx}`} className="hover:bg-[#141414]/[0.01] transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-mono text-[#141414]/40 mb-0.5">{med.itemCode}</span>
                        <button 
                          onClick={() => startEdit(med)}
                          className="text-sm font-bold text-[#141414] hover:text-[#F27D26] transition-colors text-left"
                        >
                          {med.itemName}
                        </button>
                        {med.isRefrigerated && (
                          <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-[10px] font-black uppercase tracking-tight w-fit border border-blue-200 shadow-sm mt-1">
                            <ThermometerSnowflake size={12} className="text-blue-600 animate-pulse" />
                            REFRIGERATED
                          </div>
                        )}
                        {med.generic && (
                          <span className="text-[10px] italic text-[#141414]/40 leading-tight">{med.generic}</span>
                        )}
                        <div className="flex flex-wrap gap-1 mt-1.5" onClick={(e) => e.stopPropagation()}>
                          <span className="text-[9px] font-bold uppercase tracking-wider text-[#141414]/40 self-center">Other locations:</span>
                          {getOtherLocationsAvailability(med.itemCode, selectedLocation, true)}
                        </div>
                        <span className="text-[9px] text-[#141414]/30 mt-1 uppercase italic">
                          Last Updated: {formatSafeDate(med.lastUpdatedAt, 'dd MMM, HH:mm', '-')}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold bg-[#141414]/5 px-2 py-1 rounded">{formatNumber(med.qoh)}</span>
                        </div>
                        {(() => {
                          const isOutOfStock = med.qoh <= 0;
                          const isLowStock = !isOutOfStock && med.maxQty > 0 && med.qoh < med.maxQty * 0.3;
                          return (
                            <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded w-fit ${
                              isOutOfStock ? 'bg-red-100 text-red-600' : isLowStock ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'
                            }`}>
                              {isOutOfStock ? 'Out of Stock' : isLowStock ? 'Low Stock' : 'In Stock'}
                            </span>
                          );
                        })()}
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
            </tbody>
          </table>
        </div>

        {/* Mobile View */}
        <div className="md:hidden divide-y divide-[#141414]/5">
          {loading && (
            <div className="p-20 text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-[#141414]/20" />
            </div>
          )}
          {!loading && sortedMeds.map((med, idx) => {
            const physical = physicalCounts[med.id] ?? med.qoh;
            const variance = physical - med.qoh;
            const hasVariance = variance !== 0;

            return (
              <div key={`${med.id || 'med'}-${med.locationId || ''}-${idx}`} className="p-4 space-y-4">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <span className="text-[10px] font-mono text-[#141414]/40 uppercase tracking-widest">{med.itemCode}</span>
                    <h3 className="font-bold text-[#141414] leading-tight">{med.itemName}</h3>
                    {med.isRefrigerated && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[8px] font-black uppercase tracking-tighter">
                        <ThermometerSnowflake size={8} />
                        Refrigerated
                      </span>
                    )}
                    {med.generic && (
                      <p className="text-[10px] italic text-[#141414]/40 leading-none">{med.generic}</p>
                    )}
                    <div className="flex flex-wrap gap-1 mt-1.5 mb-1 bg-[#141414]/[0.02] p-1.5 rounded-lg border border-[#141414]/5" onClick={(e) => e.stopPropagation()}>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-[#141414]/40 self-center">Other locations:</span>
                      {getOtherLocationsAvailability(med.itemCode, selectedLocation, true)}
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    <span className="text-sm font-black bg-[#141414]/5 px-2 py-1 rounded">{formatNumber(med.qoh)}</span>
                    <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${
                      med.qoh <= 0 ? 'bg-red-100 text-red-600' : (med.maxQty > 0 && med.qoh < med.maxQty * 0.3) ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'
                    }`}>
                      {med.qoh <= 0 ? 'Out' : (med.maxQty > 0 && med.qoh < med.maxQty * 0.3) ? 'Low' : 'OK'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest block ml-1">Physical Count</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={physicalCounts[med.id] ?? ''}
                      placeholder={formatNumber(med.qoh)}
                      onChange={(e) => handlePhysicalCountChange(med.id, e.target.value)}
                      className={`w-full px-4 py-3 bg-[#141414]/5 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-[#F27D26]/20 transition-all ${
                        hasVariance ? 'ring-2 ring-orange-200 bg-orange-50/50' : ''
                      }`}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest block ml-1">Variance</label>
                    <div className={`h-[44px] flex items-center justify-center px-4 rounded-xl text-sm font-black border ${
                      hasVariance 
                        ? variance > 0 ? 'bg-blue-50 border-blue-100 text-blue-600' : 'bg-red-50 border-red-100 text-red-600'
                        : 'bg-[#141414]/5 border-transparent text-[#141414]/20'
                    }`}>
                      {hasVariance ? (
                        <>
                          <ArrowUpRight className={`w-3 h-3 mr-1 ${variance < 0 ? 'rotate-180' : ''}`} />
                          {variance > 0 ? '+' : ''}{formatNumber(variance)}
                        </>
                      ) : '0'}
                    </div>
                  </div>
                </div>

                {hasVariance && (
                  <button
                    onClick={() => handleAdjust(med)}
                    className="w-full py-4 bg-[#141414] text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-[#F27D26] shadow-xl transition-all flex items-center justify-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    Reconcile Variance
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {sortedMeds.length === 0 && !loading && (
          <div className="p-20 text-center flex flex-col items-center gap-4">
            <Search className="w-8 h-8 text-[#141414]/10" />
            <p className="font-bold text-[#141414]/40 uppercase tracking-widest text-sm">No items found</p>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      <AnimatePresence>
        {(isAdding || editingId) && (
          <MedicationFormModal
            isOpen={true}
            onClose={() => {
              setIsAdding(false);
              setEditingId(null);
              setForm({});
            }}
            onSave={async (data) => {
              setIsUpdating(true);
              try {
                // Auto-translate logic if needed
                const dataToSave = { ...data };
                
                if (editingId) {
                  await medicationOps.update(editingId, dataToSave);
                }
                
                await refresh();
                setEditingId(null);
                setIsAdding(false);
                setSuccess('Item updated successfully');
                setTimeout(() => setSuccess(null), 3000);
              } catch (err: any) {
                setError(err.message || 'Update failed');
                throw err;
              } finally {
                setIsUpdating(false);
              }
            }}
            onDelete={async (id) => {
              if (window.confirm('Are you sure you want to delete this item?')) {
                await medicationOps.delete(id);
                await refresh();
                setEditingId(null);
              }
            }}
            initialData={form as any}
            isAdding={isAdding}
            locationId={selectedLocation}
            onStartCapture={() => {
              // Camera logic - focus on file upload for now in this view
            }}
          />
        )}
      </AnimatePresence>

      {/* Success Toast */}
      <AnimatePresence>
        {success && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 bg-emerald-600 text-white rounded-2xl shadow-2xl z-[200] font-bold text-sm"
          >
            {success}
          </motion.div>
        )}
      </AnimatePresence>

      <BrandGenericReportModal
        isOpen={showBrandGenericReport}
        onClose={() => setShowBrandGenericReport(false)}
        medications={medications}
        lastUpdate={lastUpdate}
        selectedLocation={selectedLocation}
      />
    </div>
  );
}
