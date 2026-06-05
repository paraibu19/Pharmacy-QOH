import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, MapPin, ThermometerSnowflake, Sparkles, Edit3, 
  ArrowRightLeft, Layers, Calendar, ClipboardCheck, Info 
} from 'lucide-react';
import { PharmacyLocation, PHARMACY_NAMES, Medication } from '../types';

interface MultiLocationLookupModalProps {
  isOpen: boolean;
  onClose: () => void;
  medication: Medication | null;
  allMedications: Medication[];
  onEditOption?: () => void;
  onLinksOption?: () => void;
}

const PHARMACIES = [
  { id: PharmacyLocation.ADULT, name: 'Adult Pharmacy', short: 'Adult' },
  { id: PharmacyLocation.PEDIATRIC, name: 'Pediatric Pharmacy', short: 'Pediatric' },
  { id: PharmacyLocation.MESAIEED, name: 'Mesaieed Pharmacy', short: 'Mesaieed' }
];

export default function MultiLocationLookupModal({
  isOpen,
  onClose,
  medication,
  allMedications,
  onEditOption,
  onLinksOption
}: MultiLocationLookupModalProps) {
  if (!isOpen || !medication) return null;

  // Find occurrences of this item in all locations
  const otherLocationsData = PHARMACIES.map(pharm => {
    const match = allMedications.find(
      m => m.itemCode === medication.itemCode && m.locationId === pharm.id
    );
    return {
      pharm,
      match,
      isCurrent: medication.locationId === pharm.id
    };
  });

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative w-full max-w-2xl overflow-hidden bg-white border border-[#141414]/10 rounded-3xl shadow-2xl flex flex-col max-h-[85vh] sm:max-h-[90vh]"
        >
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-start justify-between p-4 sm:p-6 bg-stone-50 border-b border-[#141414]/5">
            <div className="space-y-1 pr-6 justify-start text-left">
              <div className="flex items-center flex-wrap gap-2 text-left">
                <span className="font-mono text-xs font-bold px-2 py-0.5 bg-[#141414]/5 rounded text-[#141414]/50">
                  {medication.itemCode}
                </span>
                {medication.isRefrigerated && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-600 rounded text-[9px] font-black uppercase tracking-tighter shadow-sm animate-pulse">
                    <ThermometerSnowflake size={10} />
                    Refrigerated
                  </span>
                )}
                {medication.restriction && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold bg-[#141414]/5 text-[#141414]/60 border border-[#141414]/10 uppercase tracking-tight">
                    {medication.restriction}
                  </span>
                )}
              </div>
              <h3 className="text-base sm:text-lg font-black text-[#141414] tracking-tight text-left">{medication.itemName}</h3>
              {medication.generic && (
                <p className="text-xs italic text-[#141414]/50 text-left">{medication.generic}</p>
              )}
            </div>
            
            <button
              onClick={onClose}
              className="p-2 border border-transparent rounded-full text-[#141414]/40 hover:bg-[#141414]/5 hover:text-[#141414] transition-all cursor-pointer flex-shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body Content */}
          <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
            <div className="space-y-2 text-left">
              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#141414]/40 text-left">
                Multi-Location Lookup Details
              </h4>
              <p className="text-xs text-[#141414]/60 text-left">
                Real-time stock quantities and detailed secondary expiry batches across Al Wakra and Mesaieed pharmacies.
              </p>
            </div>

            {/* comparison cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {otherLocationsData.map(({ pharm, match, isCurrent }) => {
                const hasItem = !!match;
                const qoh = match ? match.qoh : 0;
                
                return (
                  <div
                    key={pharm.id}
                    className={`p-4 rounded-2xl border transition-all flex flex-col justify-between min-h-[160px] relative text-left ${
                      isCurrent 
                        ? 'border-[#F27D26] bg-[#F27D26]/[0.02] shadow-sm shadow-[#F27D26]/5' 
                        : hasItem
                          ? 'border-[#141414]/10 bg-white hover:border-[#141414]/20'
                          : 'border-[#141414]/5 bg-stone-50/50'
                    }`}
                  >
                    {isCurrent && (
                      <span className="absolute top-3 right-3 text-[8px] font-black uppercase tracking-widest bg-[#F27D26] text-white px-2 py-0.5 rounded-full shadow-sm">
                        Current
                      </span>
                    )}

                    <div className="space-y-3 text-left">
                      <div className="flex items-center gap-1.5 text-left">
                        <MapPin className={`w-3.5 h-3.5 ${isCurrent ? 'text-[#F27D26]' : 'text-[#141414]/40'}`} />
                        <span className={`text-xs font-extrabold ${isCurrent ? 'text-[#F27D26]' : 'text-[#141414]/80'}`}>
                          {pharm.name}
                        </span>
                      </div>

                      {hasItem ? (
                        <div className="space-y-2.5 text-left">
                          <div>
                            <span className="text-[9px] font-bold text-[#141414]/40 uppercase tracking-widest block text-left">Available QOH</span>
                            <span className={`text-xl font-black ${qoh > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                              {qoh} <span className="text-xs font-bold text-[#141414]/50">Box</span>
                            </span>
                          </div>

                          <div className="space-y-1 text-left">
                            <span className="text-[9px] font-bold text-[#141414]/40 uppercase tracking-widest block text-left">Expiries</span>
                            <div className="space-y-1 font-mono text-[10px] text-[#141414]/70">
                              <div className="flex items-center justify-between border-b border-[#141414]/5 pb-0.5">
                                <span className="text-[8px] font-bold text-[#141414]/30 uppercase">Exp 1:</span>
                                <span className="font-extrabold">{match.expiration1 || 'N/A'}</span>
                              </div>
                              <div className="flex items-center justify-between border-b border-[#141414]/5 pb-0.5">
                                <span className="text-[8px] font-bold text-[#141414]/30 uppercase">Exp 2:</span>
                                <span className="font-semibold">{match.expiration2 || '-'}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-[8px] font-bold text-[#141414]/30 uppercase">Exp 3:</span>
                                <span className="font-semibold">{match.expiration3 || '-'}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="py-6 flex flex-col items-center justify-center text-center gap-1">
                          <Layers className="w-6 h-6 text-[#141414]/20" />
                          <span className="text-[10px] font-black text-[#141414]/30 uppercase tracking-widest">
                            Not In The List
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action Footer */}
          <div className="sticky bottom-0 z-10 flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-end p-4 sm:p-6 bg-[#FCFCFC] border-t border-[#141414]/5">
            {onLinksOption && medication.to && (
              <button
                onClick={() => {
                  onClose();
                  onLinksOption();
                }}
                className="px-4 py-2.5 bg-[#F27D26]/10 text-[#F27D26] hover:bg-[#F27D26]/20 transition-all text-xs font-bold rounded-2xl flex items-center justify-center gap-1.5 border border-[#F27D26]/20 cursor-pointer w-full sm:w-auto"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                View Linked Items
              </button>
            )}

            {onEditOption && (
              <button
                onClick={() => {
                  onClose();
                  onEditOption();
                }}
                className="px-4 py-2.5 bg-white hover:bg-stone-50 border border-[#141414]/10 transition-all text-xs font-bold rounded-2xl text-[#141414]/80 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm w-full sm:w-auto"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Edit / Settle Details
              </button>
            )}

            <button
              onClick={onClose}
              className="px-5 py-2.5 bg-[#141414] hover:bg-[#141414]/90 text-white transition-all text-xs font-extrabold rounded-2xl cursor-pointer shadow-md shadow-stone-800/10 flex items-center justify-center w-full sm:w-auto"
            >
              Close Lookup
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
