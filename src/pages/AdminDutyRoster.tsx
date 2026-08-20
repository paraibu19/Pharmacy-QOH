import { useState, useEffect, useMemo } from 'react';
import { 
  CalendarDays, 
  Upload, 
  Sparkles, 
  Download, 
  Trash2, 
  Plus, 
  FileSpreadsheet, 
  FileText, 
  Grid, 
  Search, 
  Filter, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Save,
  Clock,
  User,
  MapPin,
  FileCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

interface RosterEntry {
  date: string;
  day: string;
  pharmacistName: string;
  shift: string;
  location: string;
  notes?: string;
}

interface SuggestedFilters {
  pharmacists: string[];
  shifts: string[];
  locations: string[];
}

interface SavedRoster {
  id: string;
  month: string;
  filename: string;
  uploadedAt: string;
  entries: RosterEntry[];
  suggestedFilters: SuggestedFilters;
}

export interface PharmacistRowStats {
  name: string;
  emergencyTotal: number;
  emergencyMorning: number;
  emergencyEvening: number;
  emergencyNight: number;
  locationAdult: number;
  locationPediatric: number;
  locationOPD: number;
  locationInpatient: number;
  timeMorning: number;
  timeEvening: number;
  timeNight: number;
  leaveAnnual: number;
  leaveCasual: number;
  leaveSick: number;
  offDays: number;
}

export function getShiftCode(shift: string): string {
  if (!shift) return '';
  const s = shift.trim().toLowerCase();
  
  // Direct code match
  if (s === 'aa' || s.startsWith('aa ') || s.includes(' morning shift adult') || s.includes('morning shift adult pharmacy')) return 'Aa';
  if (s === 'ap' || s.startsWith('ap ') || s.includes(' morning shift pediatric') || s.includes('morning shift pediatric pharmacy')) return 'Ap';
  if (s === 'ba' || s.startsWith('ba ') || s.includes(' evening shift adult') || s.includes('evening shift adult pharmacy')) return 'Ba';
  if (s === 'bp' || s.startsWith('bp ') || s.includes(' evening shift pediatric') || s.includes('evening shift pediatric pharmacy')) return 'Bp';
  if (s === 'ca' || s.startsWith('ca ') || s.includes(' night shift adult') || s.includes('night shift adult pharmacy')) return 'Ca';
  if (s === 'cp' || s.startsWith('cp ') || s.includes(' night shift pediatric') || s.includes('night shift pediatric pharmacy')) return 'Cp';
  
  if (s === 'ao' || s.startsWith('ao ') || s.includes(' awh opd') || s.includes('morning shift awh opd')) return 'Ao';
  if (s === 'amo' || s.startsWith('amo ') || s.includes(' mesaieed opd') || s.includes('morning shift mesaieed opd')) return 'Amo';
  
  if (s === 'ai' || s.startsWith('ai ') || s.includes(' morning shift inpatient') || s.includes('morning shift inpatient pharmacy')) return 'Ai';
  if (s === 'av' || s.startsWith('av ') || s.includes(' morning shift iv') || s.includes('morning shift iv pharmacy')) return 'Av';
  if (s === 'ar' || s.startsWith('ar ') || s.includes(' extemporaneous') || s.includes('morning extemporaneous preparations')) return 'Ar';
  if (s === 'an' || s.startsWith('an ') || s.includes(' morning narcotic') || s.includes('narcotic pharmacy') || s.includes('morning narcotic pharmacy')) return 'An';
  if (s === 'bi' || s.startsWith('bi ') || s.includes(' evening shift inpatient') || s.includes('evening shift inpatient pharmacy')) return 'Bi';
  if (s === 'ci' || s.startsWith('ci ') || s.includes(' night shift inpatient') || s.includes('night shift inpatient pharmacy')) return 'Ci';
  
  if (s === 'l' || s === 'annual leave' || s.includes('annual leave')) return 'L';
  if (s === 'a*' || s === 'casual leave' || s.includes('casual leave') || s.includes('a*')) return 'A*';
  if (s === 'sl' || s === 'sick leave' || s.includes('sick leave')) return 'SL';
  if (s === 'o' || s === 'off' || s === 'off day' || s.includes('off day')) return 'O';
  
  // Fallbacks if we can find the substring
  if (s.includes('adult') && s.includes('morning')) return 'Aa';
  if (s.includes('pediatric') && s.includes('morning')) return 'Ap';
  if (s.includes('adult') && s.includes('evening')) return 'Ba';
  if (s.includes('pediatric') && s.includes('evening')) return 'Bp';
  if (s.includes('adult') && s.includes('night')) return 'Ca';
  if (s.includes('pediatric') && s.includes('night')) return 'Cp';
  
  if (s.includes('mesaieed')) return 'Amo';
  if (s.includes('opd') && s.includes('morning')) return 'Ao';
  
  if (s.includes('inpatient') && s.includes('morning')) return 'Ai';
  if (s.includes('iv') && s.includes('morning')) return 'Av';
  if (s.includes('extemporaneous')) return 'Ar';
  if (s.includes('narcotic')) return 'An';
  if (s.includes('inpatient') && s.includes('evening')) return 'Bi';
  if (s.includes('inpatient') && s.includes('night')) return 'Ci';
  
  // Let's also support uppercase codes
  const upper = shift.trim();
  if (['Aa', 'Ap', 'Ba', 'Bp', 'Ca', 'Cp', 'Ao', 'Amo', 'Ai', 'Av', 'Ar', 'An', 'Bi', 'Ci', 'L', 'A*', 'SL', 'O'].includes(upper)) {
    return upper;
  }
  
  return shift;
}

export function formatEntryDate(dateStr: string, dayStr?: string): string {
  if (!dateStr) return '';
  if (dateStr.includes(',')) return dateStr;

  let formattedDate = dateStr;
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    formattedDate = `${match[3]}-${match[2]}-${match[1]}`;
  }

  if (dayStr) {
    return `${dayStr}, ${formattedDate}`;
  }
  return formattedDate;
}

export function computeStats(entries: RosterEntry[]): PharmacistRowStats[] {
  const pharmacistMap: { [name: string]: PharmacistRowStats } = {};
  
  const names = Array.from(new Set(entries.map(e => e.pharmacistName).filter(Boolean))).sort();
  names.forEach(name => {
    pharmacistMap[name] = {
      name,
      emergencyTotal: 0,
      emergencyMorning: 0,
      emergencyEvening: 0,
      emergencyNight: 0,
      locationAdult: 0,
      locationPediatric: 0,
      locationOPD: 0,
      locationInpatient: 0,
      timeMorning: 0,
      timeEvening: 0,
      timeNight: 0,
      leaveAnnual: 0,
      leaveCasual: 0,
      leaveSick: 0,
      offDays: 0,
    };
  });
  
  entries.forEach(entry => {
    const name = entry.pharmacistName;
    if (!name || !pharmacistMap[name]) return;
    
    const code = getShiftCode(entry.shift);
    
    // 1. Emergency Total (Aa, Ap, Ba, Bp, Ca, Cp)
    if (['Aa', 'Ap', 'Ba', 'Bp', 'Ca', 'Cp'].includes(code)) {
      pharmacistMap[name].emergencyTotal++;
    }
    
    // 2. Emergency by Shift Time
    if (['Aa', 'Ap'].includes(code)) {
      pharmacistMap[name].emergencyMorning++;
    } else if (['Ba', 'Bp'].includes(code)) {
      pharmacistMap[name].emergencyEvening++;
    } else if (['Ca', 'Cp'].includes(code)) {
      pharmacistMap[name].emergencyNight++;
    }
    
    // 3. Location (Adult, Pediatric, OPD, Inpatient)
    if (['Aa', 'Ba', 'Ca'].includes(code)) {
      pharmacistMap[name].locationAdult++;
    } else if (['Ap', 'Bp', 'Cp'].includes(code)) {
      pharmacistMap[name].locationPediatric++;
    } else if (['Ao', 'Amo'].includes(code)) {
      pharmacistMap[name].locationOPD++;
    } else if (['Ai', 'Bi', 'Ci', 'Av', 'Ar', 'An'].includes(code)) {
      pharmacistMap[name].locationInpatient++;
    }
    
    // 4. Time (Morning, Evening, Night)
    if (['Aa', 'Ap', 'Ao', 'Amo', 'Ai', 'Av', 'Ar', 'An'].includes(code)) {
      pharmacistMap[name].timeMorning++;
    } else if (['Ba', 'Bp', 'Bi'].includes(code)) {
      pharmacistMap[name].timeEvening++;
    } else if (['Ca', 'Cp', 'Ci'].includes(code)) {
      pharmacistMap[name].timeNight++;
    }
    
    // 5. Leave & Off Days
    if (code === 'L') {
      pharmacistMap[name].leaveAnnual++;
    } else if (code === 'A*') {
      pharmacistMap[name].leaveCasual++;
    } else if (code === 'SL') {
      pharmacistMap[name].leaveSick++;
    } else if (code === 'O') {
      pharmacistMap[name].offDays++;
    }
  });
  
  return Object.values(pharmacistMap);
}

export default function AdminDutyRoster() {
  // Global States
  const [savedRosters, setSavedRosters] = useState<SavedRoster[]>([]);
  const [selectedRosterId, setSelectedRosterId] = useState<string>('');
  const [currentRoster, setCurrentRoster] = useState<SavedRoster | null>(null);

  // Safe derived filter fallback arrays to prevent crashes on older rosters or undefined properties
  const rosterPharmacists = currentRoster?.suggestedFilters?.pharmacists || 
    (currentRoster?.entries ? Array.from(new Set(currentRoster.entries.map(e => e.pharmacistName).filter(Boolean))) : []);
  
  const rawRosterShifts = useMemo(() => {
    const list = currentRoster?.suggestedFilters?.shifts || 
      (currentRoster?.entries ? Array.from(new Set(currentRoster.entries.map(e => e.shift).filter(Boolean))) : []);
    
    const hasSpecialBp = list.some(s => s.toLowerCase() === 'evening shift pediatric pharmacy (1-9 pm)');
    const hasBpCode = list.some(s => s.toLowerCase() === 'bp');
    
    const newList = [...list];
    if (!hasSpecialBp) {
      newList.push('Evening Shift Pediatric Pharmacy (1-9 PM)');
    }
    if (!hasBpCode) {
      newList.push('BP');
    }
    return newList;
  }, [currentRoster]);

  const SHIFT_LEGEND_ORDER = useMemo(() => [
    'Aa', 'Ap', 'Ba', 'Bp', 'Ca', 'Cp', 
    'Ao', 'Amo', 'Ai', 'Av', 'Ar', 'An', 
    'Bi', 'Ci', 
    'L', 'A*', 'SL', 'O'
  ], []);

  const rosterShifts = useMemo(() => {
    const getShiftCode = (shift: string): string => {
      const s = shift.toLowerCase().trim();
      if (s === 'aa' || s.includes('morning shift adult')) return 'Aa';
      if (s === 'ap' || s.includes('morning shift pediatric')) return 'Ap';
      if (s === 'ba' || s.includes('evening shift adult')) return 'Ba';
      if (s === 'bp' || s.includes('evening shift pediatric')) return 'Bp';
      if (s === 'ca' || s.includes('night shift adult')) return 'Ca';
      if (s === 'cp' || s.includes('night shift pediatric')) return 'Cp';
      if (s === 'ao' || s.includes('morning shift awh opd') || s.includes('awh opd')) return 'Ao';
      if (s === 'amo' || s.includes('morning shift mesaieed') || s.includes('mesaieed opd')) return 'Amo';
      if (s === 'ai' || s.includes('morning shift inpatient')) return 'Ai';
      if (s === 'av' || s.includes('morning shift iv') || s.includes('iv pharmacy')) return 'Av';
      if (s === 'ar' || s.includes('extemporaneous') || s.includes('morning extemporaneous')) return 'Ar';
      if (s === 'an' || s.includes('narcotic') || s.includes('morning narcotic')) return 'An';
      if (s === 'bi' || s.includes('evening shift inpatient')) return 'Bi';
      if (s === 'ci' || s.includes('night shift inpatient')) return 'Ci';
      if (s === 'l' || s.includes('annual leave')) return 'L';
      if (s === 'a*' || s.includes('casual leave')) return 'A*';
      if (s === 'sl' || s.includes('sick leave')) return 'SL';
      if (s === 'o' || s.includes('off day') || s === 'off') return 'O';
      return s;
    };

    return [...rawRosterShifts].sort((a, b) => {
      const codeA = getShiftCode(a);
      const codeB = getShiftCode(b);
      const idxA = SHIFT_LEGEND_ORDER.findIndex(code => code.toLowerCase() === codeA.toLowerCase());
      const idxB = SHIFT_LEGEND_ORDER.findIndex(code => code.toLowerCase() === codeB.toLowerCase());
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [rawRosterShifts, SHIFT_LEGEND_ORDER]);

  const rosterLocations = currentRoster?.suggestedFilters?.locations || 
    (currentRoster?.entries ? Array.from(new Set(currentRoster.entries.map(e => e.location).filter(Boolean))) : []);

  const pharmacistsWithBp = useMemo(() => {
    if (!currentRoster || !currentRoster.entries) return new Set<string>();
    const set = new Set<string>();
    currentRoster.entries.forEach(entry => {
      if (getShiftCode(entry.shift) === 'Bp') {
        set.add(entry.pharmacistName);
      }
    });
    return set;
  }, [currentRoster]);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Parsing state
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [parsingStep, setParsingStep] = useState<string>('');
  const [parseProgress, setParseProgress] = useState<number>(0);
  const [parsedRosterResult, setParsedRosterResult] = useState<SavedRoster | null>(null);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedPharmacist, setSelectedPharmacist] = useState<string>('');
  const [selectedShift, setSelectedShift] = useState<string>('');
  const [selectedLocation, setSelectedLocation] = useState<string>('');

  // Custom States for View Mode and Comparison Table
  const [viewMode, setViewMode] = useState<'spreadsheet' | 'comparison' | 'today'>('spreadsheet');
  const [selectedTodayDate, setSelectedTodayDate] = useState<string>('');
  const [selectedComparisonTable, setSelectedComparisonTable] = useState<number>(0);
  const [comparisonSearchQuery, setComparisonSearchQuery] = useState<string>('');

  // Password confirmation for deletion
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [rosterToDeleteId, setRosterToDeleteId] = useState<string>('');
  const [adminPassword, setAdminPassword] = useState<string>('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const [isResetModalOpen, setIsResetModalOpen] = useState<boolean>(false);
  const [resetAdminPassword, setResetAdminPassword] = useState<string>('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState<boolean>(false);

  // Load Saved Rosters
  const fetchRosters = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/rosters');
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      setSavedRosters(data);
      
      // Auto-select latest roster
      if (data.length > 0) {
        setSavedRosters(data);
        const latest = data[0];
        setSelectedRosterId(latest.id);
        setCurrentRoster(latest);
      } else {
        setCurrentRoster(null);
      }
    } catch (err: any) {
      console.error('Failed to load rosters:', err);
      setError(err.message || 'Failed to fetch saved rosters');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRosters();
  }, []);

  // Synchronize selectedTodayDate to today or first roster date when currentRoster changes
  useEffect(() => {
    if (currentRoster && currentRoster.entries && currentRoster.entries.length > 0) {
      const todayStr = '2026-07-13'; // Environment current date
      const hasToday = currentRoster.entries.some(e => e.date === todayStr);
      if (hasToday) {
        setSelectedTodayDate(todayStr);
      } else {
        // Fallback to the first sorted date in the roster
        const uniqueDates = Array.from(new Set(currentRoster.entries.map(e => e.date).filter(Boolean)))
          .sort((a, b) => a.localeCompare(b));
        if (uniqueDates.length > 0) {
          setSelectedTodayDate(uniqueDates[0]);
        }
      }
    } else {
      setSelectedTodayDate('');
    }
  }, [currentRoster]);

  // Listen for SSE updates
  useEffect(() => {
    const handleSSEUpdate = (e: any) => {
      if (e.detail && e.detail.type === 'rosters') {
        const data = e.detail.data;
        setSavedRosters(data);
        if (data.length > 0) {
          // Keep selection synchronized
          const found = data.find((r: any) => r.id === selectedRosterId) || data[0];
          setSelectedRosterId(found.id);
          setCurrentRoster(found);
        } else {
          setCurrentRoster(null);
          setSelectedRosterId('');
        }
      }
    };

    window.addEventListener('sse-status-change', handleSSEUpdate);
    return () => {
      window.removeEventListener('sse-status-change', handleSSEUpdate);
    };
  }, [selectedRosterId]);

  // Handle month selection change
  const handleRosterSelect = (id: string) => {
    if (selectedRosterId === id) {
      // Toggle off / deselect / close view
      setSelectedRosterId('');
      setCurrentRoster(null);
      return;
    }
    setSelectedRosterId(id);
    const selected = savedRosters.find(r => r.id === id) || null;
    setCurrentRoster(selected);
    // Reset filters
    setSelectedPharmacist('');
    setSelectedShift('');
    setSelectedLocation('');
    setSearchQuery('');
  };

  // Convert PDF file to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = reader.result?.toString().split(',')[1];
        resolve(base64String || '');
      };
      reader.onerror = error => reject(error);
    });
  };

  // Drag and Drop handlers
  const [dragActive, setDragActive] = useState<boolean>(false);
  const handleDrag = (e: any) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: any) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleRosterUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: any) => {
    if (e.target.files && e.target.files[0]) {
      handleRosterUpload(e.target.files[0]);
    }
  };

  // Perform PDF OCR using Gemini 3.5 Flash
  const handleRosterUpload = async (file: File) => {
    if (file.type !== 'application/pdf') {
      alert('Please upload a valid PDF file.');
      return;
    }

    try {
      setIsParsing(true);
      setParsedRosterResult(null);
      setError(null);
      
      // Step 1: Base64 Conversion
      setParsingStep('Reading PDF document structure...');
      setParseProgress(15);
      const base64 = await fileToBase64(file);
      
      // Step 2: Call Gemini OCR Route
      setParsingStep('Initiating Gemini AI OCR Table Extraction...');
      setParseProgress(45);
      
      const res = await fetch('/api/rosters/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64,
          filename: file.name,
          mimeType: file.type
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP error ${res.status}`);
      }

      setParsingStep('Analyzing extracted shifts & mapping calendar...');
      setParseProgress(80);

      const parsedData = await res.json();
      
      // Construct a SavedRoster model
      const mockId = `roster_${Date.now()}`;
      const entries: RosterEntry[] = parsedData.entries || [];
      const suggestedFilters: SuggestedFilters = parsedData.suggestedFilters || {
        pharmacists: Array.from(new Set(entries.map(e => e.pharmacistName).filter(Boolean))),
        shifts: Array.from(new Set(entries.map(e => e.shift).filter(Boolean))),
        locations: Array.from(new Set(entries.map(e => e.location).filter(Boolean)))
      };

      const rosterObj: SavedRoster = {
        id: mockId,
        month: parsedData.month || 'Selected Month',
        filename: file.name,
        uploadedAt: new Date().toISOString(),
        entries,
        suggestedFilters
      };

      setParsingStep('Finalizing roster filters and layout...');
      setParseProgress(100);
      
      // Delay briefly to allow user to see completed state
      setTimeout(() => {
        setParsedRosterResult(rosterObj);
        setIsParsing(false);
      }, 500);

    } catch (err: any) {
      console.error('Error uploading/parsing duty roster:', err);
      setError(err.message || 'Failed to parse duty roster PDF');
      setIsParsing(false);
    }
  };

  // Publish / Commit Roster to Database (Local & Firestore)
  const handleSaveParsedRoster = async () => {
    if (!parsedRosterResult) return;
    try {
      setLoading(true);
      const res = await fetch('/api/rosters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsedRosterResult)
      });

      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      
      const result = await res.json();
      setSavedRosters(prev => {
        const filtered = prev.filter(r => r.id !== parsedRosterResult.id);
        return [result.roster, ...filtered];
      });
      
      setSelectedRosterId(result.roster.id);
      setCurrentRoster(result.roster);
      setParsedRosterResult(null);
    } catch (err: any) {
      console.error('Failed to commit roster to storage:', err);
      alert('Failed to publish roster: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Edit in-place cell handlers
  const handleEditCell = (index: number, field: keyof RosterEntry, value: string) => {
    if (!currentRoster) return;
    const updatedEntries = [...currentRoster.entries];
    updatedEntries[index] = { ...updatedEntries[index], [field]: value };
    
    // Update current roster view
    const updatedRoster = {
      ...currentRoster,
      entries: updatedEntries
    };
    setCurrentRoster(updatedRoster);
    
    // Update in savedRosters array
    setSavedRosters(prev => prev.map(r => r.id === currentRoster.id ? updatedRoster : r));
  };

  // Save current modifications to cloud database
  const handleSaveModifiedRoster = async () => {
    if (!currentRoster) return;
    try {
      setLoading(true);
      const res = await fetch('/api/rosters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentRoster)
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      alert('Roster changes saved successfully!');
    } catch (err: any) {
      console.error('Failed to save manual edits:', err);
      alert('Failed to save manual changes: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Delete Roster security modal handlers
  const triggerDeleteRoster = (id: string) => {
    setRosterToDeleteId(id);
    setAdminPassword('');
    setDeleteError(null);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!adminPassword) {
      setDeleteError('Please enter the administrator password');
      return;
    }
    try {
      setIsDeleting(true);
      setDeleteError(null);
      const res = await fetch('/api/rosters/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rosterToDeleteId, adminPassword })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Authorization failed');
      }

      setSavedRosters(prev => prev.filter(r => r.id !== rosterToDeleteId));
      if (selectedRosterId === rosterToDeleteId) {
        setCurrentRoster(null);
        setSelectedRosterId('');
      }
      setIsDeleteModalOpen(false);
      alert('Roster deleted successfully.');
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete roster');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleResetArchive = async () => {
    if (!resetAdminPassword) {
      setResetError('Please enter the administrator password');
      return;
    }
    try {
      setIsResetting(true);
      setResetError(null);
      const res = await fetch('/api/rosters/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPassword: resetAdminPassword })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Authorization failed');
      }

      setSavedRosters([]);
      setCurrentRoster(null);
      setSelectedRosterId('');
      setIsResetModalOpen(false);
      setResetAdminPassword('');
      alert('Roster archive reset successfully.');
    } catch (err: any) {
      setResetError(err.message || 'Failed to reset archive');
    } finally {
      setIsResetting(false);
    }
  };

  // Add empty row manually
  const handleAddManualRow = () => {
    if (!currentRoster) return;
    const todayISO = new Date().toISOString().split('T')[0];
    const newEntry: RosterEntry = {
      date: todayISO,
      day: 'Monday',
      pharmacistName: 'New Pharmacist',
      shift: 'Morning',
      location: 'Al Wakra',
      notes: ''
    };
    
    const updatedRoster = {
      ...currentRoster,
      entries: [newEntry, ...currentRoster.entries]
    };
    setCurrentRoster(updatedRoster);
    setSavedRosters(prev => prev.map(r => r.id === currentRoster.id ? updatedRoster : r));
  };

  // Comparison Export Helpers
  const handleDownloadComparisonExcel = () => {
    if (!currentRoster) return;
    const stats = computeStats(currentRoster.entries);
    let exportData: any[] = [];
    let sheetName = "";

    if (selectedComparisonTable === 0) {
      sheetName = "Emergency Pharmacy Total";
      exportData = stats.map(s => ({
        "Staff Name": s.name,
        "Emergency Pharmacy (Adult + Pediatric)": s.emergencyTotal
      }));
    } else if (selectedComparisonTable === 1) {
      sheetName = "Emergency Pharmacy by Shift";
      exportData = stats.map(s => ({
        "Staff Name": s.name,
        "Emergency Pharmacy Morning": s.emergencyMorning,
        "Emergency Pharmacy Evening": s.emergencyEvening,
        "Emergency Pharmacy Night": s.emergencyNight
      }));
    } else if (selectedComparisonTable === 2) {
      sheetName = "Shifts by Location";
      exportData = stats.map(s => ({
        "Staff Name": s.name,
        "Adult": s.locationAdult,
        "Pediatric": s.locationPediatric,
        "OPD": s.locationOPD,
        "Inpatient": s.locationInpatient
      }));
    } else if (selectedComparisonTable === 3) {
      sheetName = "Shifts by Time";
      exportData = stats.map(s => ({
        "Staff Name": s.name,
        "Morning": s.timeMorning,
        "Evening": s.timeEvening,
        "Night": s.timeNight
      }));
    } else if (selectedComparisonTable === 4) {
      sheetName = "Leaves & Off Days";
      exportData = stats.map(s => ({
        "Staff Name": s.name,
        "Annual Leave": s.leaveAnnual,
        "Casual Leave": s.leaveCasual,
        "Sick Leave": s.leaveSick,
        "Off Days": s.offDays
      }));
    }

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, `Pharmacist_Comparison_${sheetName.replace(/\s+/g, '_')}_${currentRoster.month.replace(/\s+/g, '_')}.xlsx`);
  };

  const handleDownloadComparisonCSV = () => {
    if (!currentRoster) return;
    const stats = computeStats(currentRoster.entries);
    let exportData: any[] = [];
    let sheetName = "";

    if (selectedComparisonTable === 0) {
      sheetName = "Emergency_Pharmacy_Total";
      exportData = stats.map(s => ({
        "Staff Name": s.name,
        "Emergency Pharmacy (Adult + Pediatric)": s.emergencyTotal
      }));
    } else if (selectedComparisonTable === 1) {
      sheetName = "Emergency_Pharmacy_by_Shift";
      exportData = stats.map(s => ({
        "Staff Name": s.name,
        "Emergency Pharmacy Morning": s.emergencyMorning,
        "Emergency Pharmacy Evening": s.emergencyEvening,
        "Emergency Pharmacy Night": s.emergencyNight
      }));
    } else if (selectedComparisonTable === 2) {
      sheetName = "Shifts_by_Location";
      exportData = stats.map(s => ({
        "Staff Name": s.name,
        "Adult": s.locationAdult,
        "Pediatric": s.locationPediatric,
        "OPD": s.locationOPD,
        "Inpatient": s.locationInpatient
      }));
    } else if (selectedComparisonTable === 3) {
      sheetName = "Shifts_by_Time";
      exportData = stats.map(s => ({
        "Staff Name": s.name,
        "Morning": s.timeMorning,
        "Evening": s.timeEvening,
        "Night": s.timeNight
      }));
    } else if (selectedComparisonTable === 4) {
      sheetName = "Leaves_and_Off_Days";
      exportData = stats.map(s => ({
        "Staff Name": s.name,
        "Annual Leave": s.leaveAnnual,
        "Casual Leave": s.leaveCasual,
        "Sick Leave": s.leaveSick,
        "Off Days": s.offDays
      }));
    }

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const csvContent = XLSX.utils.sheet_to_csv(worksheet);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Pharmacist_Comparison_${sheetName}_${currentRoster.month.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadComparisonPDF = () => {
    if (!currentRoster) return;
    const stats = computeStats(currentRoster.entries);
    const doc = new jsPDF() as any;

    let title = "";
    let headers: string[] = [];
    let rows: any[] = [];

    if (selectedComparisonTable === 0) {
      title = "Emergency Pharmacy Total (Adult + Pediatric) Shifts";
      headers = ["Staff Name", "Emergency Pharmacy Total Shifts"];
      rows = stats.map(s => [s.name, s.emergencyTotal]);
    } else if (selectedComparisonTable === 1) {
      title = "Emergency Pharmacy Shifts by Time";
      headers = ["Staff Name", "Emergency Morning", "Emergency Evening", "Emergency Night"];
      rows = stats.map(s => [s.name, s.emergencyMorning, s.emergencyEvening, s.emergencyNight]);
    } else if (selectedComparisonTable === 2) {
      title = "Shifts by Location";
      headers = ["Staff Name", "Adult Pharmacy", "Pediatric Pharmacy", "OPD Pharmacy", "Inpatient Pharmacy"];
      rows = stats.map(s => [s.name, s.locationAdult, s.locationPediatric, s.locationOPD, s.locationInpatient]);
    } else if (selectedComparisonTable === 3) {
      title = "Shifts by Time";
      headers = ["Staff Name", "Morning Shifts", "Evening Shifts", "Night Shifts"];
      rows = stats.map(s => [s.name, s.timeMorning, s.timeEvening, s.timeNight]);
    } else if (selectedComparisonTable === 4) {
      title = "Leaves & Off Days Summary";
      headers = ["Staff Name", "Annual Leave (L)", "Casual Leave (A*)", "Sick Leave (SL)", "Off Days (O)"];
      rows = stats.map(s => [s.name, s.leaveAnnual, s.leaveCasual, s.leaveSick, s.offDays]);
    }

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(20, 83, 45); // Dark Green
    doc.text(title, 14, 22);

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Roster Period: ${currentRoster.month}`, 14, 30);
    doc.text(`Generated On: ${new Date().toLocaleDateString()}`, 14, 35);

    doc.autoTable({
      head: [headers],
      body: rows,
      startY: 42,
      theme: 'grid',
      headStyles: { 
        fillColor: [20, 83, 45],
        textColor: [255, 255, 255],
        fontSize: 10,
        fontStyle: 'bold'
      },
      styles: { 
        fontSize: 9, 
        cellPadding: 3 
      }
    });

    doc.save(`Pharmacist_Comparison_${selectedComparisonTable + 1}_${currentRoster.month.replace(/\s+/g, '_')}.pdf`);
  };

  // Export & Download Reports
  // Export & Download Reports
  const handleDownloadTodayExcel = () => {
    if (!currentRoster || !selectedTodayDate) return;
    const entriesToExport = dailyEntries.map(e => ({
      "Date": e.date,
      "Day": e.day,
      "Pharmacist Name": e.pharmacistName,
      "Shift": e.shift,
      "Location": e.location,
      "Notes": e.notes || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(entriesToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Daily Roster");
    XLSX.writeFile(workbook, `Pharmacist_Daily_Roster_${selectedTodayDate}_${currentRoster.month.replace(/\s+/g, '_')}.xlsx`);
  };

  const handleDownloadTodayCSV = () => {
    if (!currentRoster || !selectedTodayDate) return;
    const entriesToExport = dailyEntries.map(e => ({
      "Date": e.date,
      "Day": e.day,
      "Pharmacist Name": e.pharmacistName,
      "Shift": e.shift,
      "Location": e.location,
      "Notes": e.notes || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(entriesToExport);
    const csvContent = XLSX.utils.sheet_to_csv(worksheet);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Pharmacist_Daily_Roster_${selectedTodayDate}_${currentRoster.month.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadTodayPDF = () => {
    if (!currentRoster || !selectedTodayDate) return;
    const doc = new jsPDF() as any;

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(20, 83, 45); // Dark Green
    doc.text(`Daily Pharmacists Duty Roster`, 14, 22);

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Selected Date: ${formatEntryDate(selectedTodayDate)} (${dailyEntries[0]?.day || ''})`, 14, 29);
    doc.text(`Roster Month: ${currentRoster.month}`, 14, 35);
    doc.text(`Exported On: ${new Date().toLocaleDateString()}`, 14, 41);

    const tableColumn = ["Pharmacist Name", "Shift Code", "Shift Detail", "Location", "Notes"];
    const tableRows = dailyEntries.map(e => [
      e.pharmacistName,
      getShiftCode(e.shift),
      e.shift,
      e.location,
      e.notes || ''
    ]);

    doc.autoTable({
      head: [tableColumn],
      body: tableRows,
      startY: 47,
      theme: 'grid',
      headStyles: { 
        fillColor: [20, 83, 45],
        textColor: [255, 255, 255],
        fontSize: 10,
        fontStyle: 'bold'
      },
      styles: { 
        fontSize: 9, 
        cellPadding: 3 
      }
    });

    doc.save(`Pharmacist_Daily_Roster_${selectedTodayDate}_${currentRoster.month.replace(/\s+/g, '_')}.pdf`);
  };

  const handleDownloadExcel = () => {
    if (!currentRoster) return;
    if (viewMode === 'comparison') {
      handleDownloadComparisonExcel();
      return;
    }
    if (viewMode === 'today') {
      handleDownloadTodayExcel();
      return;
    }
    const entriesToExport = filteredEntries.map(e => ({
      "Date": e.date,
      "Day": e.day,
      "Pharmacist Name": e.pharmacistName,
      "Shift": e.shift,
      "Location": e.location,
      "Notes": e.notes || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(entriesToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Pharmacist Roster");
    XLSX.writeFile(workbook, `Pharmacist_Duty_Roster_${currentRoster.month.replace(/\s+/g, '_')}.xlsx`);
  };

  const handleDownloadCSV = () => {
    if (!currentRoster) return;
    if (viewMode === 'comparison') {
      handleDownloadComparisonCSV();
      return;
    }
    if (viewMode === 'today') {
      handleDownloadTodayCSV();
      return;
    }
    const entriesToExport = filteredEntries.map(e => ({
      "Date": e.date,
      "Day": e.day,
      "Pharmacist Name": e.pharmacistName,
      "Shift": e.shift,
      "Location": e.location,
      "Notes": e.notes || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(entriesToExport);
    const csvContent = XLSX.utils.sheet_to_csv(worksheet);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Pharmacist_Duty_Roster_${currentRoster.month.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadPDF = () => {
    if (!currentRoster) return;
    if (viewMode === 'comparison') {
      handleDownloadComparisonPDF();
      return;
    }
    if (viewMode === 'today') {
      handleDownloadTodayPDF();
      return;
    }
    const doc = new jsPDF() as any;

    // Header Band
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(20, 83, 45); // Dark Green
    doc.text(`Monthly Pharmacists Duty Roster`, 14, 22);

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(100, 100, 100);
    doc.text(`Roster Period: ${currentRoster.month}`, 14, 30);
    doc.text(`Exported On: ${new Date().toLocaleDateString()}`, 14, 36);

    const tableColumn = ["Date", "Day", "Pharmacist Name", "Shift", "Location", "Notes"];
    const tableRows = filteredEntries.map(e => [
      e.date,
      e.day,
      e.pharmacistName,
      e.shift,
      e.location,
      e.notes || ''
    ]);

    doc.autoTable({
      head: [tableColumn],
      body: tableRows,
      startY: 42,
      theme: 'grid',
      headStyles: { 
        fillColor: [20, 83, 45],
        textColor: [255, 255, 255],
        fontSize: 10,
        fontStyle: 'bold'
      },
      styles: { 
        fontSize: 9, 
        cellPadding: 3 
      },
      columnStyles: {
        4: { cellWidth: 35 },
        5: { cellWidth: 40 }
      }
    });

    doc.save(`Pharmacist_Duty_Roster_${currentRoster.month.replace(/\s+/g, '_')}.pdf`);
  };

  // Filter application
  const filteredEntries = currentRoster ? currentRoster.entries.filter(e => {
    const matchesSearch = !searchQuery || 
      e.pharmacistName.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (e.notes || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesPharmacist = !selectedPharmacist || e.pharmacistName === selectedPharmacist;
    const matchesShift = !selectedShift || 
      e.shift.toLowerCase() === selectedShift.toLowerCase() ||
      e.shift.toLowerCase().includes(selectedShift.toLowerCase()) ||
      selectedShift.toLowerCase().includes(e.shift.toLowerCase()) ||
      (getShiftCode(e.shift) && getShiftCode(e.shift) === getShiftCode(selectedShift));
    const matchesLocation = !selectedLocation || e.location === selectedLocation;

    return matchesSearch && matchesPharmacist && matchesShift && matchesLocation;
  }).sort((a, b) => (a.date || '').localeCompare(b.date || '')) : [];

  const dailyEntries = useMemo(() => {
    if (!currentRoster || !selectedTodayDate) return [];
    return currentRoster.entries.filter(e => e.date === selectedTodayDate);
  }, [currentRoster, selectedTodayDate]);

  const uniqueRosterDates = useMemo(() => {
    if (!currentRoster) return [];
    return Array.from(new Set(currentRoster.entries.map(e => e.date).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b));
  }, [currentRoster]);

  const handlePrevDay = () => {
    const currentIdx = uniqueRosterDates.indexOf(selectedTodayDate);
    if (currentIdx > 0) {
      setSelectedTodayDate(uniqueRosterDates[currentIdx - 1]);
    }
  };

  const handleNextDay = () => {
    const currentIdx = uniqueRosterDates.indexOf(selectedTodayDate);
    if (currentIdx !== -1 && currentIdx < uniqueRosterDates.length - 1) {
      setSelectedTodayDate(uniqueRosterDates[currentIdx + 1]);
    }
  };

  const groupedDailyEntries = useMemo(() => {
    const result = {
      emergencyMorning: [] as RosterEntry[],
      emergencyEvening: [] as RosterEntry[],
      emergencyNight: [] as RosterEntry[],
      otherMorning: [] as RosterEntry[],
      otherEvening: [] as RosterEntry[],
      otherNight: [] as RosterEntry[],
      away: [] as RosterEntry[],
    };

    dailyEntries.forEach(entry => {
      const code = getShiftCode(entry.shift);
      // Categorize
      if (['Aa', 'Ap'].includes(code)) {
        result.emergencyMorning.push(entry);
      } else if (['Ba', 'Bp'].includes(code)) {
        result.emergencyEvening.push(entry);
      } else if (['Ca', 'Cp'].includes(code)) {
        result.emergencyNight.push(entry);
      } else if (['Ao', 'Amo', 'Ai', 'Av', 'Ar', 'An'].includes(code)) {
        result.otherMorning.push(entry);
      } else if (['Bi'].includes(code)) {
        result.otherEvening.push(entry);
      } else if (['Ci'].includes(code)) {
        result.otherNight.push(entry);
      } else if (['L', 'A*', 'SL', 'O'].includes(code)) {
        result.away.push(entry);
      } else {
        // Fallback categorization based on text matching
        const s = entry.shift.toLowerCase();
        if (s.includes('leave') || s.includes('off') || s.includes('sick') || s === 'l' || s === 'o' || s === 'sl' || s === 'a*') {
          result.away.push(entry);
        } else if (s.includes('evening') || s.includes('afternoon') || s.includes(' pm') || s.includes('pm ')) {
          result.otherEvening.push(entry);
        } else if (s.includes('night') || s.includes('overnight')) {
          result.otherNight.push(entry);
        } else {
          result.otherMorning.push(entry);
        }
      }
    });

    return result;
  }, [dailyEntries]);

  return (
    <div className="min-h-screen bg-[#FDFDFD] py-8 px-4 sm:px-6 lg:px-8">
      {/* 1. Page Title & Hero */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="bg-gradient-to-r from-emerald-900 to-teal-950 rounded-3xl p-6 sm:p-8 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20">
              <CalendarDays className="w-8 h-8 text-emerald-300" />
            </div>
            <div>
              <span className="text-emerald-300 text-xs font-extrabold uppercase tracking-widest">Administration Hub</span>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight mt-0.5">Pharmacists Duty Roster</h1>
              <p className="text-white/75 text-xs sm:text-sm font-medium mt-1">Upload rosters in PDF format, extract shifts instantly via Gemini AI OCR, make edits, and compile PDF, Excel, and CSV report exports.</p>
            </div>
          </div>
          <div className="flex gap-3 shrink-0">
            <button 
              onClick={fetchRosters}
              className="p-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-all flex items-center justify-center cursor-pointer"
              title="Refresh Roster list"
            >
              <RefreshCw className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column - Roster Upload & File Selector (width 4/12) */}
        <div className={`lg:col-span-4 flex flex-col gap-8 ${currentRoster ? 'order-2 lg:order-1' : 'order-1'}`}>
          
          {/* A. Upload Block */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Upload className="w-4 h-4 text-emerald-600" />
              <span>Import Monthly Roster</span>
            </h2>

            {/* Drag & Drop Canvas */}
            <label 
              htmlFor="roster-file-upload"
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all relative block cursor-pointer ${
                dragActive 
                  ? 'border-emerald-600 bg-emerald-50/50' 
                  : 'border-gray-200 hover:border-gray-300 bg-gray-50/50'
              }`}
            >
              <input 
                type="file" 
                id="roster-file-upload" 
                className="hidden" 
                onChange={handleFileChange}
              />
              <div className="pointer-events-none">
                <div className="w-12 h-12 bg-white rounded-xl border border-gray-100 flex items-center justify-center mx-auto shadow-sm mb-3">
                  <Sparkles className="w-6 h-6 text-emerald-600" />
                </div>
                <p className="text-sm font-bold text-gray-800">Drag & drop duty roster PDF</p>
                <p className="text-xs text-gray-500 mt-1">or click to browse your workspace</p>
                <span className="inline-block mt-3 px-3 py-1 bg-white rounded-full text-[10px] font-extrabold text-emerald-700 border border-emerald-100 uppercase tracking-wider">
                  Gemini AI OCR Enabled
                </span>
              </div>
            </label>

            {/* OCR Parser overlay */}
            <AnimatePresence>
              {isParsing && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                >
                  <motion.div 
                    initial={{ scale: 0.95 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0.95 }}
                    className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-gray-100 text-center"
                  >
                    <div className="relative w-20 h-20 mx-auto mb-6">
                      <div className="absolute inset-0 rounded-full border-4 border-emerald-100"></div>
                      <div className="absolute inset-0 rounded-full border-4 border-emerald-600 border-t-transparent animate-spin"></div>
                      <Sparkles className="w-8 h-8 text-emerald-600 absolute inset-0 m-auto animate-pulse" />
                    </div>
                    
                    <h3 className="text-lg font-black text-gray-900 mb-1">Pharmacist Roster Parsing</h3>
                    <p className="text-sm text-gray-500 max-w-xs mx-auto mb-6">Analyzing file structure and extracting personnel schedules with Gemini AI.</p>
                    
                    {/* Progress Bar */}
                    <div className="w-full bg-gray-100 rounded-full h-2 mb-2 overflow-hidden">
                      <motion.div 
                        className="bg-emerald-600 h-2 rounded-full"
                        animate={{ width: `${parseProgress}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                    <div className="flex justify-between items-center text-xs text-gray-400 font-bold">
                      <span>{parsingStep}</span>
                      <span>{parseProgress}%</span>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* B. Saved Months List selector */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Grid className="w-4 h-4 text-emerald-600" />
                <span>Roster Archive</span>
              </h2>
              {savedRosters.length > 0 && (
                <button
                  onClick={() => setIsResetModalOpen(true)}
                  className="px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-all flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Reset Archive
                </button>
              )}
            </div>

            {loading ? (
              <div className="py-6 text-center text-gray-400">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-gray-300" />
                <p className="text-xs font-bold">Syncing archives...</p>
              </div>
            ) : savedRosters.length === 0 ? (
              <div className="py-6 text-center border border-dashed border-gray-100 rounded-2xl bg-gray-50/50">
                <Clock className="w-6 h-6 text-gray-300 mx-auto mb-2" />
                <p className="text-xs font-bold text-gray-400">No rosters uploaded yet.</p>
                <p className="text-[10px] text-gray-400 mt-1">Upload your first duty roster above to begin.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto">
                {savedRosters.map((roster) => (
                  <div
                    key={roster.id}
                    onClick={() => handleRosterSelect(roster.id)}
                    className={`p-3.5 rounded-2xl border text-left transition-all flex justify-between items-center group cursor-pointer ${
                      selectedRosterId === roster.id
                        ? 'bg-emerald-50 border-emerald-200 shadow-sm'
                        : 'bg-white border-gray-100 hover:border-gray-200'
                    }`}
                  >
                    <div>
                      <h4 className={`text-sm font-bold ${selectedRosterId === roster.id ? 'text-emerald-900' : 'text-gray-800'}`}>
                        {roster.month}
                      </h4>
                      <p className="text-[10px] text-gray-400 font-semibold mt-0.5 flex items-center gap-1.5">
                        <FileCheck className="w-3.5 h-3.5 shrink-0" />
                        <span>{roster.entries.length} shifts tracked</span>
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerDeleteRoster(roster.id);
                      }}
                      className="p-2 bg-transparent hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-600" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Shift Legend & Appreciations Block */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-600" />
                <span>Shift Code Legend</span>
              </h2>
              <span className="text-[10px] font-extrabold uppercase bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full border border-emerald-100">
                18 Codes
              </span>
            </div>
            
            <p className="text-xs text-gray-500 leading-relaxed">
              Below are the standard shift abbreviation codes used in the duty roster. Click any code to filter assignments below.
            </p>

            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
              {currentRoster && rosterPharmacists.length > 0 && (
                <div className="p-3.5 rounded-2xl border border-emerald-100 bg-emerald-50/20 space-y-2.5">
                  <div className="flex justify-between items-center">
                    <h3 className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border text-emerald-800 bg-emerald-100/60 border-emerald-200 w-max flex items-center gap-1">
                      <User className="w-3 h-3" />
                      <span>Pharmacists</span>
                    </h3>
                    {selectedPharmacist && (
                      <button
                        onClick={() => setSelectedPharmacist('')}
                        className="text-[9px] font-bold text-emerald-700 hover:text-emerald-900 underline cursor-pointer"
                      >
                        Clear Filter
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 pl-1">
                    {rosterPharmacists.map((ph) => {
                      const isSelected = selectedPharmacist === ph;
                      return (
                        <button
                          key={ph}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedPharmacist('');
                            } else {
                              setSelectedPharmacist(ph);
                            }
                          }}
                          className={`px-2.5 py-1 rounded-xl border text-[11px] font-semibold transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-emerald-800 text-white border-transparent shadow-sm scale-[1.02] font-bold'
                              : 'bg-white hover:bg-gray-50 border-gray-100 text-gray-700'
                          }`}
                        >
                          {ph}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {[
                {
                  title: 'Emergency Pharmacies',
                  color: 'border-amber-100 bg-amber-50/20',
                  headerColor: 'text-amber-800 bg-amber-100/60 border-amber-200',
                  subSections: [
                    {
                      subTitle: 'Morning Shifts Section',
                      items: [
                        { code: 'Aa', name: 'Morning Shift Adult Pharmacy', badgeClass: 'bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200/50' },
                        { code: 'Ap', name: 'Morning Shift Pediatric Pharmacy', badgeClass: 'bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200/50' }
                      ]
                    },
                    {
                      subTitle: 'Evening Shifts Section',
                      items: [
                        { code: 'Ba', name: 'Evening Shift Adult Pharmacy', badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200 hover:bg-indigo-200/50' },
                        { code: 'Bp', name: 'Evening Shift Pediatric Pharmacy', badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200 hover:bg-indigo-200/50' },
                        { code: 'Bp', name: 'Evening Shift Pediatric Pharmacy (1-9 PM)', badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200 italic font-black font-serif', isSpecialBp: true }
                      ]
                    },
                    {
                      subTitle: 'Night Shifts Section',
                      items: [
                        { code: 'Ca', name: 'Night Shift Adult Pharmacy', badgeClass: 'bg-violet-100 text-violet-800 border-violet-200 hover:bg-violet-200/50' },
                        { code: 'Cp', name: 'Night Shift Pediatric Pharmacy', badgeClass: 'bg-violet-100 text-violet-800 border-violet-200 hover:bg-violet-200/50' }
                      ]
                    }
                  ]
                },
                {
                  title: 'Other Pharmacies',
                  color: 'border-indigo-100 bg-indigo-50/20',
                  headerColor: 'text-indigo-800 bg-indigo-100/60 border-indigo-200',
                  subSections: [
                    {
                      subTitle: 'OPD Pharmacies',
                      items: [
                        { code: 'Ao', name: 'Morning Shift AWH OPD Pharmacy', badgeClass: 'bg-teal-100 text-teal-800 border-teal-200 hover:bg-teal-200/50' },
                        { code: 'Amo', name: 'Morning Shift Mesaieed OPD Pharmacy', badgeClass: 'bg-teal-100 text-teal-800 border-teal-200 hover:bg-teal-200/50' }
                      ]
                    },
                    {
                      subTitle: 'Inpatient Pharmacies - Morning',
                      items: [
                        { code: 'Ai', name: 'Morning Shift Inpatient Pharmacy', badgeClass: 'bg-sky-100 text-sky-800 border-sky-200 hover:bg-sky-200/50' },
                        { code: 'Av', name: 'Morning Shift IV Pharmacy', badgeClass: 'bg-sky-100 text-sky-800 border-sky-200 hover:bg-sky-200/50' },
                        { code: 'Ar', name: 'Extemporaneous Preparations', badgeClass: 'bg-sky-100 text-sky-800 border-sky-200 hover:bg-sky-200/50' },
                        { code: 'An', name: 'Narcotic Pharmacy', badgeClass: 'bg-sky-100 text-sky-800 border-sky-200 hover:bg-sky-200/50' }
                      ]
                    },
                    {
                      subTitle: 'Inpatient Pharmacies - Evening',
                      items: [
                        { code: 'Bi', name: 'Evening Shift Inpatient Pharmacy', badgeClass: 'bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-200/50' }
                      ]
                    },
                    {
                      subTitle: 'Inpatient Pharmacies - Night',
                      items: [
                        { code: 'Ci', name: 'Night Shift Inpatient Pharmacy', badgeClass: 'bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-200/50' }
                      ]
                    }
                  ]
                },
                {
                  title: 'Leave',
                  color: 'border-rose-100 bg-rose-50/20',
                  headerColor: 'text-rose-800 bg-rose-100/60 border-rose-200',
                  items: [
                    { code: 'L', name: 'Annual Leave', badgeClass: 'bg-rose-100 text-rose-800 border-rose-200 hover:bg-rose-200/50' },
                    { code: 'A*', name: 'Casual Leave', badgeClass: 'bg-orange-100 text-orange-800 border-orange-200 hover:bg-orange-200/50' },
                    { code: 'SL', name: 'Sick Leave', badgeClass: 'bg-red-100 text-red-800 border-red-200 hover:bg-red-200/50' },
                    { code: 'O', name: 'OFF Day', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-200/50', isOff: true }
                  ]
                }
              ].map((section) => (
                <div key={section.title} className={`p-3.5 rounded-2xl border ${section.color} space-y-2.5`}>
                  <h3 className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${section.headerColor} w-max`}>
                    {section.title}
                  </h3>
                  
                  {section.subSections ? (
                    <div className="space-y-2.5 pl-1">
                      {section.subSections.map((sub) => (
                        <div key={sub.subTitle} className="space-y-1">
                          <h4 className="text-[9px] font-black text-gray-400 uppercase tracking-wide border-l-2 border-gray-200 pl-1.5 ml-1">
                            {sub.subTitle}
                          </h4>
                          <div className="grid grid-cols-1 gap-1 pl-1.5">
                            {sub.items.map((item) => {
                              const isSelected = selectedShift.toLowerCase() === item.name.toLowerCase() || selectedShift.toLowerCase() === item.code.toLowerCase();
                              return (
                                <button
                                  key={item.name}
                                  onClick={() => {
                                    if (isSelected) {
                                      setSelectedShift('');
                                    } else {
                                      setSelectedShift(item.name);
                                    }
                                  }}
                                  className={`flex items-center justify-between text-left p-1.5 rounded-xl border transition-all text-[11px] cursor-pointer ${
                                    isSelected 
                                      ? 'ring-2 ring-emerald-600 ring-offset-1 border-transparent font-bold bg-white shadow-sm' 
                                      : 'bg-white hover:bg-gray-50 border-gray-100'
                                  }`}
                                >
                                  <span className="text-gray-700 truncate mr-1.5 font-medium">
                                    {item.name}
                                  </span>
                                  <span className={`px-1.5 py-0.5 rounded-md border text-[9px] font-extrabold tracking-wide uppercase shrink-0 ${item.badgeClass}`}>
                                    {item.isSpecialBp ? <span className="italic font-serif font-black">Bp</span> : item.code}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-1 pl-1">
                      {section.items?.map((item) => {
                        const isSelected = selectedShift.toLowerCase() === item.name.toLowerCase() || selectedShift.toLowerCase() === item.code.toLowerCase();
                        return (
                          <button
                            key={item.name}
                            onClick={() => {
                              if (isSelected) {
                                setSelectedShift('');
                              } else {
                                setSelectedShift(item.name);
                              }
                            }}
                            className={`flex items-center justify-between text-left p-1.5 rounded-xl border transition-all text-[11px] cursor-pointer ${
                              isSelected 
                                ? 'ring-2 ring-emerald-600 ring-offset-1 border-transparent font-bold bg-white shadow-sm' 
                                : 'bg-white hover:bg-gray-50 border-gray-100'
                            }`}
                          >
                            <span className="text-gray-700 truncate mr-1.5 font-medium">
                              {item.name}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded-md border text-[9px] font-extrabold tracking-wide uppercase shrink-0 ${item.badgeClass}`}>
                              {item.code}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            <div className="pt-3 border-t border-gray-100 text-[10px] text-gray-400 font-bold leading-normal uppercase text-center tracking-wider">
              Pharmacists Duty Roster Appreciations
            </div>
          </div>

        </div>

        {/* Right Column - OCR Result Preview & Table (width 8/12) */}
        <div className={`lg:col-span-8 flex flex-col gap-6 ${currentRoster ? 'order-1 lg:order-2' : 'order-2'}`}>

          {/* C. Gemini OCR Processing Temporary Result Card */}
          {parsedRosterResult && (
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="bg-amber-50/50 border border-amber-100 rounded-3xl p-6"
            >
              <div className="flex items-start gap-4 justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-amber-500 rounded-2xl">
                    <Sparkles className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <span className="text-amber-700 text-[10px] font-extrabold uppercase tracking-widest">Extracted Candidate Roster</span>
                    <h3 className="text-base font-black text-gray-900 mt-0.5">Ready to publish: {parsedRosterResult.month}</h3>
                    <p className="text-xs text-gray-500 mt-1">Verify accuracy and edit fields directly before committing to cloud database.</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setParsedRosterResult(null)}
                    className="px-4 py-2 rounded-xl text-xs font-bold border border-gray-200 hover:border-gray-300 bg-white cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveParsedRoster}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 rounded-xl text-xs font-bold text-white shadow-sm flex items-center gap-2 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Publish to Cloud</span>
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* D. Main Interactive Shift Panel */}
          {currentRoster ? (
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
              
              {/* Header section with Details, View Switcher, and Export buttons */}
              <div className="p-6 border-b border-gray-50 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div>
                  <span className="text-emerald-700 text-[10px] font-extrabold uppercase tracking-widest">Active Schedule View</span>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <h2 className="text-lg font-black text-gray-900 shrink-0">
                      {currentRoster.month} Roster
                    </h2>
                    <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-extrabold rounded-full uppercase tracking-wider shrink-0">
                      {filteredEntries.length} Assignments
                    </span>
                    <button
                      onClick={() => {
                        setCurrentRoster(null);
                        setSelectedRosterId('');
                      }}
                      className="px-2.5 py-1 text-[10px] font-bold text-gray-500 hover:text-red-700 hover:bg-red-50 hover:border-red-100 rounded-xl transition-all cursor-pointer border border-gray-100 flex items-center gap-1 shrink-0"
                      title="Reset active view and clear current roster selection"
                    >
                      <RefreshCw className="w-2.5 h-2.5" />
                      <span>Close View</span>
                    </button>
                  </div>
                </div>

                {/* View Mode Switcher (Spreadsheet vs Comparison vs Daily Control) */}
                <div className="flex bg-gray-100 p-1 rounded-xl gap-0.5">
                  <button
                    onClick={() => setViewMode('spreadsheet')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      viewMode === 'spreadsheet' 
                        ? 'bg-white text-emerald-900 shadow-sm' 
                        : 'text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    Spreadsheet View
                  </button>
                  <button
                    onClick={() => setViewMode('today')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                      viewMode === 'today' 
                        ? 'bg-white text-emerald-900 shadow-sm' 
                        : 'text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Daily Shift Board</span>
                  </button>
                  <button
                    onClick={() => setViewMode('comparison')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                      viewMode === 'comparison' 
                        ? 'bg-white text-emerald-900 shadow-sm' 
                        : 'text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    <Sparkles className="w-3 h-3 text-emerald-600 animate-pulse" />
                    <span>Comparison Tables</span>
                  </button>
                </div>
                
                {/* Export / Download Buttons */}
                <div className="flex items-center gap-2 flex-wrap">
                  {viewMode === 'spreadsheet' && (
                    <>
                      <button
                        onClick={handleAddManualRow}
                        className="px-4 py-2 text-xs font-bold border border-gray-200 hover:border-gray-300 hover:bg-gray-50 rounded-xl flex items-center gap-1.5 transition-all bg-white cursor-pointer"
                      >
                        <Plus className="w-4 h-4 text-emerald-600" />
                        <span>Add Shift</span>
                      </button>
                      <button
                        onClick={handleSaveModifiedRoster}
                        className="px-4 py-2 text-xs font-bold bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Save className="w-4 h-4" />
                        <span>Save Changes</span>
                      </button>
                      <div className="h-8 w-px bg-gray-100 mx-1" />
                    </>
                  )}
                  
                  <div className="flex gap-1.5">
                    <button
                      onClick={handleDownloadExcel}
                      className="p-2 border border-gray-100 hover:border-gray-200 hover:bg-gray-50 rounded-xl bg-white cursor-pointer"
                      title={viewMode === 'comparison' ? "Export Active Comparison to Excel" : viewMode === 'today' ? "Export Daily Roster to Excel" : "Export to Excel (.xlsx)"}
                    >
                      <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                    </button>
                    <button
                      onClick={handleDownloadCSV}
                      className="p-2 border border-gray-100 hover:border-gray-200 hover:bg-gray-50 rounded-xl bg-white cursor-pointer"
                      title={viewMode === 'comparison' ? "Export Active Comparison to CSV" : viewMode === 'today' ? "Export Daily Roster to CSV" : "Export to CSV (.csv)"}
                    >
                      <FileText className="w-4 h-4 text-teal-600" />
                    </button>
                    <button
                      onClick={handleDownloadPDF}
                      className="p-2 border border-gray-100 hover:border-gray-200 hover:bg-gray-50 rounded-xl bg-white cursor-pointer"
                      title={viewMode === 'comparison' ? "Export Active Comparison to PDF" : viewMode === 'today' ? "Export Daily Roster to PDF" : "Export to PDF Report"}
                    >
                      <Download className="w-4 h-4 text-red-600" />
                    </button>
                  </div>
                </div>
              </div>

              {viewMode === 'spreadsheet' && (
                <>
                  {/* Dynamic Filter Suggestions & Search bar */}
                  <div className="p-6 bg-gray-50/50 border-b border-gray-50 flex flex-col gap-4">
                    
                    {/* Dynamic Filters Badges generated by Gemini */}
                    <div>
                      <div className="flex justify-between items-center mb-2.5">
                        <h4 className="text-[11px] font-extrabold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                          <span>AI Filter Suggestions</span>
                        </h4>
                        {(selectedPharmacist || selectedShift || selectedLocation || searchQuery) && (
                          <button
                            onClick={() => {
                              setSelectedPharmacist('');
                              setSelectedShift('');
                              setSelectedLocation('');
                              setSearchQuery('');
                            }}
                            className="px-2.5 py-1 text-[10px] font-extrabold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100/80 rounded-xl flex items-center gap-1 transition-all cursor-pointer border border-red-100/60"
                          >
                            <RefreshCw className="w-3 h-3 animate-spin-once" />
                            <span>Reset Filters</span>
                          </button>
                        )}
                      </div>
                      
                      {/* Categorized suggestions */}
                      <div className="flex flex-col gap-2">
                        {/* Pharmacists Badges */}
                        <div className="flex flex-row overflow-x-auto sm:flex-wrap items-center gap-1.5 text-xs scrollbar-none pb-1.5 sm:pb-0">
                          <span className="text-gray-400 font-semibold mr-1 flex items-center gap-1 shrink-0"><User className="w-3 h-3" /> Pharmacists:</span>
                          <button
                            onClick={() => setSelectedPharmacist('')}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
                              !selectedPharmacist 
                                ? 'bg-emerald-800 text-white' 
                                : 'bg-white border border-gray-100 hover:border-gray-200 text-gray-600'
                            }`}
                          >
                            All
                          </button>
                          {rosterPharmacists.map((ph) => (
                            <button
                              key={ph}
                              onClick={() => setSelectedPharmacist(ph)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
                                selectedPharmacist === ph
                                  ? 'bg-emerald-800 text-white'
                                  : 'bg-white border border-gray-100 hover:border-gray-200 text-gray-600'
                              }`}
                            >
                              {ph}
                            </button>
                          ))}
                        </div>

                        {/* Shifts Badges */}
                        <div className="flex flex-row overflow-x-auto sm:flex-wrap items-center gap-1.5 text-xs scrollbar-none pb-1.5 sm:pb-0">
                          <span className="text-gray-400 font-semibold mr-1 flex items-center gap-1 shrink-0"><Clock className="w-3 h-3" /> Shifts:</span>
                          <button
                            onClick={() => setSelectedShift('')}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
                              !selectedShift 
                                ? 'bg-emerald-800 text-white' 
                                : 'bg-white border border-gray-100 hover:border-gray-200 text-gray-600'
                            }`}
                          >
                            All
                          </button>
                          {rosterShifts.map((sh) => (
                            <button
                              key={sh}
                              onClick={() => setSelectedShift(sh)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
                                selectedShift === sh
                                  ? 'bg-emerald-800 text-white'
                                  : 'bg-white border border-gray-100 hover:border-gray-200 text-gray-600'
                              }`}
                            >
                              {sh}
                            </button>
                          ))}
                        </div>

                        {/* Locations Badges */}
                        <div className="flex flex-row overflow-x-auto sm:flex-wrap items-center gap-1.5 text-xs scrollbar-none pb-1.5 sm:pb-0">
                          <span className="text-gray-400 font-semibold mr-1 flex items-center gap-1 shrink-0"><MapPin className="w-3 h-3" /> Locations:</span>
                          <button
                            onClick={() => setSelectedLocation('')}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
                              !selectedLocation 
                                ? 'bg-emerald-800 text-white' 
                                : 'bg-white border border-gray-100 hover:border-gray-200 text-gray-600'
                            }`}
                          >
                            All
                          </button>
                          {rosterLocations.map((loc) => (
                            <button
                              key={loc}
                              onClick={() => setSelectedLocation(loc)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
                                selectedLocation === loc
                                  ? 'bg-emerald-800 text-white'
                                  : 'bg-white border border-gray-100 hover:border-gray-200 text-gray-600'
                              }`}
                            >
                              {loc}
                            </button>
                          ))}
                        </div>
                      </div>

                    </div>

                    {/* Direct text Search input & Reset filters button */}
                    <div className="flex flex-col sm:flex-row gap-3 w-full">
                      <div className="relative flex-1">
                        <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="Search shifts by pharmacist name or remarks..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full pl-10 pr-4 py-2.5 border border-gray-100 hover:border-gray-200 rounded-xl text-sm bg-white shadow-inner focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <button
                        onClick={() => {
                          setSelectedPharmacist('');
                          setSelectedShift('');
                          setSelectedLocation('');
                          setSearchQuery('');
                        }}
                        className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 hover:text-emerald-900 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer border border-gray-200"
                        title="Clear all filters, badges, and search queries"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-gray-500 animate-spin-once" />
                        <span>Reset All Filters</span>
                      </button>
                    </div>

                  </div>

                  {/* Responsive Mobile Card View */}
                  <div className="block md:hidden space-y-3 p-4 bg-gray-50/30 max-h-[600px] overflow-y-auto border-b border-gray-100">
                    {filteredEntries.length === 0 ? (
                      <div className="py-12 text-center text-gray-400 bg-white rounded-2xl border border-gray-100 p-6">
                        <AlertCircle className="w-6 h-6 mx-auto mb-2 text-gray-300" />
                        <p className="text-xs font-bold text-gray-500">No shifts match the selected filters.</p>
                        <p className="text-[10px] text-gray-400 mt-1 mb-3">Try resetting the pharmacist, shift, or location badges.</p>
                        <button
                          onClick={() => {
                            setSelectedPharmacist('');
                            setSelectedShift('');
                            setSelectedLocation('');
                            setSearchQuery('');
                          }}
                          className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-850 text-xs font-bold rounded-xl border border-emerald-100 transition-all cursor-pointer inline-flex items-center gap-1.5"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Reset All Filters</span>
                        </button>
                      </div>
                    ) : (
                      filteredEntries.map((entry, idx) => {
                        const originalIndex = currentRoster.entries.indexOf(entry);
                        const isBp = getShiftCode(entry.shift) === 'Bp';
                        return (
                          <div 
                            key={`${entry.date}_${originalIndex}`} 
                            className={`rounded-2xl border p-4 shadow-sm hover:border-emerald-300 transition-all flex flex-col gap-3 relative group ${
                              isBp ? 'bg-amber-50/15 border-amber-200' : 'bg-white border-gray-150'
                            }`}
                          >
                            <div className="flex justify-between items-center border-b border-gray-50 pb-2">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-extrabold text-emerald-800 bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 rounded-lg">
                                  {formatEntryDate(entry.date, entry.day)}
                                </span>
                              </div>
                              <button
                                onClick={() => {
                                  const updatedEntries = [...currentRoster.entries];
                                  updatedEntries.splice(originalIndex, 1);
                                  const updatedRoster = { ...currentRoster, entries: updatedEntries };
                                  setCurrentRoster(updatedRoster);
                                  setSavedRosters(prev => prev.map(r => r.id === currentRoster.id ? updatedRoster : r));
                                }}
                                className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl transition-all"
                                title="Delete this shift entry"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="grid grid-cols-1 gap-2.5">
                              <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block mb-1">Pharmacist</label>
                                <input
                                  type="text"
                                  value={entry.pharmacistName}
                                  onChange={(e) => handleEditCell(originalIndex, 'pharmacistName', e.target.value)}
                                  className={`w-full bg-gray-50 hover:bg-gray-100/50 focus:bg-white border focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl px-3 py-1.5 text-sm outline-none transition-all ${
                                    isBp 
                                      ? 'italic font-extrabold text-amber-900 border-amber-300 bg-amber-50/50' 
                                      : 'font-bold text-gray-800 border-gray-150'
                                  }`}
                                />
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block mb-1">Shift / Duty</label>
                                  <input
                                    type="text"
                                    value={entry.shift}
                                    onChange={(e) => handleEditCell(originalIndex, 'shift', e.target.value)}
                                    className="w-full bg-gray-50 hover:bg-gray-100/50 focus:bg-white border border-gray-150 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl px-3 py-1.5 text-xs font-bold text-emerald-800 outline-none transition-all"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block mb-1">Location</label>
                                  <input
                                    type="text"
                                    value={entry.location}
                                    onChange={(e) => handleEditCell(originalIndex, 'location', e.target.value)}
                                    className="w-full bg-gray-50 hover:bg-gray-100/50 focus:bg-white border border-gray-150 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl px-3 py-1.5 text-xs font-bold text-indigo-800 outline-none transition-all"
                                  />
                                </div>
                              </div>

                              <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block mb-1">Notes / Remarks</label>
                                <input
                                  type="text"
                                  value={entry.notes || ''}
                                  placeholder="None"
                                  onChange={(e) => handleEditCell(originalIndex, 'notes', e.target.value)}
                                  className="w-full bg-gray-50 hover:bg-gray-100/50 focus:bg-white border border-gray-150 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl px-3 py-1.5 text-xs text-gray-600 outline-none transition-all"
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Desktop Spreadsheet grid */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[700px]">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="px-6 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wider w-[220px]">Date</th>
                          <th className="px-6 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wider">Pharmacist Name</th>
                          <th className="px-6 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wider w-[150px]">Shift / Duty</th>
                          <th className="px-6 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wider w-[160px]">Location</th>
                          <th className="px-6 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wider">Notes / Remarks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 text-sm">
                        {filteredEntries.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                              <AlertCircle className="w-6 h-6 mx-auto mb-2 text-gray-300" />
                              <p className="text-xs font-bold text-gray-500">No shifts match the selected filters.</p>
                              <p className="text-[10px] text-gray-400 mt-1 mb-3">Try resetting the pharmacist, shift, or location badges.</p>
                              <button
                                onClick={() => {
                                  setSelectedPharmacist('');
                                  setSelectedShift('');
                                  setSelectedLocation('');
                                  setSearchQuery('');
                                }}
                                className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-850 text-xs font-bold rounded-xl border border-emerald-100 transition-all cursor-pointer inline-flex items-center gap-1.5"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                                <span>Reset All Filters</span>
                              </button>
                            </td>
                          </tr>
                        ) : (
                          filteredEntries.map((entry, idx) => {
                            // Find the absolute index in currentRoster.entries to edit properly
                            const originalIndex = currentRoster.entries.indexOf(entry);
                            const isBp = getShiftCode(entry.shift) === 'Bp';
                            return (
                              <tr 
                                key={`${entry.date}_${originalIndex}`} 
                                className={`group transition-all ${
                                  isBp 
                                    ? 'bg-amber-50/20 hover:bg-amber-100/30' 
                                    : 'hover:bg-gray-50/50'
                                }`}
                              >
                                
                                {/* Date Cell (Combined "Day, Date") */}
                                <td className="px-6 py-2">
                                  <input
                                    type="text"
                                    value={formatEntryDate(entry.date, entry.day)}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      const commaIdx = val.indexOf(',');
                                      if (commaIdx !== -1) {
                                        const dayPart = val.slice(0, commaIdx).trim();
                                        const datePart = val.slice(commaIdx + 1).trim();
                                        
                                        const ddmmyyyy = datePart.match(/^(\d{2})-(\d{2})-(\d{4})$/);
                                        if (ddmmyyyy) {
                                          handleEditCell(originalIndex, 'day', dayPart);
                                          handleEditCell(originalIndex, 'date', `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`);
                                        } else {
                                          handleEditCell(originalIndex, 'day', dayPart);
                                          handleEditCell(originalIndex, 'date', datePart);
                                        }
                                      } else {
                                        const ddmmyyyy = val.match(/^(\d{2})-(\d{2})-(\d{4})$/);
                                        if (ddmmyyyy) {
                                          handleEditCell(originalIndex, 'date', `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`);
                                        } else {
                                          handleEditCell(originalIndex, 'date', val.trim());
                                        }
                                      }
                                    }}
                                    className="w-full bg-transparent border-0 border-b border-transparent focus:border-emerald-500 p-1 text-xs font-bold text-gray-700 outline-none"
                                  />
                                </td>
 
                                {/* Pharmacist Name Cell */}
                                <td className="px-6 py-2">
                                  <input
                                    type="text"
                                    value={entry.pharmacistName}
                                    onChange={(e) => handleEditCell(originalIndex, 'pharmacistName', e.target.value)}
                                    className={`w-full bg-transparent border-0 border-b border-transparent focus:border-emerald-500 p-1 text-sm outline-none ${
                                      isBp 
                                        ? 'italic font-extrabold text-amber-900 placeholder-amber-800/50' 
                                        : 'font-bold text-gray-900'
                                    }`}
                                  />
                                </td>
 
                                {/* Shift Cell */}
                                <td className="px-6 py-2">
                                  <input
                                    type="text"
                                    value={entry.shift}
                                    onChange={(e) => handleEditCell(originalIndex, 'shift', e.target.value)}
                                    className="w-full bg-transparent border-0 border-b border-transparent focus:border-emerald-500 p-1 text-xs font-bold text-emerald-800 outline-none"
                                  />
                                </td>
 
                                {/* Location Cell */}
                                <td className="px-6 py-2">
                                  <input
                                    type="text"
                                    value={entry.location}
                                    onChange={(e) => handleEditCell(originalIndex, 'location', e.target.value)}
                                    className="w-full bg-transparent border-0 border-b border-transparent focus:border-emerald-500 p-1 text-xs font-semibold text-indigo-700 outline-none"
                                  />
                                </td>
 
                                {/* Notes Cell */}
                                <td className="px-6 py-2">
                                  <input
                                    type="text"
                                    value={entry.notes || ''}
                                    placeholder="None"
                                    onChange={(e) => handleEditCell(originalIndex, 'notes', e.target.value)}
                                    className="w-full bg-transparent border-0 border-b border-transparent focus:border-emerald-500 p-1 text-xs text-gray-500 outline-none"
                                  />
                                </td>
 
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {viewMode === 'today' && (
                <div className="flex flex-col bg-gray-50/20">
                  {/* Daily Control Dashboard Header bar */}
                  <div className="p-6 bg-white border-b border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handlePrevDay}
                        disabled={uniqueRosterDates.indexOf(selectedTodayDate) <= 0}
                        className="p-2.5 rounded-xl border border-gray-100 hover:bg-gray-50 disabled:opacity-40 transition-all cursor-pointer shrink-0"
                        title="Previous Day in Roster"
                      >
                        <span className="text-gray-600 font-bold text-sm">◀</span>
                      </button>
                      
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <input
                          type="date"
                          value={selectedTodayDate}
                          onChange={(e) => {
                            if (e.target.value) {
                              setSelectedTodayDate(e.target.value);
                            }
                          }}
                          className="px-3.5 py-2 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white shadow-sm"
                        />
                        <button
                          onClick={() => {
                            const todayStr = '2026-07-13';
                            const hasToday = currentRoster.entries.some(e => e.date === todayStr);
                            if (hasToday) {
                              setSelectedTodayDate(todayStr);
                            } else if (uniqueRosterDates.length > 0) {
                              // If real today is not in roster, find closest to real today or use first
                              setSelectedTodayDate(uniqueRosterDates[0]);
                            }
                          }}
                          className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 text-emerald-800 text-xs font-bold rounded-xl transition-all cursor-pointer inline-flex items-center justify-center gap-1"
                        >
                          <Clock className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Back to Today</span>
                        </button>
                      </div>

                      <button
                        onClick={handleNextDay}
                        disabled={uniqueRosterDates.indexOf(selectedTodayDate) === -1 || uniqueRosterDates.indexOf(selectedTodayDate) >= uniqueRosterDates.length - 1}
                        className="p-2.5 rounded-xl border border-gray-100 hover:bg-gray-50 disabled:opacity-40 transition-all cursor-pointer shrink-0"
                        title="Next Day in Roster"
                      >
                        <span className="text-gray-600 font-bold text-sm">▶</span>
                      </button>
                    </div>

                    {/* Summary Badges */}
                    <div className="flex flex-wrap gap-2">
                      <span className="px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-800 text-xs font-extrabold flex items-center gap-1.5 shadow-sm">
                        <User className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Active: {dailyEntries.filter(e => !['L', 'A*', 'SL', 'O'].includes(getShiftCode(e.shift))).length} Staff</span>
                      </span>
                      <span className="px-3 py-1.5 bg-amber-50 border border-amber-100 rounded-xl text-amber-800 text-xs font-extrabold flex items-center gap-1.5 shadow-sm">
                        <Sparkles className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                        <span>Emergency Coverage: {dailyEntries.filter(e => ['Aa', 'Ap', 'Ba', 'Bp', 'Ca', 'Cp'].includes(getShiftCode(e.shift))).length}</span>
                      </span>
                      <span className="px-3 py-1.5 bg-rose-50 border border-rose-100 rounded-xl text-rose-800 text-xs font-extrabold flex items-center gap-1.5 shadow-sm">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                        <span>Leave / OFF: {dailyEntries.filter(e => ['L', 'A*', 'SL', 'O'].includes(getShiftCode(e.shift))).length}</span>
                      </span>
                    </div>
                  </div>

                  {/* Empty State when no entries for selected date */}
                  {dailyEntries.length === 0 ? (
                    <div className="p-12 text-center text-gray-400 bg-white border border-dashed border-gray-150 rounded-2xl m-6">
                      <AlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                      <p className="text-sm font-bold text-gray-600">No shifts scheduled for {formatEntryDate(selectedTodayDate)}</p>
                      <p className="text-xs text-gray-400 mt-1 mb-4">Please select a different date from the calendar or roster archive dates.</p>
                      <div className="flex flex-wrap justify-center gap-1.5 max-w-xl mx-auto">
                        {uniqueRosterDates.slice(0, 15).map(date => (
                          <button
                            key={date}
                            onClick={() => setSelectedTodayDate(date)}
                            className="px-2.5 py-1 text-[11px] font-bold border border-gray-200 bg-white hover:bg-gray-50 rounded-lg transition-all cursor-pointer"
                          >
                            {formatEntryDate(date)}
                          </button>
                        ))}
                        {uniqueRosterDates.length > 15 && <span className="text-xs font-bold text-gray-400 self-center">...and {uniqueRosterDates.length - 15} more days</span>}
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 space-y-6">
                      {/* Emergency Coverage Grid (Morning, Evening, Night) */}
                      <div className="space-y-3">
                        <h3 className="text-xs font-extrabold text-amber-800 uppercase tracking-wider flex items-center gap-1.5 pl-1">
                          <span className="w-2 h-2 bg-amber-500 rounded-full animate-ping" />
                          <span>Emergency Coverage (Adult & Pediatric)</span>
                        </h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {/* Morning Emergency */}
                          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3">
                            <h4 className="text-[10px] font-black text-amber-700 bg-amber-50 px-2 py-1 rounded-lg border border-amber-100 w-max uppercase tracking-wider">
                              ☀ Morning Emergency
                            </h4>
                            {groupedDailyEntries.emergencyMorning.length === 0 ? (
                              <p className="text-xs text-gray-400 italic py-2">No emergency morning coverage</p>
                            ) : (
                              <div className="space-y-2">
                                {groupedDailyEntries.emergencyMorning.map(entry => (
                                  <div key={entry.pharmacistName} className="p-2.5 rounded-xl border border-gray-50 bg-gray-50/30 flex justify-between items-start gap-2">
                                    <div className="min-w-0">
                                      <p className="text-xs font-bold text-gray-900 truncate">{entry.pharmacistName}</p>
                                      <p className="text-[10px] text-gray-500 font-semibold mt-0.5">{entry.shift} • {entry.location}</p>
                                      {entry.notes && <p className="text-[9px] text-amber-700 italic mt-1 font-semibold">★ {entry.notes}</p>}
                                    </div>
                                    <span className="px-1.5 py-0.5 bg-amber-100 text-amber-850 border border-amber-200 text-[9px] font-black rounded-md uppercase shrink-0">
                                      {getShiftCode(entry.shift)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Evening Emergency */}
                          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3">
                            <h4 className="text-[10px] font-black text-indigo-750 bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-100 w-max uppercase tracking-wider">
                              🌆 Evening Emergency
                            </h4>
                            {groupedDailyEntries.emergencyEvening.length === 0 ? (
                              <p className="text-xs text-gray-400 italic py-2">No emergency evening coverage</p>
                            ) : (
                              <div className="space-y-2">
                                {groupedDailyEntries.emergencyEvening.map(entry => (
                                  <div key={entry.pharmacistName} className="p-2.5 rounded-xl border border-gray-50 bg-gray-50/30 flex justify-between items-start gap-2">
                                    <div className="min-w-0">
                                      <p className="text-xs font-bold text-gray-900 truncate">{entry.pharmacistName}</p>
                                      <p className="text-[10px] text-gray-500 font-semibold mt-0.5">{entry.shift} • {entry.location}</p>
                                      {entry.notes && <p className="text-[9px] text-indigo-700 italic mt-1 font-semibold">★ {entry.notes}</p>}
                                    </div>
                                    <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-850 border border-indigo-200 text-[9px] font-black rounded-md uppercase shrink-0">
                                      {getShiftCode(entry.shift)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Night Emergency */}
                          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3">
                            <h4 className="text-[10px] font-black text-violet-750 bg-violet-50 px-2 py-1 rounded-lg border border-violet-100 w-max uppercase tracking-wider">
                              🌙 Night Emergency
                            </h4>
                            {groupedDailyEntries.emergencyNight.length === 0 ? (
                              <p className="text-xs text-gray-400 italic py-2">No emergency night coverage</p>
                            ) : (
                              <div className="space-y-2">
                                {groupedDailyEntries.emergencyNight.map(entry => (
                                  <div key={entry.pharmacistName} className="p-2.5 rounded-xl border border-gray-50 bg-gray-50/30 flex justify-between items-start gap-2">
                                    <div className="min-w-0">
                                      <p className="text-xs font-bold text-gray-900 truncate">{entry.pharmacistName}</p>
                                      <p className="text-[10px] text-gray-500 font-semibold mt-0.5">{entry.shift} • {entry.location}</p>
                                      {entry.notes && <p className="text-[9px] text-violet-700 italic mt-1 font-semibold">★ {entry.notes}</p>}
                                    </div>
                                    <span className="px-1.5 py-0.5 bg-violet-100 text-violet-850 border border-violet-200 text-[9px] font-black rounded-md uppercase shrink-0">
                                      {getShiftCode(entry.shift)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Other Pharmacy Duties Grid */}
                      <div className="space-y-3">
                        <h3 className="text-xs font-extrabold text-teal-850 uppercase tracking-wider flex items-center gap-1.5 pl-1">
                          <MapPin className="w-4 h-4 text-teal-650" />
                          <span>Other Pharmacy Duties (OPD, Inpatient, IV, Prep)</span>
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {/* Routine Morning */}
                          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3">
                            <h4 className="text-[10px] font-black text-teal-700 bg-teal-50 px-2 py-1 rounded-lg border border-teal-100 w-max uppercase tracking-wider">
                              ☀ Morning Duties
                            </h4>
                            {groupedDailyEntries.otherMorning.length === 0 ? (
                              <p className="text-xs text-gray-400 italic py-2">No morning shifts scheduled</p>
                            ) : (
                              <div className="space-y-2">
                                {groupedDailyEntries.otherMorning.map(entry => (
                                  <div key={entry.pharmacistName} className="p-2.5 rounded-xl border border-gray-50 bg-gray-50/30 flex justify-between items-start gap-2">
                                    <div className="min-w-0">
                                      <p className="text-xs font-bold text-gray-900 truncate">{entry.pharmacistName}</p>
                                      <p className="text-[10px] text-gray-500 font-semibold mt-0.5">{entry.shift} • {entry.location}</p>
                                      {entry.notes && <p className="text-[9px] text-teal-700 italic mt-1 font-semibold">★ {entry.notes}</p>}
                                    </div>
                                    <span className="px-1.5 py-0.5 bg-teal-100 text-teal-850 border border-teal-200 text-[9px] font-black rounded-md uppercase shrink-0">
                                      {getShiftCode(entry.shift)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Routine Evening */}
                          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3">
                            <h4 className="text-[10px] font-black text-blue-750 bg-blue-50 px-2 py-1 rounded-lg border border-blue-100 w-max uppercase tracking-wider">
                              🌆 Evening Duties
                            </h4>
                            {groupedDailyEntries.otherEvening.length === 0 ? (
                              <p className="text-xs text-gray-400 italic py-2">No evening shifts scheduled</p>
                            ) : (
                              <div className="space-y-2">
                                {groupedDailyEntries.otherEvening.map(entry => (
                                  <div key={entry.pharmacistName} className="p-2.5 rounded-xl border border-gray-50 bg-gray-50/30 flex justify-between items-start gap-2">
                                    <div className="min-w-0">
                                      <p className="text-xs font-bold text-gray-900 truncate">{entry.pharmacistName}</p>
                                      <p className="text-[10px] text-gray-500 font-semibold mt-0.5">{entry.shift} • {entry.location}</p>
                                      {entry.notes && <p className="text-[9px] text-blue-700 italic mt-1 font-semibold">★ {entry.notes}</p>}
                                    </div>
                                    <span className="px-1.5 py-0.5 bg-blue-100 text-blue-850 border border-blue-200 text-[9px] font-black rounded-md uppercase shrink-0">
                                      {getShiftCode(entry.shift)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Routine Night */}
                          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3">
                            <h4 className="text-[10px] font-black text-purple-750 bg-purple-50 px-2 py-1 rounded-lg border border-purple-100 w-max uppercase tracking-wider">
                              🌙 Night Duties
                            </h4>
                            {groupedDailyEntries.otherNight.length === 0 ? (
                              <p className="text-xs text-gray-400 italic py-2">No night shifts scheduled</p>
                            ) : (
                              <div className="space-y-2">
                                {groupedDailyEntries.otherNight.map(entry => (
                                  <div key={entry.pharmacistName} className="p-2.5 rounded-xl border border-gray-50 bg-gray-50/30 flex justify-between items-start gap-2">
                                    <div className="min-w-0">
                                      <p className="text-xs font-bold text-gray-900 truncate">{entry.pharmacistName}</p>
                                      <p className="text-[10px] text-gray-500 font-semibold mt-0.5">{entry.shift} • {entry.location}</p>
                                      {entry.notes && <p className="text-[9px] text-purple-700 italic mt-1 font-semibold">★ {entry.notes}</p>}
                                    </div>
                                    <span className="px-1.5 py-0.5 bg-purple-100 text-purple-850 border border-purple-200 text-[9px] font-black rounded-md uppercase shrink-0">
                                      {getShiftCode(entry.shift)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Leaves & OFF Days */}
                      <div className="space-y-3">
                        <h3 className="text-xs font-extrabold text-rose-800 uppercase tracking-wider flex items-center gap-1.5 pl-1">
                          <AlertCircle className="w-4 h-4 text-rose-600" />
                          <span>On Leave / Off Duty</span>
                        </h3>
                        
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                          {groupedDailyEntries.away.length === 0 ? (
                            <p className="text-xs text-gray-400 italic py-2 pl-2">No personnel on leave or OFF today</p>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                              {groupedDailyEntries.away.map(entry => {
                                const code = getShiftCode(entry.shift);
                                const isOff = code === 'O';
                                return (
                                  <div key={entry.pharmacistName} className="p-2.5 rounded-xl border border-gray-100 bg-gray-50/20 flex justify-between items-center gap-2">
                                    <div className="min-w-0">
                                      <p className="text-xs font-bold text-gray-800 truncate">{entry.pharmacistName}</p>
                                      <p className="text-[9px] text-gray-400 font-bold tracking-wide mt-0.5">{entry.shift}</p>
                                    </div>
                                    <span className={`px-1.5 py-0.5 border text-[9px] font-black rounded-md uppercase shrink-0 ${
                                      isOff 
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                                        : 'bg-rose-50 text-rose-700 border-rose-100'
                                    }`}>
                                      {code}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>

                    </div>
                  )}
                </div>
              )}

              {viewMode === 'comparison' && (
                <div className="flex flex-col">
                  {/* Sub-tabs menu for 5 comparison tables */}
                  <div className="border-b border-gray-100 bg-gray-50/40 p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex flex-wrap gap-1">
                      {[
                        { id: 0, label: "Emergency Total" },
                        { id: 1, label: "Emergency by Shift" },
                        { id: 2, label: "By Location" },
                        { id: 3, label: "By Time" },
                        { id: 4, label: "Leaves & Offs" }
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          onClick={() => setSelectedComparisonTable(tab.id)}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer border ${
                            selectedComparisonTable === tab.id
                              ? 'bg-emerald-900 border-emerald-900 text-white shadow-sm'
                              : 'bg-white border-gray-200 text-gray-600 hover:text-gray-900 hover:border-gray-300'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    <div className="relative w-full md:w-72">
                      <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Filter staff by name..."
                        value={comparisonSearchQuery}
                        onChange={(e) => setComparisonSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  {/* Rendering the active computed table */}
                  <div className="overflow-x-auto">
                    {(() => {
                      const stats = computeStats(currentRoster.entries);
                      const filteredStats = stats.filter(s => s.name.toLowerCase().includes(comparisonSearchQuery.toLowerCase()));

                      if (filteredStats.length === 0) {
                        return (
                          <div className="py-12 text-center text-gray-400">
                            <AlertCircle className="w-6 h-6 mx-auto mb-2 text-gray-300" />
                            <p className="text-xs font-bold text-gray-500 mb-2">No pharmacists match "{comparisonSearchQuery}".</p>
                            <button
                              onClick={() => setComparisonSearchQuery('')}
                              className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-850 text-xs font-bold rounded-xl border border-emerald-100 transition-all cursor-pointer inline-flex items-center gap-1.5"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>Clear Search</span>
                            </button>
                          </div>
                        );
                      }

                      if (selectedComparisonTable === 0) {
                        return (
                          <table className="w-full text-left border-collapse min-w-[500px]">
                            <thead>
                              <tr className="bg-gray-50 border-b border-gray-100">
                                <th className="px-6 py-4 text-xs font-extrabold text-gray-500 uppercase tracking-wider">Staff Name</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-gray-500 uppercase tracking-wider text-right">Emergency Pharmacy (Adult + Pediatric) Shifts</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-sm">
                              {filteredStats.map((ph, idx) => (
                                <tr key={ph.name} className="hover:bg-gray-50/50 transition-all">
                                  <td className="px-6 py-3.5 font-bold text-gray-900">{ph.name}</td>
                                  <td className="px-6 py-3.5 text-right font-black text-emerald-800 text-base">
                                    <span className="bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100">
                                      {ph.emergencyTotal}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        );
                      }

                      if (selectedComparisonTable === 1) {
                        return (
                          <table className="w-full text-left border-collapse min-w-[600px]">
                            <thead>
                              <tr className="bg-gray-50 border-b border-gray-100">
                                <th className="px-6 py-4 text-xs font-extrabold text-gray-500 uppercase tracking-wider">Staff Name</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-gray-500 uppercase tracking-wider text-center">Emergency Morning Shifts</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-gray-500 uppercase tracking-wider text-center">Emergency Evening Shifts</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-gray-500 uppercase tracking-wider text-center">Emergency Night Shifts</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-sm">
                              {filteredStats.map((ph) => (
                                <tr key={ph.name} className="hover:bg-gray-50/50 transition-all">
                                  <td className="px-6 py-3.5 font-bold text-gray-900">{ph.name}</td>
                                  <td className="px-6 py-3.5 text-center font-bold text-amber-700">{ph.emergencyMorning}</td>
                                  <td className="px-6 py-3.5 text-center font-bold text-indigo-700">{ph.emergencyEvening}</td>
                                  <td className="px-6 py-3.5 text-center font-bold text-violet-700">{ph.emergencyNight}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        );
                      }

                      if (selectedComparisonTable === 2) {
                        return (
                          <table className="w-full text-left border-collapse min-w-[600px]">
                            <thead>
                              <tr className="bg-gray-50 border-b border-gray-100">
                                <th className="px-6 py-4 text-xs font-extrabold text-gray-500 uppercase tracking-wider">Staff Name</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-gray-500 uppercase tracking-wider text-center">Adult</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-gray-500 uppercase tracking-wider text-center">Pediatric</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-gray-500 uppercase tracking-wider text-center">OPD</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-gray-500 uppercase tracking-wider text-center">Inpatient</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-sm">
                              {filteredStats.map((ph) => (
                                <tr key={ph.name} className="hover:bg-gray-50/50 transition-all">
                                  <td className="px-6 py-3.5 font-bold text-gray-900">{ph.name}</td>
                                  <td className="px-6 py-3.5 text-center font-semibold text-gray-700">{ph.locationAdult}</td>
                                  <td className="px-6 py-3.5 text-center font-semibold text-gray-700">{ph.locationPediatric}</td>
                                  <td className="px-6 py-3.5 text-center font-semibold text-gray-700">{ph.locationOPD}</td>
                                  <td className="px-6 py-3.5 text-center font-semibold text-gray-700">{ph.locationInpatient}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        );
                      }

                      if (selectedComparisonTable === 3) {
                        return (
                          <table className="w-full text-left border-collapse min-w-[600px]">
                            <thead>
                              <tr className="bg-gray-50 border-b border-gray-100">
                                <th className="px-6 py-4 text-xs font-extrabold text-gray-500 uppercase tracking-wider">Staff Name</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-gray-500 uppercase tracking-wider text-center">Morning</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-gray-500 uppercase tracking-wider text-center">Evening</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-gray-500 uppercase tracking-wider text-center">Night</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-sm">
                              {filteredStats.map((ph) => (
                                <tr key={ph.name} className="hover:bg-gray-50/50 transition-all">
                                  <td className="px-6 py-3.5 font-bold text-gray-900">{ph.name}</td>
                                  <td className="px-6 py-3.5 text-center font-semibold text-amber-700">{ph.timeMorning}</td>
                                  <td className="px-6 py-3.5 text-center font-semibold text-indigo-700">{ph.timeEvening}</td>
                                  <td className="px-6 py-3.5 text-center font-semibold text-violet-700">{ph.timeNight}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        );
                      }

                      if (selectedComparisonTable === 4) {
                        return (
                          <table className="w-full text-left border-collapse min-w-[600px]">
                            <thead>
                              <tr className="bg-gray-50 border-b border-gray-100">
                                <th className="px-6 py-4 text-xs font-extrabold text-gray-500 uppercase tracking-wider">Staff Name</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-gray-500 uppercase tracking-wider text-center">Annual Leave (L)</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-gray-500 uppercase tracking-wider text-center">Casual Leave (A*)</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-gray-500 uppercase tracking-wider text-center">Sick Leave (SL)</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-gray-500 uppercase tracking-wider text-center">Off Days (O)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-sm">
                              {filteredStats.map((ph) => (
                                <tr key={ph.name} className="hover:bg-gray-50/50 transition-all">
                                  <td className="px-6 py-3.5 font-bold text-gray-900">{ph.name}</td>
                                  <td className="px-6 py-3.5 text-center font-medium text-rose-700">{ph.leaveAnnual || '-'}</td>
                                  <td className="px-6 py-3.5 text-center font-medium text-orange-700">{ph.leaveCasual || '-'}</td>
                                  <td className="px-6 py-3.5 text-center font-medium text-red-700">{ph.leaveSick || '-'}</td>
                                  <td className="px-6 py-3.5 text-center font-medium text-emerald-700">{ph.offDays || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        );
                      }

                      return null;
                    })()}
                  </div>
                </div>
              )}

            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-12 text-center flex flex-col items-center justify-center min-h-[400px]">
              <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 mb-4">
                <CalendarDays className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-gray-900">No Roster Selected</h3>
              <p className="text-xs text-gray-400 mt-1 max-w-sm">
                Drag and drop your Monthly Pharmacists Duty Roster PDF or select a previously uploaded month from the Archive index to display work assignments.
              </p>
            </div>
          )}

        </div>
      </div>

      {/* 2. Admin Password confirmation for deleting roster */}
      <AnimatePresence>
        {isDeleteModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl border border-gray-100"
            >
              <h3 className="text-lg font-black text-gray-900 mb-2">Delete Duty Roster</h3>
              <p className="text-xs text-gray-500 mb-6">
                You are about to delete this duty roster permanently. This action is irreversible. Please enter the administrator password to authorize.
              </p>

              <div className="mb-4">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                  Admin Password
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-emerald-600 shadow-inner"
                />
              </div>

              {deleteError && (
                <div className="p-3 bg-red-50 rounded-xl border border-red-100 flex items-center gap-2 text-xs font-bold text-red-700 mb-4">
                  <AlertCircle className="w-4 h-4 text-red-600" />
                  <span>{deleteError}</span>
                </div>
              )}

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold border border-gray-200 hover:border-gray-300 hover:bg-gray-50 bg-white transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-xl text-xs font-bold text-white shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Deleting...' : 'Authorize Deletion'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reset Archive Password confirmation */}
      <AnimatePresence>
        {isResetModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl border border-gray-100"
            >
              <h3 className="text-lg font-black text-gray-900 mb-2">Reset Roster Archive</h3>
              <p className="text-xs text-gray-500 mb-6">
                You are about to completely wipe the entire Duty Roster Archive. All saved months will be deleted permanently. This action is irreversible. Please enter the administrator password to authorize.
              </p>

              <div className="mb-4">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                  Admin Password
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={resetAdminPassword}
                  onChange={(e) => setResetAdminPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-emerald-600 shadow-inner"
                />
              </div>

              {resetError && (
                <div className="p-3 bg-red-50 rounded-xl border border-red-100 flex items-center gap-2 text-xs font-bold text-red-700 mb-4">
                  <AlertCircle className="w-4 h-4 text-red-600" />
                  <span>{resetError}</span>
                </div>
              )}

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setIsResetModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold border border-gray-200 hover:border-gray-300 hover:bg-gray-50 bg-white transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleResetArchive}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-xl text-xs font-bold text-white shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
                  disabled={isResetting}
                >
                  {isResetting ? 'Resetting...' : 'Authorize Reset'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
