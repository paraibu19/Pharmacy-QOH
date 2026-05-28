import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Save, Trash2, Image as ImageIcon, Camera, Upload,
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
    restriction: '',
    qatari: '',
    imageUrl: '',
    isRefrigerated: false,
    enIndications: '',
    arIndications: ''
  });

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 400;
        const imgWidth = img.width > 0 ? img.width : 400;
        const scaleSize = MAX_WIDTH / imgWidth;
        canvas.width = MAX_WIDTH;
        canvas.height = Math.round(img.height > 0 ? img.height * scaleSize : 300);

        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        setForm(prev => ({ ...prev, imageUrl: dataUrl }));
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    setError(null);
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
        restriction: '',
        qatari: '',
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
    setError(null);
    try {
      await onSave(form);
      onClose();
    } catch (err: any) {
      console.error("Save failure in modal:", err);
      setError(err?.message || "Failed to save. Please review the form or try again.");
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
              <div className="p-5 md:p-6 space-y-6 md:space-y-8 pb-20 md:pb-8">
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
                      title="Take Photo"
                    >
                      <Camera size={18} />
                    </button>
                    <button 
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="p-2.5 bg-[#141414] text-white rounded-xl shadow-lg shadow-black/20 hover:scale-110 active:scale-95 transition-all"
                      title="Upload Photo"
                    >
                      <Upload size={18} />
                    </button>
                    <input 
                      type="file"
                      ref={fileInputRef}
                      onChange={handleImageUpload}
                      accept="image/*"
                      className="hidden"
                    />
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
                  <div className="col-span-2 grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest ml-1">Restriction</label>
                      <input
                        value={form.restriction || ''}
                        onChange={e => setForm({...form, restriction: e.target.value})}
                        className="w-full px-4 py-2.5 bg-[#141414]/5 border-none rounded-xl text-xs font-medium focus:ring-2 focus:ring-[#F27D26]/20"
                        placeholder="e.g. Restricted"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest ml-1">Qatari</label>
                      <input
                        value={form.qatari || ''}
                        onChange={e => setForm({...form, qatari: e.target.value})}
                        className="w-full px-4 py-2.5 bg-[#141414]/5 border-none rounded-xl text-xs font-medium focus:ring-2 focus:ring-[#F27D26]/20"
                        placeholder="e.g. Yes"
                      />
                    </div>
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
                         className="w-full h-20 md:h-32 bg-[#141414]/5 border-none rounded-2xl p-4 text-xs font-medium focus:ring-2 focus:ring-[#F27D26]/20 resize-none"
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
                         className="w-full h-20 md:h-32 bg-emerald-50/30 border border-emerald-100/20 rounded-2xl p-4 text-xs font-bold text-emerald-900 focus:ring-2 focus:ring-emerald-500/20 resize-none"
                         placeholder="أدخل دواعي الاستعمال باللغة العربية..."
                       />
                    </div>
                 </div>
                 
                 <div className="p-3 md:p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
                    <div className="flex items-start gap-2 md:gap-3">
                       <div className="p-1 md:p-1.5 bg-emerald-100 rounded-lg text-emerald-600 shrink-0">
                          <Sparkles size={14} />
                       </div>
                       <div className="space-y-0.5">
                          <p className="text-[9px] md:text-[10px] font-black text-emerald-800 uppercase tracking-tight">AI Auto-Translation</p>
                          <p className="text-[9px] md:text-[10px] text-emerald-700/60 leading-relaxed">
                            {isAdding 
                              ? "We will automatically generate translations for multiple languages upon save."
                              : "Translations for other languages are managed via the dashboard."}
                          </p>
                       </div>
                    </div>
                 </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="mx-6 mt-2 mb-2 p-3 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-2.5 text-red-600 shrink-0">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="text-[10px] font-black uppercase tracking-tight text-red-800">Save Error</p>
                <p className="text-[10px] text-red-700 font-semibold leading-relaxed">{error}</p>
              </div>
            </div>
          )}

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
