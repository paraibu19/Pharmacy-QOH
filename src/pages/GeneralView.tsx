import { useState, useMemo, useEffect } from 'react';
import { Search, MapPin, Sparkles, Filter, Loader2, X as XIcon, RefreshCw, Image as ImageIcon, Bell, Calendar, Clock, ChevronRight, AlertCircle, Save, Globe, Check, ArrowRightLeft, ThermometerSnowflake, UploadCloud, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PharmacyLocation, Medication } from '../types';
import { LOCATIONS } from '../constants';
import { format, addHours, addDays, addWeeks, addMonths, isBefore } from 'date-fns';
import { useMedications } from '../hooks/useMedications';
import { useNavigate } from 'react-router-dom';
import { translations, LANGUAGES, Language, TranslationStrings } from '../lib/translations';
import LinkedItemsModal from '../components/LinkedItemsModal';
import * as ics from 'ics';
import { db } from '../lib/firebase';
import { localDb } from '../lib/localStorageDb';
import { storage } from '../lib/storage';
import { useSystemMetadata } from '../lib/useSystemMetadata';

export default function GeneralView() {
  const navigate = useNavigate();
  const { lastUpdate } = useSystemMetadata();
  
  // Language State
  const [language, setLanguage] = useState<Language>(() => {
    const saved = storage.getItem('app_language');
    return (saved as Language) || 'en';
  });
  const [showLanguageSelector, setShowLanguageSelector] = useState(false);
  const t = translations[language];
  const isRtl = LANGUAGES.find(l => l.id === language)?.dir === 'rtl';

  const [selectedLocation, setSelectedLocation] = useState<PharmacyLocation>(PharmacyLocation.ADULT);
  const [searchQuery, setSearchQuery] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'in' | 'low' | 'out'>('all');
  const [classificationFilter, setClassificationFilter] = useState<'qatari' | 'restricted' | null>(null);
  const [typeFilter, setTypeFilter] = useState<'generic' | 'brand' | null>(null);
  const [refFilter, setRefFilter] = useState(false);
  const [expStart, setExpStart] = useState('');
  const [expEnd, setExpEnd] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedMedForLinks, setSelectedMedForLinks] = useState<Medication | null>(null);
  const [selectedMedForIndications, setSelectedMedForIndications] = useState<Medication | null>(null);
  const [selectedMedForRefrigeration, setSelectedMedForRefrigeration] = useState<Medication | null>(null);
  
  // Reminder State
  const [selectedMedicationForReminder, setSelectedMedicationForReminder] = useState<Medication | null>(null);
  const [reminderFrequency, setReminderFrequency] = useState<'daily' | 'weekly' | 'monthly' | 'hours' | 'other_day' | 'other_week' | 'twice_weekly' | 'twice_monthly'>('daily');
  const [reminderIntervalHours, setReminderIntervalHours] = useState(8);
  const [reminderDurationValue, setReminderDurationValue] = useState(7);
  const [reminderDurationType, setReminderDurationType] = useState<'days' | 'weeks' | 'months'>('days');
  const [reminderStartTime, setReminderStartTime] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  
  // Saved Reminders from LocalStorage
  const [savedReminders, setSavedReminders] = useState<any[]>(() => {
    try {
      const saved = storage.getItem('medication_reminders');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [showSavedReminders, setShowSavedReminders] = useState(false);
  
  const { medications, loading, error: fetchError, refresh, lastSynced, isSyncing } = useMedications(selectedLocation);

  useEffect(() => {
    storage.setItem('app_language', language);
  }, [language]);

  useEffect(() => {
    if (fetchError) {
      console.error("GeneralView fetch error:", fetchError);
    }
  }, [fetchError]);

  const handleSaveSchedule = () => {
    if (!selectedMedicationForReminder) return;

    const newReminder = {
      id: (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') 
        ? crypto.randomUUID() 
        : Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
      itemName: selectedMedicationForReminder.itemName,
      generic: selectedMedicationForReminder.generic,
      isRefrigerated: selectedMedicationForReminder.isRefrigerated || false,
      frequency: reminderFrequency,
      intervalHours: reminderIntervalHours,
      durationValue: reminderDurationValue,
      durationType: reminderDurationType,
      startTime: reminderStartTime,
      createdAt: Date.now()
    };

    const updated = [...savedReminders, newReminder];
    setSavedReminders(updated);
    storage.setItem('medication_reminders', JSON.stringify(updated));
    
    setSelectedMedicationForReminder(null);
    setShowSavedReminders(true);
  };

  const handleDeleteReminder = (id: string) => {
    const updated = savedReminders.filter(r => r.id !== id);
    setSavedReminders(updated);
    storage.setItem('medication_reminders', JSON.stringify(updated));
  };

  const handleExportSingleReminder = (reminder: any) => {
    const startDate = new Date(reminder.startTime);
    const untilDate = new Date(startDate);
    
    if (reminder.durationType === 'days') untilDate.setDate(untilDate.getDate() + reminder.durationValue);
    else if (reminder.durationType === 'weeks') untilDate.setDate(untilDate.getDate() + (reminder.durationValue * 7));
    else if (reminder.durationType === 'months') untilDate.setMonth(untilDate.getMonth() + reminder.durationValue);

    const occurrences: ics.EventAttributes[] = [];
    let current = new Date(startDate);
    let safetyCounter = 0;

    while (isBefore(current, untilDate) && safetyCounter < 365) {
      safetyCounter++;
      const eventUid = `med-rem-${reminder.id}-${current.getTime()}@medreminder.app`;
      
      // Clean up storage instructions for ICS (no markdown)
      const cleanStorageInfo = t.storageInstructions.replace(/\*\*/g, '');
      const description = `Medication Reminder: ${reminder.itemName}${reminder.generic ? ' (' + reminder.generic + ')' : ''}${reminder.isRefrigerated ? '\n\n' + cleanStorageInfo : ''}`;
      
      occurrences.push({
        uid: eventUid,
        title: `Reminder: ${reminder.itemName}`,
        description: description,
        start: [current.getFullYear(), current.getMonth() + 1, current.getDate(), current.getHours(), current.getMinutes()],
        duration: { minutes: 15 },
        categories: ['Medication', 'Health'],
        alarms: [{ 
          action: 'display', 
          description: `Take ${reminder.itemName}${reminder.isRefrigerated ? ' - REFRIGERATED' : ''}`, 
          trigger: { minutes: 0, before: true } 
        }]
      });

      if (reminder.frequency === 'daily') current = addDays(current, 1);
      else if (reminder.frequency === 'weekly') current = addWeeks(current, 1);
      else if (reminder.frequency === 'monthly') current = addMonths(current, 1);
      else if (reminder.frequency === 'twice_weekly') current = addHours(current, 84);
      else if (reminder.frequency === 'twice_monthly') current = addDays(current, 15);
      else if (reminder.frequency === 'hours') current = addHours(current, reminder.intervalHours);
      else if (reminder.frequency === 'other_day') current = addDays(current, 2);
      else if (reminder.frequency === 'other_week') current = addWeeks(current, 2);
      else break;
    }

    if (occurrences.length === 0) return;

    const { error, value } = ics.createEvents(occurrences);
    if (!error && value) {
      // Inject METHOD:PUBLISH and calendar name for better app compatibility
      let modified = value;
      const calTitle = (reminder.itemName + ' Schedule').replace(/[^\w\s]/gi, '');
      
      if (!modified.includes('METHOD:PUBLISH')) {
        modified = modified.replace(
          'BEGIN:VCALENDAR', 
          `BEGIN:VCALENDAR\r\nMETHOD:PUBLISH\r\nX-WR-CALNAME:${calTitle}\r\nX-WR-TIMEZONE:UTC`
        );
      }

      // Ensure VALARM blocks have specific properties that some mobile calendars require
      // We do a safer replacement that doesn't risk stripping DESCRIPTION
      modified = modified.replace(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g, (vevent) => {
        // If it already has a VALARM, we'll refine it, otherwise the library adds one
        if (vevent.includes('BEGIN:VALARM')) {
          return vevent.replace(/BEGIN:VALARM[\s\S]*?END:VALARM/g, (valarm) => {
            return `BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:Medication Reminder\r\nTRIGGER:PT0M\r\nEND:VALARM`;
          });
        }
        return vevent;
      });

      const blob = new Blob([modified], { type: 'text/calendar;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${reminder.itemName.replace(/\s+/g, '_')}_schedule.ics`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    }
  };

  const handleClearAllReminders = () => {
    if (window.confirm(t.confirmClear)) {
      setSavedReminders([]);
      storage.removeItem('medication_reminders');
    }
  };

  const suggestions = useMemo(() => {
    if (searchQuery.length < 1) return [];
    const lowerQuery = searchQuery.toLowerCase();
    return medications.filter(m => 
      m.itemName.toLowerCase().startsWith(lowerQuery) ||
      (m.generic && m.generic.toLowerCase().startsWith(lowerQuery))
    ).slice(0, 5);
  }, [medications, searchQuery]);

  const parseExpDate = (dateStr: string) => {
    if (!dateStr || dateStr === '-' || dateStr === '.') return null;
    try {
      const parts = dateStr.split(/[-/.]/);
      if (parts.length === 3) {
        const d = parseInt(parts[0]);
        const m = parseInt(parts[1]);
        const y = parseInt(parts[2]);
        const fullYear = y < 100 ? 2000 + y : y;
        const date = new Date(fullYear, m - 1, d);
        if (!isNaN(date.getTime())) return date;
      } else if (parts.length === 2) {
        const m = parseInt(parts[0]);
        const y = parseInt(parts[1]);
        const fullYear = y < 100 ? 2000 + y : y;
        const date = new Date(fullYear, m - 1, 1);
        if (!isNaN(date.getTime())) return date;
      }
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) return d;
    } catch { }
    return null;
  };

  const filteredMeds = useMemo(() => {
    let result = medications;
    if (searchQuery.length >= 1) {
      const lowerQuery = searchQuery.toLowerCase();
      result = result.filter(m => 
        m.itemName.toLowerCase().includes(lowerQuery) || 
        (m.generic && m.generic.toLowerCase().includes(lowerQuery)) ||
        (lowerQuery === 'refrig' && m.isRefrigerated) ||
        (lowerQuery === 'refridge' && m.isRefrigerated) ||
        (lowerQuery === 'refrigerated' && m.isRefrigerated)
      );
    }
    
    // Type Filter (Generics or Brands)
    if (typeFilter) {
      if (typeFilter === 'generic') {
        result = result.filter(m => m.generic && m.generic.toLowerCase().includes('generic') && m.qoh > 0);
      } else if (typeFilter === 'brand') {
        result = result.filter(m => m.generic && m.generic.toLowerCase().includes('brand') && m.qoh > 0);
      }
    }

    // Classification Filter (Qatari or Restricted)
    if (classificationFilter) {
      result = result.filter(m => {
        const isQatari = !!(m.qatari && (m.qatari.trim().toUpperCase() === 'TRUE' || m.qatari.trim().toUpperCase() === 'QATARI'));
        const isRestricted = !!(m.restriction && m.restriction.trim() !== '');
        
        if (classificationFilter === 'qatari') return isQatari;
        if (classificationFilter === 'restricted') return isRestricted;
        return true;
      });
    }

    // Refrigerated Filter
    if (refFilter) {
      result = result.filter(m => !!m.isRefrigerated);
    }

    // Expiry Date Range Filter
    if (expStart || expEnd) {
      const start = expStart ? new Date(expStart) : null;
      const end = expEnd ? new Date(expEnd) : null;

      result = result.filter(m => {
        const dates = [m.expiration1, m.expiration2, m.expiration3]
          .map(parseExpDate)
          .filter(d => d !== null) as Date[];

        if (dates.length === 0) return !expStart && !expEnd;

        return dates.some(d => {
          let matches = true;
          if (start && d < start) matches = false;
          if (end && d > end) matches = false;
          return matches;
        });
      });
    }

    // Stock Status
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
  }, [medications, searchQuery, stockFilter, classificationFilter, typeFilter, refFilter, expStart, expEnd]);

  const filterCounts = useMemo(() => {
    const all = medications.length;
    const inStock = medications.filter(m => m.qoh > 0 && !(m.maxQty > 0 && m.qoh < m.maxQty * 0.3)).length;
    const lowStock = medications.filter(m => m.qoh > 0 && m.maxQty > 0 && m.qoh < m.maxQty * 0.3).length;
    const outOfStock = medications.filter(m => m.qoh <= 0).length;
    const qatari = medications.filter(m => m.qatari && (m.qatari.trim().toUpperCase() === 'TRUE' || m.qatari.trim().toUpperCase() === 'QATARI') && m.qoh > 0).length;
    const restricted = medications.filter(m => m.restriction && m.restriction.trim() !== '' && m.qoh > 0).length;
    const generics = medications.filter(m => m.generic && m.generic.toLowerCase().includes('generic') && m.qoh > 0).length;
    const brands = medications.filter(m => m.generic && m.generic.toLowerCase().includes('brand') && m.qoh > 0).length;
    const refrigerated = medications.filter(m => m.isRefrigerated && m.qoh > 0).length;

    return { all, inStock, lowStock, outOfStock, qatari, restricted, generics, brands, refrigerated };
  }, [medications]);

  const availableGenericsCount = filterCounts.generics;
  const availableBrandsCount = filterCounts.brands;

  const changeLanguage = (newLang: Language) => {
    setLanguage(newLang);
    setShowLanguageSelector(false);
  };

  return (
    <div className="space-y-6 md:space-y-8" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 md:gap-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{t.title}</h1>
            <div className="flex items-center gap-2 px-3 py-1 bg-[#F27D26]/5 rounded-full text-[10px] font-bold text-[#F27D26] uppercase tracking-widest border border-[#F27D26]/10">
              <UploadCloud className="w-3 h-3" />
              <span className="opacity-60 text-[#141414]">Last Update:</span>
              <span className="text-[#F27D26]">
                {lastUpdate ? format(new Date(lastUpdate), 'EEEE, dd-MM-yyyy hh:mm a').toUpperCase() : 'No Data'}
              </span>
            </div>
            
            {/* Language Selector Dropdown */}
            <div className="relative">
              <button 
                onClick={() => setShowLanguageSelector(!showLanguageSelector)} 
                className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#141414]/5 text-[#141414]/60 text-[10px] font-bold hover:bg-[#141414]/10 transition-all border border-[#141414]/5"
              >
                <Globe size={12} />
                {LANGUAGES.find(l => l.id === language)?.label}
              </button>
              
              <AnimatePresence>
                {showLanguageSelector && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className={`absolute ${isRtl ? 'right-0' : 'left-0'} top-full mt-2 w-48 bg-white border border-[#141414]/10 rounded-2xl shadow-xl z-[150] overflow-hidden p-1 shadow-[#141414]/5`}
                  >
                    {LANGUAGES.map(lang => (
                      <button
                        key={lang.id}
                        onClick={() => changeLanguage(lang.id)}
                        className={`w-full flex items-center justify-between px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                          language === lang.id ? 'bg-[#F27D26] text-white' : 'hover:bg-[#141414]/5 text-[#141414]/60'
                        }`}
                      >
                        <span>{lang.label}</span>
                        {language === lang.id && <Check size={12} />}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
          <p className="text-[#141414]/60 max-w-xl text-sm md:text-base">
            {t.description}
          </p>
        </div>
        
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          {savedReminders.length > 0 && (
            <button 
              onClick={() => setShowSavedReminders(true)}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold transition-all bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 animate-pulse hover:animate-none"
            >
              <Bell className="w-4 h-4" />
              <span>{savedReminders.length} {t.reminders}</span>
            </button>
          )}

          <button 
            onClick={() => refresh(true)}
            disabled={isSyncing}
            className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-3 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all relative ${
              isSyncing ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-emerald-50/30 text-emerald-600/50 border border-emerald-100'
            } disabled:opacity-50 shadow-sm`}
          >
            <div className={`w-1.5 h-1.5 rounded-full ${!isSyncing ? 'bg-emerald-500' : 'bg-emerald-400 animate-ping'}`} />
            {isSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            {isSyncing ? t.syncing : t.lastSynced} {format(lastSynced, 'HH:mm')}
          </button>

          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold transition-all ${
              showFilters || stockFilter !== 'all' || classificationFilter !== null || typeFilter !== null || refFilter || expStart || expEnd
              ? 'bg-[#F27D26] text-white shadow-lg shadow-[#F27D26]/20'
              : 'bg-white border border-[#141414]/10 text-[#141414]/60 hover:bg-[#141414]/5'
            }`}
          >
            <Filter className="w-4 h-4" />
            <span>{t.filters}</span>
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center bg-white p-4 md:p-6 rounded-2xl border border-[#141414]/10 shadow-sm">
          <div className="lg:col-span-1">
            <label className={`block text-[10px] font-bold uppercase tracking-[0.2em] text-[#141414]/40 mb-2 ${isRtl ? 'mr-1' : 'ml-1'}`}>
              {t.selectLocation}
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
                  {loc.id === PharmacyLocation.ADULT ? t.adult : loc.id === PharmacyLocation.PEDIATRIC ? t.pediatric : t.mesaieed}
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2 relative">
            <label className={`block text-[10px] font-bold uppercase tracking-[0.2em] text-[#141414]/40 mb-2 ${isRtl ? 'mr-1' : 'ml-1'}`}>
              {t.searchLabel}
            </label>
            <div className="relative group">
              <Search className={`absolute ${isRtl ? 'right-4' : 'left-4'} top-1/2 -translate-y-1/2 w-4 h-4 text-[#141414]/30 group-focus-within:text-[#F27D26] transition-colors`} />
              <input
                type="text"
                placeholder={t.searchPlaceholder}
                value={searchQuery}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full ${isRtl ? 'pr-11 pl-10' : 'pl-11 pr-10'} py-3 bg-[#141414]/5 border border-transparent rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F27D26]/20 focus:border-[#F27D26] transition-all placeholder:text-[#141414]/30 text-sm font-medium`}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className={`absolute ${isRtl ? 'left-3' : 'right-3'} top-1/2 -translate-y-1/2 p-1.5 hover:bg-[#141414]/5 rounded-lg text-[#141414]/40 transition-colors z-10`}
                >
                  <XIcon size={16} />
                </button>
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
                        className={`w-full px-4 py-3 ${isRtl ? 'text-right' : 'text-left'} hover:bg-[#141414]/5 flex items-center justify-between transition-colors border-b border-[#141414]/5 last:border-0`}
                      >
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-[#141414]">{s.itemName}</span>
                            {s.isRefrigerated && (
                              <ThermometerSnowflake size={10} className="text-blue-500" />
                            )}
                          </div>
                          {s.generic && <span className="text-[10px] text-[#141414]/40">{s.generic}</span>}
                        </div>
                        <div className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.qoh > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                          {s.qoh > 0 ? t.inStock : t.outOfStock}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  
                  {/* Stock Status selector */}
                  <div className="flex flex-col gap-1.5">
                    <span className={`text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 ${isRtl ? 'mr-1' : 'ml-1'}`}>{t.stockStatus}</span>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => setStockFilter('all')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                          stockFilter === 'all'
                            ? 'bg-[#141414] text-white border-[#141414]'
                            : 'bg-white text-[#141414]/65 border-[#141414]/5 hover:bg-[#141414]/5'
                        }`}
                      >
                        {t.all} ({filterCounts.all})
                      </button>
                      {[
                        { id: 'in', label: t.inStock, count: filterCounts.inStock, color: 'bg-emerald-500 text-white border-emerald-500' },
                        { id: 'low', label: t.lowStock, count: filterCounts.lowStock, color: 'bg-amber-500 text-white border-amber-500' },
                        { id: 'out', label: t.outOfStock, count: filterCounts.outOfStock, color: 'bg-red-500 text-white border-red-500' }
                      ].map(f => {
                        const active = stockFilter === f.id;
                        return (
                          <button
                            key={f.id}
                            onClick={() => setStockFilter(f.id as any)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                              active ? f.color : 'bg-white text-[#141414]/65 border-[#141414]/10 hover:bg-[#141414]/5'
                            }`}
                          >
                            {f.label} ({f.count})
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Storage selector */}
                  <div className="flex flex-col gap-1.5">
                    <span className={`text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 ${isRtl ? 'mr-1' : 'ml-1'}`}>Storage</span>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => setRefFilter(prev => !prev)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border flex items-center gap-1.5 ${
                          refFilter
                            ? 'bg-blue-500 text-white border-blue-500'
                            : 'bg-white text-[#141414]/65 border-[#141414]/10 hover:bg-[#141414]/5'
                        }`}
                      >
                        <ThermometerSnowflake className="w-3 h-3" />
                        Ref Storage ({filterCounts.refrigerated})
                      </button>
                    </div>
                  </div>

                </div>

                {/* Expiration and control row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-[#141414]/5">
                  <div className="space-y-1.5">
                    <span className={`block text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 ${isRtl ? 'mr-1' : 'ml-1'}`}>
                      Exp. Range (Start)
                    </span>
                    <input
                      type="date"
                      value={expStart}
                      onChange={(e) => setExpStart(e.target.value)}
                      className="w-full px-4 py-2 bg-white border border-[#141414]/10 rounded-xl text-xs focus:ring-2 focus:ring-[#F27D26]/10 transition-all font-medium"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <span className={`block text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 ${isRtl ? 'mr-1' : 'ml-1'}`}>
                      Exp. Range (End)
                    </span>
                    <input
                      type="date"
                      value={expEnd}
                      onChange={(e) => setExpEnd(e.target.value)}
                      className="w-full px-4 py-2 bg-white border border-[#141414]/10 rounded-xl text-xs focus:ring-2 focus:ring-[#F27D26]/10 transition-all font-medium"
                    />
                  </div>

                  <div className="flex items-end">
                    <button
                      onClick={() => {
                        setStockFilter('all');
                        setClassificationFilter(null);
                        setTypeFilter(null);
                        setRefFilter(false);
                        setExpStart('');
                        setExpEnd('');
                        setSearchQuery('');
                      }}
                      className="w-full h-10 flex items-center justify-center gap-2 bg-red-50 text-red-500 border border-red-100 rounded-xl text-xs font-bold hover:bg-red-100 transition-all cursor-pointer"
                    >
                      <XIcon className="w-4 h-4" />
                      {t.reset}
                    </button>
                  </div>
                </div>

              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Active Filters Display inside GeneralView */}
        {(stockFilter !== 'all' || refFilter || expStart || expEnd) && (
          <div className="flex flex-wrap items-center gap-2 p-3 bg-white rounded-2xl border border-[#141414]/10 shadow-sm animate-in slide-in-from-top-2">
            <span className={`text-[9px] font-bold uppercase tracking-widest text-[#141414]/40 flex items-center gap-1 ${isRtl ? 'ml-1' : 'mr-1'}`}>
              Active:
            </span>
            {stockFilter !== 'all' && (
              <span className="px-2 py-0.5 bg-[#141414]/5 text-[#141414] rounded-md text-[9px] font-bold border border-[#141414]/5">
                Stock: {stockFilter === 'in' ? t.inStock : stockFilter === 'low' ? t.lowStock : t.outOfStock}
              </span>
            )}
            {refFilter && (
              <span className="px-2 py-0.5 bg-[#141414]/5 text-[#141414] rounded-md text-[9px] font-bold border border-[#141414]/5 flex items-center gap-1">
                <ThermometerSnowflake className="w-2.5 h-2.5 text-[#141414]/60" />
                Storage: Refrigerated
              </span>
            )}
            {(expStart || expEnd) && (
              <span className="px-2 py-0.5 bg-[#141414]/5 text-[#141414] rounded-md text-[9px] font-bold border border-[#141414]/5">
                Exp Range: {expStart || '*'} to {expEnd || '*'}
              </span>
            )}
            <button 
              onClick={() => { setStockFilter('all'); setClassificationFilter(null); setTypeFilter(null); setRefFilter(false); setExpStart(''); setExpEnd(''); }}
              className={`${isRtl ? 'mr-auto' : 'ml-auto'} text-[10px] font-black text-red-500 hover:underline`}
            >
              Clear All
            </button>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="bg-white rounded-2xl border border-[#141414]/10 shadow-sm overflow-hidden min-h-[400px]">
        {fetchError && (
          <div className="p-6 m-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-4 animate-in fade-in zoom-in-95 duration-500">
            <AlertCircle className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-red-800 uppercase tracking-tight">Database Connection Error</h3>
              
              <div className="text-xs text-red-700 leading-relaxed font-medium bg-white/50 p-4 rounded-xl border border-red-200/50">
                {fetchError.includes('permission') ? (
                  <p>Access denied. please ensure you have 'Accepted' the database terms in the AI Studio Firebase setup panel.</p>
                ) : fetchError.toLowerCase().includes('quota') || fetchError.toLowerCase().includes('limit') ? (
                  <div className="space-y-2">
                    <p className="font-black text-red-800">DAILY LIMIT REACHED (QUOTA EXCEEDED)</p>
                    <p>The free version of this database allows 50,000 reads per day. This limit has been reached due to high activity (e.g. large data uploads or many users). </p>
                    <p className="bg-amber-100 text-amber-800 p-2 rounded border border-amber-200">
                      <strong>Solution:</strong> The limit will reset automatically <strong>tomorrow</strong> (at midnight US Pacific Time). 
                    </p>
                    <p className="opacity-60 italic text-[10px]">Note: Offline mode is now enabled, so future visits will use cached data to save on reads.</p>
                  </div>
                ) : (
                  <p>{fetchError}</p>
                )}
              </div>
              
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => refresh(true)}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg shadow-red-200"
                >
                  Retry Connection
                </button>
                <button 
                  onClick={() => window.location.reload()}
                  className="text-[10px] font-bold text-red-700 underline uppercase tracking-widest opacity-60 hover:opacity-100"
                >
                  Refresh Page
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Desktop View */}
        <div className="hidden md:block overflow-x-auto">
          <table className={`w-full ${isRtl ? 'text-right' : 'text-left'} border-collapse`}>
            <thead className="bg-[#141414]/5 border-b border-[#141414]/10">
              <tr>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">{t.medicationName}</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">{t.status}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#141414]/5">
              {loading ? (
                <tr>
                  <td colSpan={2} className="px-6 py-20 text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-[#F27D26] mx-auto mb-2" />
                    <p className="font-bold text-xs uppercase tracking-widest text-[#141414]/40">{t.loading}</p>
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
                      <div className="flex items-center gap-2">
                        <div 
                          className={`flex flex-col cursor-pointer hover:opacity-70 transition-all ${isRtl ? 'group-hover:-translate-x-1' : 'group-hover:translate-x-1'}`}
                          onClick={() => setSelectedMedicationForReminder(med)}
                        >
                          <span className="text-sm font-bold text-[#141414] group-hover:text-[#F27D26] transition-colors">{med.itemName}</span>
                          {med.isRefrigerated && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedMedForRefrigeration(med);
                              }}
                              className="flex items-center gap-1.5 px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-[10px] font-black uppercase tracking-tight w-fit border border-blue-200 shadow-sm mt-1 transition-all hover:bg-blue-200 hover:border-blue-300 hover:scale-[1.02] active:scale-95 cursor-pointer"
                            >
                              <ThermometerSnowflake size={12} className="text-blue-600 animate-pulse" />
                              {t.refrigerated}
                            </button>
                          )}
                          {med.generic && <span className="text-[10px] italic text-[#141414]/40 leading-tight">{med.generic}</span>}
                        </div>
                        <div className="flex items-center gap-1">
                          {(med.enIndications || med.arIndications) && (
                            <button 
                              onClick={() => setSelectedMedForIndications(med)}
                              className="p-1 px-2 bg-[#F27D26]/5 text-[#F27D26] rounded-md hover:bg-[#F27D26] hover:text-white transition-all flex items-center gap-1 group/info shadow-sm"
                              title={t.indicationsTitle}
                            >
                              <Info size={12} className="group-hover/info:scale-110 transition-transform" />
                              <span className="text-[8px] font-black uppercase tracking-tighter">{t.indicationsInfo}</span>
                            </button>
                          )}
                          {med.to && (
                            <button 
                              onClick={() => setSelectedMedForLinks(med)}
                              className="p-1 px-2 bg-[#F27D26]/10 text-[#F27D26] rounded-md hover:bg-[#F27D26] hover:text-white transition-all flex items-center gap-1 group/btn shadow-sm"
                              title="View Linked Brand/Generic Items"
                            >
                              <ArrowRightLeft size={10} className="group-hover/btn:rotate-180 transition-transform duration-500" />
                              <span className="text-[8px] font-black uppercase tracking-tighter">Linked Info</span>
                            </button>
                          )}
                        </div>
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
                        ? t.outOfStock 
                        : (med.maxQty && med.qoh < med.maxQty * 0.3)
                        ? t.lowStock 
                        : t.inStock}
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
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 
                    className="font-bold text-[#141414] text-sm group-active:text-[#F27D26] cursor-pointer hover:underline"
                    onClick={() => setSelectedMedicationForReminder(med)}
                  >
                    {med.itemName}
                  </h3>
                  {med.isRefrigerated && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedMedForRefrigeration(med);
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-600 active:scale-95 text-white rounded-full text-[9px] font-black uppercase tracking-tight shadow-md border border-white/20 cursor-pointer hover:bg-blue-700 transition-all"
                    >
                      <ThermometerSnowflake size={10} />
                      REF
                    </button>
                  )}
                  {(med.enIndications || med.arIndications) && (
                    <button 
                      onClick={() => setSelectedMedForIndications(med)}
                      className="p-1 px-2 bg-[#F27D26]/5 text-[#F27D26] rounded-md hover:bg-[#F27D26] hover:text-white transition-all flex items-center gap-1 group/info shadow-sm"
                      title={t.indicationsTitle}
                    >
                      <Info size={12} className="group-hover/info:scale-110 transition-transform" />
                      <span className="text-[8px] font-black uppercase tracking-tighter">{t.indicationsInfo}</span>
                    </button>
                  )}
                  {med.to && (
                    <button 
                      onClick={() => setSelectedMedForLinks(med)}
                      className="p-1 px-2 bg-[#F27D26]/10 text-[#F27D26] rounded-md hover:bg-[#F27D26] hover:text-white transition-all flex items-center gap-1 group/btn"
                      title="View Linked Brand/Generic Items"
                    >
                      <ArrowRightLeft size={10} className="group-hover/btn:rotate-180 transition-transform duration-500" />
                      <span className="text-[8px] font-black uppercase tracking-tighter">Linked Info</span>
                    </button>
                  )}
                </div>
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
                  ? t.outOfStock 
                  : (med.maxQty && med.qoh < med.maxQty * 0.3)
                  ? t.lowStock 
                  : t.inStock}
              </span>
            </div>
          ))}
        </div>
        
        {filteredMeds.length === 0 && !loading && (
          <div className="p-20 text-center flex flex-col items-center gap-4">
            <Search className="w-8 h-8 text-[#141414]/10" />
            <p className="font-bold text-[#141414]/40 uppercase tracking-widest text-sm">{t.noResults}</p>
          </div>
        )}
      </div>

      {/* Reminder Modal */}
      <AnimatePresence>
        {selectedMedicationForReminder && (
          <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-0 md:p-4 bg-black/60 backdrop-blur-md" dir={isRtl ? 'rtl' : 'ltr'}>
            <motion.div 
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative max-w-lg w-full bg-white rounded-t-[2.5rem] md:rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh] md:max-h-[85vh]"
            >
              {/* Modal Header */}
              <div className="p-5 md:p-6 border-b border-[#141414]/5 bg-white flex items-center justify-between sticky top-0 z-10 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#F27D26]/10 rounded-xl text-[#F27D26]">
                    <Bell size={20} />
                  </div>
                  <div>
                    <h2 className="text-base md:text-lg font-bold text-[#141414] leading-tight">
                      {selectedMedicationForReminder.itemName}
                    </h2>
                    <p className="text-[9px] md:text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest mt-0.5">
                      {t.setReminder}
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
              <div className="p-5 md:p-6 space-y-6 overflow-y-auto flex-1">
                {/* Refrigerated Warning */}
                {selectedMedicationForReminder.isRefrigerated && (
                  <section className="p-4 bg-blue-50 border border-blue-100 rounded-2xl flex items-start gap-3">
                    <div className="mt-0.5 p-1.5 bg-blue-500 rounded-lg text-white">
                      <ThermometerSnowflake size={16} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-black uppercase tracking-widest text-blue-600">Refrigeration Required</span>
                      <p className="text-xs font-bold text-blue-800 leading-normal">
                        {t.storageInstructions.replace(/\*\*/g, '')}
                      </p>
                    </div>
                  </section>
                )}

                {/* 1. Frequency Selection */}
                <section className="space-y-3">
                  <div className="flex items-center gap-2 text-[#141414]/40">
                    <Clock size={16} />
                    <span className="text-[10px] font-bold uppercase tracking-widest">{t.frequency}</span>
                  </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[
                      { id: 'daily', label: t.daily },
                      { id: 'weekly', label: t.weekly },
                      { id: 'monthly', label: t.monthly },
                      { id: 'twice_weekly', label: t.twiceWeekly },
                      { id: 'twice_monthly', label: t.twiceMonthly },
                      { id: 'other_day', label: t.otherDay },
                      { id: 'other_week', label: t.otherWeek },
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

                  <div className={`mt-4 p-4 rounded-2xl flex flex-col gap-4 transition-all border-2 ${
                    reminderFrequency === 'hours' 
                      ? 'bg-[#F27D26]/5 border-[#F27D26]/20' 
                      : 'bg-[#141414]/5 border-transparent'
                  }`}>
                    <button
                      onClick={() => setReminderFrequency('hours')}
                      className={`w-full py-3 rounded-xl border text-xs font-bold transition-all ${
                        reminderFrequency === 'hours'
                          ? 'bg-[#F27D26] border-[#F27D26] text-white shadow-md shadow-[#F27D26]/10'
                          : 'bg-white border-[#141414]/5 text-[#141414]/60 hover:bg-black/5'
                      }`}
                    >
                      {t.everyXHours}
                    </button>
 
                    <div className="space-y-3">
                      <span className={`text-[10px] font-bold text-[#141414]/40 uppercase tracking-wider ${isRtl ? 'pr-1' : 'pl-1'}`}>{t.selectInterval}</span>
                      <div className="grid grid-cols-5 gap-2">
                        {[4, 6, 8, 12, 24].map((h) => (
                          <button
                            key={h}
                            onClick={() => {
                              setReminderIntervalHours(h);
                              setReminderFrequency('hours');
                            }}
                            className={`py-2.5 rounded-xl text-[11px] font-black transition-all border-2 ${
                              reminderIntervalHours === h && reminderFrequency === 'hours'
                                ? 'bg-[#141414] border-[#141414] text-white'
                                : 'bg-white border-transparent text-[#141414]/60 hover:border-black/10'
                            }`}
                          >
                            {h}{language === 'ar' || language === 'ur' ? 'س' : 'h'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>

                {/* 2. Duration Setup */}
                <section className="space-y-3 pt-6 border-t border-[#141414]/5">
                  <div className="flex items-center gap-2 text-[#141414]/40">
                    <Calendar size={16} />
                    <span className="text-[10px] font-bold uppercase tracking-widest">{t.duration}</span>
                  </div>
                  
                  <div className="flex flex-col gap-4">
                    <div className="flex gap-2 p-1 bg-[#141414]/5 rounded-xl">
                      {(['days', 'weeks', 'months'] as const).map((tType) => (
                        <button
                          key={tType}
                          onClick={() => setReminderDurationType(tType)}
                          className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
                            reminderDurationType === tType
                              ? 'bg-white text-[#F27D26] shadow-sm'
                              : 'text-[#141414]/40 hover:text-[#141414]'
                          }`}
                        >
                          {tType === 'days' ? t.days : tType === 'weeks' ? t.weeks : t.months}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-6 p-4 bg-[#141414]/5 rounded-2xl">
                      <div className="flex-1">
                        <span className={`text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest block mb-2`}>{t.howMany} {reminderDurationType === 'days' ? t.days : reminderDurationType === 'weeks' ? t.weeks : t.months}?</span>
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
                      <span className={`text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest block mb-2 ${isRtl ? 'mr-1' : 'ml-1'}`}>{t.firstReminder}</span>
                      <input 
                        type="datetime-local" 
                        value={reminderStartTime}
                        onChange={(e) => setReminderStartTime(e.target.value)}
                        className="w-full p-3 bg-[#141414]/5 border border-transparent rounded-xl focus:ring-2 focus:ring-[#F27D26]/20 focus:border-[#F27D26] focus:bg-white transition-all text-xs font-bold"
                      />
                    </div>
                  </div>
                </section>
              </div>

              {/* Modal Footer */}
              <div className="p-6 bg-[#141414]/[0.02] border-t border-[#141414]/5 flex gap-3">
                <button 
                  onClick={() => setSelectedMedicationForReminder(null)}
                  className="flex-1 px-4 py-3 bg-white border border-[#141414]/10 rounded-2xl text-xs font-bold text-[#141414]/60 hover:bg-[#141414]/5 transition-all"
                >
                  {t.cancel}
                </button>
                <button 
                  onClick={handleSaveSchedule}
                  className="flex-[2] flex items-center justify-center gap-2 px-4 py-3 bg-emerald-500 text-white rounded-2xl text-xs font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20"
                >
                  <Save size={16} />
                  {t.saveReminder}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Saved Reminders Modal */}
      <AnimatePresence>
        {showSavedReminders && (
          <div className="fixed inset-0 z-[110] flex items-end md:items-center justify-center p-0 md:p-4 bg-black/60 backdrop-blur-md" dir={isRtl ? 'rtl' : 'ltr'}>
            <motion.div 
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative max-w-lg w-full bg-white rounded-t-[2.5rem] md:rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh] md:max-h-[85vh]"
            >
              <div className="p-5 md:p-6 border-b border-[#141414]/5 bg-white flex items-center justify-between sticky top-0 z-10">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-500">
                    <Bell size={20} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-[#141414] leading-tight">{t.myReminders}</h2>
                    <p className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest mt-0.5">{t.storedSchedules}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {savedReminders.length > 0 && (
                    <button 
                      onClick={handleClearAllReminders}
                      className="px-3 py-1.5 hover:bg-red-50 text-red-500 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors"
                    >
                      {t.clearAll}
                    </button>
                  )}
                  <button 
                    onClick={() => setShowSavedReminders(false)}
                    className="p-2 hover:bg-[#141414]/5 rounded-full text-[#141414]/40 transition-colors"
                  >
                    <XIcon size={20} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {savedReminders.length === 0 ? (
                  <div className="py-20 text-center flex flex-col items-center gap-3">
                    <AlertCircle className="text-[#141414]/10 w-10 h-10" />
                    <p className="text-xs font-bold text-[#141414]/30 uppercase tracking-widest">{t.noResults}</p>
                  </div>
                ) : (
                  savedReminders.map((r) => (
                    <div key={r.id} className="p-4 bg-[#141414]/[0.02] border border-[#141414]/5 rounded-2xl space-y-4">
                      <div className="flex flex-col gap-2">
                        <div className="flex justify-between items-start">
                          <div className="flex flex-col gap-0.5">
                            <h4 className="font-bold text-sm text-[#141414]">{r.itemName}</h4>
                            {r.generic && <p className="text-[10px] text-[#141414]/40 italic">{r.generic}</p>}
                            {r.isRefrigerated && (
                              <div className="flex items-center gap-1 mt-1 px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[8px] font-black uppercase tracking-tighter w-fit">
                                <ThermometerSnowflake size={8} />
                                Refrigerated (2-8°C)
                              </div>
                            )}
                          </div>
                          <button 
                            onClick={() => handleDeleteReminder(r.id)}
                            className="p-2 hover:bg-red-50 text-red-400 rounded-lg transition-colors"
                          >
                            <XIcon size={16} />
                          </button>
                        </div>

                        {r.isRefrigerated && (
                          <div className="p-3 bg-blue-50/50 border border-blue-100/50 rounded-xl text-[9px] font-bold text-blue-700 leading-tight">
                            {t.storageInstructions}
                          </div>
                        )}
                      </div>
                      
                      <div className="flex flex-wrap gap-2">
                        <div className="px-2 py-1 bg-white rounded-lg border border-[#141414]/5 text-[9px] font-bold text-[#141414]/40 flex items-center gap-1.5">
                          <Clock size={10} />
                          {r.frequency === 'hours' ? `${t.everyXHours} (${r.intervalHours}h)` : t[r.frequency as keyof TranslationStrings] || r.frequency}
                        </div>
                        <div className="px-2 py-1 bg-white rounded-lg border border-[#141414]/5 text-[9px] font-bold text-[#141414]/40 flex items-center gap-1.5">
                          <Calendar size={10} />
                          {r.durationValue} {r.durationType === 'days' ? t.days : r.durationType === 'weeks' ? t.weeks : t.months}
                        </div>
                      </div>

                      <button 
                        onClick={() => handleExportSingleReminder(r)}
                        className="w-full py-2.5 bg-white border border-[#141414]/10 rounded-xl text-[10px] font-bold text-[#141414] flex items-center justify-center gap-2 hover:bg-[#141414]/5 transition-all shadow-sm"
                      >
                        <Calendar size={14} className="text-[#F27D26]" />
                        {t.exportCalendar}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Indications Modal */}
      <AnimatePresence>
        {selectedMedForIndications && (
          <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center p-0 md:p-4 bg-black/60 backdrop-blur-md" dir={isRtl ? 'rtl' : 'ltr'}>
            <motion.div 
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative max-w-lg w-full bg-white rounded-t-[2.5rem] md:rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh] md:max-h-[85vh]"
            >
              <div className="p-5 md:p-6 border-b border-[#141414]/5 bg-white flex items-center justify-between sticky top-0 z-10">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#F27D26]/10 rounded-xl text-[#F27D26]">
                    <Info size={20} />
                  </div>
                  <div>
                    <h2 className="text-base md:text-lg font-bold text-[#141414] leading-tight">
                      {selectedMedForIndications.itemName}
                    </h2>
                    <p className="text-[9px] md:text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest mt-0.5">
                      {t.indicationsTitle}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedMedForIndications(null)}
                  className="p-2 hover:bg-[#141414]/5 rounded-full text-[#141414]/40 transition-colors"
                >
                  <XIcon size={20} />
                </button>
              </div>

              <div className="p-5 md:p-6 space-y-6 flex-1 overflow-y-auto">
                <div className="p-5 bg-[#F27D26]/5 rounded-2xl border border-[#F27D26]/10 min-h-[150px] md:min-h-[200px] flex flex-col">
                  <span className={`text-[9px] md:text-[10px] font-bold text-[#F27D26] uppercase tracking-widest mb-3 ${isRtl ? 'text-right' : 'text-left'}`}>
                    {t.indicationsInfo}
                  </span>
                  <div className={`text-xs md:text-sm font-medium text-[#141414] leading-relaxed whitespace-pre-wrap ${isRtl ? 'text-right' : 'text-left'}`}>
                    {(() => {
                      const med = selectedMedForIndications;
                      if (language === 'ar' && med.arIndications) return med.arIndications;
                      if (language === 'hi' && med.hiIndications) return med.hiIndications;
                      if (language === 'ur' && med.urIndications) return med.urIndications;
                      if (language === 'ml' && med.mlIndications) return med.mlIndications;
                      if (language === 'bn' && med.bnIndications) return med.bnIndications;
                      if (language === 'tl' && med.tlIndications) return med.tlIndications;
                      
                      // Fallback to EN if specific translation missing
                      if (med.enIndications) return med.enIndications;
                      
                      // Final fallback if even EN is missing but AR exists
                      if (med.arIndications) return med.arIndications;
                      
                      return t.noIndications;
                    })()}
                  </div>
                </div>
              </div>

              <div className="p-5 md:p-6 bg-[#141414]/[0.02] border-t border-[#141414]/5 sticky bottom-0 z-10">
                <button 
                  onClick={() => setSelectedMedForIndications(null)}
                  className="w-full py-4 bg-[#141414] text-white rounded-2xl text-xs font-bold hover:opacity-90 transition-all shadow-lg shadow-black/10 active:scale-[0.98]"
                >
                  {t.cancel}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Refrigeration Modal */}
      <AnimatePresence>
        {selectedMedForRefrigeration && (
          <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center p-0 md:p-4 bg-black/60 backdrop-blur-md" dir={isRtl ? 'rtl' : 'ltr'}>
            <motion.div 
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative max-w-lg w-full bg-white rounded-t-[2.5rem] md:rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh] md:max-h-[85vh]"
            >
              <div className="p-5 md:p-6 border-b border-[#141414]/5 bg-white flex items-center justify-between sticky top-0 z-10">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/10 rounded-xl text-blue-500 animate-pulse">
                    <ThermometerSnowflake size={20} />
                  </div>
                  <div>
                    <h2 className="text-base md:text-lg font-bold text-[#141414] leading-tight">
                      {selectedMedForRefrigeration.itemName}
                    </h2>
                    <p className="text-[9px] md:text-[10px] font-bold text-blue-600 uppercase tracking-widest mt-0.5 animate-pulse">
                      {t.refrigerationRequiredTitle}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedMedForRefrigeration(null)}
                  className="p-2 hover:bg-[#141414]/5 rounded-full text-[#141414]/40 transition-colors"
                >
                  <XIcon size={20} />
                </button>
              </div>

              <div className="p-5 md:p-6 space-y-6 flex-1 overflow-y-auto">
                <div className="p-5 bg-blue-50/70 rounded-2xl border border-blue-100/60 min-h-[150px] md:min-h-[200px] flex flex-col justify-center">
                  <span className={`text-[10px] md:text-xs font-black text-blue-600 uppercase tracking-widest mb-3 ${isRtl ? 'text-right' : 'text-left'}`}>
                    {t.refrigerationRequiredTitle}
                  </span>
                  <div className={`text-sm md:text-base font-bold text-blue-900 leading-relaxed whitespace-pre-wrap ${isRtl ? 'text-right' : 'text-left'}`}>
                    {t.refrigerationRequiredBody}
                  </div>
                </div>
              </div>

              <div className="p-5 md:p-6 bg-[#141414]/[0.02] border-t border-[#141414]/5 sticky bottom-0 z-10">
                <button 
                  onClick={() => setSelectedMedForRefrigeration(null)}
                  className="w-full py-4 bg-blue-600 text-white rounded-2xl text-xs font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/10 active:scale-[0.98]"
                >
                  {t.cancel}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Image Modal */}
      <AnimatePresence>
        {selectedImage && (
          <div 
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-12 bg-black/90 backdrop-blur-xl"
            onClick={() => setSelectedImage(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-5xl w-full h-full flex items-center justify-center"
              onClick={e => e.stopPropagation()}
            >
              <img src={selectedImage} alt="Medication" className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl" />
              <button 
                onClick={() => setSelectedImage(null)}
                className="absolute top-4 right-4 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all backdrop-blur-md"
              >
                <XIcon size={24} />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {selectedMedForLinks && (
          <LinkedItemsModal 
            medication={selectedMedForLinks}
            allMedications={medications}
            onClose={() => setSelectedMedForLinks(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
