import React, { useState, useRef, useMemo, useEffect } from 'react';
import { 
  Plus, Upload, Trash2, Edit2, Check, X, FileSpreadsheet, 
  ClipboardPaste, Save, AlertCircle, Info, ArrowLeftRight, Loader2,
  AlertTriangle, Settings2, CalendarClock, History, RotateCcw, Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PharmacyLocation, Medication } from '../types';
import { LOCATIONS } from '../constants';
import * as XLSX from 'xlsx';
import { format, differenceInDays, isBefore, startOfToday } from 'date-fns';
import { useMedications } from '../hooks/useMedications';
import { medicationOps } from '../lib/firebaseOperations';

const DRAFT_STORAGE_KEY = 'admin_medication_draft';

export default function AdminDashboard() {
  const [selectedLocation, setSelectedLocation] = useState<PharmacyLocation>(PharmacyLocation.ADULT);
  const { medications, loading } = useMedications(selectedLocation);
  const [isAdding, setIsAdding] = useState(false);
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [bulkInput, setBulkInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [alertThreshold, setAlertThreshold] = useState<number>(90);
  const [hasDraft, setHasDraft] = useState(false);
  const [expSearchQuery, setExpSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state for new/edit
  const [form, setForm] = useState<Partial<Medication>>({
    itemCode: '',
    itemName: '',
    qoh: 0,
    lowStockThreshold: 0,
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

  // Expiration helper
  const parseExpDate = (dateStr: string) => {
    if (!dateStr || dateStr === '-' || dateStr === '.') return null;
    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) return d;
      
      const parts = dateStr.split(/[-/]/);
      if (parts.length === 3) {
        return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      } else if (parts.length === 2) {
        return new Date(parseInt(parts[1]), parseInt(parts[0]) - 1, 1);
      }
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

    if (expSearchQuery) {
      const query = expSearchQuery.toLowerCase();
      result = result.filter(item => {
        const formattedDate = format(item.nextExp, 'MMM-yyyy').toLowerCase();
        return formattedDate.includes(query);
      });
    }

    return result.sort((a, b) => (a.daysLeft || 0) - (b.daysLeft || 0));
  }, [medications, alertThreshold, expSearchQuery]);

  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws) as any[];

      const newMedsList = data.map((row) => ({
        itemCode: String(row.itemCode || row['item code'] || row['Item Code'] || ''),
        itemName: String(row.itemName || row['item name'] || row['Item Name'] || ''),
        qoh: Number(row.qoh || row.QOH || row['Quantity'] || 0),
        lowStockThreshold: Number(row.lowStockThreshold || row['low stock'] || row['Threshold'] || 0),
        expiration1: String(row.expiration1 || row.Expiration1 || ''),
        expiration2: String(row.expiration2 || row.Expiration2 || ''),
        expiration3: String(row.expiration3 || row.Expiration3 || ''),
        locationId: selectedLocation,
      })).filter(m => m.itemCode && m.itemName);

    try {
      setError(null);
      await medicationOps.bulkAdd(newMedsList);
      setIsBulkMode(false);
    } catch (error: any) {
      setError(error.message);
    }
    };
    reader.readAsBinaryString(file);
  };

  const handlePasteImport = async () => {
    try {
      setError(null);
      const rows = bulkInput.split('\n');
      const newMedsList = rows.map((row) => {
        const parts = row.split(/\t|,/);
        if (parts.length < 3) return null;
        return {
          itemCode: parts[0]?.trim(),
          itemName: parts[1]?.trim(),
          qoh: Number(parts[2]?.trim()) || 0,
          lowStockThreshold: Number(parts[3]?.trim()) || 0,
          expiration1: parts[4]?.trim() || '',
          expiration2: parts[5]?.trim() || '',
          expiration3: parts[6]?.trim() || '',
          locationId: selectedLocation,
        };
      }).filter(m => m !== null) as any[];

      await medicationOps.bulkAdd(newMedsList);
      setBulkInput('');
      setIsBulkMode(false);
    } catch (error: any) {
      setError(error.message);
    }
  };

  const handleSave = async (id?: string) => {
    if (!form.itemCode || !form.itemName) return;
    
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
      
      setEditingId(null);
      setIsAdding(false);
      setForm({ itemCode: '', itemName: '', qoh: 0, lowStockThreshold: 0, expiration1: '', expiration2: '', expiration3: '' });
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
      lowStockThreshold: med.lowStockThreshold ?? 0,
      expiration1: med.expiration1,
      expiration2: med.expiration2,
      expiration3: med.expiration3
    });
  };

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Medication Management</h1>
          <p className="text-[#141414]/50">Add, update or delete pharmacy stock items</p>
        </div>
        
        <div className="flex gap-2">
          {hasDraft && (
            <motion.div 
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs font-bold text-amber-700"
            >
              <History className="w-3.5 h-3.5" />
              Unsaved changes found
              <div className="flex gap-1 ml-2">
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
            onClick={() => setIsBulkMode(!isBulkMode)}
            className="flex items-center gap-2 px-4 py-2 border border-[#141414]/10 rounded-xl text-sm font-bold hover:bg-[#141414]/5 transition-colors"
          >
            <ArrowLeftRight className="w-4 h-4" />
            Bulk Import
          </button>
          <button 
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#F27D26] text-white rounded-xl text-sm font-bold hover:bg-[#F27D26]/90 transition-colors shadow-lg shadow-[#F27D26]/20"
          >
            <Plus className="w-4 h-4" />
            Add New Item
          </button>
        </div>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-between gap-4"
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
              
              <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
                <div className="relative flex-1 md:flex-none">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#141414]/30" />
                  <input 
                    type="text" 
                    placeholder="Search mmm-yyyy..."
                    value={expSearchQuery}
                    onChange={(e) => setExpSearchQuery(e.target.value)}
                    className="w-full md:w-48 pl-9 pr-3 py-1.5 bg-white border border-[#141414]/10 rounded-lg text-[10px] font-bold focus:outline-none focus:ring-2 focus:ring-[#F27D26]/20 transition-all"
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
                            {format(item.nextExp, 'MMM-yyyy')}
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
                          <div className="text-sm font-bold">{item.qoh}</div>
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
                  <span className="text-lg font-bold">{medications.length}</span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-white/10">
                  <span className="text-sm text-white/60">Total Stock</span>
                  <span className="text-lg font-bold">{medications.reduce((acc, m) => acc + m.qoh, 0)}</span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-white/10">
                  <span className="text-sm text-white/60">Low Stock Items</span>
                  <span className="text-lg font-bold text-red-400">{medications.filter(m => m.qoh <= (m.lowStockThreshold ?? 0)).length}</span>
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

      {/* Bulk Section */}
      <AnimatePresence>
        {isBulkMode && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-[#141414] text-white p-6 rounded-2xl space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-bold flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-[#F27D26]" />
                  Bulk Update for {selectedLocation}
                </h3>
                <button onClick={() => setIsBulkMode(false)}><X className="w-5 h-5 opacity-50 hover:opacity-100" /></button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                    <p className="text-xs font-bold text-[#F27D26] mb-2">OPTION 1: UPLOAD EXCEL</p>
                    <p>Required columns: itemCode, itemName, QOH, LowStockThreshold, Expiration1, Expiration2, Expiration3</p>
                    <input 
                      type="file" 
                      accept=".xlsx,.xls" 
                      className="hidden" 
                      ref={fileInputRef}
                      onChange={handleExcelUpload}
                    />
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full py-3 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-bold transition-all border border-white/5"
                    >
                      Browse Excel File
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                    <p className="text-xs font-bold text-[#F27D26] mb-2">OPTION 2: PASTE LIST</p>
                    <textarea 
                      value={bulkInput}
                      onChange={(e) => setBulkInput(e.target.value)}
                      placeholder="code,name,qoh,threshold,exp1,exp2,exp3..."
                      className="w-full h-32 bg-transparent border border-white/10 rounded-lg p-3 text-xs font-mono focus:outline-none focus:border-[#F27D26] transition-colors"
                    />
                    <button 
                      onClick={handlePasteImport}
                      disabled={!bulkInput.trim()}
                      className="w-full mt-4 py-3 bg-[#F27D26] hover:bg-[#F27D26]/90 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                    >
                      Process List
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Location Filter */}
      <div className="flex gap-2 p-1 bg-[#141414]/5 rounded-2xl w-fit">
        {LOCATIONS.map(loc => (
          <button
            key={loc.id}
            onClick={() => setSelectedLocation(loc.id as PharmacyLocation)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              selectedLocation === loc.id ? 'bg-white shadow-sm text-[#141414]' : 'text-[#141414]/40 hover:text-[#141414]'
            }`}
          >
            {loc.name.replace('Aw-', '')}
          </button>
        ))}
      </div>

      {/* Table Container */}
      <div className="bg-white rounded-2xl border border-[#141414]/10 shadow-sm overflow-hidden min-h-[400px]">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-[#141414]/5 text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 border-b border-[#141414]/10">
              <th className="px-6 py-4">Item Details</th>
              <th className="px-6 py-4">Quantity on Hand</th>
              <th className="px-6 py-4">Expirations (1 / 2 / 3)</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#141414]/5">
            {loading && (
              <tr>
                <td colSpan={4} className="px-6 py-10 text-center">
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
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest">Qty:</span>
                      <input 
                        type="number" 
                        className="w-20 p-1 border rounded text-sm"
                        value={form.qoh}
                        onChange={e => setForm({...form, qoh: parseInt(e.target.value) || 0})}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest">Low Alert:</span>
                      <input 
                        type="number" 
                        className="w-20 p-1 border rounded text-sm"
                        value={form.lowStockThreshold}
                        onChange={e => setForm({...form, lowStockThreshold: parseInt(e.target.value) || 0})}
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

            {!loading && medications.map(med => {
              const isLowStock = med.qoh <= (med.lowStockThreshold ?? 0);
              return (
                <tr key={med.id} className={`group hover:bg-[#141414]/[0.02] transition-colors ${editingId === med.id ? 'hidden' : ''} ${isLowStock ? 'bg-red-50/50' : ''}`}>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-mono font-bold text-[#141414]/40">{med.itemCode}</span>
                      <span className="text-sm font-bold text-[#141414]">{med.itemName}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${isLowStock ? 'text-red-500' : ''}`}>{med.qoh}</span>
                      {isLowStock && (
                        <div className="flex items-center gap-1 bg-red-100 text-red-600 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider">
                          <AlertCircle size={8} />
                          Low
                        </div>
                      )}
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
    </div>
  );
}
