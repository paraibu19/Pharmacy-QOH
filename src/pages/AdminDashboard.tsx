import React, { useState, useRef } from 'react';
import { 
  Plus, Upload, Trash2, Edit2, Check, X, FileSpreadsheet, 
  ClipboardPaste, Save, AlertCircle, Info, ArrowLeftRight, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PharmacyLocation, Medication } from '../types';
import { LOCATIONS } from '../constants';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { useMedications } from '../hooks/useMedications';
import { medicationOps } from '../lib/firebaseOperations';

export default function AdminDashboard() {
  const [selectedLocation, setSelectedLocation] = useState<PharmacyLocation>(PharmacyLocation.ADULT);
  const { medications, loading } = useMedications(selectedLocation);
  const [isAdding, setIsAdding] = useState(false);
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [bulkInput, setBulkInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state for new/edit
  const [form, setForm] = useState<Partial<Medication>>({
    itemCode: '',
    itemName: '',
    qoh: 0,
    expiration1: '',
    expiration2: '',
    expiration3: ''
  });

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
        expiration1: String(row.expiration1 || row.Expiration1 || ''),
        expiration2: String(row.expiration2 || row.Expiration2 || ''),
        expiration3: String(row.expiration3 || row.Expiration3 || ''),
        locationId: selectedLocation,
      })).filter(m => m.itemCode && m.itemName);

      await medicationOps.bulkAdd(newMedsList);
      setIsBulkMode(false);
    };
    reader.readAsBinaryString(file);
  };

  const handlePasteImport = async () => {
    const rows = bulkInput.split('\n');
    const newMedsList = rows.map((row) => {
      const parts = row.split(/\t|,/);
      if (parts.length < 3) return null;
      return {
        itemCode: parts[0]?.trim(),
        itemName: parts[1]?.trim(),
        qoh: Number(parts[2]?.trim()) || 0,
        expiration1: parts[3]?.trim() || '',
        expiration2: parts[4]?.trim() || '',
        expiration3: parts[5]?.trim() || '',
        locationId: selectedLocation,
      };
    }).filter(m => m !== null) as any[];

    await medicationOps.bulkAdd(newMedsList);
    setBulkInput('');
    setIsBulkMode(false);
  };

  const handleSave = async (id?: string) => {
    if (!form.itemCode || !form.itemName) return;
    
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
    setForm({ itemCode: '', itemName: '', qoh: 0, expiration1: '', expiration2: '', expiration3: '' });
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this item?')) {
      await medicationOps.delete(id);
    }
  };

  const startEdit = (med: Medication) => {
    setEditingId(med.id);
    setForm({
      itemCode: med.itemCode,
      itemName: med.itemName,
      qoh: med.qoh,
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
                    <p className="text-xs opacity-60 mb-4">Required columns: itemCode, itemName, QOH, Expiration1, Expiration2, Expiration3</p>
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
                      placeholder="code,name,qoh,exp1,exp2,exp3..."
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
                  <input 
                    type="number" 
                    className="w-20 p-1 border rounded text-sm"
                    value={form.qoh}
                    onChange={e => setForm({...form, qoh: parseInt(e.target.value) || 0})}
                  />
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
                    <button onClick={() => { setIsAdding(false); setEditingId(null); }} className="p-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
                    <button onClick={() => handleSave()} className="p-1.5 bg-green-50 text-green-500 rounded-lg hover:bg-green-500 hover:text-white transition-colors"><Check className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            )}

            {!loading && medications.map(med => (
              <tr key={med.id} className={`group hover:bg-[#141414]/[0.02] transition-colors ${editingId === med.id ? 'hidden' : ''}`}>
                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-mono font-bold text-[#141414]/40">{med.itemCode}</span>
                    <span className="text-sm font-bold text-[#141414]">{med.itemName}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm font-bold">{med.qoh}</span>
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
            ))}
            
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
