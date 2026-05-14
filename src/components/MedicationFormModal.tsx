import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Save, Trash2, Image as ImageIcon, Camera, 
  ThermometerSnowflake, Info, Globe, AlertCircle, Loader2, Sparkles
} from 'lucide-react';
import { Medication, PharmacyLocation } from '../types';

interface MedicationFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  initialData?: any;
  isAdding: boolean;
  locationId: PharmacyLocation;
  isCapturing?: boolean;
  onStartCapture?: () => void;
}

export default function MedicationFormModal({
  isOpen,
  onClose,
  onSave,
  onDelete,
  initialData,
  isAdding,
  locationId,
  onStartCapture
}: MedicationFormModalProps) {
  const [form, setForm] = useState(initialData || {
    itemCode: '',
    itemName: '',
    generic: '',
    to: '',
    qoh: 0,
    minQty: 0,
    maxQty: 0,
    expiration1: '',
    expiration2: '',
    expiration3: '',
    imageUrl: '',
    isRefrigerated: false,
    enIndications: '',
    arIndications: ''
  });

  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (initialData) {
      setForm(initialData);
    } else {
      setForm({
        itemCode: '',
        itemName: '',
        generic: '',
        to: '',
        qoh: 0,
        minQty: 0,
        maxQty: 0,
        expiration1: '',
        expiration2: '',
        expiration3: '',
        imageUrl: '',
        isRefrigerated: false,
        enIndications: '',
        arIndications: ''
      });
    }
  }, [initialData, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.itemCode || !form.itemName) return;
    setIsSaving(true);
    try {
      await onSave(form);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-end md:items-center justify-center p-0 md:p-4 bg-black/60 backdrop-blur-md">
        <motion.div
           initial={{ opacity: 0 }}
           animate={{ opacity: 1 }}
           exit={{ opacity: 0 }}
           onClick={onClose}
           className="absolute inset-0"
        />
        <motion.div
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative max-w-2xl w-full bg-white rounded-t-[2.5rem] md:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] md:max-h-[90vh]"
        >
          {/* Header */}
          <div className="p-5 md:p-6 border-b border-[#141414]/5 bg-white flex items-center justify-between sticky top-0 z-10 shrink-0">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${isAdding ? 'bg-[#F27D26]/10 text-[#F27D26]' : 'bg-[#141414]/10 text-[#141414]'}`}>
                {isAdding ? <ImageIcon size={20} /> : <Save size={20} />}
              </div>
              <div>
                <h2 className="text-base md:text-lg font-bold text-[#141414] leading-tight">
                  {isAdding ? 'Add New Medication' : 'Edit Medication'}
                </h2>
                <p className="text-[10px] md:text-[11px] font-bold text-[#141414]/40 uppercase tracking-widest mt-1">
                  Location: {locationId.split('-').pop()}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-[#141414]/5 rounded-full text-[#141414]/20 hover:text-[#141414]/40 transition-all"
            >
              <X size={24} />
            </button>
          </div>

          {/* Form Content */}
          <form onSubmit={handleSubmit} className="overflow-y-auto custom-scrollbar flex-1">
            <div className="p-5 md:p-6 space-y-8">
              {/* Photo Section */}
              <div className="flex flex-col md:flex-row gap-6 items-start">
                <div className="relative group shrink-0">
                  <div className="w-32 h-32 md:w-40 md:h-40 bg-[#141414]/5 rounded-3xl border-2 border-dashed border-[#141414]/10 flex items-center justify-center overflow-hidden transition-all group-hover:border-[#F27D26]/30">
                    {form.imageUrl ? (
                      <img src={form.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon size={32} className="text-[#141414]/10" />
                    )}
                  </div>
                  <div className="absolute -bottom-2 -right-2 flex flex-col gap-2">
                    <button 
                      type="button"
                      onClick={onStartCapture}
                      className="p-2.5 bg-[#F27D26] text-white rounded-xl shadow-lg shadow-[#F27D26]/20 hover:scale-110 active:scale-95 transition-all"
                    >
                      <Camera size={18} />
                    </button>
                  </div>
                </div>

                <div className="flex-1 space-y-4 w-full">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest ml-1">Item Code</label>
                      <input
                        required
                        value={form.itemCode}
                        onChange={e => setForm({...form, itemCode: e.target.value})}
                        className="w-full px-4 py-3 bg-[#141414]/5 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-[#F27D26]/20 transition-all"
                        placeholder="e.g. 100234"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest ml-1">Stock Level (QOH)</label>
                      <input
                        type="number"
                        step="any"
                        value={form.qoh}
                        onChange={e => setForm({...form, qoh: Number(e.target.value)})}
                        className="w-full px-4 py-3 bg-[#141414]/5 border-none rounded-xl text-sm font-black focus:ring-2 focus:ring-[#F27D26]/20 transition-all font-mono"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest ml-1">Item Name</label>
                    <input
                      required
                      value={form.itemName}
                      onChange={e => setForm({...form, itemName: e.target.value})}
                      className="w-full px-4 py-3 bg-[#141414]/5 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-[#F27D26]/20 transition-all"
                      placeholder="e.g. PANADOL 500MG TABLET"
                    />
                  </div>
                </div>
              </div>

              {/* Additional Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest ml-1 flex items-center justify-between">
                      <span>Generic Name / Info</span>
                      <span className="text-[8px] opacity-60">(Optional)</span>
                    </label>
                    <input
                      value={form.generic}
                      onChange={e => setForm({...form, generic: e.target.value})}
                      className="w-full px-4 py-2.5 bg-[#141414]/5 border-none rounded-xl text-xs font-medium"
                      placeholder="e.g. Paracetamol"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest ml-1 flex items-center justify-between">
                      <span>Link to Codes</span>
                      <span className="text-[8px] opacity-60">(Comma separated)</span>
                    </label>
                    <input
                      value={form.to}
                      onChange={e => setForm({...form, to: e.target.value})}
                      className="w-full px-4 py-2.5 bg-[#141414]/5 border-none rounded-xl text-xs font-mono"
                      placeholder="e.g. 10234, 10567"
                    />
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-2xl">
                    <div className="flex items-center gap-2">
                       <input 
                         type="checkbox" 
                         checked={form.isRefrigerated}
                         onChange={e => setForm({...form, isRefrigerated: e.target.checked})}
                         className="w-4 h-4 rounded-md accent-[#F27D26]"
                         id="modal-refrig"
                       />
                       <label htmlFor="modal-refrig" className="text-xs font-bold text-blue-700 flex items-center gap-1.5 cursor-pointer">
                         <ThermometerSnowflake size={14} />
                         Refrigerated Storage (2-8°C)
                       </label>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest ml-1">Min Order</label>
                    <input
                      type="number"
                      value={form.minQty}
                      onChange={e => setForm({...form, minQty: Number(e.target.value)})}
                      className="w-full px-4 py-3 bg-[#141414]/5 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-[#F27D26]/20"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest ml-1">Max Order</label>
                    <input
                      type="number"
                      value={form.maxQty}
                      onChange={e => setForm({...form, maxQty: Number(e.target.value)})}
                      className="w-full px-4 py-3 bg-[#141414]/5 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-[#F27D26]/20"
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                     <label className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest ml-1">Expirations (1 / 2 / 3)</label>
                     <div className="grid grid-cols-3 gap-2">
                        <input
                          placeholder="Exp 1"
                          value={form.expiration1}
                          onChange={e => setForm({...form, expiration1: e.target.value})}
                          className="px-3 py-2 bg-[#141414]/5 border-none rounded-lg text-[10px] font-bold focus:ring-2 focus:ring-[#F27D26]/20"
                        />
                        <input
                          placeholder="Exp 2"
                          value={form.expiration2}
                          onChange={e => setForm({...form, expiration2: e.target.value})}
                          className="px-3 py-2 bg-[#141414]/5 border-none rounded-lg text-[10px] font-bold focus:ring-2 focus:ring-[#F27D26]/20"
                        />
                        <input
                          placeholder="Exp 3"
                          value={form.expiration3}
                          onChange={e => setForm({...form, expiration3: e.target.value})}
                          className="px-3 py-2 bg-[#141414]/5 border-none rounded-lg text-[10px] font-bold focus:ring-2 focus:ring-[#F27D26]/20"
                        />
                     </div>
                  </div>
                </div>
              </div>

              {/* Indications Section */}
              <div className="space-y-4 pt-6 border-t border-[#141414]/5">
                 <div className="flex items-center gap-2 text-[#F27D26]">
                    <Sparkles size={16} />
                    <h3 className="text-[10px] font-black uppercase tracking-widest">Indications & AI Translation</h3>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                       <label className="flex items-center gap-2 text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest ml-1">
                          <Globe size={10} />
                          English Description
                       </label>
                       <textarea
                         value={form.enIndications}
                         onChange={e => setForm({...form, enIndications: e.target.value})}
                         className="w-full h-32 bg-[#141414]/5 border-none rounded-2xl p-4 text-xs font-medium focus:ring-2 focus:ring-[#F27D26]/20 resize-none"
                         placeholder="Enter medication use instructions in English..."
                       />
                    </div>
                    <div className="space-y-1.5">
                       <label className="flex items-center gap-2 text-[10px] font-bold text-emerald-600 uppercase tracking-widest ml-1">
                          <Globe size={10} />
                          Arabic Translation
                       </label>
                       <textarea
                         value={form.arIndications}
                         onChange={e => setForm({...form, arIndications: e.target.value})}
                         dir="rtl"
                         className="w-full h-32 bg-emerald-50/30 border border-emerald-100/20 rounded-2xl p-4 text-xs font-bold text-emerald-900 focus:ring-2 focus:ring-emerald-500/20 resize-none"
                         placeholder="أدخل دواعي الاستعمال باللغة العربية..."
                       />
                    </div>
                 </div>
                 
                 <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
                    <div className="flex items-start gap-3">
                       <div className="p-1.5 bg-emerald-100 rounded-lg text-emerald-600">
                          <Sparkles size={16} />
                       </div>
                       <div className="space-y-1">
                          <p className="text-[10px] font-black text-emerald-800 uppercase tracking-tight">Pro Tip: Auto-Translation</p>
                          <p className="text-[10px] text-emerald-700/60 leading-relaxed">
                            {isAdding 
                              ? "Enter the English description and save. We will automatically generate translations for Arabic, Hindi, Urdu, Malayalam, and Bengali for you."
                              : "After saving, you can click 'AI Translate Missing' in the main dashboard to generate translations for other languages if they are missing."}
                          </p>
                       </div>
                    </div>
                 </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="p-5 md:p-6 bg-[#141414]/[0.02] border-t border-[#141414]/5 flex flex-col md:flex-row gap-3">
              {!isAdding && onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(initialData.id)}
                  className="px-6 py-3 bg-red-50 text-red-500 rounded-2xl text-xs font-bold hover:bg-red-100 transition-all flex items-center justify-center gap-2 group"
                >
                  <Trash2 size={16} className="group-hover:rotate-12 transition-transform" />
                  Delete Item
                </button>
              )}
              <div className="flex-1 flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-6 py-3 bg-white border border-[#141414]/10 rounded-2xl text-xs font-bold text-[#141414]/60 hover:bg-[#141414]/5 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !form.itemCode || !form.itemName}
                  className="flex-[2] px-6 py-3 bg-[#F27D26] text-white rounded-2xl text-xs font-bold hover:bg-[#F27D26]/90 transition-all shadow-lg shadow-[#F27D26]/20 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSaving ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Save size={16} />
                  )}
                  {isAdding ? 'Add Medication' : 'Save Changes'}
                </button>
              </div>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
