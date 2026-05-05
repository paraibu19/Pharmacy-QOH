import { useState, useMemo, useEffect } from 'react';
import { Search, MapPin, Sparkles, Filter, Loader2, X as XIcon, RefreshCw, Image as ImageIcon, Bell, Calendar, Clock, ChevronRight, AlertCircle, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PharmacyLocation, Medication } from '../types';
import { LOCATIONS } from '../constants';
import { format, addHours, addDays, addWeeks, addMonths, isBefore, startOfToday } from 'date-fns';
import { useMedications } from '../hooks/useMedications';
import * as ics from 'ics';

export default function GeneralView() {
  const [selectedLocation, setSelectedLocation] = useState<PharmacyLocation>(PharmacyLocation.ADULT);
  const [searchQuery, setSearchQuery] = useState('');
  const [availableGenericsOnly, setAvailableGenericsOnly] = useState(false);
  const [stockFilter, setStockFilter] = useState<'all' | 'in' | 'low' | 'out'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  
  // Reminder State
  const [selectedMedicationForReminder, setSelectedMedicationForReminder] = useState<Medication | null>(null);
  const [reminderFrequency, setReminderFrequency] = useState<'daily' | 'weekly' | 'monthly' | 'hours' | 'other_day' | 'other_week'>('daily');
  const [reminderIntervalHours, setReminderIntervalHours] = useState(8);
  const [reminderDurationValue, setReminderDurationValue] = useState(7);
  const [reminderDurationType, setReminderDurationType] = useState<'days' | 'weeks' | 'months'>('days');
  const [reminderStartTime, setReminderStartTime] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [isGeneratingReminder, setIsGeneratingReminder] = useState(false);
  
  const { medications, loading, error: fetchError, refresh, lastSynced, isSyncing } = useMedications(selectedLocation);

  useEffect(() => {
    if (fetchError) {
      console.error("GeneralView fetch error:", fetchError);
    }
  }, [fetchError]);

  const handleExportToCalendar = () => {
    if (!selectedMedicationForReminder) return;

    const startDate = new Date(reminderStartTime);
    const endDate = new Date(startDate);
    
    if (reminderDurationType === 'days') endDate.setDate(endDate.getDate() + reminderDurationValue);
    else if (reminderDurationType === 'weeks') endDate.setDate(endDate.getDate() + (reminderDurationValue * 7));
    else if (reminderDurationType === 'months') endDate.setMonth(endDate.getMonth() + reminderDurationValue);

    const occurrences: any[] = [];
    let current = new Date(startDate);

    while (isBefore(current, endDate)) {
      const year = current.getFullYear();
      const month = current.getMonth() + 1;
      const day = current.getDate();
      const hour = current.getHours();
      const minute = current.getMinutes();

      occurrences.push({
        title: `Reminder: ${selectedMedicationForReminder.itemName}`,
        description: `Scheduled reminder to take your medication: ${selectedMedicationForReminder.itemName}${selectedMedicationForReminder.generic ? ' (' + selectedMedicationForReminder.generic + ')' : ''}`,
        start: [year, month, day, hour, minute],
        duration: { minutes: 15 },
        alarms: [
          { action: 'display', description: 'Reminder', trigger: { minutes: 0, before: true } }
        ]
      });

      // Calculate next occurrence
      if (reminderFrequency === 'daily') current = addDays(current, 1);
      else if (reminderFrequency === 'weekly') current = addWeeks(current, 1);
      else if (reminderFrequency === 'monthly') current = addMonths(current, 1);
      else if (reminderFrequency === 'hours') current = addHours(current, reminderIntervalHours);
      else if (reminderFrequency === 'other_day') current = addDays(current, 2);
      else if (reminderFrequency === 'other_week') current = addWeeks(current, 2);
      else break;
    }

    if (occurrences.length === 0) return;

    const { error, value } = ics.createEvents(occurrences);

    if (error) {
      console.error(error);
      return;
    }

    const blob = new Blob([value!], { type: 'text/calendar;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${selectedMedicationForReminder.itemName}_reminders.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setSelectedMedicationForReminder(null);
  };

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

    if (stockFilter !== 'all') {
      result = result.filter(m => {
        const isOut = m.qoh <= 0;
        const isLow = !isOut && m.maxQty > 0 && m.qoh < m.maxQty * 0.3;
        const isIn = !isOut && !isLow;
        
        if (stockFilter === 'in') return isIn;
        if (stockFilter === 'low') return isLow;
        if (stockFilter === 'out') return isOut;
        return true;
      });
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
              <div className="flex flex-col gap-4 bg-[#141414]/5 p-4 rounded-2xl border border-[#141414]/10">
                <div className="flex flex-wrap gap-2">
                  <span className="w-full text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 mb-1 ml-1">Stock Status</span>
                  {[
                    { id: 'all', label: 'All', color: 'gray' },
                    { id: 'in', label: 'In Stock', color: 'emerald' },
                    { id: 'low', label: 'Low Stock', color: 'amber' },
                    { id: 'out', label: 'Out of Stock', color: 'red' }
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setStockFilter(f.id as any)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                        stockFilter === f.id
                          ? f.id === 'in' ? 'bg-emerald-500 text-white border-emerald-500' :
                            f.id === 'low' ? 'bg-amber-500 text-white border-amber-500' :
                            f.id === 'out' ? 'bg-red-500 text-white border-red-500' :
                            'bg-[#141414] text-white border-[#141414]'
                          : 'bg-white text-[#141414]/60 border-[#141414]/10 hover:bg-[#141414]/5'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2 pt-2 border-t border-[#141414]/5">
                  <button
                    onClick={() => setAvailableGenericsOnly(!availableGenericsOnly)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
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
                      setStockFilter('all');
                      setSearchQuery('');
                    }}
                    className="px-4 py-2 flex items-center justify-center gap-2 bg-white border border-red-100 text-red-500 rounded-xl text-xs font-bold hover:bg-red-50 transition-all font-bold"
                  >
                    <XIcon className="w-4 h-4" />
                    Reset
                  </button>
                </div>
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
                      <div 
                        className="flex flex-col cursor-pointer hover:opacity-70 transition-opacity translate-x-0 group-hover:translate-x-1"
                        onClick={() => setSelectedMedicationForReminder(med)}
                      >
                        <span className="text-sm font-bold text-[#141414] group-hover:text-[#F27D26] transition-colors">{med.itemName}</span>
                        {med.generic && <span className="text-[10px] italic text-[#141414]/40 leading-tight">{med.generic}</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                      med.qoh <= 0 
                        ? 'bg-red-100 text-red-700' 
                        : (med.maxQty && med.qoh < med.maxQty * 0.3)
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {med.qoh <= 0 
                        ? 'Out of Stock' 
                        : (med.maxQty && med.qoh < med.maxQty * 0.3)
                        ? 'Low Stock' 
                        : 'In Stock'}
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
              <div 
                className="flex-1 cursor-pointer"
                onClick={() => setSelectedMedicationForReminder(med)}
              >
                <h3 className="font-bold text-[#141414] text-sm group-active:text-[#F27D26]">{med.itemName}</h3>
                {med.generic && <p className="text-[10px] italic text-[#141414]/40 leading-tight">{med.generic}</p>}
              </div>
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest ${
                med.qoh <= 0 
                  ? 'bg-red-100 text-red-700' 
                  : (med.maxQty && med.qoh < med.maxQty * 0.3)
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-emerald-100 text-emerald-700'
              }`}>
                {med.qoh <= 0 
                  ? 'Out of Stock' 
                  : (med.maxQty && med.qoh < med.maxQty * 0.3)
                  ? 'Low Stock' 
                  : 'In Stock'}
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
      {/* Reminder Modal */}
      <AnimatePresence>
        {selectedMedicationForReminder && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="relative max-w-lg w-full bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-[#141414]/5 bg-white flex items-center justify-between sticky top-0 z-10">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#F27D26]/10 rounded-xl text-[#F27D26]">
                    <Bell size={20} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-[#141414] leading-tight">
                      {selectedMedicationForReminder.itemName}
                    </h2>
                    <p className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest mt-0.5">
                      Set Medication Reminder
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedMedicationForReminder(null)}
                  className="p-2 hover:bg-[#141414]/5 rounded-full text-[#141414]/40 transition-colors"
                >
                  <XIcon size={20} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
                {/* 1. Frequency Selection */}
                <section className="space-y-3">
                  <div className="flex items-center gap-2 text-[#141414]/40">
                    <Clock size={16} />
                    <span className="text-[10px] font-bold uppercase tracking-widest">1. Choose Frequency</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[
                      { id: 'daily', label: 'Daily' },
                      { id: 'weekly', label: 'Weekly' },
                      { id: 'monthly', label: 'Monthly' },
                      { id: 'other_day', label: 'Every Other Day' },
                      { id: 'other_week', label: 'Every Other Week' },
                      { id: 'hours', label: 'Every X Hours' }
                    ].map((freq) => (
                      <button
                        key={freq.id}
                        onClick={() => setReminderFrequency(freq.id as any)}
                        className={`px-3 py-3 rounded-xl border text-xs font-bold transition-all ${
                          reminderFrequency === freq.id
                            ? 'bg-[#F27D26] border-[#F27D26] text-white shadow-md shadow-[#F27D26]/10'
                            : 'bg-white border-[#141414]/5 text-[#141414]/60 hover:bg-[#141414]/5'
                        }`}
                      >
                        {freq.label}
                      </button>
                    ))}
                  </div>

                  <AnimatePresence>
                    {reminderFrequency === 'hours' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="p-4 bg-[#141414]/5 rounded-2xl flex flex-col gap-3"
                      >
                        <span className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-wider">Interval (Hours)</span>
                        <div className="grid grid-cols-5 gap-2">
                          {[4, 6, 8, 12, 24].map((h) => (
                            <button
                              key={h}
                              onClick={() => setReminderIntervalHours(h)}
                              className={`py-2 rounded-lg text-[10px] font-black transition-all ${
                                reminderIntervalHours === h
                                  ? 'bg-[#141414] text-white'
                                  : 'bg-white text-[#141414]/60'
                              }`}
                            >
                              {h}h
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </section>

                {/* 2. Duration Setup */}
                <section className="space-y-3 pt-6 border-t border-[#141414]/5">
                  <div className="flex items-center gap-2 text-[#141414]/40">
                    <Calendar size={16} />
                    <span className="text-[10px] font-bold uppercase tracking-widest">2. Set Schedule Duration</span>
                  </div>
                  
                  <div className="flex flex-col gap-4">
                    <div className="flex gap-2 p-1 bg-[#141414]/5 rounded-xl">
                      {(['days', 'weeks', 'months'] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => setReminderDurationType(t)}
                          className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
                            reminderDurationType === t
                              ? 'bg-white text-[#F27D26] shadow-sm'
                              : 'text-[#141414]/40 hover:text-[#141414]'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-6 p-4 bg-[#141414]/5 rounded-2xl">
                      <div className="flex-1">
                        <span className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest block mb-2">How many {reminderDurationType}?</span>
                        <input 
                          type="range" 
                          min={1} 
                          max={reminderDurationType === 'days' ? 90 : reminderDurationType === 'weeks' ? 52 : 24} 
                          value={reminderDurationValue}
                          onChange={(e) => setReminderDurationValue(parseInt(e.target.value))}
                          className="w-full accent-[#F27D26]"
                        />
                      </div>
                      <div className="w-16 h-12 bg-white rounded-xl border border-[#141414]/10 flex items-center justify-center font-black text-xl text-[#F27D26]">
                        {reminderDurationValue}
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest block mb-2 ml-1">First Reminder</span>
                      <input 
                        type="datetime-local" 
                        value={reminderStartTime}
                        onChange={(e) => setReminderStartTime(e.target.value)}
                        className="w-full p-3 bg-[#141414]/5 border border-transparent rounded-xl focus:ring-2 focus:ring-[#F27D26]/20 focus:border-[#F27D26] focus:bg-white transition-all text-xs font-bold"
                      />
                    </div>
                  </div>
                </section>

                {/* Info Box */}
                <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex gap-3">
                  <div className="p-1.5 bg-emerald-500 rounded-lg text-white h-fit">
                    <AlertCircle size={14} />
                  </div>
                  <div>
                    <h4 className="text-[11px] font-bold text-emerald-800">Ready to Sync</h4>
                    <p className="text-[10px] text-emerald-700/60 leading-relaxed mt-0.5">
                      Clicking "Save to Calendar" will generate a schedule for the next {reminderDurationValue} {reminderDurationType}.
                    </p>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-6 bg-[#141414]/[0.02] border-t border-[#141414]/5 flex gap-3">
                <button 
                  onClick={() => setSelectedMedicationForReminder(null)}
                  className="flex-1 px-4 py-3 bg-white border border-[#141414]/10 rounded-2xl text-xs font-bold text-[#141414]/60 hover:bg-[#141414]/5 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleExportToCalendar}
                  className="flex-[2] flex items-center justify-center gap-2 px-4 py-3 bg-[#F27D26] text-white rounded-2xl text-xs font-bold hover:bg-[#F27D26]/90 transition-all shadow-lg shadow-[#F27D26]/20"
                >
                  <Save size={16} />
                  Save to Calendar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
