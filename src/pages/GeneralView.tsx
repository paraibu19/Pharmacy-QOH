import { useState, useMemo } from 'react';
import { Search, MapPin, Sparkles, Filter, Loader2, X as XIcon, RefreshCw, Image as ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PharmacyLocation, Medication } from '../types';
import { LOCATIONS } from '../constants';
import { format } from 'date-fns';
import { useMedications } from '../hooks/useMedications';

export default function GeneralView() {
  const [selectedLocation, setSelectedLocation] = useState<PharmacyLocation>(PharmacyLocation.ADULT);
  const [searchQuery, setSearchQuery] = useState('');
  const [availableGenericsOnly, setAvailableGenericsOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  
  const { medications, loading, refresh, lastSynced, isSyncing } = useMedications(selectedLocation);

  const suggestions = useMemo(() => {
    if (searchQuery.length < 1) return [];
    const lowerQuery = searchQuery.toLowerCase();
    return medications.filter(m => 
      m.itemName.toLowerCase().startsWith(lowerQuery) ||
      (m.generic && m.generic.toLowerCase().startsWith(lowerQuery))
    ).slice(0, 5);
  }, [medications, searchQuery]);

  const filteredMeds = useMemo(() => {
    let result = medications;
    
    if (searchQuery.length >= 1) {
      const lowerQuery = searchQuery.toLowerCase();
      result = result.filter(m => 
        m.itemName.toLowerCase().includes(lowerQuery) ||
        (m.generic && m.generic.toLowerCase().includes(lowerQuery))
      );
    }

    if (availableGenericsOnly) {
      result = result.filter(m => m.generic && m.qoh > 0);
    }
    
    return result.sort((a, b) => a.itemName.localeCompare(b.itemName));
  }, [medications, searchQuery, availableGenericsOnly]);

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 md:gap-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">General View</h1>
            <div className="px-3 py-1 bg-[#141414]/5 rounded-full text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest border border-[#141414]/5">
              {format(new Date(), 'eeee, dd-MM-yyyy')}
            </div>
          </div>
          <p className="text-[#141414]/60 max-w-xl text-sm md:text-base">
            Public availability status of medications at Alwakra and Mesaieed pharmacies.
          </p>
        </div>
        
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <button 
            onClick={() => refresh(true)}
            disabled={isSyncing}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all bg-[#141414]/5 text-[#141414]/60 border border-[#141414]/10 disabled:opacity-50"
          >
            {isSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Synced {format(lastSynced, 'HH:mm:ss')}
          </button>

          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold transition-all ${
              showFilters || availableGenericsOnly
              ? 'bg-[#F27D26] text-white shadow-lg shadow-[#F27D26]/20'
              : 'bg-white border border-[#141414]/10 text-[#141414]/60 hover:bg-[#141414]/5'
            }`}
          >
            <Filter className="w-4 h-4" />
            <span>Filters</span>
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center bg-white p-4 md:p-6 rounded-2xl border border-[#141414]/10 shadow-sm">
          <div className="lg:col-span-1">
            <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-[#141414]/40 mb-2 ml-1">
              Select Pharmacy Location
            </label>
            <div className="flex flex-wrap gap-2">
              {LOCATIONS.map(loc => (
                <button
                  key={loc.id}
                  onClick={() => setSelectedLocation(loc.id as PharmacyLocation)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all ${
                    selectedLocation === loc.id 
                      ? 'bg-[#F27D26] text-white shadow-md shadow-[#F27D26]/20' 
                      : 'bg-[#141414]/5 text-[#141414]/60 hover:bg-[#141414]/10'
                  }`}
                >
                  <MapPin className="w-3 h-3" />
                  {loc.id === PharmacyLocation.ADULT ? 'Adult' : loc.id === PharmacyLocation.PEDIATRIC ? 'Pediatric' : 'Mesaieed'}
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2 relative">
            <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-[#141414]/40 mb-2 ml-1">
              Search Medication
            </label>
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#141414]/30 group-focus-within:text-[#F27D26] transition-colors" />
              <input
                type="text"
                placeholder="Start typing medication name..."
                value={searchQuery}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-[#141414]/5 border border-transparent rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F27D26]/20 focus:border-[#F27D26] transition-all placeholder:text-[#141414]/30 text-sm font-medium"
              />

              <AnimatePresence>
                {showSuggestions && suggestions.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute left-0 right-0 top-full mt-2 bg-white border border-[#141414]/10 rounded-xl shadow-xl z-50 overflow-hidden"
                  >
                    {suggestions.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          setSearchQuery(s.itemName);
                          setShowSuggestions(false);
                        }}
                        className="w-full px-4 py-3 text-left hover:bg-[#141414]/5 flex items-center justify-between transition-colors border-b border-[#141414]/5 last:border-0"
                      >
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-[#141414]">{s.itemName}</span>
                          {s.generic && <span className="text-[10px] text-[#141414]/40">{s.generic}</span>}
                        </div>
                        <div className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.qoh > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                          {s.qoh > 0 ? 'In Stock' : 'Out of Stock'}
                        </div>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="flex gap-4 bg-[#141414]/5 p-4 rounded-2xl border border-[#141414]/10">
                <button
                  onClick={() => setAvailableGenericsOnly(!availableGenericsOnly)}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                    availableGenericsOnly 
                      ? 'bg-yellow-400 text-white shadow-lg ring-2 ring-yellow-400/20' 
                      : 'bg-yellow-50 text-yellow-700 border border-yellow-100 hover:bg-yellow-100'
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                  Available Generics
                </button>
                <button
                  onClick={() => {
                    setAvailableGenericsOnly(false);
                    setSearchQuery('');
                  }}
                  className="px-4 py-2.5 flex items-center justify-center gap-2 bg-white border border-red-100 text-red-500 rounded-xl text-xs font-bold hover:bg-red-50 transition-all font-bold"
                >
                  <XIcon className="w-4 h-4" />
                  Reset
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Main Content */}
      <div className="bg-white rounded-2xl border border-[#141414]/10 shadow-sm overflow-hidden min-h-[400px]">
        {/* Desktop View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#141414]/5 border-b border-[#141414]/10">
              <tr>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">Medication Name</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#141414]/5">
              {loading ? (
                <tr>
                  <td colSpan={2} className="px-6 py-20 text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-[#F27D26] mx-auto mb-2" />
                    <p className="font-bold text-xs uppercase tracking-widest text-[#141414]/40">Loading...</p>
                  </td>
                </tr>
              ) : filteredMeds.map((med) => (
                <tr key={med.id} className="hover:bg-[#141414]/[0.02] transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-4">
                      {med.imageUrl && (
                        <button 
                          onClick={() => setSelectedImage(med.imageUrl!)}
                          className="w-10 h-10 bg-[#141414]/5 rounded-xl border border-[#141414]/10 overflow-hidden hover:scale-105 transition-transform"
                        >
                          <img src={med.imageUrl} alt={med.itemName} className="w-full h-full object-cover" />
                        </button>
                      )}
                      {!med.imageUrl && (
                        <div className="w-10 h-10 bg-[#141414]/5 rounded-xl border border-[#141414]/10 flex items-center justify-center">
                          <ImageIcon size={18} className="text-[#141414]/10" />
                        </div>
                      )}
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-[#141414]">{med.itemName}</span>
                        {med.generic && <span className="text-[10px] italic text-[#141414]/40 leading-tight">{med.generic}</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                      med.qoh > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {med.qoh > 0 ? 'In Stock' : 'Out of Stock'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="md:hidden divide-y divide-[#141414]/5">
          {!loading && filteredMeds.map((med) => (
            <div key={med.id} className="p-4 flex gap-4 items-center">
              {med.imageUrl && (
                <button 
                  onClick={() => setSelectedImage(med.imageUrl!)}
                  className="w-12 h-12 flex-shrink-0 bg-[#141414]/5 rounded-xl border border-[#141414]/10 overflow-hidden"
                >
                  <img src={med.imageUrl} alt={med.itemName} className="w-full h-full object-cover" />
                </button>
              )}
              {!med.imageUrl && (
                <div className="w-12 h-12 flex-shrink-0 bg-[#141414]/5 rounded-xl border border-[#141414]/10 flex items-center justify-center">
                  <ImageIcon size={20} className="text-[#141414]/10" />
                </div>
              )}
              <div className="flex-1">
                <h3 className="font-bold text-[#141414] text-sm">{med.itemName}</h3>
                {med.generic && <p className="text-[10px] italic text-[#141414]/40 leading-tight">{med.generic}</p>}
              </div>
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest ${
                med.qoh > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
              }`}>
                {med.qoh > 0 ? 'In Stock' : 'Out of Stock'}
              </span>
            </div>
          ))}
        </div>
        
        {filteredMeds.length === 0 && !loading && (
          <div className="p-20 text-center flex flex-col items-center gap-4">
            <Search className="w-8 h-8 text-[#141414]/10" />
            <p className="font-bold text-[#141414]/40 uppercase tracking-widest text-sm">No results found</p>
          </div>
        )}
      </div>
      {/* Image Preview Modal */}
      <AnimatePresence>
        {selectedImage && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm shadow-2xl">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-2xl w-full bg-white rounded-3xl overflow-hidden shadow-2xl"
            >
              <button 
                onClick={() => setSelectedImage(null)}
                className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full z-10 transition-colors"
              >
                <XIcon size={24} />
              </button>
              <div className="aspect-square md:aspect-video w-full bg-[#141414] flex items-center justify-center">
                <img 
                  src={selectedImage} 
                  alt="Medication Preview" 
                  className="w-full h-full object-contain"
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
