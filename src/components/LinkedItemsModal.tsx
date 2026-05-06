import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Medication, PHARMACY_NAMES } from '../types';
import { X, Image as ImageIcon, ExternalLink, ArrowRightLeft } from 'lucide-react';
import { formatNumber } from '../lib/formatters';

interface LinkedItemsModalProps {
  medication: Medication | null;
  allMedications: Medication[];
  onClose: () => void;
}

export default function LinkedItemsModal({ medication, allMedications, onClose }: LinkedItemsModalProps) {
  if (!medication) return null;

  // Split linked codes by comma or space
  const linkedCodes = medication.to
    ? medication.to.split(/[\s,]+/).filter(Boolean).map(c => c.trim().toLowerCase())
    : [];

  const linkedItems = allMedications.filter(m => 
    linkedCodes.includes(m.itemCode.trim().toLowerCase())
  );

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          className="relative max-w-2xl w-full bg-white rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="p-6 border-b border-[#141414]/5 bg-white flex items-center justify-between sticky top-0 z-10">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-[#F27D26]/10 rounded-xl text-[#F27D26]">
                <ArrowRightLeft size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-[#141414] leading-tight">
                  {medication.itemName}
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-mono font-bold text-[#141414]/40 bg-[#141414]/5 px-1.5 py-0.5 rounded">
                    {medication.itemCode}
                  </span>
                  <span className="text-[10px] font-bold text-[#F27D26] uppercase tracking-widest">
                    Linked Items Details
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-[#141414]/5 rounded-full text-[#141414]/20 hover:text-[#141414]/40 transition-all"
            >
              <X size={24} />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
            {linkedItems.length > 0 ? (
              <div className="grid grid-cols-1 gap-4">
                {linkedItems.map((item) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex flex-col md:flex-row gap-6 p-5 bg-[#141414]/[0.02] border border-[#141414]/5 rounded-3xl group hover:border-[#F27D26]/20 transition-all"
                  >
                    {/* Item Photo */}
                    <div className="w-full md:w-32 h-32 bg-white rounded-2xl border border-[#141414]/10 shadow-sm overflow-hidden flex-shrink-0 flex items-center justify-center">
                      {item.imageUrl ? (
                        <img 
                          src={item.imageUrl} 
                          alt={item.itemName} 
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                        />
                      ) : (
                        <ImageIcon size={32} className="text-[#141414]/10" />
                      )}
                    </div>

                    {/* Item Info */}
                    <div className="flex-1 space-y-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-bold text-[#141414] text-base group-hover:text-[#F27D26] transition-colors line-clamp-1">
                            {item.itemName}
                          </h3>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-mono font-bold text-[#141414]/30">
                              {item.itemCode}
                            </span>
                            {item.generic && (
                              <span className="text-[10px] italic text-[#141414]/40">
                                ({item.generic})
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end">
                           <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg ${
                             item.qoh <= 0 
                               ? 'bg-red-50 text-red-500' 
                               : (item.maxQty && item.qoh < item.maxQty * 0.3)
                               ? 'bg-amber-50 text-amber-500'
                               : 'bg-emerald-50 text-emerald-500'
                           }`}>
                             {item.qoh <= 0 ? 'Out of Stock' : (item.maxQty && item.qoh < item.maxQty * 0.3) ? 'Low Stock' : 'In Stock'}
                           </span>
                           <span className="text-[9px] text-[#141414]/20 font-bold mt-1 uppercase">
                             Status
                           </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-4 pt-4 border-t border-[#141414]/5">
                        <div className="col-span-1">
                          <p className="text-[9px] font-bold text-[#141414]/30 uppercase tracking-widest mb-1">QOH</p>
                          <p className="text-sm font-black text-[#141414]">{formatNumber(item.qoh)}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-[9px] font-bold text-[#141414]/30 uppercase tracking-widest mb-1">Primary Expiry (Exp1)</p>
                          <p className={`text-sm font-black ${item.expiration1 ? 'text-[#141414]' : 'text-[#141414]/20'}`}>
                            {item.expiration1 || 'N/A'}
                          </p>
                        </div>
                        <div className="col-span-1">
                          <p className="text-[9px] font-bold text-[#141414]/30 uppercase tracking-widest mb-1">Location</p>
                          <p className="text-[10px] font-bold text-[#F27D26] truncate">
                            {PHARMACY_NAMES[item.locationId]?.split('-').pop() || 'N/A'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="py-20 text-center flex flex-col items-center gap-4">
                <div className="w-16 h-16 bg-[#141414]/5 rounded-3xl flex items-center justify-center text-[#141414]/10">
                  <ExternalLink size={32} />
                </div>
                <div className="space-y-1">
                  <p className="font-bold text-[#141414] tracking-tight">No Linked Items Found</p>
                  <p className="text-[10px] uppercase font-bold tracking-widest text-[#141414]/30">
                    Verify item codes: {linkedCodes.join(', ') || 'N/A'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-6 bg-[#141414]/[0.02] border-t border-[#141414]/5">
            <button
              onClick={onClose}
              className="w-full py-4 bg-[#141414] text-white rounded-2xl text-xs font-bold uppercase tracking-[0.2em] hover:bg-[#F27D26] transition-all shadow-xl active:scale-95"
            >
              Close Details
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
