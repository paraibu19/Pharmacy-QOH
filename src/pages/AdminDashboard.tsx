import React, { useState, useRef, useMemo, useEffect } from 'react';
import { 
  Plus, Upload, Trash2, Edit2, Check, X, FileSpreadsheet, 
  ClipboardPaste, Save, AlertCircle, Info, ArrowLeftRight, Loader2,
  AlertTriangle, Settings2, CalendarClock, History, RotateCcw, Search, Sparkles, RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PharmacyLocation, Medication } from '../types';
import { LOCATIONS } from '../constants';
import * as XLSX from 'xlsx';
import { format, differenceInDays, isBefore, startOfToday, isSameMonth, addMonths, startOfMonth } from 'date-fns';
import { useMedications } from '../hooks/useMedications';
import { medicationOps, systemOps } from '../lib/firebaseOperations';

import { db } from '../lib/firebase';

const DRAFT_STORAGE_KEY = 'admin_medication_draft';

export default function AdminDashboard() {
  const [selectedLocation, setSelectedLocation] = useState<PharmacyLocation>(PharmacyLocation.ADULT);
  const { medications, loading, refresh, lastSynced, isSyncing } = useMedications(selectedLocation);
  const [isAdding, setIsAdding] = useState(false);
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [bulkInput, setBulkInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [alertThreshold, setAlertThreshold] = useState<number>(90);
  const [hasDraft, setHasDraft] = useState(false);
  const [expSearchQuery, setExpSearchQuery] = useState('');
  const [expSearchMonth, setExpSearchMonth] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [showSyncPulse, setShowSyncPulse] = useState(false);
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [selectedMedForEdit, setSelectedMedForEdit] = useState<Medication | null>(null);
  const [editMin, setEditMin] = useState<string>('');
  const [editMax, setEditMax] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [sortField, setSortField] = useState<string>('itemName');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-dismiss alerts
  useEffect(() => {
    if (success || error) {
      const timer = setTimeout(() => {
        setSuccess(null);
        setError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [success, error]);

  // Form state for new/edit
  const [form, setForm] = useState<Partial<Medication>>({
    itemCode: '',
    itemName: '',
    qoh: 0,
    minQty: 0,
    maxQty: 0,
    expiration1: '',
    expiration2: '',
    expiration3: ''
  });

  // Check for draft on mount
  useEffect(() => {
    const savedDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (savedDraft) {
      setHasDraft(true);
    }
  }, []);

  // Auto-save logic
  useEffect(() => {
    if (isAdding || editingId) {
      const draft = {
        form,
        isAdding,
        editingId,
        locationId: selectedLocation,
        timestamp: Date.now()
      };
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    }
  }, [form, isAdding, editingId, selectedLocation]);

  const restoreDraft = () => {
    const savedDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (savedDraft) {
      const { form: draftForm, isAdding: draftAdding, editingId: draftEditingId, locationId: draftLocationId } = JSON.parse(savedDraft);
      setSelectedLocation(draftLocationId);
      setForm(draftForm);
      setIsAdding(draftAdding);
      setEditingId(draftEditingId);
      setHasDraft(false);
    }
  };

  const clearDraft = () => {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    setHasDraft(false);
  };

  useEffect(() => {
    if (medications.length > 0) {
      setShowSyncPulse(true);
      const timer = setTimeout(() => setShowSyncPulse(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [medications]);

  // Expiration helper
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

  const expiringItems = useMemo(() => {
    const today = startOfToday();
    let result = medications.map(med => {
      const dates = [med.expiration1, med.expiration2, med.expiration3]
        .map(parseExpDate)
        .filter(d => d !== null && !isBefore(d, today)) as Date[];
      
      if (dates.length === 0) return null;
      
      const nextExp = new Date(Math.min(...dates.map(d => d.getTime())));
      const daysLeft = differenceInDays(nextExp, today);
      
      if (daysLeft <= alertThreshold) {
        return { ...med, daysLeft, nextExp };
      }
      return null;
    }).filter(Boolean) as (Medication & { daysLeft: number; nextExp: Date })[];

    if (expSearchMonth) {
      const [year, month] = expSearchMonth.split('-').map(Number);
      result = result.filter(item => {
        return item.nextExp.getFullYear() === year && (item.nextExp.getMonth() + 1) === month;
      });
    }

    if (expSearchQuery) {
      const query = expSearchQuery.toLowerCase();
      result = result.filter(item => {
        const formattedDate = format(item.nextExp, 'dd-MM-yyyy').toLowerCase();
        const itemName = item.itemName.toLowerCase();
        const itemCode = item.itemCode.toLowerCase();
        return formattedDate.includes(query) || itemName.includes(query) || itemCode.includes(query);
      });
    }

    return result.sort((a, b) => (a.daysLeft || 0) - (b.daysLeft || 0));
  }, [medications, alertThreshold, expSearchQuery]);

  const expirationStats = useMemo(() => {
    const today = new Date();
    const currentM = startOfMonth(today);
    const nextM = startOfMonth(addMonths(today, 1));
    const thirdM = startOfMonth(addMonths(today, 2));

    let current = 0;
    let next = 0;
    let third = 0;

    medications.forEach(med => {
      const d1 = parseExpDate(med.expiration1);
      if (d1) {
        const m = startOfMonth(d1);
        if (isSameMonth(m, currentM)) current++;
        else if (isSameMonth(m, nextM)) next++;
        else if (isSameMonth(m, thirdM)) third++;
      }
    });

    return { current, next, third };
  }, [medications]);

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const sortedMedications = useMemo(() => {
    return [...medications].sort((a, b) => {
      const multiplier = sortOrder === 'asc' ? 1 : -1;
      
      if (['qoh', 'minQty', 'maxQty'].includes(sortField)) {
        const valA = Number(a[sortField as keyof Medication]) || 0;
        const valB = Number(b[sortField as keyof Medication]) || 0;
        return (valA - valB) * multiplier;
      }
      
      if (sortField.startsWith('expiration')) {
        const dateA = parseExpDate(a[sortField as keyof Medication] as string);
        const dateB = parseExpDate(b[sortField as keyof Medication] as string);
        
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1 * multiplier;
        if (!dateB) return -1 * multiplier;
        
        return (dateA.getTime() - dateB.getTime()) * multiplier;
      }
      
      const valA = String(a[sortField as keyof Medication] || '').toLowerCase();
      const valB = String(b[sortField as keyof Medication] || '').toLowerCase();
      
      if (valA < valB) return -1 * multiplier;
      if (valA > valB) return 1 * multiplier;
      return 0;
    });
  }, [medications, sortField, sortOrder]);

  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        setIsImporting(true);
        setError(null);
        setSuccess(null);
        const dataBuffer = evt.target?.result;
        const wb = XLSX.read(dataBuffer, { type: 'array', cellDates: true });
        const allMedsList: any[] = [];
        let sheetsFound = 0;

        const getRowValue = (row: any, keys: string[]) => {
          const rowKeys = Object.keys(row);
          for (const k of keys) {
            const normalizedK = k.toLowerCase().replace(/[\s\-_.]/g, '');
            const found = rowKeys.find(rk => {
              const normalizedRK = rk.toLowerCase().replace(/[\s\-_.]/g, '');
              
              // Exact match or prefix/suffix match
              if (normalizedRK === normalizedK || normalizedRK.startsWith(normalizedK) || normalizedK.startsWith(normalizedRK)) {
                return true;
              }

              // Special handling for Exp 1, 2, 3
              const digitMatch = normalizedK.match(/\d/);
              if (digitMatch && (normalizedK.includes('exp') || normalizedK.includes('expiry'))) {
                const digit = digitMatch[0];
                const rkHasDigit = normalizedRK.includes(digit);
                const rkIsExp = normalizedRK.includes('exp') || normalizedRK.includes('expiry');
                if (rkHasDigit && rkIsExp) return true;
              }
              
              return false;
            });
            if (found !== undefined) return row[found];
          }
          return undefined;
        };

        const formatExp = (val: any) => {
          if (val === undefined || val === null || val === '') return '';
          
          let dateObj: Date | null = null;

          if (val instanceof Date) {
            dateObj = val;
          } else if (typeof val === 'number') {
            // Excel serial date fallback
            try {
              const parsed = XLSX.SSF.parse_date_code(val);
              dateObj = new Date(parsed.y, parsed.m - 1, parsed.d);
            } catch (e) {
              return String(val);
            }
          } else if (typeof val === 'string') {
            dateObj = parseExpDate(val);
          }

          if (dateObj && !isNaN(dateObj.getTime())) {
            return format(dateObj, 'dd-MM-yyyy');
          }
          
          return String(val);
        };

        let sheetsTotal = wb.SheetNames.length;
        wb.SheetNames.forEach(wsname => {
          let locationId: PharmacyLocation | null = null;
          const lowerName = wsname.toLowerCase().trim();
          
          // Location keywords with more variants
          if (lowerName.match(/adult|male|main/i)) locationId = PharmacyLocation.ADULT;
          else if (lowerName.match(/pediatric|peds|child|ped/i)) locationId = PharmacyLocation.PEDIATRIC;
          else if (lowerName.match(/mesaieed|mesai|msd|mes/i)) locationId = PharmacyLocation.MESAIEED;

          // Single sheet fallback
          if (!locationId && sheetsTotal === 1) {
            locationId = selectedLocation;
          }

          if (!locationId) return;
          sheetsFound++;

          const ws = wb.Sheets[wsname];
          const dataRows = XLSX.utils.sheet_to_json(ws) as any[];

          const sheetMeds = dataRows.map((row) => {
            // Very permissive field mapping
            const itemCode = String(getRowValue(row, ['itemCode', 'Code', 'ItemNo', 'Item No', 'Product Code', 'Reference']) || '');
            const itemName = String(getRowValue(row, ['itemName', 'Name', 'Description', 'ItemName', 'Item Name', 'Product']) || '');
            
            if (!itemName) return null;

            return {
              itemCode: itemCode || `TEMP-${Math.random().toString(36).substr(2, 5)}`,
              itemName,
              qoh: Number(getRowValue(row, ['qoh', 'Quantity', 'Qty', 'Stock', 'Inventory', 'Total', 'Available']) || 0),
              minQty: Number(getRowValue(row, ['minQty', 'Min', 'Order Min', 'Minimum']) || 0),
              maxQty: Number(getRowValue(row, ['maxQty', 'Max', 'Order Max', 'Maximum']) || 0),
              expiration1: formatExp(getRowValue(row, ['exp1', 'expir1', 'expir_1', 'expiry1', 'primary exp', 'expiration1', 'exp date 1'])),
              expiration2: formatExp(getRowValue(row, ['exp2', 'expir2', 'expir_2', 'expiry2', 'secondary exp', 'expiration2', 'exp date 2'])),
              expiration3: formatExp(getRowValue(row, ['exp3', 'expir3', 'expir_3', 'expiry3', 'final exp', 'expiration3', 'exp date 3'])),
              locationId: locationId!,
            };
          }).filter(Boolean) as any[];

          allMedsList.push(...sheetMeds);
        });

        if (allMedsList.length === 0) {
          if (sheetsFound === 0) {
            throw new Error(`Could not identify locations from sheet names: ${wb.SheetNames.join(', ')}. Please rename sheets to 'Adult', 'Pediatric', or 'Mesaieed'.`);
          }
          throw new Error("No valid medication data found in the matched sheets.");
        }

        await medicationOps.bulkAdd(allMedsList);
        await refresh();
        setSuccess(`Success: Imported/Updated ${allMedsList.length} items to ${sheetsFound} locations.`);
        setIsBulkMode(false);
      } catch (error: any) {
        setError(error.message);
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handlePasteImport = async () => {
    try {
      setIsImporting(true);
      setError(null);
      const rows = bulkInput.split('\n');
      const newMedsList = rows.map((row) => {
        const parts = row.split(/\t|,/);
        if (parts.length < 3) return null;
        return {
          itemCode: parts[0]?.trim(),
          itemName: parts[1]?.trim(),
          qoh: Number(parts[2]?.trim()) || 0,
          minQty: Number(parts[4]?.trim()) || 0,
          maxQty: Number(parts[5]?.trim()) || 0,
          expiration1: parts[6]?.trim() || '',
          expiration2: parts[7]?.trim() || '',
          expiration3: parts[8]?.trim() || '',
          locationId: selectedLocation,
        };
      }).filter(m => m !== null) as any[];

      await medicationOps.bulkAdd(newMedsList);
      await refresh();
      setBulkInput('');
      setSuccess(`Successfully imported ${newMedsList.length} items.`);
      setIsBulkMode(false);
    } catch (error: any) {
      setError(error.message);
    } finally {
      setIsImporting(false);
    }
  };

  const handleSave = async (id?: string) => {
    if (!form.itemCode || !form.itemName) return;
    
    // Check for duplicate item code within the same location
    const formattedCode = form.itemCode.trim().toLowerCase();
    const isDuplicate = medications.some(m => 
      m.itemCode.trim().toLowerCase() === formattedCode && 
      m.id !== editingId
    );

    if (isDuplicate) {
      setError(`Duplicate Item Code: "${form.itemCode}" already exists in this location.`);
      return;
    }
    
    try {
      setError(null);
      if (editingId) {
        await medicationOps.update(editingId, form);
      } else {
        await medicationOps.add({
          ...form,
          locationId: selectedLocation,
        } as any);
      }
      
      await refresh();
      setEditingId(null);
      setIsAdding(false);
      setForm({ itemCode: '', itemName: '', qoh: 0, minQty: 0, maxQty: 0, expiration1: '', expiration2: '', expiration3: '' });
      clearDraft();
    } catch (error: any) {
      setError(error.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this item?')) {
      try {
        setError(null);
        await medicationOps.delete(id);
        await refresh();
      } catch (err: any) {
        setError(err.message || 'Failed to delete medication. Please try again.');
        console.error(err);
      }
    }
  };

  const startEdit = (med: Medication) => {
    setEditingId(med.id);
    setForm({
      itemCode: med.itemCode,
      itemName: med.itemName,
      qoh: med.qoh,
      minQty: med.minQty ?? 0,
      maxQty: med.maxQty ?? 0,
      expiration1: med.expiration1,
      expiration2: med.expiration2,
      expiration3: med.expiration3
    });
  };

  const handleSystemReset = async () => {
    const currentAdminPassword = localStorage.getItem('adminPassword') || 'admin123';
    
    if (resetPassword !== currentAdminPassword) {
      setResetError('Incorrect password. Reset aborted.');
      return;
    }

    try {
      setIsResetting(true);
      setResetError('');
      await systemOps.resetAll();
      await refresh();
      setSuccess('Application has been successfully reset.');
      setIsResetModalOpen(false);
      setResetPassword('');
    } catch (err: any) {
      setResetError(err.message || 'Reset failed.');
    } finally {
      setIsResetting(false);
    }
  };

  const startCorrection = (med: Medication) => {
    setSelectedMedForEdit(med);
    setEditMin(String(med.minQty || 0));
    setEditMax(String(med.maxQty || 0));
    setShowCorrectionModal(true);
  };

  const saveCorrection = async () => {
    if (!selectedMedForEdit) return;
    setIsUpdating(true);
    try {
      await medicationOps.update(selectedMedForEdit.id, {
        minQty: Number(editMin),
        maxQty: Number(editMax)
      });
      setShowCorrectionModal(false);
      setSelectedMedForEdit(null);
      await refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-6 md:space-y-8 pb-20 px-4 md:px-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-6">
        <div className="flex flex-col w-full md:w-auto">
          <div className="flex items-center justify-between md:justify-start gap-3">
            <h1 className="text-2xl md:text-3xl font-bold text-[#141414]">Management</h1>
            <button 
              onClick={() => refresh(true)}
              disabled={isSyncing}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm transition-all relative ${
                showSyncPulse
                ? 'bg-emerald-500 text-white border-emerald-600'
                : db 
                  ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' 
                  : 'bg-blue-100 text-blue-700 border border-blue-200 hover:bg-blue-200'
              } disabled:opacity-50`}
            >
              {isSyncing ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                db ? <Check className={`w-3 h-3 ${showSyncPulse ? 'animate-pulse' : ''}`} /> : <RefreshCw className="w-3 h-3" />
              )}
              {showSyncPulse ? 'Live' : db ? 'Sync' : 'Server'}
              <span className="opacity-50 font-medium ml-1 hidden sm:inline">
                {format(lastSynced, 'HH:mm:ss')}
              </span>
              {showSyncPulse && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping" />
              )}
            </button>
          </div>
          <p className="text-[#141414]/50 text-sm md:text-base">Stock inventory control panel</p>
        </div>
        
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          {hasDraft && (
            <motion.div 
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex-1 md:flex-none flex items-center justify-between md:justify-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-[10px] font-bold text-amber-700"
            >
              <div className="flex items-center gap-1.5">
                <History className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Unsaved changes</span>
              </div>
              <div className="flex gap-1">
                <button 
                  onClick={restoreDraft}
                  className="px-2 py-1 bg-amber-200 hover:bg-amber-300 rounded-md transition-colors flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  Restore
                </button>
                <button 
                  onClick={clearDraft}
                  className="px-2 py-1 bg-white hover:bg-red-50 rounded-md transition-colors text-red-500"
                >
                  Discard
                </button>
              </div>
            </motion.div>
          )}
          <button 
            onClick={() => setIsBulkMode(true)}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-3 md:py-2 border border-[#141414]/10 rounded-xl text-xs sm:text-sm font-bold hover:bg-[#141414]/5 transition-colors"
          >
            <ArrowLeftRight className="w-4 h-4" />
            Bulk Import
          </button>
          <button 
            onClick={() => setIsAdding(true)}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-3 md:py-2 bg-[#F27D26] text-white rounded-xl text-xs sm:text-sm font-bold hover:bg-[#F27D26]/90 transition-colors shadow-lg shadow-[#F27D26]/20"
          >
            <Plus className="w-4 h-4" />
            Add New
          </button>
        </div>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-between gap-4 shadow-sm"
          >
            <div className="flex items-center gap-3 text-red-700">
              <AlertCircle size={18} />
              <p className="text-sm font-bold">{error}</p>
            </div>
            <button 
              onClick={() => setError(null)}
              className="p-1 hover:bg-red-100 rounded-lg transition-colors text-red-500"
            >
              <X size={16} />
            </button>
          </motion.div>
        )}
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between gap-4 shadow-sm"
          >
            <div className="flex items-center gap-3 text-emerald-700">
              <Check size={18} />
              <p className="text-sm font-bold">{success}</p>
            </div>
            <button 
              onClick={() => setSuccess(null)}
              className="p-1 hover:bg-emerald-100 rounded-lg transition-colors text-emerald-500"
            >
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expiration Alerts Widget */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white rounded-2xl border border-[#141414]/10 shadow-sm overflow-hidden">
            <div className="p-4 bg-[#F27D26]/5 border-b border-[#141414]/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-[#F27D26]/10 rounded-lg text-[#F27D26]">
                  <AlertTriangle size={18} />
                </div>
                <h3 className="font-bold text-sm">Expiration Alerts</h3>
                <span className="bg-[#F27D26] text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                  {expiringItems.length}
                </span>
              </div>
              
              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                <div className="relative flex-1 md:flex-none">
                  <CalendarClock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#141414]/30" />
                  <input 
                    type="month" 
                    value={expSearchMonth}
                    onChange={(e) => setExpSearchMonth(e.target.value)}
                    className="w-full md:w-40 pl-9 pr-2 py-1.5 bg-white border border-[#141414]/10 rounded-lg text-[10px] font-bold focus:outline-none focus:ring-2 focus:ring-[#F27D26]/20 transition-all cursor-pointer"
                  />
                  {expSearchMonth && (
                    <button 
                      onClick={() => setExpSearchMonth('')}
                      className="absolute right-8 top-1/2 -translate-y-1/2 p-0.5 hover:bg-[#141414]/5 rounded text-[#141414]/40"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                <div className="relative flex-1 md:flex-none">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#141414]/30" />
                  <input 
                    type="text" 
                    placeholder="Search name/code..."
                    value={expSearchQuery}
                    onChange={(e) => setExpSearchQuery(e.target.value)}
                    className="w-full md:w-40 pl-9 pr-8 py-1.5 bg-white border border-[#141414]/10 rounded-lg text-[10px] font-bold focus:outline-none focus:ring-2 focus:ring-[#F27D26]/20 transition-all"
                  />
                  {expSearchQuery && (
                    <button 
                      onClick={() => setExpSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-[#141414]/5 rounded text-[#141414]/40"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest hidden sm:inline">Alert Threshold:</span>
                  <div className="flex bg-white border border-[#141414]/10 rounded-lg p-1">
                    {[30, 60, 90].map(val => (
                      <button
                        key={val}
                        onClick={() => setAlertThreshold(val)}
                        className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${
                          alertThreshold === val ? 'bg-[#141414] text-white' : 'text-[#141414]/40 hover:text-[#141414]'
                        }`}
                      >
                        {val}d
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="max-h-[300px] overflow-y-auto">
              {expiringItems.length > 0 ? (
                <div className="divide-y divide-[#141414]/5">
                  {expiringItems.map(item => item && (
                    <div key={item.id} className="p-4 flex items-center justify-between hover:bg-[#F27D26]/[0.02] transition-colors">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-[#141414]">{item.itemName}</span>
                        <span className="text-[10px] font-mono text-[#141414]/40">{item.itemCode}</span>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <div className="text-[10px] text-[#141414]/40 font-bold uppercase tracking-widest mb-0.5">Expires On</div>
                          <div className="text-[10px] font-bold text-[#141414]">
                            {format(item.nextExp, 'dd-MM-yyyy')}
                          </div>
                        </div>
                        <div className="text-right min-w-[70px]">
                          <div className="text-[10px] text-[#141414]/40 font-bold uppercase tracking-widest mb-0.5">In</div>
                          <div className={`text-sm font-bold ${item.daysLeft <= 15 ? 'text-red-500' : item.daysLeft <= 30 ? 'text-[#F27D26]' : 'text-amber-500'}`}>
                            {item.daysLeft}d
                          </div>
                        </div>
                        <div className="text-right min-w-[80px]">
                          <div className="text-[10px] text-[#141414]/40 font-bold uppercase tracking-widest mb-0.5">Qty</div>
                          <div className="text-sm font-bold">{item.qoh.toLocaleString()}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-10 text-center text-[#141414]/20 font-bold italic text-sm">
                  No medications expiring within {alertThreshold} days.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-[#141414] text-white p-6 rounded-2xl shadow-xl h-full flex flex-col justify-between">
            <div>
              <div className="p-3 bg-white/10 rounded-xl w-fit mb-4 text-[#F27D26]">
                <Settings2 size={24} />
              </div>
              <h3 className="text-xl font-bold mb-2">Inventory Stats</h3>
              <p className="text-white/50 text-sm mb-6">Real-time overview of your current pharmacy stock levels.</p>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center py-3 border-b border-white/10">
                  <span className="text-sm text-white/60">Total Items</span>
                  <span className="text-lg font-bold">{medications.length.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-start py-3 border-b border-white/10 gap-4">
                  <span className="text-sm text-white/60">EXP1 Current Month</span>
                  <span className="text-lg font-bold text-red-400">{expirationStats.current.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-start py-3 border-b border-white/10 gap-4">
                  <span className="text-sm text-white/60">EXP1 Next Month</span>
                  <span className="text-lg font-bold text-amber-400">{expirationStats.next.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-start py-3 border-b border-white/10 gap-4">
                  <span className="text-sm text-white/60">EXP1 After Next Month</span>
                  <span className="text-lg font-bold text-sky-400">{expirationStats.third.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-white/10">
                  <span className="text-sm text-white/60">Low Stock Items (qoh &le; 10)</span>
                  <span className="text-lg font-bold text-red-400">{(medications.filter(m => m.qoh <= 10).length).toLocaleString()}</span>
                </div>
              </div>
            </div>
            
            <div className="mt-8 pt-6 border-t border-white/10">
              <div className="flex items-center gap-2 text-xs font-bold text-[#F27D26]">
                <CalendarClock size={14} />
                Last Update: {format(new Date(), 'HH:mm')}
              </div>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isBulkMode && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsBulkMode(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-4xl bg-[#141414] text-white p-6 md:p-8 rounded-[2rem] md:rounded-3xl shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center sticky top-0 bg-[#141414] z-10 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 md:p-3 bg-[#F27D26]/20 rounded-2xl text-[#F27D26]">
                    <FileSpreadsheet size={20} className="md:w-6 md:h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg md:text-xl font-bold">Bulk Stock Import</h3>
                    <p className="text-white/40 text-[10px] md:text-sm">Upload Excel or paste a list of items</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsBulkMode(false)}
                  className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                >
                  <X className="w-6 h-6 opacity-50" />
                </button>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
                <div className="space-y-6">
                  <div className="p-4 md:p-6 bg-white/5 rounded-2xl border border-white/10 flex flex-col items-center text-center">
                    <div className="w-12 h-12 md:w-16 md:h-16 bg-[#F27D26]/10 rounded-full flex items-center justify-center mb-4">
                      <Upload className="w-6 h-6 md:w-8 md:h-8 text-[#F27D26]" />
                    </div>
                    <p className="text-xs font-bold text-white mb-2 uppercase tracking-widest">Option 1: Excel File</p>
                    <p className="text-[10px] md:text-xs text-white/40 mb-6 leading-relaxed">
                      Upload an Excel workbook with sheets named <br className="hidden md:block"/>
                      <span className="text-[#F27D26] font-bold">"Adult"</span>, 
                      <span className="text-[#F27D26] font-bold"> "Pediatric"</span>, or 
                      <span className="text-[#F27D26] font-bold"> "Mesaieed"</span>.<br/>
                      Columns: itemCode, itemName, QOH, Min, Max, Exp1, Exp2, Exp3
                    </p>
                    
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isImporting}
                      className="w-full py-4 bg-white text-black hover:bg-white/90 rounded-2xl text-sm font-bold transition-all shadow-xl shadow-white/5 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isImporting ? <Loader2 className="animate-spin w-4 h-4" /> : null}
                      Browse Excel File
                    </button>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="p-4 md:p-6 bg-white/5 rounded-2xl border border-white/10">
                    <p className="text-[10px] font-bold text-white mb-4 uppercase tracking-widest">Option 2: Paste List</p>
                    <textarea 
                      value={bulkInput}
                      onChange={(e) => setBulkInput(e.target.value)}
                      placeholder="code,name,qoh,min,max,exp1,exp2,exp3..."
                      className="w-full h-32 md:h-40 bg-[#141414] border border-white/10 rounded-xl p-4 text-[10px] font-mono focus:outline-none focus:border-[#F27D26] transition-colors resize-none"
                    />
                    <button 
                      onClick={handlePasteImport}
                      disabled={!bulkInput.trim() || isImporting}
                      className="w-full mt-4 py-4 bg-[#F27D26] hover:bg-[#F27D26]/90 rounded-2xl text-sm font-bold transition-all disabled:opacity-50 shadow-xl shadow-[#F27D26]/20 flex items-center justify-center gap-2"
                    >
                      {isImporting ? <Loader2 className="animate-spin w-4 h-4" /> : null}
                      Process to {selectedLocation.split('-').pop()}
                    </button>
                    <p className="text-[9px] text-white/30 text-center mt-3 lowercase italic font-mono">
                      * Paste uses current selected location ({selectedLocation})
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Location Filter */}
      <div className="flex gap-2 p-1 bg-[#141414]/5 rounded-2xl w-full md:w-fit overflow-x-auto no-scrollbar">
        {LOCATIONS.map(loc => (
          <button
            key={loc.id}
            onClick={() => setSelectedLocation(loc.id as PharmacyLocation)}
            className={`flex-1 md:flex-none whitespace-nowrap px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
              selectedLocation === loc.id 
                ? loc.id === PharmacyLocation.ADULT
                  ? 'bg-emerald-100 border border-emerald-200 text-emerald-700 shadow-sm'
                  : loc.id === PharmacyLocation.PEDIATRIC
                    ? 'bg-sky-100 border border-sky-200 text-sky-700 shadow-sm'
                    : loc.id === PharmacyLocation.MESAIEED
                      ? 'bg-orange-100 border border-orange-200 text-orange-700 shadow-sm'
                      : 'bg-white shadow-sm text-[#141414]'
                : 'text-[#141414]/40 hover:text-[#141414]'
            }`}
          >
            {loc.name.replace('Aw-', '')}
          </button>
        ))}
      </div>

      {/* Table Container */}
      <div className="bg-white rounded-3xl border border-[#141414]/10 shadow-sm overflow-hidden min-h-[400px]">
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto max-h-[75vh]">
          <table className="w-full text-left">
            <thead className="sticky top-0 z-20 bg-white shadow-sm">
              <tr className="bg-[#141414]/5 text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 border-b border-[#141414]/10">
              <th 
                className="px-6 py-4 sticky top-0 bg-[#F9F9F9] cursor-pointer hover:bg-[#141414]/5 transition-colors"
                onClick={() => toggleSort('itemName')}
              >
                <div className="flex items-center gap-1">
                  Item Details
                  {sortField === 'itemName' && (
                    sortOrder === 'asc' ? <Sparkles className="w-3 h-3 text-[#F27D26]" /> : <RefreshCw className="w-3 h-3 text-[#F27D26]" />
                  )}
                </div>
              </th>
              <th 
                className="px-6 py-4 sticky top-0 bg-[#F9F9F9] cursor-pointer hover:bg-[#141414]/5 transition-colors"
                onClick={() => toggleSort('qoh')}
              >
                <div className="flex items-center gap-1">
                  Quantity on Hand
                  {sortField === 'qoh' && (
                    sortOrder === 'asc' ? <Sparkles className="w-3 h-3 text-[#F27D26]" /> : <RefreshCw className="w-3 h-3 text-[#F27D26]" />
                  )}
                </div>
              </th>
              <th 
                className="px-6 py-4 sticky top-0 bg-[#F9F9F9] cursor-pointer hover:bg-[#141414]/5 transition-colors"
                onClick={() => toggleSort('minQty')}
              >
                <div className="flex items-center gap-1">
                  Min / Max
                  {sortField === 'minQty' && (
                    sortOrder === 'asc' ? <Sparkles className="w-3 h-3 text-[#F27D26]" /> : <RefreshCw className="w-3 h-3 text-[#F27D26]" />
                  )}
                </div>
              </th>
              <th 
                className="px-6 py-4 sticky top-0 bg-[#F9F9F9] cursor-pointer hover:bg-[#141414]/5 transition-colors"
                onClick={() => toggleSort('expiration1')}
              >
                <div className="flex items-center gap-1">
                  Expirations (1 / 2 / 3)
                  {sortField === 'expiration1' && (
                    sortOrder === 'asc' ? <Sparkles className="w-3 h-3 text-[#F27D26]" /> : <RefreshCw className="w-3 h-3 text-[#F27D26]" />
                  )}
                </div>
              </th>
              <th className="px-6 py-4 text-right sticky top-0 bg-[#F9F9F9]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#141414]/5">
            {loading && (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-[#F27D26]" />
                </td>
              </tr>
            )}
            {/* Inline Add/Edit Form */}
            {(isAdding || editingId) && (
              <tr className="bg-[#F27D26]/5 animate-in fade-in duration-300">
                <td className="px-6 py-4">
                  <div className="space-y-2">
                    <input 
                      type="text" 
                      placeholder="Code" 
                      autoFocus
                      className="w-full text-xs font-mono p-1 border rounded"
                      value={form.itemCode}
                      onChange={e => setForm({...form, itemCode: e.target.value})}
                    />
                    <input 
                      type="text" 
                      placeholder="Item Name" 
                      className="w-full text-sm font-bold p-1 border rounded"
                      value={form.itemName}
                      onChange={e => setForm({...form, itemName: e.target.value})}
                    />
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest">Qty:</span>
                    <input 
                      type="number" 
                      step="any"
                      className="w-20 p-1 border rounded text-sm"
                      value={form.qoh}
                      onChange={e => setForm({...form, qoh: e.target.value === '' ? 0 : parseFloat(e.target.value)})}
                    />
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest">Min:</span>
                      <input 
                        type="number" 
                        step="any"
                        className="w-20 p-1 border rounded text-sm"
                        value={form.minQty}
                        onChange={e => setForm({...form, minQty: e.target.value === '' ? 0 : parseFloat(e.target.value)})}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest">Max:</span>
                      <input 
                        type="number" 
                        step="any"
                        className="w-20 p-1 border rounded text-sm"
                        value={form.maxQty}
                        onChange={e => setForm({...form, maxQty: e.target.value === '' ? 0 : parseFloat(e.target.value)})}
                      />
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex gap-2 text-xs">
                    <input type="text" placeholder="Exp1" className="w-24 p-1 border rounded" value={form.expiration1} onChange={e => setForm({...form, expiration1: e.target.value})} />
                    <input type="text" placeholder="Exp2" className="w-24 p-1 border rounded" value={form.expiration2} onChange={e => setForm({...form, expiration2: e.target.value})} />
                    <input type="text" placeholder="Exp3" className="w-24 p-1 border rounded" value={form.expiration3} onChange={e => setForm({...form, expiration3: e.target.value})} />
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => { setIsAdding(false); setEditingId(null); clearDraft(); }} className="p-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
                    <button onClick={() => handleSave()} className="p-1.5 bg-green-50 text-green-500 rounded-lg hover:bg-green-500 hover:text-white transition-colors"><Check className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            )}
            {!loading && sortedMedications.map(med => {
              const isLowStock = med.qoh <= 10;
              const isNew = med.addedAt ? differenceInDays(new Date(), (med.addedAt as any).toDate?.() || new Date(med.addedAt)) < 10 : false;
              
              // Expiration check for highlighting
              const today = startOfToday();
              const dates = [med.expiration1, med.expiration2, med.expiration3]
                .map(parseExpDate)
                .filter(d => d !== null && !isBefore(d, today)) as Date[];
              
              let expirationAlertClass = '';
              if (dates.length > 0) {
                const nextExp = new Date(Math.min(...dates.map(d => d.getTime())));
                const daysLeft = differenceInDays(nextExp, today);
                if (daysLeft <= 15) {
                  expirationAlertClass = 'bg-red-100/80';
                } else if (daysLeft <= 30) {
                  expirationAlertClass = 'bg-yellow-100/80';
                }
              }
              
              return (
                <tr key={med.id} className={`group hover:bg-[#141414]/[0.02] transition-colors ${editingId === med.id ? 'hidden' : ''} ${expirationAlertClass || (isLowStock ? 'bg-red-50/50' : '')}`}>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono font-bold text-[#141414]/40">{med.itemCode}</span>
                        {isNew ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-[1px] bg-[#F27D26]/10 text-[#F27D26] text-[8px] font-extrabold rounded-full tracking-tight whitespace-nowrap">
                            <Sparkles className="w-2 h-2" />
                            NEW
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-[#141414]/20">-</span>
                        )}
                      </div>
                      <button 
                        onClick={() => startCorrection(med)}
                        className="text-sm font-bold text-[#141414] hover:text-[#F27D26] transition-colors text-left"
                      >
                        {med.itemName}
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${isLowStock ? 'text-red-500' : ''}`}>{med.qoh.toLocaleString()}</span>
                        {isLowStock && (
                          <div className="flex items-center gap-1 bg-red-100 text-red-600 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider">
                            <AlertCircle size={8} />
                            Low
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">
                      <span>Min: <span className="text-[#141414]">{med.minQty || 0}</span></span>
                      <span>Max: <span className="text-[#141414]">{med.maxQty || 0}</span></span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                  <div className="flex gap-2 font-mono text-[10px]">
                    <span className="bg-[#141414]/5 px-1.5 py-0.5 rounded italic">{med.expiration1 || '-'}</span>
                    <span className="bg-[#141414]/5 px-1.5 py-0.5 rounded italic">{med.expiration2 || '-'}</span>
                    <span className="bg-[#141414]/5 px-1.5 py-0.5 rounded italic">{med.expiration3 || '-'}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => startEdit(med)} className="p-1.5 hover:bg-black rounded-lg hover:text-white transition-colors"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(med.id)} className="p-1.5 hover:bg-red-500 rounded-lg hover:text-white transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            );
          })}
            
            {!loading && medications.length === 0 && !isAdding && (
              <tr>
                <td colSpan={4} className="px-6 py-20 text-center text-[#141414]/20 font-bold italic">
                  No medications in this location yet. Use "+" to add some!
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden divide-y divide-[#141414]/5">
        {loading && (
          <div className="p-10 flex flex-col items-center justify-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-[#F27D26]" />
            <p className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest">Loading Items...</p>
          </div>
        )}
        
        {/* Inline Add/Edit Form for Mobile */}
        {(isAdding || editingId) && (
          <div className="p-4 bg-[#F27D26]/5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <input 
                type="text" 
                placeholder="Item Code" 
                autoFocus
                className="w-full text-xs font-mono p-3 bg-white border rounded-xl"
                value={form.itemCode}
                onChange={e => setForm({...form, itemCode: e.target.value})}
              />
              <input 
                type="number" 
                placeholder="Stock Qty" 
                className="w-full text-xs p-3 bg-white border rounded-xl"
                value={form.qoh}
                onChange={e => setForm({...form, qoh: e.target.value === '' ? 0 : parseFloat(e.target.value)})}
              />
            </div>
            <input 
              type="text" 
              placeholder="Full Medication Name" 
              className="w-full text-sm font-bold p-3 bg-white border rounded-xl"
              value={form.itemName}
              onChange={e => setForm({...form, itemName: e.target.value})}
            />
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 bg-white p-2 rounded-xl border">
                <span className="text-[10px] font-bold text-[#141414]/40">Min:</span>
                <input type="number" className="w-full text-sm font-bold" value={form.minQty} onChange={e => setForm({...form, minQty: e.target.value === '' ? 0 : parseFloat(e.target.value)})} />
              </div>
              <div className="flex items-center gap-2 bg-white p-2 rounded-xl border">
                <span className="text-[10px] font-bold text-[#141414]/40">Max:</span>
                <input type="number" className="w-full text-sm font-bold" value={form.maxQty} onChange={e => setForm({...form, maxQty: e.target.value === '' ? 0 : parseFloat(e.target.value)})} />
              </div>
            </div>
            <div className="flex gap-2">
              <input type="text" placeholder="Exp 1" className="flex-1 p-2 bg-white border rounded-lg text-xs" value={form.expiration1} onChange={e => setForm({...form, expiration1: e.target.value})} />
              <input type="text" placeholder="Exp 2" className="flex-1 p-2 bg-white border rounded-lg text-xs" value={form.expiration2} onChange={e => setForm({...form, expiration2: e.target.value})} />
              <input type="text" placeholder="Exp 3" className="flex-1 p-2 bg-white border rounded-lg text-xs" value={form.expiration3} onChange={e => setForm({...form, expiration3: e.target.value})} />
            </div>
            <div className="flex gap-3 pt-2">
              <button 
                onClick={() => { setIsAdding(false); setEditingId(null); clearDraft(); }} 
                className="flex-1 py-3 bg-white text-red-500 rounded-xl font-bold border border-red-100"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleSave()} 
                className="flex-1 py-3 bg-[#F27D26] text-white rounded-xl font-bold"
              >
                Save Item
              </button>
            </div>
          </div>
        )}

        {!loading && sortedMedications.map(med => {
          const isLowStock = med.qoh <= 10;
          const isNew = med.addedAt ? differenceInDays(new Date(), (med.addedAt as any).toDate?.() || new Date(med.addedAt)) < 10 : false;
          
          return (
            <motion.div 
              layout
              key={med.id} 
              className={`p-4 space-y-4 ${editingId === med.id ? 'hidden' : ''} ${isLowStock ? 'bg-red-50/20' : ''}`}
            >
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-[#141414] leading-tight truncate max-w-[200px]">{med.itemName}</h3>
                    {isNew && (
                      <span className="px-1.5 py-0.5 bg-[#F27D26]/10 text-[#F27D26] rounded text-[8px] font-black uppercase tracking-widest whitespace-nowrap">
                        NEW
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] font-mono text-[#141414]/40 uppercase tracking-widest">{med.itemCode}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => startEdit(med)} className="p-2 bg-[#141414]/5 rounded-lg text-[#141414]/40"><Edit2 className="w-3.5 h-3.5" /></button>
                  <button onClick={() => handleDelete(med.id)} className="p-2 bg-red-50 rounded-lg text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-[8px] font-bold uppercase tracking-widest text-[#141414]/40">Current Stock</p>
                  <div className="flex items-center gap-2">
                    <span className={`text-xl font-black ${isLowStock ? 'text-red-500' : ''}`}>{med.qoh.toLocaleString()}</span>
                    {isLowStock && (
                      <span className="px-1.5 py-0.5 bg-red-100 text-red-600 rounded text-[8px] font-bold uppercase">Low</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col justify-center border-l border-[#141414]/10 pl-4">
                   <div className="flex items-center gap-4 text-[10px] font-bold">
                     <div className="flex flex-col">
                       <span className="text-[#141414]/40 text-[8px] uppercase">Min</span>
                       <span>{med.minQty || 0}</span>
                     </div>
                     <div className="flex flex-col">
                       <span className="text-[#141414]/40 text-[8px] uppercase">Max</span>
                       <span>{med.maxQty || 0}</span>
                     </div>
                   </div>
                </div>
              </div>

              <div className="bg-[#141414]/[0.03] p-2 rounded-xl">
                 <p className="text-[8px] font-bold uppercase tracking-widest text-[#141414]/40 mb-1 ml-1">Expirations</p>
                 <div className="flex gap-2 font-mono text-[9px]">
                   <span className="flex-1 bg-white px-2 py-1.5 rounded border border-[#141414]/5 text-center">{med.expiration1 || '-'}</span>
                   <span className="flex-1 bg-white px-2 py-1.5 rounded border border-[#141414]/5 text-center">{med.expiration2 || '-'}</span>
                   <span className="flex-1 bg-white px-2 py-1.5 rounded border border-[#141414]/5 text-center">{med.expiration3 || '-'}</span>
                 </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>

      {/* Danger Zone */}
      <div className="mt-12 p-8 bg-red-50/30 border border-red-100 rounded-3xl">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle size={20} />
              <h3 className="text-lg font-bold uppercase tracking-tight">Danger Zone</h3>
            </div>
            <p className="text-sm text-red-600/60 max-w-md">
              Resetting will permanently delete all medications across all locations and clear the entire audit history. This action cannot be undone.
            </p>
          </div>
          <button 
            onClick={() => setIsResetModalOpen(true)}
            className="px-6 py-4 bg-red-600 text-white rounded-2xl text-sm font-bold hover:bg-red-700 transition-all shadow-xl shadow-red-200 flex items-center gap-2"
          >
            <RotateCcw className="w-5 h-5" />
            Reset Application Data
          </button>
        </div>
      </div>

      {/* Quantity Correction Window */}
      <AnimatePresence>
        {showCorrectionModal && selectedMedForEdit && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white p-8 rounded-3xl shadow-2xl max-w-sm w-full"
            >
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#F27D26]/10 text-[#F27D26] rounded-xl flex items-center justify-center font-black">
                    QTY
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">Correction Window</h3>
                    <p className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest">{selectedMedForEdit.itemName}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowCorrectionModal(false)}
                  className="p-2 hover:bg-[#141414]/5 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">Min Quantity</label>
                    <input 
                      type="number"
                      value={editMin}
                      onChange={(e) => setEditMin(e.target.value)}
                      className="w-full px-4 py-3 bg-[#141414]/5 border-none rounded-xl focus:ring-2 focus:ring-[#F27D26]/20 transition-all font-bold"
                      placeholder="Min"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">Max Quantity</label>
                    <input 
                      type="number"
                      value={editMax}
                      onChange={(e) => setEditMax(e.target.value)}
                      className="w-full px-4 py-3 bg-[#141414]/5 border-none rounded-xl focus:ring-2 focus:ring-[#F27D26]/20 transition-all font-bold"
                      placeholder="Max"
                    />
                  </div>
                </div>

                <div className="p-4 bg-[#F27D26]/5 rounded-2xl space-y-2">
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">
                    <span>Item Code</span>
                    <span className="text-[#141414] font-mono">{selectedMedForEdit.itemCode}</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">
                    <span>Current QOH</span>
                    <span className="text-[#141414] font-bold">{selectedMedForEdit.qoh.toLocaleString()}</span>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => setShowCorrectionModal(false)}
                    className="flex-1 py-3 bg-[#141414]/5 text-[#141414]/60 rounded-xl font-bold hover:bg-[#141414]/10 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={saveCorrection}
                    disabled={isUpdating}
                    className="flex-1 py-3 bg-[#141414] text-white rounded-xl font-bold hover:bg-[#F27D26] transition-all flex items-center justify-center gap-2"
                  >
                    {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Apply Sync'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Reset Confirmation Modal */}
      <AnimatePresence>
        {isResetModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-hidden">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (!isResetting) {
                  setIsResetModalOpen(false);
                  setResetPassword('');
                  setResetError('');
                }
              }}
              className="absolute inset-0 bg-red-950/20 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-white p-8 rounded-[32px] shadow-2xl border border-red-100 space-y-6"
            >
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center text-red-600 animate-pulse">
                  <AlertTriangle size={40} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-2xl font-bold text-[#141414]">Master System Reset</h3>
                  <p className="text-sm text-[#141414]/60">
                    This will wipe all data across Adult, Pediatric, and Mesaieed pharmacies.
                  </p>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-[#141414]/5">
                <div className="space-y-2">
                  <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 ml-1">
                    Re-enter Admin Password
                  </label>
                  <input 
                    type="password"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-5 py-4 bg-[#141414]/5 border border-transparent rounded-2xl focus:bg-white focus:border-red-500 transition-all font-bold tracking-widest"
                    autoFocus
                  />
                </div>

                {resetError && (
                  <motion.p 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="text-red-500 text-xs font-bold ml-1 text-center"
                  >
                    {resetError}
                  </motion.p>
                )}

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button 
                    onClick={() => {
                      setIsResetModalOpen(false);
                      setResetPassword('');
                      setResetError('');
                    }}
                    disabled={isResetting}
                    className="py-4 bg-[#141414]/5 rounded-2xl text-sm font-bold hover:bg-[#141414]/10 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleSystemReset}
                    disabled={!resetPassword || isResetting}
                    className="py-4 bg-red-600 text-white rounded-2xl text-sm font-bold hover:bg-red-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isResetting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                    Wipe Data
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
