import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Command, Pill, ArrowRight, Zap, Filter, MousePointer2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Medication, PharmacyLocation } from '../types';
import { db } from '../lib/firebase';
import { collection, query, limit, getDocs, where } from 'firebase/firestore';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Medication[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        isOpen ? onClose() : onClose(); // This will be handled by the parent
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setSearch('');
      setResults([]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const medsRef = collection(db, 'medications');
        // Simple search logic - in a real super app, we might use a more advanced search
        const q = query(
          medsRef,
          limit(8)
        );
        const snapshot = await getDocs(q);
        const allMeds = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Medication));
        
        const filtered = allMeds.filter(m => 
          m.itemName?.toLowerCase().includes(search.toLowerCase()) ||
          m.itemCode?.toLowerCase().includes(search.toLowerCase()) ||
          m.generic?.toLowerCase().includes(search.toLowerCase())
        );
        
        setResults(filtered);
      } catch (error) {
        console.error("Search error:", error);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
       handleSelect(results[selectedIndex]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const handleSelect = (med: Medication) => {
    navigate(`/admin/dashboard?search=${med.itemCode}`);
    onClose();
  };

  const actions = [
    { icon: <Zap size={14} />, label: 'Add Medication', path: '/admin/dashboard?action=add' },
    { icon: <Filter size={14} />, label: 'View Low Stock', path: '/admin/dashboard?filter=low' },
    { icon: <ArrowRight size={14} />, label: 'Mesaieed Portal', path: '/admin/dashboard?location=MESAIEED' },
  ].filter(a => a.label.toLowerCase().includes(search.toLowerCase()));

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-[#141414]/40 backdrop-blur-[2px]"
          />
          
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: -20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: -20 }}
            className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden border border-[#141414]/5"
            onKeyDown={handleKeyDown}
          >
            <div className="flex items-center px-4 py-3 border-b border-[#141414]/5">
              <Search className="w-5 h-5 text-[#141414]/40 mr-3" />
              <input
                ref={inputRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search medication, codes, or commands..."
                className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-medium placeholder:text-[#141414]/20"
              />
              <div className="flex items-center gap-1.5 px-2 py-1 bg-[#141414]/5 rounded-lg">
                <Command size={10} className="text-[#141414]/30" />
                <span className="text-[10px] font-bold text-[#141414]/30">ESC</span>
              </div>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-2 custom-scrollbar">
              {search.trim() === '' ? (
                 <div className="p-4">
                   <p className="text-[10px] uppercase font-bold tracking-widest text-[#141414]/30 mb-4 ml-2">Quick Actions</p>
                   <div className="grid grid-cols-1 gap-1">
                     {actions.map((action, i) => (
                       <button
                         key={i}
                         onClick={() => { navigate(action.path); onClose(); }}
                         className="flex items-center gap-3 p-3 rounded-xl hover:bg-[#141414]/5 transition-colors text-left group"
                       >
                         <div className="w-8 h-8 rounded-lg bg-white border border-[#141414]/5 flex items-center justify-center text-[#141414]/40 group-hover:text-[#F27D26] group-hover:border-[#F27D26]/20 transition-all shadow-sm">
                           {action.icon}
                         </div>
                         <span className="text-xs font-bold text-[#141414]/60 group-hover:text-[#141414] transition-colors">{action.label}</span>
                       </button>
                     ))}
                   </div>
                 </div>
              ) : (
                <div className="space-y-1">
                  {isLoading && (
                    <div className="p-8 flex flex-col items-center justify-center gap-3">
                      <Zap className="w-6 h-6 text-[#F27D26] animate-pulse" />
                      <p className="text-[10px] font-bold text-[#141414]/20 uppercase tracking-widest">Searching Database...</p>
                    </div>
                  )}
                  
                  {!isLoading && results.length === 0 && (
                    <div className="p-8 text-center">
                      <p className="text-xs font-bold text-[#141414]/40">No matching results found.</p>
                    </div>
                  )}

                  {results.map((med, i) => (
                    <button
                      key={med.id}
                      onClick={() => handleSelect(med)}
                      onMouseEnter={() => setSelectedIndex(i)}
                      className={`w-full flex items-center justify-between p-3 rounded-xl transition-all text-left ${selectedIndex === i ? 'bg-[#141414] text-white shadow-lg' : 'hover:bg-[#141414]/5'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${selectedIndex === i ? 'bg-white/10 border-white/20' : 'bg-white border-[#141414]/10 shadow-sm'}`}>
                          <Pill size={18} className={selectedIndex === i ? 'text-white' : 'text-[#F27D26]'} />
                        </div>
                        <div>
                          <p className={`text-xs font-bold ${selectedIndex === i ? 'text-white' : 'text-[#141414]'}`}>{med.itemName}</p>
                          <p className={`text-[10px] font-bold uppercase tracking-tight ${selectedIndex === i ? 'text-white/40' : 'text-[#141414]/30'}`}>{med.itemCode} • {med.generic || 'Generic'}</p>
                        </div>
                      </div>
                      <div className={`flex items-center gap-2 ${selectedIndex === i ? 'opacity-100' : 'opacity-0'}`}>
                        <ArrowRight size={14} className="text-white/40" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-white/20">Select</span>
                      </div>
                    </button>
                  ))}
                  
                  {actions.length > 0 && results.length > 0 && (
                    <div className="h-px bg-[#141414]/5 my-2 mx-2" />
                  )}
                  
                  {results.length > 0 && actions.map((action, i) => (
                    <button
                      key={`action-${i}`}
                      onClick={() => { navigate(action.path); onClose(); }}
                      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#141414]/5 transition-colors text-left group"
                    >
                      <div className="w-10 h-10 rounded-lg bg-white border border-[#141414]/5 flex items-center justify-center text-[#141414]/40 group-hover:text-[#F27D26] group-hover:border-[#F27D26]/20 transition-all shadow-sm">
                        {action.icon}
                      </div>
                      <span className="text-xs font-bold text-[#141414]/60 group-hover:text-[#141414] transition-colors">{action.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="p-3 bg-[#141414]/[0.02] border-t border-[#141414]/5 flex items-center justify-between">
              <div className="flex gap-4">
                <div className="flex items-center gap-1.5 grayscale opacity-50">
                  <div className="px-1.5 py-0.5 rounded border border-[#141414]/10 bg-white">
                    <MousePointer2 size={10} className="text-[#141414]" />
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-[#141414]/60">Select</span>
                </div>
              </div>
              <p className="text-[9px] font-bold text-[#141414]/20 uppercase tracking-[0.2em]">Press <span className="text-[#141414]/40">ESC</span> to close</p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
