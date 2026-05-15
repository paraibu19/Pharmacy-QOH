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
      // If the image URL changed in parent (from camera capture), only sync that to avoid wiping typed fields
      if (initialData.imageUrl && initialData.imageUrl !== form.imageUrl) {
        setForm(prev => ({ ...prev, imageUrl: initialData.imageUrl }));
      }
      
      // Full sync only when opening or switching items
      if (initialData.id !== form.id || (isAdding && !form.itemCode)) {
        setForm(initialData);
      }
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
          className="relative max-w-2xl w-full bg-white rounded-t-[2rem] md:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] md:max-h-[90vh]"
        >
          {/* Header */}
          <div className="p-4 md:p-6 border-b border-[#141414]/5 bg-white flex items-center justify-between sticky top-0 z-10 shrink-0">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl ${isAdding ? 'bg-[#F27D26]/10 text-[#F27D26]' : 'bg-[#141414]/10 text-[#141414]'}`}>
                {isAdding ? <ImageIcon size={18} /> : <Save size={18} />}
              </div>
              <div>
                <h2 className="text-sm md:text-lg font-bold text-[#141414] leading-tight">
                  {isAdding ? 'Add New' : 'Edit Medication'}
                </h2>
                <p className="text-[8px] md:text-[11px] font-bold text-[#141414]/40 uppercase tracking-widest mt-0.5">
                  {locationId.split('-').pop()}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-[#141414]/5 rounded-full text-[#141414]/20 hover:text-[#141414]/40 transition-all"
            >
              <X size={20} />
            </button>
          </div>

          {/* Form Content */}
          <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
            <div className="overflow-y-auto custom-scrollbar flex-1">
              <div className="p-4 md:p-8 space-y-8 md:space-y-12 pb-32 md:pb-8">
                {/* Visual Identity Section */}
                <div className="flex flex-col md:flex-row gap-8 items-start">
                  <div className="relative group shrink-0 self-center md:self-start">
                    <div className="w-40 h-40 md:w-56 md:h-56 bg-[#141414]/[0.03] rounded-[2.5rem] border-2 border-dashed border-[#141414]/10 flex items-center justify-center overflow-hidden transition-all group-hover:border-[#F27D26]/30 shadow-inner">
                      {form.imageUrl ? (
                        <motion.img 
                          layoutId="med-image"
                          src={form.imageUrl} 
                          alt="Preview" 
                          className="w-full h-full object-cover" 
                        />
                      ) : (
                        <ImageIcon size={48} className="text-[#141414]/10" />
                      )}
                    </div>
                    <div className="absolute -bottom-2 -right-2 flex flex-col gap-2">
                      <button 
                        type="button"
                        onClick={onStartCapture}
                        className="p-4 bg-[#F27D26] text-white rounded-2xl shadow-xl shadow-[#F27D26]/30 hover:scale-110 active:scale-95 transition-all"
                      >
                        <Camera size={24} />
                      </button>
                      {form.imageUrl && (
                        <button 
                          type="button"
                          onClick={() => setForm({...form, imageUrl: ''})}
                          className="p-3 bg-white text-red-500 rounded-xl shadow-lg border border-red-50 hover:bg-red-50 transition-all"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 space-y-6 w-full">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-[#141414]/30 uppercase tracking-[0.2em] ml-1">Item Reference</label>
                        <input
                          required
                          value={form.itemCode}
                          onChange={e => setForm({...form, itemCode: e.target.value})}
                          className="w-full px-5 py-4 bg-[#141414]/[0.03] border-none rounded-2xl text-xs font-black tracking-tight focus:ring-2 focus:ring-[#F27D26]/10 transition-all font-mono"
                          placeholder="CODE"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-[#141414]/30 uppercase tracking-[0.2em] ml-1">Units (QOH)</label>
                        <input
                          type="number"
                          step="any"
                          value={form.qoh}
                          onChange={e => setForm({...form, qoh: Number(e.target.value)})}
                          className="w-full px-5 py-4 bg-[#141414]/[0.03] border-none rounded-2xl text-sm font-black focus:ring-2 focus:ring-[#F27D26]/10 transition-all font-mono text-[#F27D26]"
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-[#141414]/30 uppercase tracking-[0.2em] ml-1">Product Description</label>
                      <input
                        required
                        value={form.itemName}
                        onChange={e => setForm({...form, itemName: e.target.value})}
                        className="w-full px-5 py-4 bg-[#141414]/[0.03] border-none rounded-2xl text-xs font-bold focus:ring-2 focus:ring-[#F27D26]/10 transition-all uppercase"
                        placeholder="FULL PRODUCT NAME"
                      />
                    </div>
                  </div>
                </div>

                {/* Technical Specs */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-[#141414]/30 uppercase tracking-[0.2em] ml-1 flex items-center justify-between">
                        <span>Generic Foundation</span>
                        <span className="text-[8px] opacity-40 font-bold italic">OPTIONAL</span>
                      </label>
                      <input
                        value={form.generic}
                        onChange={e => setForm({...form, generic: e.target.value})}
                        className="w-full px-5 py-3.5 bg-[#141414]/[0.03] border-none rounded-2xl text-xs font-bold"
                        placeholder="Active Ingredient"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-[#141414]/30 uppercase tracking-[0.2em] ml-1 flex items-center justify-between">
                        <span>Linked Relations</span>
                        <span className="text-[8px] opacity-40 font-bold italic">COMMA SEP</span>
                      </label>
                      <input
                        value={form.to}
                        onChange={e => setForm({...form, to: e.target.value})}
                        className="w-full px-5 py-3.5 bg-[#141414]/[0.03] border-none rounded-2xl text-xs font-mono font-bold"
                        placeholder="1001, 1002..."
                      />
                    </div>

                    <div className={`flex items-center gap-4 p-4 rounded-[2rem] transition-all border ${form.isRefrigerated ? 'bg-blue-50 border-blue-100 shadow-sm' : 'bg-[#141414]/[0.02] border-transparent'}`}>
                       <div className={`p-3 rounded-2xl transition-colors ${form.isRefrigerated ? 'bg-blue-600 text-white shadow-lg' : 'bg-[#141414]/5 text-[#141414]/20'}`}>
                         <ThermometerSnowflake size={20} />
                       </div>
                       <div className="flex-1">
                          <p className={`text-xs font-black uppercase tracking-tight ${form.isRefrigerated ? 'text-blue-700' : 'text-[#141414]/40'}`}>
                            Climate Control
                          </p>
                          <p className="text-[9px] font-bold opacity-40 uppercase">Required (2-8°C)</p>
                       </div>
                       <input 
                         type="checkbox" 
                         checked={form.isRefrigerated}
                         onChange={e => setForm({...form, isRefrigerated: e.target.checked})}
                         className="w-6 h-6 rounded-lg accent-blue-600 cursor-pointer"
                         id="modal-refrig"
                       />
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-[#141414]/30 uppercase tracking-[0.2em] ml-1">Safe-Min</label>
                        <input
                          type="number"
                          value={form.minQty}
                          onChange={e => setForm({...form, minQty: Number(e.target.value)})}
                          className="w-full px-5 py-4 bg-[#141414]/[0.03] border-none rounded-2xl text-xs font-black focus:ring-2 focus:ring-[#F27D26]/10"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-[#141414]/30 uppercase tracking-[0.2em] ml-1">Safe-Max</label>
                        <input
                          type="number"
                          value={form.maxQty}
                          onChange={e => setForm({...form, maxQty: Number(e.target.value)})}
                          className="w-full px-5 py-4 bg-[#141414]/[0.03] border-none rounded-2xl text-xs font-black focus:ring-2 focus:ring-[#F27D26]/10"
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                       <label className="text-[10px] font-black text-[#141414]/30 uppercase tracking-[0.2em] ml-1">Expiration Pipeline</label>
                       <div className="grid grid-cols-1 gap-2">
                          {[1, 2, 3].map((idx) => (
                            <div key={idx} className="flex items-center gap-3 bg-[#141414]/[0.03] p-1.5 rounded-2xl border border-[#141414]/5">
                              <span className="w-8 h-8 flex items-center justify-center text-[10px] font-black text-[#141414]/20 italic">0{idx}</span>
                              <input
                                placeholder="MM/YY"
                                value={(form as any)[`expiration${idx}`]}
                                onChange={e => setForm({...form, [`expiration${idx}`]: e.target.value})}
                                className="flex-1 bg-white px-4 py-2.5 rounded-xl text-xs font-black tracking-widest focus:ring-2 focus:ring-[#F27D26]/10 border-none uppercase shadow-sm"
                              />
                            </div>
                          ))}
                       </div>
                    </div>
                  </div>
                </div>

                {/* Patient Information Section */}
                <div className="space-y-6 pt-10 border-t border-[#141414]/5">
                   <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-emerald-600 text-white rounded-2xl shadow-lg shadow-emerald-600/20">
                        <Info size={18} />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-[#141414] uppercase tracking-tight">Therapeutic Use</h3>
                        <p className="text-[10px] font-bold text-[#141414]/30 uppercase tracking-widest italic leading-none">Global Multi-Language Feed</p>
                      </div>
                   </div>

                   <div className="grid grid-cols-1 gap-6">
                      <div className="space-y-3">
                         <label className="flex items-center gap-2 text-[10px] font-black text-[#141414]/40 uppercase tracking-[0.15em] ml-1">
                            <Globe size={12} />
                            Primary Instruction (English)
                         </label>
                         <textarea
                           value={form.enIndications}
                           onChange={e => setForm({...form, enIndications: e.target.value})}
                           className="w-full h-24 md:h-32 bg-[#141414]/[0.03] border-none rounded-2xl md:rounded-[2rem] p-4 md:p-6 text-xs font-bold focus:ring-2 focus:ring-[#F27D26]/10 resize-none leading-relaxed shadow-inner"
                           placeholder="Describe the medical indications..."
                         />
                      </div>
                      <div className="space-y-3">
                         <label className="flex items-center gap-2 text-[10px] font-black text-emerald-600 uppercase tracking-[0.15em] ml-1">
                            <Globe size={12} />
                            Translated Feed (Arabic)
                         </label>
                         <textarea
                           value={form.arIndications}
                           onChange={e => setForm({...form, arIndications: e.target.value})}
                           dir="rtl"
                           className="w-full h-24 md:h-32 bg-emerald-50/50 border border-emerald-100/30 rounded-2xl md:rounded-[2rem] p-4 md:p-6 text-sm font-black text-emerald-900 focus:ring-4 focus:ring-emerald-500/10 resize-none leading-relaxed shadow-sm"
                           placeholder="دواعي الاستعمال..."
                         />
                      </div>
                   </div>
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="p-4 md:p-6 bg-white border-t border-[#141414]/5 flex flex-col md:flex-row gap-2 md:gap-3 shrink-0 pb-10 md:pb-6">
              {!isAdding && onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(initialData.id)}
                  className="px-6 py-2.5 bg-red-50 text-red-500 rounded-2xl text-[10px] font-bold hover:bg-red-100 transition-all flex items-center justify-center gap-2 group order-3 md:order-1"
                >
                  <Trash2 size={14} className="group-hover:rotate-12 transition-transform" />
                  Delete
                </button>
              )}
              <div className="flex-1 flex gap-2 md:gap-3 order-1 md:order-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-3 md:py-3 bg-white border border-[#141414]/10 rounded-2xl text-[10px] md:text-xs font-bold text-[#141414]/60 hover:bg-[#141414]/5 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !form.itemCode || !form.itemName}
                  className="flex-[2] px-6 py-3 md:py-3 bg-[#F27D26] text-white rounded-2xl text-[10px] md:text-xs font-bold hover:bg-[#F27D26]/90 transition-all shadow-lg shadow-[#F27D26]/20 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSaving ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Save size={14} />
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
