import { useState, useMemo } from 'react';
import { Search, Download, MapPin, Sparkles, Filter, Loader2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PharmacyLocation, PHARMACY_NAMES } from '../types';
import { LOCATIONS } from '../constants';
import { format, differenceInDays } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useMedications } from '../hooks/useMedications';

export default function UserHome() {
  const [selectedLocation, setSelectedLocation] = useState<PharmacyLocation>(PharmacyLocation.ADULT);
  const [searchQuery, setSearchQuery] = useState('');
  const [qohThreshold, setQohThreshold] = useState<number | ''>('');
  const [expStart, setExpStart] = useState('');
  const [expEnd, setExpEnd] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  const { medications, loading } = useMedications(selectedLocation);

  const suggestions = useMemo(() => {
    if (searchQuery.length < 1) return [];
    const lowerQuery = searchQuery.toLowerCase();
    return medications.filter(m => 
      m.itemCode.toLowerCase().startsWith(lowerQuery) || 
      m.itemName.toLowerCase().startsWith(lowerQuery)
    ).slice(0, 5); // Limit suggestions
  }, [medications, searchQuery]);

  const parseExpDate = (dateStr: string) => {
    if (!dateStr || dateStr === '-') return null;
    // Try common formats
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d;
    
    // Try DD-MM-YYYY or MM-YYYY
    const parts = dateStr.split(/[-/]/);
    if (parts.length === 3) {
      const year = parseInt(parts[2]);
      const month = parseInt(parts[1]) - 1;
      const day = parseInt(parts[0]);
      return new Date(year, month, day);
    } else if (parts.length === 2) {
      const year = parseInt(parts[1]);
      const month = parseInt(parts[0]) - 1;
      return new Date(year, month, 1);
    }
    return null;
  };

  const filteredMeds = useMemo(() => {
    let result = medications;
    
    if (searchQuery.length >= 1) {
      const lowerQuery = searchQuery.toLowerCase();
      result = result.filter(m => 
        m.itemCode.toLowerCase().includes(lowerQuery) || 
        m.itemName.toLowerCase().includes(lowerQuery)
      );
    }

    if (qohThreshold !== '') {
      result = result.filter(m => m.qoh <= qohThreshold);
    }

    if (expStart || expEnd) {
      const start = expStart ? new Date(expStart) : null;
      const end = expEnd ? new Date(expEnd) : null;

      result = result.filter(m => {
        const dates = [m.expiration1, m.expiration2, m.expiration3]
          .map(parseExpDate)
          .filter(d => d !== null) as Date[];

        if (dates.length === 0) return !expStart && !expEnd; // Show if no dates but filters exist? Or hide? Let's hide if filters are set but no dates found.

        return dates.some(d => {
          let matches = true;
          if (start && d < start) matches = false;
          if (end && d > end) matches = false;
          return matches;
        });
      });
    }
    
    return result.map(m => ({
      ...m,
      isNew: m.addedAt ? differenceInDays(new Date(), (m.addedAt as any).toDate?.() || new Date(m.addedAt)) < 10 : false
    }));
  }, [medications, searchQuery, qohThreshold, expStart, expEnd]);

  // Handle PDF Export
  const downloadPDF = () => {
    const doc = new jsPDF();
    const locationName = PHARMACY_NAMES[selectedLocation];
    const now = format(new Date(), "eeee, dd-MM-yyyy, hh:mm a");
    // User requested format: DayName, dd-mm-yyyy, HH:MM AM/PM
    const displayDate = format(new Date(), "eeee, dd-MM-yyyy, hh:mm a");

    doc.setFontSize(18);
    doc.text(locationName, 14, 15);
    doc.setFontSize(10);
    doc.text(`Last Updated: ${displayDate}`, 14, 22);

    const tableData = filteredMeds.map(m => [
      m.itemCode,
      m.itemName,
      m.qoh,
      m.expiration1 || '-',
      m.expiration2 || '-',
      m.expiration3 || '-',
      m.isNew ? 'NEW' : 'Existing'
    ]);

    autoTable(doc, {
      startY: 30,
      head: [['Code', 'Name', 'QOH', 'Exp 1', 'Exp 2', 'Exp 3', 'Status']],
      body: tableData,
      headStyles: { fillColor: [20, 20, 20] },
      alternateRowStyles: { fillColor: [245, 245, 245] },
    });

    doc.save(`${locationName}_Inventory_${format(new Date(), 'yyyyMMdd')}.pdf`);
  };

  return (
    <div className="space-y-8">
      {/* Hero / Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h1 className="text-4xl font-bold tracking-tight mb-2">Inventory View</h1>
          <p className="text-[#141414]/60 max-w-xl">
            Real-time medication availability across all Qatar pharmacy locations.
          </p>
        </div>
        
        <div className="flex gap-3">
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold transition-all ${
              showFilters || qohThreshold !== '' || expStart || expEnd
              ? 'bg-[#F27D26] text-white shadow-lg shadow-[#F27D26]/20'
              : 'bg-white border border-[#141414]/10 text-[#141414]/60 hover:bg-[#141414]/5'
            }`}
          >
            <Filter className="w-4 h-4" />
            {showFilters ? 'Hide Filters' : 'Show Filters'}
            {(qohThreshold !== '' || expStart || expEnd) && (
              <span className="ml-1 w-2 h-2 bg-white rounded-full animate-pulse" />
            )}
          </button>
          
          <button 
            onClick={downloadPDF}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#141414] text-white rounded-full text-sm font-bold shadow-lg shadow-black/10 hover:translate-y-[-2px] transition-all active:translate-y-0"
          >
            <Download className="w-4 h-4" />
            Download PDF Report
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center bg-white p-6 rounded-2xl border border-[#141414]/10 shadow-sm">
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
                      ? loc.id === PharmacyLocation.ADULT
                        ? 'bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-md shadow-emerald-700/10'
                        : loc.id === PharmacyLocation.PEDIATRIC
                          ? 'bg-sky-100 text-sky-700 border border-sky-200 shadow-md shadow-sky-700/10'
                          : loc.id === PharmacyLocation.MESAIEED
                            ? 'bg-orange-100 text-orange-700 border border-orange-200 shadow-md shadow-orange-700/10'
                            : 'bg-[#F27D26] text-white shadow-md shadow-[#F27D26]/20' 
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
              Search Medication (Code or Name)
            </label>
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#141414]/30 group-focus-within:text-[#F27D26] transition-colors" />
              <input
                type="text"
                placeholder="Start typing item code or name..."
                value={searchQuery}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-[#141414]/5 md:bg-white border md:border-[#141414]/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F27D26]/20 focus:border-[#F27D26] transition-all placeholder:text-[#141414]/30 text-sm font-medium"
              />
              {searchQuery && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-2 py-0.5 bg-[#141414]/5 rounded text-[10px] font-bold text-[#141414]/40">
                  <Filter className="w-3 h-3" />
                  {filteredMeds.length} Match
                </div>
              )}

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
                          <span className="text-[10px] font-mono text-[#141414]/40">{s.itemCode}</span>
                        </div>
                        <div className="text-[10px] font-bold text-[#F27D26] bg-[#F27D26]/10 px-2 py-0.5 rounded-full">
                          {s.qoh} in stock
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
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-[#141414]/5 p-4 rounded-2xl border border-[#141414]/10">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 ml-1">
                    Max QOH Threshold
                  </label>
                  <input
                    type="number"
                    value={qohThreshold}
                    onChange={(e) => setQohThreshold(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="e.g. 50"
                    className="w-full px-4 py-2.5 bg-white border border-[#141414]/10 rounded-xl text-sm focus:ring-2 focus:ring-[#F27D26]/20 transition-all font-medium"
                  />
                </div>
                
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 ml-1">
                    Exp. Date Range (Start)
                  </label>
                  <input
                    type="date"
                    value={expStart}
                    onChange={(e) => setExpStart(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-[#141414]/10 rounded-xl text-sm focus:ring-2 focus:ring-[#F27D26]/20 transition-all font-medium"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 ml-1">
                    Exp. Date Range (End)
                  </label>
                  <input
                    type="date"
                    value={expEnd}
                    onChange={(e) => setExpEnd(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-[#141414]/10 rounded-xl text-sm focus:ring-2 focus:ring-[#F27D26]/20 transition-all font-medium"
                  />
                </div>

                <div className="flex items-end">
                  <button
                    onClick={() => {
                      setQohThreshold('');
                      setExpStart('');
                      setExpEnd('');
                      setSearchQuery('');
                    }}
                    className="w-full h-[42px] flex items-center justify-center gap-2 bg-white border border-red-100 text-red-500 rounded-xl text-xs font-bold hover:bg-red-50 transition-all"
                  >
                    <X className="w-4 h-4" />
                    Reset All Filters
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Main Table View */}
      <div className="bg-white rounded-2xl border border-[#141414]/10 shadow-sm overflow-hidden min-h-[400px]">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#141414]/5 border-bottom border-[#141414]/10">
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">Status</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">Item Code</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">Item Name</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">QOH</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">Exp 1</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">Exp 2</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">Exp 3</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#141414]/5">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-2 opacity-50">
                      <Loader2 className="w-8 h-8 animate-spin text-[#F27D26]" />
                      <p className="font-bold text-xs uppercase tracking-widest">Loading Inventory...</p>
                    </div>
                  </td>
                </tr>
              )}
              <AnimatePresence mode="popLayout">
                {!loading && filteredMeds.map((med) => (
                  <motion.tr 
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    key={med.id} 
                    className="hover:bg-[#141414]/[0.02] transition-colors group"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      {med.isNew ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#F27D26]/10 text-[#F27D26] text-[10px] font-bold rounded-full">
                          <Sparkles className="w-3 h-3" />
                          NEW
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-[#141414]/20">STABLE</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm font-mono font-medium text-[#141414]/80">{med.itemCode}</td>
                    <td className="px-6 py-4 text-sm font-bold text-[#141414]">{med.itemName}</td>
                    <td className="px-6 py-4">
                      <span className={`text-sm font-bold ${med.qoh < 10 ? 'text-red-500' : 'text-[#141414]'}`}>
                        {med.qoh}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs font-medium text-[#141414]/60">{med.expiration1 || '-'}</td>
                    <td className="px-6 py-4 text-xs font-medium text-[#141414]/60">{med.expiration2 || '-'}</td>
                    <td className="px-6 py-4 text-xs font-medium text-[#141414]/60">{med.expiration3 || '-'}</td>
                  </motion.tr>
                ))}
              </AnimatePresence>
              
              {filteredMeds.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-2 opacity-20">
                      <Search className="w-12 h-12" />
                      <p className="font-bold">No medications found matching your criteria</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
