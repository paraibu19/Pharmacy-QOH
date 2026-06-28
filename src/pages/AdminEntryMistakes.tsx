import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  AlertCircle, 
  Upload, 
  Trash2, 
  Download, 
  FileSpreadsheet, 
  Send, 
  CheckCircle2, 
  Users, 
  MapPin, 
  FileWarning, 
  Search, 
  RefreshCw, 
  AlertTriangle,
  User,
  ExternalLink,
  MessageCircle,
  HelpCircle,
  X,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMedications } from '../hooks/useMedications';
import { Medication } from '../types';
import { sessionStorage } from '../lib/storage';
import { db } from '../lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';

// Types representing the database schema
interface ParameterRow {
  pharmacyLocation: string;
  itemNumber: string;
  labelDescription: string;
  allowedQuantities: string[]; // values from Column D:Z
}

interface PharmacistRow {
  name: string;
  whatsappNumber: string;
}

interface ParameterDb {
  configured: boolean;
  lastUpdated?: string;
  parameters: ParameterRow[];
  pharmacists: PharmacistRow[];
}

interface WorkloadRecord {
  id: string;
  actionDateTime: string;
  mrnOrganization: string;
  personNameFull: string;
  sex: string;
  nationality: string;
  pharmacyLocation: string;
  actionType: string;
  itemNumber: string;
  labelDescription: string;
  dispenseQuantity: string;
  actionPersonnelPharmacy: string;
  
  // Evaluation outcomes
  reasons: string[];
  isMismatch: boolean;
  dismissedBrandVsGeneric?: boolean;
}

function formatActionDateTime(val: any): string {
  if (!val) return 'N/A';
  
  let date: Date;

  if (val instanceof Date) {
    date = val;
  } else if (typeof val === 'number') {
    // If it's a number, treat as Excel serial date (days since Jan 1 1900)
    const ms = (val - 25569) * 86400 * 1000;
    date = new Date(ms);
  } else {
    const strVal = String(val).trim();
    if (!strVal || strVal.toLowerCase() === 'n/a') return 'N/A';
    
    // Check if it's purely a numeric string representing an Excel serial date
    if (/^\d+(\.\d+)?$/.test(strVal)) {
      const ms = (parseFloat(strVal) - 25569) * 86400 * 1000;
      date = new Date(ms);
    } else {
      // Try parsing standard Date formats in JS
      date = new Date(strVal);
      
      // Fallback parsing for typical dd/mm/yyyy hh:mm or mm/dd/yyyy hh:mm formats
      if (isNaN(date.getTime())) {
        const slashParts = strVal.split(/[\/\-\s:]+/);
        if (slashParts.length >= 5) {
          const p1 = parseInt(slashParts[0], 10);
          const p2 = parseInt(slashParts[1], 10);
          const p3 = parseInt(slashParts[2], 10);
          const hr = parseInt(slashParts[3], 10);
          const min = parseInt(slashParts[4], 10);
          const sec = slashParts[5] ? parseInt(slashParts[5], 10) : 0;
          
          if (p3 > 1000) {
            if (p1 > 12) {
              date = new Date(p3, p2 - 1, p1, hr, min, sec);
            } else {
              date = new Date(p3, p1 - 1, p2, hr, min, sec);
            }
          }
        }
      }
    }
  }

  if (isNaN(date.getTime())) {
    return String(val);
  }

  // Format to dd-mm-yyyy hh:mm AM/PM
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  const hoursStr = String(hours).padStart(2, '0');

  return `${day}-${month}-${year} ${hoursStr}:${minutes} ${ampm}`;
}

const isNonQatariBrandMistake = (
  rec: WorkloadRecord, 
  medicationsList: Medication[],
  locationMatcher: (loc1: string, loc2: string) => boolean
): { isMistake: boolean; details: string; targetGenericCode?: string; targetGenericName?: string } => {
  // 1. Check if patient is Non-Qatari
  const nationalityLower = (rec.nationality || '').toLowerCase().trim();
  
  // Explicit check: Is this nationality explicitly Non-Qatari?
  const isNonQatariExplicit = 
    nationalityLower.includes('non') || 
    nationalityLower.includes('not') || 
    nationalityLower.includes('no ') || 
    nationalityLower.includes('no-') || 
    nationalityLower.includes('غير') || 
    nationalityLower.includes('ليس');

  // A patient is considered Qatari if and only if their nationality value contains Qatari keywords and doesn't explicitly start with / contain non- / not-
  const isQatari = !isNonQatariExplicit && (
    nationalityLower.includes('qatari') || 
    nationalityLower.includes('qatar') || 
    nationalityLower.includes('qat') || 
    nationalityLower === 'qa' || 
    nationalityLower.includes('قطر')
  );

  if (isQatari) {
    return { isMistake: false, details: '' };
  }

  // 2. Check if the dispensed item is a Brand Item
  const itemNoClean = (rec.itemNumber || '').toLowerCase().trim();
  if (!itemNoClean) {
    return { isMistake: false, details: '' };
  }

  // Find the medication in our inventory that matches this itemCode and the action's location
  const matchingMed = medicationsList.find(m => 
    m.itemCode.toLowerCase().trim() === itemNoClean && 
    locationMatcher(m.locationId, rec.pharmacyLocation)
  );

  if (!matchingMed) {
    return { isMistake: false, details: '' };
  }

  // Check if it's explicitly brand
  const isBrand = matchingMed.generic && matchingMed.generic.toLowerCase().includes('brand');
  if (!isBrand) {
    return { isMistake: false, details: '' };
  }

  // 3. Check if there are any connected/associated Generic items that are in stock (QOH > 0)
  // We check for bidirectional connections (either direct "Brand links to Generic" or inverse "Generic links to Brand").
  const matchingMedCode = matchingMed.itemCode.trim().toLowerCase();
  const brandLinkedCodes = matchingMed.to 
    ? matchingMed.to.split(/[\s,;]+/).filter(Boolean).map(c => c.trim().toLowerCase()) 
    : [];

  const inStockGenericMed = medicationsList.find(m => {
    const mCode = m.itemCode.trim().toLowerCase();

    // Prevent self-matching
    if (mCode === matchingMedCode) return false;

    // Must be in stock at the SAME pharmacy location
    if (m.qoh <= 0) return false;
    if (!locationMatcher(m.locationId, rec.pharmacyLocation)) return false;

    // Must be classified as a Generic item (either says "generic", or is NOT "brand")
    const isMGeneric = (m.generic && m.generic.toLowerCase().includes('generic')) || 
                        (!m.generic || !m.generic.toLowerCase().includes('brand'));
    if (!isMGeneric) return false;

    // Direct path check: Is generic code listed in brand's 'to' field?
    if (brandLinkedCodes.includes(mCode)) {
      return true;
    }

    // Inverse path check: Is brand code listed in generic's 'to' field?
    const genericLinkedCodes = m.to
      ? m.to.split(/[\s,;]+/).filter(Boolean).map(c => c.trim().toLowerCase())
      : [];
    if (genericLinkedCodes.includes(matchingMedCode)) {
      return true;
    }

    return false;
  });

  if (!inStockGenericMed) {
    return { isMistake: false, details: '' };
  }

  return {
    isMistake: true,
    details: `Dispensed Brand (${matchingMed.itemCode} - ${matchingMed.itemName}) for Non-Qatari while Generic (${inStockGenericMed.itemCode} - ${inStockGenericMed.itemName}) is IN STOCK (QOH: ${inStockGenericMed.qoh})`,
    targetGenericCode: inStockGenericMed.itemCode,
    targetGenericName: inStockGenericMed.itemName
  };
};

export default function AdminEntryMistakes() {
  const { medications } = useMedications();
  const [activeReportType, setActiveReportType] = useState<'standard' | 'brand-vs-generic'>(() => {
    try {
      const saved = sessionStorage.getItem('daily_workload_report_type');
      return (saved === 'brand-vs-generic' || saved === 'standard') ? saved : 'standard';
    } catch {
      return 'standard';
    }
  });

  const [dbState, setDbState] = useState<ParameterDb>({
    configured: false,
    parameters: [],
    pharmacists: []
  });
  const [dbLoading, setDbLoading] = useState(true);
  const [isDraggingDb, setIsDraggingDb] = useState(false);
  const [isDraggingWorkload, setIsDraggingWorkload] = useState(false);
  const [workloadLoading, setWorkloadLoading] = useState(false);
  const [workloadRecords, setWorkloadRecords] = useState<WorkloadRecord[]>(() => {
    try {
      const saved = sessionStorage.getItem('daily_workload_records');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [workloadUploaded, setWorkloadUploaded] = useState(() => {
    try {
      const saved = sessionStorage.getItem('daily_workload_uploaded');
      return saved === 'true';
    } catch {
      return false;
    }
  });
  
  // Custom dialog modals to bypass iframe popup blocking
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [whatsappPromptInfo, setWhatsappPromptInfo] = useState<{ pharmacistName: string; mistakes: WorkloadRecord[] } | null>(null);
  const [customPhoneInput, setCustomPhoneInput] = useState('');

  // Application Storage states
  const [savedStorageItems, setSavedStorageItems] = useState<any[]>([]);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordTargetItem, setPasswordTargetItem] = useState<any | null>(null);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isDeletingFromStorage, setIsDeletingFromStorage] = useState(false);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReason, setSelectedReason] = useState('all');
  const [selectedLocation, setSelectedLocation] = useState('all');
  const [selectedPharmacist, setSelectedPharmacist] = useState('all');

  // Pagination states to prevent DOM rendering blockage "hanging" during search queries
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 30;

  const fileInputDbRef = useRef<HTMLInputElement>(null);
  const fileInputWorkloadRef = useRef<HTMLInputElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const scrollTable = (direction: 'left' | 'right') => {
    if (tableContainerRef.current) {
      const scrollAmount = 350;
      tableContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  // Handler to delete a specific mismatch reason one by one
  const handleDeleteReason = (recordId: string, reasonToDelete: string) => {
    setWorkloadRecords(prev => 
      prev.map(rec => {
        if (rec.id === recordId) {
          const updatedReasons = rec.reasons.filter(r => r !== reasonToDelete);
          const isBrandVsGen = activeReportType === 'brand-vs-generic';
          return {
            ...rec,
            reasons: updatedReasons,
            isMismatch: updatedReasons.length > 0,
            dismissedBrandVsGeneric: isBrandVsGen ? true : rec.dismissedBrandVsGeneric
          };
        }
        return rec;
      })
    );
  };

  // Keep workload records in sync with sessionStorage to persist across page transitions
  useEffect(() => {
    try {
      sessionStorage.setItem('daily_workload_records', JSON.stringify(workloadRecords));
      sessionStorage.setItem('daily_workload_uploaded', workloadUploaded ? 'true' : 'false');
      sessionStorage.setItem('daily_workload_report_type', activeReportType);
    } catch (e) {
      console.warn('Failed to sync workload with sessionStorage:', e);
    }
  }, [workloadRecords, workloadUploaded, activeReportType]);

  const resetWorkload = () => {
    setWorkloadRecords([]);
    setWorkloadUploaded(false);
    try {
      sessionStorage.removeItem('daily_workload_records');
      sessionStorage.removeItem('daily_workload_uploaded');
    } catch (e) {
      console.warn('Failed to clear workload from sessionStorage:', e);
    }
  };

  // Fetch configured parameters database on load
  useEffect(() => {
    fetchDb();
    
    let unsubscribe: (() => void) | undefined = undefined;

    if (db) {
      try {
        const colRef = collection(db, 'application_storage');
        unsubscribe = onSnapshot(colRef, (snapshot) => {
          const loaded: any[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            loaded.push({
              id: doc.id,
              actionDateTime: data.actionDateTime || '',
              mrnOrganization: data.mrnOrganization || '',
              personNameFull: data.personNameFull || '',
              sex: data.sex || '',
              nationality: data.nationality || '',
              pharmacyLocation: data.pharmacyLocation || '',
              actionType: data.actionType || '',
              itemNumber: data.itemNumber || '',
              labelDescription: data.labelDescription || '',
              dispenseQuantity: data.dispenseQuantity || '',
              actionPersonnelPharmacy: data.actionPersonnelPharmacy || '',
              reasons: data.reasons || [],
              savedAt: data.savedAt || ''
            });
          });
          // Sort items by savedAt descending
          loaded.sort((a, b) => new Date(b.savedAt || 0).getTime() - new Date(a.savedAt || 0).getTime());
          setSavedStorageItems(loaded);
        }, (error) => {
          console.warn("Firestore onSnapshot error on application_storage mapping:", error);
          fetchSavedStorageItems();
        });
      } catch (err) {
        console.warn("Firestore subscription failed in AdminEntryMistakes, fallback:", err);
        fetchSavedStorageItems();
      }
    } else {
      fetchSavedStorageItems();
      const handleSyncUpdate = (e: Event) => {
        const customEvent = e as CustomEvent;
        if (customEvent.detail) {
          if (customEvent.detail.type === 'application-storage') {
            if (customEvent.detail.data) {
              const data = customEvent.detail.data;
              const loaded: any[] = data.map((d: any) => ({
                id: d.id,
                actionDateTime: d.actionDateTime || '',
                mrnOrganization: d.mrnOrganization || '',
                personNameFull: d.personNameFull || '',
                sex: d.sex || '',
                nationality: d.nationality || '',
                pharmacyLocation: d.pharmacyLocation || '',
                actionType: d.actionType || '',
                itemNumber: d.itemNumber || '',
                labelDescription: d.labelDescription || '',
                dispenseQuantity: d.dispenseQuantity || '',
                actionPersonnelPharmacy: d.actionPersonnelPharmacy || '',
                reasons: d.reasons || [],
                savedAt: d.savedAt || ''
              }));
              loaded.sort((a, b) => new Date(b.savedAt || 0).getTime() - new Date(a.savedAt || 0).getTime());
              setSavedStorageItems(loaded);
            } else {
              fetchSavedStorageItems();
            }
          } else if (customEvent.detail.type === 'entry-mistakes') {
            if (customEvent.detail.data) {
              setDbState(customEvent.detail.data);
            } else {
              fetchDb();
            }
          }
        }
      };
      window.addEventListener('sync-update', handleSyncUpdate);
      return () => {
        window.removeEventListener('sync-update', handleSyncUpdate);
      };
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  const fetchSavedStorageItems = async () => {
    try {
      const res = await fetch('/api/application-storage');
      if (res.ok) {
        const data = await res.json();
        setSavedStorageItems(data);
      }
    } catch (err) {
      console.error('Failed to load application storage data:', err);
    }
  };

  const handleSaveToStorage = async (record: WorkloadRecord) => {
    try {
      const res = await fetch('/api/application-storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record)
      });
      if (res.ok) {
        fetchSavedStorageItems();
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to save to Application Storage');
      }
    } catch (err) {
      console.error('Network error saving to storage:', err);
    }
  };

  const handleDeleteFromStorage = async () => {
    if (!passwordTargetItem) return;
    setIsDeletingFromStorage(true);
    setPasswordError('');
    try {
      const res = await fetch('/api/application-storage/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: passwordTargetItem.id,
          mrnOrganization: passwordTargetItem.mrnOrganization,
          actionDateTime: passwordTargetItem.actionDateTime,
          itemNumber: passwordTargetItem.itemNumber,
          adminPassword: adminPasswordInput
        })
      });
      
      const data = await res.json();
      if (res.ok && data.success) {
        setPasswordModalOpen(false);
        setPasswordTargetItem(null);
        setAdminPasswordInput('');
        fetchSavedStorageItems();
      } else {
        setPasswordError(data.error || 'Incorrect admin password. Action unauthorized.');
      }
    } catch (err) {
      console.error('Network error deleting from storage:', err);
      setPasswordError('Network request failed. Please try again.');
    } finally {
      setIsDeletingFromStorage(false);
    }
  };

  const fetchDb = async () => {
    setDbLoading(true);
    try {
      const res = await fetch('/api/entry-mistakes/db');
      if (res.ok) {
        const data = await res.json();
        setDbState(data);
      }
    } catch (err) {
      console.error('Failed to load database parameters:', err);
    } finally {
      setDbLoading(false);
    }
  };

  const deleteDb = () => {
    setAdminPasswordInput('');
    setPasswordError('');
    setShowDeleteConfirm(true);
  };

  const confirmDeleteDb = async () => {
    setPasswordError('');
    try {
      const res = await fetch('/api/entry-mistakes/db', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': adminPasswordInput
        },
        body: JSON.stringify({ adminPassword: adminPasswordInput })
      });
      const data = await res.json();
      if (res.ok) {
        setDbState({ configured: false, parameters: [], pharmacists: [] });
        setWorkloadRecords([]);
        setWorkloadUploaded(false);
        setShowDeleteConfirm(false);
        setAdminPasswordInput('');
        setPasswordError('');
      } else {
        setPasswordError(data.error || 'Incorrect admin password. Action unauthorized.');
      }
    } catch (err) {
      console.error('Failed to delete database parameters:', err);
      setPasswordError('Network request failed. Please try again.');
    }
  };

  // Drag and drop handlers for DB parameters file
  const handleDragOverDb = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingDb(true);
  };

  const handleDragLeaveDb = () => {
    setIsDraggingDb(false);
  };

  const handleDropDb = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingDb(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      parseAndSaveDbFile(files[0]);
    }
  };

  const handleFileChangeDb = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      parseAndSaveDbFile(files[0]);
    }
  };

  // Drag and drop handlers for Workload file
  const handleDragOverWorkload = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingWorkload(true);
  };

  const handleDragLeaveWorkload = () => {
    setIsDraggingWorkload(false);
  };

  const handleDropWorkload = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingWorkload(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      parseAndProcessWorkload(files[0]);
    }
  };

  const handleFileChangeWorkload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      parseAndProcessWorkload(files[0]);
    }
  };

  // Parses parameters file (Parameters + Pharmacists list)
  const parseAndSaveDbFile = (file: File) => {
    setDbLoading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const ab = e.target?.result;
        const wb = XLSX.read(ab, { type: 'array' });
        
        // Find "Parameter" sheet
        const paramSheetName = wb.SheetNames.find(n => n.trim().toLowerCase() === 'parameter');
        // Find "Pharmacist List" sheet
        const pharmacistSheetName = wb.SheetNames.find(n => n.trim().toLowerCase() === 'pharmacist list');

        if (!paramSheetName) {
          throw new Error('Could not find worksheet named "Parameter" in the uploaded file.');
        }

        const paramSheet = wb.Sheets[paramSheetName];
        const paramRowsRaw = XLSX.utils.sheet_to_json(paramSheet, { header: 1 }) as any[];

        if (paramRowsRaw.length <= 1) {
          throw new Error('The "Parameter" sheet does not contain enough data.');
        }

        // Process Parameter Sheet (Using positional index header:1 to be immune to header changes)
        // Column A: Pharmacy Location, Column B: Item Number, Column C: Label Description, Column D-Z: Quantities
        const parsedParameters: ParameterRow[] = [];
        for (let i = 1; i < paramRowsRaw.length; i++) {
          const row = paramRowsRaw[i];
          if (!row || row.length === 0) continue;

          const pharmacyLocationStr = String(row[0] || '').trim();
          const itemNumberStr = String(row[1] || '').trim();
          const labelDescriptionStr = String(row[2] || '').trim();

          // Skip if missing primary identifiers
          if (!itemNumberStr && !pharmacyLocationStr) continue;

          // Parse allowed quantities in D:Z (index 3 onwards)
          const allowed: string[] = [];
          for (let j = 3; j < row.length; j++) {
            const cellVal = row[j];
            if (cellVal !== undefined && cellVal !== null && String(cellVal).trim() !== '') {
              allowed.push(String(cellVal).trim());
            }
          }

          parsedParameters.push({
            pharmacyLocation: pharmacyLocationStr,
            itemNumber: itemNumberStr,
            labelDescription: labelDescriptionStr,
            allowedQuantities: allowed
          });
        }

        // Process Pharmacist List Sheet (IfExists)
        const parsedPharmacists: PharmacistRow[] = [];
        if (pharmacistSheetName) {
          const pharmacistSheet = wb.Sheets[pharmacistSheetName];
          const pharmacistRowsRaw = XLSX.utils.sheet_to_json(pharmacistSheet, { header: 1 }) as any[];
          for (let i = 1; i < pharmacistRowsRaw.length; i++) {
            const row = pharmacistRowsRaw[i];
            if (!row || row.length === 0) continue;
            
            const nameStr = String(row[0] || '').trim();
            const whatsappStr = String(row[1] || '').trim();

            if (nameStr) {
              parsedPharmacists.push({
                name: nameStr,
                whatsappNumber: whatsappStr
              });
            }
          }
        }

        // Save to backend database
        const res = await fetch('/api/entry-mistakes/db', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            parameters: parsedParameters,
            pharmacists: parsedPharmacists
          })
        });

        if (res.ok) {
          const resData = await res.json();
          setDbState(resData.dbState);
        } else {
          throw new Error('Backend failed to persist database parameters.');
        }

      } catch (err: any) {
        alert(`Error parsing Excel: ${err.message}`);
      } finally {
        setDbLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Helper fuzzy matcher for workload keys to support minor layout modifications in HBKMC reports
  const extractFuzzyValue = (row: any, candidates: string[]): string => {
    // Exact match first
    for (const cand of candidates) {
      if (row[cand] !== undefined && row[cand] !== null) {
        return String(row[cand]).trim();
      }
    }
    // Case-insensitive alphanumeric normalize match
    const keys = Object.keys(row);
    for (const cand of candidates) {
      const normCand = cand.toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const k of keys) {
        const normK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (normK === normCand) {
          return String(row[k]).trim();
        }
      }
    }
    // Partial substring match
    for (const cand of candidates) {
      const normCand = cand.toLowerCase();
      for (const k of keys) {
        const normK = k.toLowerCase();
        if (normK.includes(normCand) || normCand.includes(normK)) {
          return String(row[k]).trim();
        }
      }
    }
    return '';
  };

  // Strict case and space insensitive match for filtering by user selected location filter
  const isFilterLocationMatches = (recLoc: string, selectedLoc: string): boolean => {
    if (!selectedLoc || selectedLoc === 'all') return true;
    const cleanRec = (recLoc || '').toLowerCase().replace(/[\u00A0\s]+/g, ' ').trim();
    const cleanSel = (selectedLoc || '').toLowerCase().replace(/[\u00A0\s]+/g, ' ').trim();
    return cleanRec === cleanSel;
  };

  // Matches item configurations by location
  const isLocationMatches = (loc1: string, loc2: string): boolean => {
    const clean1 = (loc1 || '').toLowerCase().replace(/[\u00A0\s]+/g, ' ').trim();
    const clean2 = (loc2 || '').toLowerCase().replace(/[\u00A0\s]+/g, ' ').trim();
    if (!clean1 || !clean2) return false;

    // Direct comparison
    if (clean1 === clean2) return true;

    const stripChars = (val: string) => val.replace(/[^a-z0-9]/g, '');
    const stripped1 = stripChars(clean1);
    const stripped2 = stripChars(clean2);

    // Direct match or exact substring matches of alphanumeric characters
    if (stripped1 === stripped2 || stripped1.includes(stripped2) || stripped2.includes(stripped1)) {
      return true;
    }

    // Standard group resolution mapping to support matching database location keys to daily report location strings
    const resolveGroup = (val: string): string => {
      const cleanVal = val.toLowerCase().trim();
      
      // 1. Pediatric Check
      if (
        cleanVal.includes('pediatric') || 
        cleanVal.includes('ped') || 
        cleanVal.includes('peds') || 
        cleanVal.includes('child') || 
        cleanVal.includes('kids') ||
        cleanVal.includes('infant')
      ) {
        return 'pediatric';
      }
      
      // 2. Mesaieed Check
      if (
        cleanVal.includes('mesaieed') || 
        cleanVal.includes('mesai') || 
        cleanVal.includes('msd') || 
        cleanVal.includes('mes')
      ) {
        return 'mesaieed';
      }
      
      // 3. Adult / Emergency / A&E / General Check
      if (
        cleanVal.includes('adult') || 
        cleanVal.includes('emergency') || 
        cleanVal.includes('male') || 
        cleanVal.includes('main') || 
        cleanVal.includes('ip') || 
        cleanVal.includes('opd') ||
        cleanVal.includes('a&e') ||
        cleanVal.includes('a/e') ||
        cleanVal.includes('a & e') ||
        cleanVal.includes('a and e') ||
        cleanVal.includes('ae') ||
        cleanVal.includes('er') ||
        cleanVal.includes('acc') ||
        cleanVal.includes('trauma') ||
        cleanVal.includes('general') ||
        cleanVal.includes('casualty')
      ) {
        return 'adult';
      }
      
      return cleanVal;
    };

    return resolveGroup(clean1) === resolveGroup(clean2);
  };

  // Parses sheet dynamically by locating the correct row containing header labels
  const parseSheetWithDynamicHeader = (ws: XLSX.WorkSheet): any[] => {
    const wsRows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
    if (wsRows.length === 0) return [];

    // Common header keywords we expect
    const headerKeywords = [
      'item number',
      'item code',
      'dispense quantity',
      'dispensed quantity',
      'qty',
      'person name',
      'patient name',
      'mrn',
      'pharmacy location',
      'action personnel',
      'action date'
    ];

    let headerIndex = -1;
    let maxMatchedKeywords = 0;

    // Scan the first 25 rows to locate the header row
    for (let i = 0; i < Math.min(wsRows.length, 25); i++) {
      const row = wsRows[i];
      if (!row || !Array.isArray(row)) continue;

      let matchCount = 0;
      for (const cell of row) {
        if (cell !== undefined && cell !== null) {
          const cellStr = String(cell).toLowerCase().trim();
          if (headerKeywords.some(keyword => cellStr.includes(keyword))) {
            matchCount++;
          }
        }
      }

      if (matchCount > maxMatchedKeywords && matchCount >= 2) {
        maxMatchedKeywords = matchCount;
        headerIndex = i;
      }
    }

    // Default to first non-empty row if no header matches
    if (headerIndex === -1) {
      for (let i = 0; i < wsRows.length; i++) {
        const row = wsRows[i];
        if (row && row.some(cell => cell !== undefined && cell !== null && String(cell).trim() !== '')) {
          headerIndex = i;
          break;
        }
      }
    }

    if (headerIndex === -1) return [];

    const headers = wsRows[headerIndex].map(h => (h !== undefined && h !== null) ? String(h).trim() : '');
    const dataRows: any[] = [];

    for (let i = headerIndex + 1; i < wsRows.length; i++) {
      const row = wsRows[i];
      if (!row || row.length === 0) continue;

      const hasData = row.some(cell => cell !== undefined && cell !== null && String(cell).trim() !== '');
      if (!hasData) continue;

      const rowObj: any = {};
      headers.forEach((header, colIdx) => {
        if (header) {
          rowObj[header] = row[colIdx];
        } else {
          rowObj[`__EMPTY_${colIdx}`] = row[colIdx];
        }
      });
      dataRows.push(rowObj);
    }

    return dataRows;
  };

  // Parses HBKMC workload and runs mismatch logic
  const parseAndProcessWorkload = (file: File) => {
    setWorkloadLoading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const ab = e.target?.result;
        const wb = XLSX.read(ab, { type: 'array' });

        // Let's find "Yesterday HBKMC Workload (Detai" sheet fuzzy
        let targetSheetName = wb.SheetNames.find(n => {
          const sName = n.trim().toLowerCase();
          return sName.includes('yesterday hbkmc workload') || 
                 (sName.includes('yesterday') && sName.includes('workload') && sName.includes('detai')) ||
                 sName.includes('hbkmc workload') ||
                 sName.includes('yesterday hbkmc');
        });

        // Fallback 1: sheet containing "detai"
        if (!targetSheetName) {
          targetSheetName = wb.SheetNames.find(n => n.trim().toLowerCase().includes('detai'));
        }

        // Fallback 2: sheet containing "workload" but NOT location and NOT staff
        if (!targetSheetName) {
          targetSheetName = wb.SheetNames.find(n => {
            const sName = n.trim().toLowerCase();
            return sName.includes('workload') && !sName.includes('location') && !sName.includes('staff');
          });
        }

        // Fallback 3: use the 3rd sheet (since user says Yesterday HBKMC Workload is the 3rd sheet)
        if (!targetSheetName && wb.SheetNames.length >= 3) {
          targetSheetName = wb.SheetNames[2];
        }

        // Fallback 4: use the last sheet
        if (!targetSheetName && wb.SheetNames.length > 0) {
          targetSheetName = wb.SheetNames[wb.SheetNames.length - 1];
        }

        if (!targetSheetName) {
          throw new Error('Your file does not contain a worksheet starting with Yesterday HBKMC Workload (such as Yesterday HBKMC Workload (Detai). Available worksheets: ' + wb.SheetNames.join(', '));
        }

        const ws = wb.Sheets[targetSheetName];
        
        // Use our dynamic header parser rather than simple sheet_to_json which breaks on top spaces/banner rows
        const rawJson = parseSheetWithDynamicHeader(ws);

        if (rawJson.length === 0) {
          throw new Error(`The worksheet "${targetSheetName}" is empty or has no readable tabular records.`);
        }

        // Parse each row and run evaluations
        const evaluated: WorkloadRecord[] = [];
        let recordCounter = 0;
        
        for (const rawRow of rawJson) {
          recordCounter++;
          const actionDateTimeRaw = extractFuzzyValue(rawRow, ['Action Date & Time', 'Action Date and Time', 'Action Date', 'Date & Time', 'Date Time', 'ActionDateTime']);
          const actionDateTime = formatActionDateTime(actionDateTimeRaw);
          const mrnOrganization = extractFuzzyValue(rawRow, ['MRN- Organization', 'MRN - Organization', 'MRN Organization', 'MRN', 'MRN_Organization']);
          const personNameFull = extractFuzzyValue(rawRow, ['Person Name- Full', 'Person Name - Full', 'Person Name Full', 'Person Name', 'Patient Name', 'Full Name']);
          const sex = extractFuzzyValue(rawRow, ['Sex', 'Gender', 'M/F']);
          const nationality = extractFuzzyValue(rawRow, ['Nationality', 'Nation', 'Country']);
          const pharmacyLocation = extractFuzzyValue(rawRow, ['Pharmacy Location', 'Location', 'PharmacyName', 'Pharmacy_Location']);
          const actionType = extractFuzzyValue(rawRow, ['Action Type', 'Type', 'Action_Type']);
          const itemNumber = extractFuzzyValue(rawRow, ['Item Number', 'Item Code', 'ItemNo', 'Item_No', 'Item']);
          const labelDescription = extractFuzzyValue(rawRow, ['Label Description', 'Description', 'Item Description', 'Drug Name', 'Item Name']);
          const dispenseQuantity = extractFuzzyValue(rawRow, ['Dispense Quantity', 'Dispensed Quantity', 'Disp Qty', 'Dispensed Qty', 'Qty', 'Quantity']);
          const actionPersonnelPharmacy = extractFuzzyValue(rawRow, ['Action Personnel - Pharmacy', 'Action Personnel', 'Pharmacist', 'Personnel', 'Action Personnel Pharmacy', 'Staff', 'Action Personnel -Pharmacy']);

          // If the row is totally empty or missing critical columns, skip
          if (!itemNumber && !personNameFull && !actionPersonnelPharmacy) continue;

          // Ignore rows representing negative (minus) dispensed QTY
          const parsedDispenseQty = parseFloat(String(dispenseQuantity).trim());
          if (!isNaN(parsedDispenseQty) && parsedDispenseQty < 0) {
            continue;
          }

          const reasons: string[] = [];
          
          // Evaluation 1: Action Personnel - Pharmacy is not in Pharmacist List
          // Compare with database stored pharmacist list
          const normalizedPharmacist = actionPersonnelPharmacy.toLowerCase().trim();
          const pharmacistConfig = dbState.pharmacists.find(p => p.name.toLowerCase().trim() === normalizedPharmacist);
          
          if (!pharmacistConfig && actionPersonnelPharmacy) {
            reasons.push(`Action Personnel "${actionPersonnelPharmacy}" not listed in Pharmacists sheet`);
          }

          // Fetch all DB parameter entries for this specific Item Number
          const normalizedItemNum = itemNumber.toLowerCase().trim();
          const matchedItemDbParameters = dbState.parameters.filter(p => p.itemNumber.toLowerCase().trim() === normalizedItemNum);

          if (matchedItemDbParameters.length === 0) {
            // Item does not exist in any database configurations at all
            if (itemNumber) {
              reasons.push(`Item Number ${itemNumber} is not registered in base Parameter sheet`);
            }
          } else {
            // Item exists. Next, find if there is a configuration for the specific Pharmacy Location of this record (Condition 3)
            const locationConfigWord = matchedItemDbParameters.find(p => isLocationMatches(p.pharmacyLocation, pharmacyLocation));
            
            if (!locationConfigWord) {
              if (pharmacyLocation) {
                reasons.push(`Item ${itemNumber} is not configured to be dispensed from "${pharmacyLocation}" location`);
              }
            } else {
              // Item + Location matches! Let's check the dispensed quantity parameter list (Condition 1)
              const allowedList = locationConfigWord.allowedQuantities;
              const normalizedDispQty = dispenseQuantity.trim();
              
              // Try numerical match and string match
              const dNum = Number(normalizedDispQty);
              const isAllowed = allowedList.some(allowVal => {
                const aNum = Number(allowVal);
                if (!isNaN(dNum) && !isNaN(aNum)) {
                  return dNum === aNum;
                }
                return allowVal.toLowerCase().trim() === normalizedDispQty.toLowerCase();
              });

              if (!isAllowed && normalizedDispQty !== '') {
                reasons.push(`Dispense Qty "${dispenseQuantity}" is unmatched (Allowed: [${allowedList.join(', ')}])`);
              }
            }
          }

          evaluated.push({
            id: `workload-rec-${recordCounter}-${Date.now()}`,
            actionDateTime,
            mrnOrganization,
            personNameFull,
            sex,
            nationality,
            pharmacyLocation,
            actionType,
            itemNumber,
            labelDescription,
            dispenseQuantity,
            actionPersonnelPharmacy,
            reasons,
            isMismatch: reasons.length > 0
          });
        }

        const mismatchOnly = evaluated.filter(r => r.isMismatch);
        setWorkloadRecords(evaluated);
        setWorkloadUploaded(true);

        // Auto-save discovered mismatches to Application Storage forever (admin can delete individual items)
        const standardMismatches = evaluated.filter(r => r.isMismatch);
        const brandVsGenericMismatches = evaluated.map(rec => {
          const outcome = isNonQatariBrandMistake(rec, medications, isLocationMatches);
          if (outcome.isMistake) {
            return {
              ...rec,
              reasons: [outcome.details],
              isMismatch: true
            };
          }
          return null;
        }).filter(Boolean) as WorkloadRecord[];

      } catch (err: any) {
        alert(`Error parsing workload Excel: ${err.message}`);
      } finally {
        setWorkloadLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Dynamically calculate brand vs generic policy mistake records
  const brandVsGenericRecords = React.useMemo(() => {
    return workloadRecords.map(rec => {
      if (rec.dismissedBrandVsGeneric) {
        return {
          ...rec,
          reasons: [],
          isMismatch: false
        };
      }
      const outcome = isNonQatariBrandMistake(rec, medications, isLocationMatches);
      if (outcome.isMistake) {
        return {
          ...rec,
          reasons: [outcome.details],
          isMismatch: true
        };
      }
      return {
        ...rec,
        reasons: [],
        isMismatch: false
      };
    }).filter(rec => rec.reasons.length > 0);
  }, [workloadRecords, medications]);

  // Filter records
  const filteredRecords = React.useMemo(() => {
    const baseList = activeReportType === 'standard' 
      ? workloadRecords.filter(r => r.isMismatch)
      : brandVsGenericRecords;

    return baseList.filter(rec => {
      // Robust multi-token search query matching
      const searchLower = searchQuery.toLowerCase().trim();
      const searchTokens = searchLower.split(/\s+/).filter(Boolean);

      const queryMatches = searchTokens.length === 0 || searchTokens.every(token => {
        return (
          String(rec.personNameFull || '').toLowerCase().includes(token) ||
          String(rec.itemNumber || '').toLowerCase().includes(token) ||
          String(rec.actionPersonnelPharmacy || '').toLowerCase().includes(token) ||
          String(rec.labelDescription || '').toLowerCase().includes(token) ||
          String(rec.mrnOrganization || '').toLowerCase().includes(token) ||
          String(rec.nationality || '').toLowerCase().includes(token) ||
          String(rec.pharmacyLocation || '').toLowerCase().includes(token) ||
          String(rec.actionType || '').toLowerCase().includes(token) ||
          String(rec.dispenseQuantity || '').toLowerCase().includes(token) ||
          rec.reasons.some(r => String(r || '').toLowerCase().includes(token))
        );
      });

      // Filter reason matches
      const reasonMatches = selectedReason === 'all' || rec.reasons.some(r => String(r || '').toLowerCase().includes(selectedReason.toLowerCase()));

      // Filter location matches
      const locationMatches = selectedLocation === 'all' || isFilterLocationMatches(String(rec.pharmacyLocation || ''), selectedLocation);

      // Filter pharmacist matches
      const pharmacistMatches = selectedPharmacist === 'all' || String(rec.actionPersonnelPharmacy || '').toLowerCase().trim() === selectedPharmacist.toLowerCase().trim();

      return queryMatches && reasonMatches && locationMatches && pharmacistMatches;
    });
  }, [workloadRecords, brandVsGenericRecords, activeReportType, searchQuery, selectedReason, selectedLocation, selectedPharmacist]);

  // Paginated chunk for hyper-fast UI rendering
  const paginatedRecords = React.useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredRecords.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredRecords, currentPage]);

  const totalPages = Math.ceil(filteredRecords.length / ITEMS_PER_PAGE);

  // Calculate stats
  const filteredWorkloadForStats = React.useMemo(() => {
    if (selectedLocation === 'all') return workloadRecords;
    return workloadRecords.filter(rec => isFilterLocationMatches(rec.pharmacyLocation, selectedLocation));
  }, [workloadRecords, selectedLocation]);

  const totalProcessed = filteredWorkloadForStats.length;
  const totalMismatches = filteredWorkloadForStats.filter(r => r.isMismatch).length;
  const unregisteredStaffCount = filteredWorkloadForStats.filter(r => r.isMismatch && r.reasons.some(re => re.toLowerCase().includes('not listed') || re.toLowerCase().includes('pharmacist'))).length;
  const unallowedQtyCount = filteredWorkloadForStats.filter(r => r.isMismatch && r.reasons.some(re => re.toLowerCase().includes('qty') || re.toLowerCase().includes('quantity'))).length;
  const locationMismatchCount = filteredWorkloadForStats.filter(r => r.isMismatch && r.reasons.some(re => re.toLowerCase().includes('location') || re.toLowerCase().includes('place'))).length;

  const filteredBrandVsGenericForStats = React.useMemo(() => {
    if (selectedLocation === 'all') return brandVsGenericRecords;
    return brandVsGenericRecords.filter(rec => isFilterLocationMatches(rec.pharmacyLocation, selectedLocation));
  }, [brandVsGenericRecords, selectedLocation]);

  const uniqueBrandItemsCount = React.useMemo(() => {
    const set = new Set<string>();
    filteredBrandVsGenericForStats.forEach(rec => set.add(rec.itemNumber));
    return set.size;
  }, [filteredBrandVsGenericForStats]);

  const uniqueNonQatariPatientsCount = React.useMemo(() => {
    const set = new Set<string>();
    filteredBrandVsGenericForStats.forEach(rec => {
      if (rec.personNameFull) set.add(rec.personNameFull.trim().toLowerCase());
    });
    return set.size;
  }, [filteredBrandVsGenericForStats]);

  const totalBrandDispensedQty = React.useMemo(() => {
    return filteredBrandVsGenericForStats.reduce((acc, rec) => acc + (parseFloat(rec.dispenseQuantity) || 0), 0);
  }, [filteredBrandVsGenericForStats]);

  // Group mismatches by Pharmacists for sending structured WhatsApp messages
  const groupedPharmacistMistakes = React.useMemo(() => {
    const map: Record<string, { pharmacist: string; whatsapp: string; mistakes: WorkloadRecord[] }> = {};
    const baseSource = activeReportType === 'standard' 
      ? workloadRecords.filter(r => r.isMismatch)
      : brandVsGenericRecords;

    baseSource.forEach(rec => {
      // Filter mistakes per the selected pharmacy location
      if (selectedLocation !== 'all' && !isFilterLocationMatches(rec.pharmacyLocation, selectedLocation)) {
        return;
      }

      const key = rec.actionPersonnelPharmacy.trim();
      if (!key) return;

      if (!map[key]) {
        // Look up registered phone number in parameter db
        const matchingDbPharma = dbState.pharmacists.find(p => p.name.toLowerCase().trim() === key.toLowerCase());
        map[key] = {
          pharmacist: key,
          whatsapp: matchingDbPharma?.whatsappNumber || '',
          mistakes: []
        };
      }
      map[key].mistakes.push(rec);
    });
    return Object.values(map);
  }, [workloadRecords, brandVsGenericRecords, activeReportType, dbState.pharmacists, selectedLocation]);

  // Unique lists for filters - include all parsed locations/staff from the entire uploaded source sheet (active and inactive) 
  // so the user can easily select any of them to check metrics or confirm 0 mistakes!
  const uniqueLocations = React.useMemo(() => {
    const set = new Set<string>();
    workloadRecords.forEach(r => { if (r.pharmacyLocation) set.add(r.pharmacyLocation); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [workloadRecords]);

  const uniquePharmacists = React.useMemo(() => {
    const set = new Set<string>();
    workloadRecords.forEach(r => {
      if (r.actionPersonnelPharmacy) {
        if (selectedLocation === 'all' || isFilterLocationMatches(r.pharmacyLocation, selectedLocation)) {
          set.add(r.actionPersonnelPharmacy);
        }
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [workloadRecords, selectedLocation]);

  // Reset selectedPharmacist if it's no longer present in the updated unique list
  React.useEffect(() => {
    if (selectedPharmacist !== 'all' && !uniquePharmacists.includes(selectedPharmacist)) {
      setSelectedPharmacist('all');
    }
  }, [uniquePharmacists, selectedPharmacist]);

  // Reset pagination to page 1 on active tab, filters, or query updates
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedReason, selectedLocation, selectedPharmacist, activeReportType]);

  // Handle send WhatsApp consolidated message
  const triggerWhatsApp = (pharmacistName: string, whatsappNumber: string, mistakes: WorkloadRecord[]) => {
    if (!whatsappNumber) {
      setWhatsappPromptInfo({ pharmacistName, mistakes });
      setCustomPhoneInput('');
      return;
    }

    sendActualWhatsApp(pharmacistName, whatsappNumber, mistakes);
  };

  const sendActualWhatsApp = (pharmacistName: string, whatsappNumber: string, mistakes: WorkloadRecord[]) => {
    // Clean phone number (strip spaces/plus signs)
    const cleanPhone = whatsappNumber.replace(/[^0-9]/g, '');

    const firstName = pharmacistName ? (pharmacistName.trim().split(' ')[0] || pharmacistName) : 'Pharmacist';

    // Construct text according to user format
    let text = `Alsalam Alykum *${pharmacistName}*,\n\nHere are your daily entry mistakes details:\n\n`;
    mistakes.forEach((m, idx) => {
      text += `*Mistake #${idx + 1}:*\n`;
      text += `• *Date & Time*: ${m.actionDateTime || 'N/A'}\n`;
      text += `• *MRN- Organization*: ${m.mrnOrganization || 'N/A'}\n`;
      text += `• *Person Name- Full*: ${m.personNameFull || 'N/A'}\n`;
      text += `• *Sex*: ${m.sex || 'N/A'}\n`;
      text += `• *Nationality*: ${m.nationality || 'N/A'}\n`;
      text += `• *Pharmacy Location*: ${m.pharmacyLocation || 'N/A'}\n`;
      text += `• *Action Type*: ${m.actionType || 'N/A'}\n`;
      text += `• *Item Number*: ${m.itemNumber || 'N/A'}\n`;
      text += `• *Label Description*: ${m.labelDescription || 'N/A'}\n`;
      text += `• *Dispense Quantity*: ${m.dispenseQuantity || 'N/A'}\n`;
      text += `• *Mismatch Issue*: ${m.reasons.join(', ') || 'N/A'}\n\n`;
    });
    text += `Please ${firstName} check the prescription, let me know if there are proper corrections should be done.`;

    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  // EXPORT UTILITIES
  const exportToCSV = () => {
    if (filteredRecords.length === 0) return;
    const isBrandVsGen = activeReportType === 'brand-vs-generic';
    const reasonHeader = isBrandVsGen ? 'Policy Infringement Reason' : 'Entry Mistakes Reasons';
    const headers = [
      'Action Personnel - Pharmacy', 'Action Date & Time', 'MRN- Organization', 'Person Name- Full', 'Sex', 'Nationality',
      'Pharmacy Location', 'Action Type', 'Item Number', 'Label Description', 'Dispense Quantity',
      reasonHeader
    ];

    const rows = filteredRecords.map(r => [
      r.actionPersonnelPharmacy, r.actionDateTime, r.mrnOrganization, r.personNameFull, r.sex, r.nationality,
      r.pharmacyLocation, r.actionType, r.itemNumber, r.labelDescription, r.dispenseQuantity,
      r.reasons.join('; ')
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const filename = isBrandVsGen ? `Brand_vs_Generic_Policy_Report_${new Date().toISOString().slice(0, 10)}.csv` : `Entry_Mistakes_Report_${new Date().toISOString().slice(0, 10)}.csv`;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToExcel = () => {
    if (filteredRecords.length === 0) return;
    const isBrandVsGen = activeReportType === 'brand-vs-generic';
    const reasonKey = isBrandVsGen ? 'Policy Infringement Reason' : 'Mismatch Reason Details';
    const worksheetData = filteredRecords.map(r => ({
      'Action Personnel - Pharmacy': r.actionPersonnelPharmacy,
      'Action Date & Time': r.actionDateTime,
      'MRN- Organization': r.mrnOrganization,
      'Person Name- Full': r.personNameFull,
      'Sex': r.sex,
      'Nationality': r.nationality,
      'Pharmacy Location': r.pharmacyLocation,
      'Action Type': r.actionType,
      'Item Number': r.itemNumber,
      'Label Description': r.labelDescription,
      'Dispense Quantity': r.dispenseQuantity,
      [reasonKey]: r.reasons.join('; ')
    }));

    const ws = XLSX.utils.json_to_sheet(worksheetData);
    const wb = XLSX.utils.book_new();
    const sheetTitle = isBrandVsGen ? "Policy Infringements" : "Entry Mistakes";
    XLSX.utils.book_append_sheet(wb, ws, sheetTitle);
    const filename = isBrandVsGen ? `HBKMC_Brand_vs_Generic_Policy_Report_${new Date().toISOString().slice(0, 10)}.xlsx` : `HBKMC_Entry_Mistakes_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  const exportToPDF = () => {
    if (filteredRecords.length === 0) return;
    const doc = new jsPDF({ orientation: 'landscape', format: 'a4' });
    const isBrandVsGen = activeReportType === 'brand-vs-generic';

    // Header styling
    doc.setFontSize(18);
    doc.setFont('Inter', 'bold');
    const mainTitle = isBrandVsGen ? 'HBKMC BRAND VS GENERIC POLICY INFRINGEMENT REPORT' : 'HBKMC DAILY ENTRY MISTAKES REPORT';
    doc.text(mainTitle, 14, 15);
    
    doc.setFontSize(10);
    doc.setFont('Inter', 'normal');
    const timestampStr = new Date().toLocaleString('en-US', { hour12: true });
    doc.text(`Generated on: ${timestampStr} | Filtered Count: ${filteredRecords.length} Instances`, 14, 21);

    const headers = [
      ['Personnel', 'Date & Time', 'Patient Name', 'Sex', 'Location', 'Item Num', 'Description', 'Qty', isBrandVsGen ? 'Policy Violation Reason' : 'Mismatch Reason']
    ];

    const body = filteredRecords.map(r => [
      r.actionPersonnelPharmacy,
      r.actionDateTime,
      r.personNameFull,
      r.sex,
      r.pharmacyLocation,
      r.itemNumber,
      r.labelDescription,
      r.dispenseQuantity,
      r.reasons.join('\n')
    ]);

    autoTable(doc, {
      head: headers,
      body: body,
      startY: 25,
      styles: {
        fontSize: 7.5,
        cellPadding: 1.5,
        overflow: 'linebreak'
      },
      headStyles: {
        fillColor: isBrandVsGen ? [242, 125, 38] : [20, 20, 20],
        textColor: [255, 255, 255],
        fontStyle: 'bold'
      },
      columnStyles: {
        0: { cellWidth: 28 }, // personnel
        1: { cellWidth: 26 }, // date
        2: { cellWidth: 32 }, // patient
        3: { cellWidth: 8 },  // sex
        4: { cellWidth: 30 }, // location
        5: { cellWidth: 16 }, // item num
        6: { cellWidth: 46 }, // desc
        7: { cellWidth: 10 }, // qty
        8: { cellWidth: 62 }  // reasons
      },
      alternateRowStyles: {
        fillColor: [250, 250, 250]
      }
    });

    const exportFilename = isBrandVsGen ? `HBKMC_Brand_vs_Generic_Policy_Report_${new Date().toISOString().slice(0, 10)}.pdf` : `HBKMC_Entry_Mistakes_Report_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(exportFilename);
  };

  return (
    <div className="space-y-8 animate-fade-in" id="entry-mistakes-dashboard-page">
      {/* Title & Banner Component */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-[#141414]/10 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-[#141414] flex items-center gap-2">
            <AlertCircle className="w-8 h-8 text-[#F27D26]" /> 
            Entry Mistakes Report Board
          </h1>
          <p className="text-sm text-[#141414]/60 mt-1">
            Compare daily workload dispensed entries with parameters database to pinpoint and resolve pharmacist ledger discrepancies.
          </p>
        </div>
      </div>

      {dbLoading ? (
        <div className="flex flex-col items-center justify-center p-20 bg-white border border-[#141414]/5 rounded-2xl shadow-sm">
          <div className="w-12 h-12 border-4 border-[#141414]/10 border-t-[#F27D26] rounded-full animate-spin mb-4" />
          <p className="text-sm font-bold text-[#141414]/60">Checking parameters database connectivity...</p>
        </div>
      ) : !dbState.configured ? (
        /* Configuration flow - No database stored in application currently */
        <motion.div 
          initial={{ opacity: 0, y: 15 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="bg-white border-2 border-dashed border-[#141414]/15 rounded-2xl p-8 max-w-2xl mx-auto h-auto text-center"
        >
          <div className="mx-auto w-16 h-16 bg-[#F27D26]/10 rounded-2xl flex items-center justify-center text-[#F27D26] mb-4">
            <FileSpreadsheet className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black text-[#141414]">Upload Parameters Database Excel</h2>
          <p className="text-sm text-[#141414]/60 mt-2 mb-6 max-w-md mx-auto">
            To start generating entry mistakes reports, upload the base parameters configuration file. 
            This file must contain the following worksheets:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left max-w-lg mx-auto mb-8 text-xs font-semibold">
            <div className="p-3 bg-[#141414]/[0.02] border border-[#141414]/8 rounded-xl">
              <span className="font-extrabold text-[#F27D26] block uppercase tracking-wider mb-1">1. "Parameter" Sheet</span>
              <ul className="space-y-1 text-[#141414]/80">
                <li>• Column A: <strong className="font-semibold">Pharmacy Location</strong></li>
                <li>• Column B: <strong className="font-semibold">Item Number</strong></li>
                <li>• Column C: <strong className="font-semibold">Label Description</strong></li>
                <li>• Columns D-Z: <strong className="font-semibold">Parameter 1...23</strong> (Allowed Dispense Quantities)</li>
              </ul>
            </div>
            
            <div className="p-3 bg-[#141414]/[0.02] border border-[#141414]/8 rounded-xl">
              <span className="font-extrabold text-[#F27D26] block uppercase tracking-wider mb-1">2. "Pharmacist List" Sheet</span>
              <ul className="space-y-1 text-[#141414]/80 text-left">
                <li>• Column A: <strong className="font-semibold">Action Personnel - Pharmacy</strong></li>
                <li>• Column B: <strong className="font-semibold">WhatsApp Number</strong> (for messages)</li>
              </ul>
            </div>
          </div>

          <div 
            onDragOver={handleDragOverDb}
            onDragLeave={handleDragLeaveDb}
            onDrop={handleDropDb}
            onClick={() => fileInputDbRef.current?.click()}
            className={`cursor-pointer rounded-xl border border-dashed p-10 hover:border-[#F27D26] hover:bg-[#F27D26]/[0.02] transition-all relative ${
              isDraggingDb ? 'border-[#F27D26] bg-[#F27D26]/5' : 'border-[#141414]/15'
            }`}
          >
            <input 
              type="file" 
              ref={fileInputDbRef} 
              className="hidden" 
              accept=".xlsx, .xls"
              onChange={handleFileChangeDb}
            />
            <Upload className="w-8 h-8 text-[#141414]/40 mx-auto mb-3" />
            <p className="text-sm font-bold text-[#141414]">Drag & Drop your Excel Database file here</p>
            <p className="text-xs text-[#141414]/40 mt-1">or click to browse from files (.xlsx, .xls)</p>
          </div>
        </motion.div>
      ) : (
        /* Database config active - ready to evaluate workload spreadsheets */
        <div className="space-y-8">
          {/* Active DB Metadata Panel */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white border border-[#141414]/10 rounded-2xl p-6 flex flex-col justify-between shadow-sm relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#F27D26]/5 rounded-bl-full pointer-events-none transition-all group-hover:scale-110" />
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#F27D26] bg-[#F27D26]/5 px-2.5 py-1 rounded-full border border-[#F27D26]/12">
                  Database Config Locked
                </span>
                <h3 className="text-lg font-black text-[#141414] mt-3">LEDGER REFERENCE DATA STATUS</h3>
                <p className="text-xs text-[#141414]/50 mt-1">All processed audits matches directly containing rules from this uploaded ledger framework.</p>
                
                <div className="mt-4 space-y-2 font-semibold">
                  <div className="flex items-center justify-between text-xs text-[#141414]/80">
                    <span className="flex items-center gap-1.5"><FileSpreadsheet className="w-4 h-4 text-[#141414]/40" /> Parameters Mappings:</span>
                    <span className="font-extrabold text-[#141414] bg-[#141414]/5 px-2 py-0.5 rounded-md">{dbState.parameters.length} Records</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-[#141414]/80">
                    <span className="flex items-center gap-1.5"><Users className="w-4 h-4 text-[#141414]/40" /> Registered Pharmacists:</span>
                    <span className="font-extrabold text-[#141414] bg-[#141414]/5 px-2 py-0.5 rounded-md">{dbState.pharmacists.length} Personnel</span>
                  </div>
                  {dbState.lastUpdated && (
                    <div className="text-[10px] text-[#141414]/45 font-mono pt-2 border-t border-[#141414]/5 mt-2">
                      LAST UPDATED: {new Date(dbState.lastUpdated).toLocaleString('en-US', { hour12: true })}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6">
                <button 
                  onClick={deleteDb}
                  className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 transition-colors border border-red-200 active:scale-[0.98]"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Stored Parameters Ledger
                </button>
              </div>
            </div>

            {/* Daily Workload Excel Uploader */}
            <div className="bg-white border border-[#141414]/10 rounded-2xl p-6 lg:col-span-2 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-black text-[#141414] uppercase tracking-wide">Upload Daily HBKMC Workload</h3>
                <p className="text-xs text-[#141414]/60 mt-1 mb-4">
                  Upload yesterday's workload file containing the detailed dispensing items table worksheets. We'll search inside "Yesterday HBKMC Workload (Detai" to filter out records based on mismatch parameters.
                </p>
              </div>

              {workloadLoading ? (
                <div className="flex flex-col items-center justify-center p-8 bg-[#141414]/[0.02] border border-dashed border-[#141414]/15 rounded-xl">
                  <div className="w-8 h-8 border-3 border-[#141414]/10 border-t-[#F27D26] rounded-full animate-spin mb-3" />
                  <p className="text-xs font-bold text-[#141414]/60">Processing workload ledger matrices and evaluating mismatch constraints...</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
                  <div 
                    onDragOver={handleDragOverWorkload}
                    onDragLeave={handleDragLeaveWorkload}
                    onDrop={handleDropWorkload}
                    onClick={() => fileInputWorkloadRef.current?.click()}
                    className={`cursor-pointer rounded-xl border border-dashed p-6 text-center hover:border-[#F27D26] hover:bg-[#F27D26]/[0.01] transition-all flex flex-col justify-center items-center ${
                      workloadUploaded ? 'md:col-span-2' : 'md:col-span-3'
                    } ${
                      isDraggingWorkload ? 'border-[#F27D26] bg-[#F27D26]/5' : 'border-[#141414]/15'
                    }`}
                  >
                    <input 
                      type="file" 
                      ref={fileInputWorkloadRef} 
                      className="hidden" 
                      accept=".xlsx, .xls"
                      onChange={handleFileChangeWorkload}
                    />
                    <Upload className="w-6 h-6 text-[#141414]/40 mx-auto mb-2 animate-bounce" />
                    <p className="text-xs font-bold text-[#141414]">Drag & Drop Workload Excel or browse file</p>
                    <p className="text-[10px] text-[#141414]/40 mt-0.5">Expects sheet name: "Yesterday HBKMC Workload (Detai"</p>
                  </div>

                  {workloadUploaded && (
                    <div className="bg-emerald-50/50 border border-emerald-500/15 rounded-xl p-4 flex flex-col justify-between items-center text-center">
                      <div className="space-y-1.5 my-auto">
                        <CheckCircle2 className="w-7 h-7 text-emerald-600 mx-auto" />
                        <h4 className="text-xs font-black text-emerald-800 uppercase tracking-widest">Active Ledger Data</h4>
                        <p className="text-[10px] text-emerald-700/80 font-semibold leading-normal">
                          Yesterday's HBKMC Workload parsed with <span className="font-extrabold text-emerald-900">{workloadRecords.length} records</span>.
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          resetWorkload();
                        }}
                        className="w-full mt-3 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors cursor-pointer active:scale-[0.98]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Reset Workload
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <AnimatePresence>
            {workloadUploaded && (
              <motion.div 
                initial={{ opacity: 0, y: 15 }} 
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 15 }} 
                className="space-y-8"
              >
                {/* Segmented Report Type Tab Selector */}
                <div className="flex border border-[#141414]/10 bg-[#141414]/[0.02] p-1 rounded-xl gap-2 max-w-xl shadow-inner">
                  <button
                    onClick={() => {
                      setActiveReportType('standard');
                      setSelectedReason('all');
                    }}
                    className={`flex-1 py-2 px-4 rounded-lg text-xs font-black transition-all ${
                      activeReportType === 'standard'
                        ? 'bg-white shadow-sm text-[#141414] border border-[#141414]/8'
                        : 'text-[#141414]/50 hover:text-[#141414] hover:bg-[#141414]/5'
                    }`}
                  >
                    Standard Mismatch Ledger
                  </button>
                  <button
                    onClick={() => {
                      setActiveReportType('brand-vs-generic');
                      setSelectedReason('all');
                    }}
                    className={`flex-1 py-2 px-4 rounded-lg text-xs font-black transition-all ${
                      activeReportType === 'brand-vs-generic'
                        ? 'bg-white shadow-sm text-[#F27D26] border border-[#141414]/8'
                        : 'text-[#141414]/50 hover:text-[#141414] hover:bg-[#141414]/5'
                    }`}
                  >
                    Non-Qatari Brand (In-Stock Generic)
                  </button>
                </div>

                {/* Stats Dashboard Summary */}
                {activeReportType === 'standard' ? (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div className="bg-white border border-[#141414]/10 rounded-2xl p-4 text-center shadow-sm">
                      <span className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-wider block">Total Ledger Elements</span>
                      <span className="text-2xl font-black text-[#141414] mt-1 block">{totalProcessed}</span>
                      <span className="text-[9px] font-semibold text-[#141414]/50 mt-1 block">Rows processed</span>
                    </div>

                    <div className="bg-white border border-[#141414]/10 rounded-2xl p-4 text-center shadow-sm relative">
                      <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500 animate-ping" />
                      <span className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-wider block text-red-600">Total Entry Mistakes</span>
                      <span className="text-2xl font-black text-red-600 mt-1 block">{totalMismatches}</span>
                      <span className="text-[9px] font-semibold text-red-600/60 mt-1 block">Mismatch discrepancies</span>
                    </div>

                    <div className="bg-white border border-[#141414]/10 rounded-2xl p-4 text-center shadow-sm">
                      <span className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-wider block">Unregistered Staff</span>
                      <span className="text-2xl font-black text-orange-600 mt-1 block">{unregisteredStaffCount}</span>
                      <span className="text-[9px] font-semibold text-orange-600/60 mt-1 block">Out of registered list</span>
                    </div>

                    <div className="bg-white border border-[#141414]/10 rounded-2xl p-4 text-center shadow-sm">
                      <span className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-wider block">Unallowed Quantities</span>
                      <span className="text-2xl font-black text-blue-600 mt-1 block">{unallowedQtyCount}</span>
                      <span className="text-[9px] font-semibold text-blue-600/60 mt-1 block">Quantity parameter fault</span>
                    </div>

                    <div className="bg-white border border-[#141414]/10 rounded-2xl p-4 text-center shadow-sm col-span-2 md:col-span-1">
                      <span className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-wider block">Location Violations</span>
                      <span className="text-2xl font-black text-amber-600 mt-1 block">{locationMismatchCount}</span>
                      <span className="text-[9px] font-semibold text-amber-600/60 mt-1 block">Wrong pharma station</span>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div className="bg-white border border-[#141414]/10 rounded-2xl p-4 text-center shadow-sm">
                      <span className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-wider block">Total Ledger Elements</span>
                      <span className="text-2xl font-black text-[#141414] mt-1 block">{totalProcessed}</span>
                      <span className="text-[9px] font-semibold text-[#141414]/50 mt-1 block">Rows processed</span>
                    </div>

                    <div className="bg-white border border-[#141414]/10 rounded-2xl p-4 text-center shadow-sm relative">
                      <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#F27D26] animate-ping" />
                      <span className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-wider block text-[#F27D26]">Brand Policy Faults</span>
                      <span className="text-2xl font-black text-[#F27D26] mt-1 block">{filteredBrandVsGenericForStats.length}</span>
                      <span className="text-[9px] font-semibold text-[#F27D26]/60 mt-1 block">Non-Qatari Brand hand-out</span>
                    </div>

                    <div className="bg-white border border-[#141414]/10 rounded-2xl p-4 text-center shadow-sm">
                      <span className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-wider block">Impacted Patients</span>
                      <span className="text-2xl font-black text-[#141414] mt-1 block">{uniqueNonQatariPatientsCount}</span>
                      <span className="text-[9px] font-semibold text-[#141414]/50 mt-1 block">Distinct Non-Qataris</span>
                    </div>

                    <div className="bg-white border border-[#141414]/10 rounded-2xl p-4 text-center shadow-sm">
                      <span className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-wider block">Brand Types Issued</span>
                      <span className="text-2xl font-black text-[#141414] mt-1 block">{uniqueBrandItemsCount}</span>
                      <span className="text-[9px] font-semibold text-[#141414]/50 mt-1 block">Distinct Brand Items</span>
                    </div>

                    <div className="bg-[#141414]/[0.01] border border-[#141414]/10 rounded-2xl p-4 text-center shadow-sm col-span-2 md:col-span-1">
                      <span className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-wider block">Dispensed Units</span>
                      <span className="text-2xl font-black text-[#141414] mt-1 block">{totalBrandDispensedQty}</span>
                      <span className="text-[9px] font-semibold text-[#141414]/50 mt-1 block">Total quantity dispensed</span>
                    </div>
                  </div>
                )}

                {/* Main Mistakes Report Table */}
                <div className="bg-white border border-[#141414]/10 rounded-2xl p-6 shadow-sm space-y-4 max-w-full overflow-hidden">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#141414]/5 pb-4">
                    <div>
                      <h3 className="text-base font-black text-[#141414] uppercase tracking-wide">
                        {activeReportType === 'standard' ? 'Mismatch Ledger Discrepancies' : 'Brand vs Generic Policy Violations'}
                      </h3>
                      <p className="text-xs text-[#141414]/60">
                        {activeReportType === 'standard' 
                          ? 'Showing filtered list of identified pharmacists and medication transaction entries discrepancies.'
                          : 'Dispensed Brand items for Non-Qatari patients where equivalent Generic is currently IN STOCK.'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button 
                        onClick={exportToCSV}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-[#141414]/70 bg-[#141414]/5 hover:bg-[#141414]/10 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" /> CSV
                      </button>
                      <button 
                        onClick={exportToExcel}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
                      </button>
                      <button 
                        onClick={exportToPDF}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition-colors"
                      >
                        <FileWarning className="w-3.5 h-3.5" /> PDF Document
                      </button>
                    </div>
                  </div>

                  {/* Filter & Search Bar */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-[#141414]/[0.02] p-3 rounded-xl border border-[#141414]/5 text-xs font-bold">
                    {/* Search query */}
                    <div className="relative col-span-1 md:col-span-2">
                      <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-[#141414]/40" />
                      <input 
                        type="text" 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search patient, item number, person..."
                        className="w-full pl-8 pr-3 py-2 border border-[#141414]/12 rounded-lg focus:outline-none focus:border-[#F27D26]"
                      />
                    </div>

                    {/* Filter Reason only for standard */}
                    {activeReportType === 'standard' ? (
                      <div>
                        <select 
                          value={selectedReason}
                          onChange={(e) => setSelectedReason(e.target.value)}
                          className="w-full px-3 py-2 border border-[#141414]/12 rounded-lg bg-white focus:outline-none focus:border-[#F27D26] cursor-pointer"
                        >
                          <option value="all">All Mismatch Categories</option>
                          <option value="not listed">Staff Not in Registry List</option>
                          <option value="unmatched">Dispense Quantity Unmatched</option>
                          <option value="not configured">Wrong Pharmacy Location</option>
                          <option value="not registered in base">Item Unregistered in Parameter sheet</option>
                        </select>
                      </div>
                    ) : (
                      <div className="flex items-center text-xs text-[#141414]/50 border border-[#141414]/12 bg-white rounded-lg px-3 py-2 select-none">
                        Category filter disabled inside policy tab
                      </div>
                    )}

                    {/* Filter Location */}
                    <div>
                      <select 
                        value={selectedLocation}
                        onChange={(e) => setSelectedLocation(e.target.value)}
                        className="w-full px-3 py-2 border border-[#141414]/12 rounded-lg bg-white focus:outline-none focus:border-[#F27D26] cursor-pointer"
                      >
                        <option value="all">All Workload Locations</option>
                        {uniqueLocations.map((loc, idx) => (
                          <option key={`location-${loc}-${idx}`} value={loc}>{loc}</option>
                        ))}
                      </select>
                    </div>

                    {/* Filter Pharmacist */}
                    <div>
                      <select 
                        value={selectedPharmacist}
                        onChange={(e) => setSelectedPharmacist(e.target.value)}
                        className="w-full px-3 py-2 border border-[#141414]/12 rounded-lg bg-white focus:outline-none focus:border-[#F27D26] cursor-pointer"
                      >
                        <option value="all">All Pharmacists Staff</option>
                        {uniquePharmacists.map((ph, idx) => (
                          <option key={`pharmacist-${ph}-${idx}`} value={ph}>{ph}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Horizontal Scroll Helpers */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#F27D26]/5 border border-[#F27D26]/12 px-4 py-3 rounded-xl shadow-sm">
                    <div className="flex items-center gap-2 text-xs font-extrabold text-[#141414]/70">
                      <span className="text-[#F1651D] text-sm animate-pulse">↔</span>
                      <span>Horizontal Scroll Assistant: Swipe or slide table to view full columns. Use controls for fast navigation:</span>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => scrollTable('left')}
                        className="px-3 py-1.5 bg-white hover:bg-[#F27D26]/10 text-[#F27D26] border border-[#F27D26]/20 rounded-lg text-xs font-bold transition-all flex items-center gap-1 active:scale-95 cursor-pointer shadow-sm"
                        title="Scroll Left"
                      >
                        ← Scroll Left
                      </button>
                      <button
                        type="button"
                        onClick={() => scrollTable('right')}
                        className="px-3 py-1.5 bg-white hover:bg-[#F27D26]/10 text-[#F27D26] border border-[#F27D26]/20 rounded-lg text-xs font-bold transition-all flex items-center gap-1 active:scale-95 cursor-pointer shadow-sm"
                        title="Scroll Right"
                      >
                        Scroll Right →
                      </button>
                    </div>
                  </div>

                  {/* Interactive Table */}
                  <div ref={tableContainerRef} className="overflow-x-auto max-w-full border border-[#141414]/8 rounded-xl bg-white">
                    <table className="w-full min-w-[1240px] text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-[#141414]/5 text-[#141414] font-black uppercase border-b border-[#141414]/10">
                          <th className="p-3">Action Personnel</th>
                          <th className="p-3">Action Date & Time</th>
                          <th className="p-3">MRN- Org</th>
                          <th className="p-3">Patient Name</th>
                          <th className="p-3">Sex</th>
                          <th className="p-3">Nationality</th>
                          <th className="p-3">Pharmacy Location</th>
                          <th className="p-3">Action Type</th>
                          <th className="p-3">Item Number</th>
                          <th className="p-3">Label Description</th>
                          <th className="p-3">Qty</th>
                          <th className="p-3">Mismatch Discrepancies Details</th>
                          <th className="p-3 text-center">Storage Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#141414]/8">
                        {filteredRecords.length === 0 ? (
                          <tr>
                            <td colSpan={13} className="p-10 text-center text-[#141414]/40 font-bold">
                              No entry mistakes found matching selected filter criteria.
                            </td>
                          </tr>
                        ) : (
                          paginatedRecords.map((r, idx) => {
                            const isSaved = savedStorageItems.some(x => 
                              x.id === r.id || 
                              (x.mrnOrganization === r.mrnOrganization && 
                               x.actionDateTime === r.actionDateTime && 
                               x.itemNumber === r.itemNumber)
                            );
                            
                            return (
                              <tr key={`${r.id || 'mistake-row'}-${idx}`} className="hover:bg-red-50/20 group transition-colors">
                                <td className="p-3 font-bold text-indigo-600">{r.actionPersonnelPharmacy || 'N/A'}</td>
                                <td className="p-3 font-mono text-[11px] font-medium text-[#141414]/70">{r.actionDateTime || 'N/A'}</td>
                                <td className="p-3 font-mono text-[11px] font-bold text-[#141414]/80">{r.mrnOrganization || 'N/A'}</td>
                                <td className="p-3 font-bold text-[#141414]">{r.personNameFull || 'N/A'}</td>
                                <td className="p-3 text-center">{r.sex || 'N/A'}</td>
                                <td className="p-3 text-ellipsis overflow-hidden font-medium text-[#141414]/70">{r.nationality || 'N/A'}</td>
                                <td className="p-3 font-medium text-[#141414]">{r.pharmacyLocation || 'N/A'}</td>
                                <td className="p-3 text-[10px] uppercase font-bold text-[#141414]/60">{r.actionType || 'N/A'}</td>
                                <td className="p-3 font-bold text-[#141414] font-mono">{r.itemNumber || 'N/A'}</td>
                                <td className="p-3 min-w-[200px] max-w-[320px] whitespace-normal break-words text-[#141414]/80 font-medium">{r.labelDescription || 'N/A'}</td>
                                <td className="p-3 text-center font-extrabold text-[#F27D26] font-mono bg-[#F27D26]/5">{r.dispenseQuantity || 'N/A'}</td>
                                <td className="p-3 min-w-[280px] max-w-[360px] whitespace-normal break-words">
                                  <div className="space-y-1">
                                    {r.reasons.map((re, reIdx) => (
                                      <span key={`reason-${r.id || 'row'}-${reIdx}`} className="inline-flex items-start justify-between gap-1.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-[10px] font-semibold px-2.5 py-1.5 rounded-md leading-normal shadow-sm flex w-full">
                                        <span className="flex items-start gap-1.5 min-w-0 whitespace-normal break-words py-0.5">
                                          <AlertTriangle className="w-2.5 h-2.5 text-red-500 shrink-0 mt-0.5" />
                                          <span className="whitespace-normal break-words" title={re}>{re}</span>
                                        </span>
                                        <button
                                          onClick={() => handleDeleteReason(r.id, re)}
                                          title="Delete this mismatch detail"
                                          className="text-red-400 hover:text-red-700 hover:bg-red-200/50 p-0.5 rounded cursor-pointer transition-colors ml-1 shrink-0 self-start"
                                        >
                                          <X className="w-2.5 h-2.5" />
                                        </button>
                                      </span>
                                    ))}
                                  </div>
                                </td>
                                <td className="p-3 text-center whitespace-nowrap">
                                  {isSaved ? (
                                    <div className="flex flex-col items-center gap-1.5 justify-center">
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 text-[9px] font-black uppercase tracking-wider">
                                        <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Saved
                                      </span>
                                      <button
                                        onClick={() => {
                                          setPasswordTargetItem(r);
                                          setAdminPasswordInput('');
                                          setPasswordError('');
                                          setPasswordModalOpen(true);
                                        }}
                                        className="text-[9px] font-bold text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100/60 px-2 py-0.5 rounded border border-red-200 transition-colors"
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => handleSaveToStorage(r)}
                                      className="px-2.5 py-1.5 rounded bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-[10px] font-black uppercase tracking-wider transition-colors inline-flex items-center gap-1"
                                    >
                                      <Upload className="w-3 h-3" /> Save To DB
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination & Stats Summary Footer - Prevents DOM rendering blockage "hanging" */}
                  <div className="flex flex-col sm:flex-row justify-between items-center gap-4 border-t border-[#141414]/8 pt-4">
                    <div className="text-xs text-[#141414]/50 font-bold">
                      {filteredRecords.length > 0 ? (
                        <span>
                          Showing <span className="text-[#141414]">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> to{' '}
                          <span className="text-[#141414]">{Math.min(currentPage * ITEMS_PER_PAGE, filteredRecords.length)}</span> of{' '}
                          <span className="text-[#141414]">{filteredRecords.length}</span> entry mistakes
                        </span>
                      ) : (
                        <span>Showing 0 entries</span>
                      )}
                    </div>

                    {totalPages > 1 && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
                          className="p-1.5 px-2.5 border border-[#141414]/10 rounded-lg bg-white hover:bg-[#141414]/5 text-xs font-bold text-[#141414]/80 disabled:opacity-40 disabled:hover:bg-white transition-all cursor-pointer flex items-center gap-1"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                          Prev
                        </button>

                        <div className="flex items-center gap-1 mx-1">
                          {Array.from({ length: totalPages }, (_, i) => i + 1)
                            .filter(page => {
                              return page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1;
                            })
                            .reduce<React.ReactNode[]>((accum, page, idx, arr) => {
                              if (idx > 0 && page - arr[idx - 1] > 1) {
                                accum.push(
                                  <span key={`ellipse-${page}`} className="text-xs text-[#141414]/40 font-bold px-1 select-none">
                                    ...
                                  </span>
                                );
                              }
                              accum.push(
                                <button
                                  key={page}
                                  onClick={() => setCurrentPage(page)}
                                  className={`w-7 h-7 rounded-lg text-xs font-black transition-all cursor-pointer ${
                                    currentPage === page
                                      ? 'bg-[#141414] text-white border border-[#141414]'
                                      : 'bg-white border border-[#141414]/10 hover:bg-[#141414]/5 text-[#141414]/80'
                                  }`}
                                >
                                  {page}
                                </button>
                              );
                              return accum;
                            }, [])}
                        </div>

                        <button
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={currentPage === totalPages}
                          className="p-1.5 px-2.5 border border-[#141414]/10 rounded-lg bg-white hover:bg-[#141414]/5 text-xs font-bold text-[#141414]/80 disabled:opacity-40 disabled:hover:bg-white transition-all cursor-pointer flex items-center gap-1"
                        >
                          Next
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    <div className="text-xs text-[#141414]/40 font-semibold text-right">
                      All discrepancies parsed from Yesterday HBKMC Workload.
                    </div>
                  </div>
                </div>

                {/* WhatsApp Outreach Communications Hub */}
                <div className="bg-white border border-[#141414]/10 rounded-2xl p-6 shadow-sm space-y-4">
                  <div>
                    <h3 className="text-base font-black text-[#141414] uppercase tracking-wide flex items-center gap-2">
                      <MessageCircle className="w-5 h-5 text-emerald-600 animate-pulse" /> 
                      Action Personnel Outreach Center (WhatsApp Notifications)
                    </h3>
                    <p className="text-xs text-[#141414]/60">
                      Instantly synthesize and launch dedicated consolidated feedback messages to each pharmacist detailing their entry mistakes so they check prescriptions and rectify entries.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {groupedPharmacistMistakes.length === 0 ? (
                      <div className="col-span-full text-center py-8 text-[#141414]/40 font-bold border border-dashed rounded-xl bg-white">
                        No entry mistakes grouped by pharmacist. Beautiful, clean ledgers!
                      </div>
                    ) : (
                      groupedPharmacistMistakes.map((gp, ix) => (
                        <div key={`gp-${gp.pharmacist || 'ix'}-${ix}`} className="bg-[#141414]/[0.02] border border-[#141414]/8 rounded-xl p-4 flex flex-col justify-between hover:border-[#141414]/20 transition-all relative">
                          <div>
                            <div className="flex items-start justify-between">
                              <div>
                                <h4 className="font-extrabold text-sm text-[#141414]">{gp.pharmacist}</h4>
                                <p className="text-[10px] font-mono font-bold text-indigo-600 mt-0.5 flex items-center gap-1">
                                  {gp.whatsapp ? `WhatsApp: ${gp.whatsapp}` : '📵 WhatsApp Unregistered'}
                                </p>
                              </div>
                              <span className="bg-red-50 border border-red-200 text-red-700 text-xs font-black px-2.5 py-1 rounded-full absolute top-4 right-4 shadow-sm">
                                {gp.mistakes.length} mistakes
                              </span>
                            </div>

                            {/* Message Preview */}
                            <div className="bg-white border border-[#141414]/10 rounded-lg p-3 mt-3 text-[10px] font-semibold text-[#141414]/70 leading-relaxed max-h-[240px] overflow-y-auto font-mono">
                              <span className="text-[8px] uppercase tracking-widest font-black text-[#141414]/40 block mb-1">Generated Draft:</span>
                              <p className="whitespace-pre-wrap">
                                Alsalam Alykum *{gp.pharmacist}*,{"\n"}{"\n"}
                                Here are your daily entry mistakes details:{"\n"}{"\n"}
                                {gp.mistakes.map((m, mIdx) => (
                                  `*Mistake #${mIdx + 1}:*\n` +
                                  `• *Date & Time*: ${m.actionDateTime || 'N/A'}\n` +
                                  `• *MRN- Organization*: ${m.mrnOrganization || 'N/A'}\n` +
                                  `• *Person Name- Full*: ${m.personNameFull || 'N/A'}\n` +
                                  `• *Sex*: ${m.sex || 'N/A'}\n` +
                                  `• *Nationality*: ${m.nationality || 'N/A'}\n` +
                                  `• *Pharmacy Location*: ${m.pharmacyLocation || 'N/A'}\n` +
                                  `• *Action Type*: ${m.actionType || 'N/A'}\n` +
                                  `• *Item Number*: ${m.itemNumber || 'N/A'}\n` +
                                  `• *Label Description*: ${m.labelDescription || 'N/A'}\n` +
                                  `• *Dispense Quantity*: ${m.dispenseQuantity || 'N/A'}\n` +
                                  `• *Mismatch Issue*: ${m.reasons.join(', ')}\n`
                                )).join('\n')}
                                {"\n"}
                                Please {gp.pharmacist ? (gp.pharmacist.trim().split(' ')[0] || gp.pharmacist) : 'Pharmacist'} check the prescription, let me know if there are proper corrections should be done.
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 pt-3 border-t border-[#141414]/5">
                            <button
                              onClick={() => triggerWhatsApp(gp.pharmacist, gp.whatsapp, gp.mistakes)}
                              className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                                gp.whatsapp 
                                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm hover:scale-[1.01]' 
                                  : 'bg-[#141414]/10 hover:bg-[#141414]/15 text-[#141414]'
                              } active:scale-95`}
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>{gp.whatsapp ? 'Send WhatsApp Notification' : 'Insert WhatsApp & Send'}</span>
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Delete Ledger Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-[#141414]/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white border border-[#141414]/10 max-w-md w-full rounded-2xl shadow-2xl p-6 relative overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-red-50 text-red-600 rounded-xl border border-red-100 shrink-0">
                <AlertTriangle className="w-6 h-6 animate-pulse" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-black text-[#141414] uppercase tracking-wide">Delete Reference Ledger?</h3>
                <p className="text-xs text-[#141414]/60 mt-1 leading-relaxed">
                  Are you sure you want to delete the stored Database Parameters and Pharmacist List? This action is <strong className="text-red-600 font-extrabold uppercase">irreversible</strong>, and all mismatch validations will stop working.
                </p>
                <p className="text-xs text-[#141414]/60 mt-1.5 leading-relaxed">
                  Please verify your <strong className="text-red-700 font-bold uppercase">Admin Password</strong> to proceed:
                </p>

                <div className="mt-4">
                  <label className="block text-[9px] uppercase font-black text-[#141414]/40 tracking-widest mb-1">Enter Admin Password</label>
                  <input
                    type="password"
                    value={adminPasswordInput}
                    onChange={(e) => setAdminPasswordInput(e.target.value)}
                    placeholder="••••••••"
                    className="w-full text-xs font-mono font-bold bg-[#141414]/5 border border-[#141414]/10 rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-red-500 focus:bg-white text-[#141414] transition-all"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        confirmDeleteDb();
                      }
                    }}
                  />
                  {passwordError && (
                    <p className="text-red-600 text-[10px] font-bold mt-1.5 flex items-center gap-1 bg-red-50 border border-red-100 p-2 rounded-lg">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {passwordError}
                    </p>
                  )}
                </div>
              </div>
            </div>
            
            <div className="mt-6 flex justify-end gap-3 border-t border-[#141414]/5 pt-4">
              <button 
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setAdminPasswordInput('');
                  setPasswordError('');
                }}
                className="px-4 py-2 text-xs font-bold text-[#141414]/70 hover:text-[#141414] bg-[#141414]/5 rounded-xl transition-all hover:bg-[#141414]/10"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDeleteDb}
                disabled={!adminPasswordInput}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 rounded-xl shadow-md transition-all active:scale-95"
              >
                Yes, Delete Ledger
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom WhatsApp Prompt Input Modal */}
      {whatsappPromptInfo && (
        <div className="fixed inset-0 bg-[#141414]/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white border border-[#141414]/10 max-w-md w-full rounded-2xl shadow-2xl p-6 relative overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100 shrink-0">
                <MessageCircle className="w-6 h-6 animate-bounce" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-black text-[#141414] uppercase tracking-wide">Enter WhatsApp Number</h3>
                <p className="text-xs text-[#141414]/60 mt-1 leading-relaxed">
                  The pharmacist <strong className="text-[#141414] font-extrabold">"{whatsappPromptInfo.pharmacistName}"</strong> is not listed or registered. Please type their custom phone number with country code:
                </p>
                
                <div className="mt-4">
                  <label className="block text-[9px] uppercase font-black text-[#141414]/40 tracking-widest mb-1.5">WhatsApp Number</label>
                  <input
                    type="text"
                    value={customPhoneInput}
                    onChange={(e) => setCustomPhoneInput(e.target.value)}
                    placeholder="e.g. 974XXXXXXXX"
                    className="w-full text-xs font-mono font-bold bg-[#141414]/5 border border-[#141414]/10 rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-emerald-500 focus:bg-white text-[#141414] transition-all"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const cleanVal = customPhoneInput.replace(/[^0-9]/g, '');
                        if (cleanVal) {
                          sendActualWhatsApp(whatsappPromptInfo.pharmacistName, cleanVal, whatsappPromptInfo.mistakes);
                          setWhatsappPromptInfo(null);
                        }
                      }
                    }}
                  />
                  <span className="text-[9px] font-medium text-[#141414]/40 mt-1.5 block">Format: Include your country code e.g. 974 for Qatar (no + or spaces).</span>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-[#141414]/5 pt-4">
              <button 
                onClick={() => setWhatsappPromptInfo(null)}
                className="px-4 py-2 text-xs font-bold text-[#141414]/70 hover:text-[#141414] bg-[#141414]/5 rounded-xl transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  const cleanVal = customPhoneInput.replace(/[^0-9]/g, '');
                  if (cleanVal) {
                    sendActualWhatsApp(whatsappPromptInfo.pharmacistName, cleanVal, whatsappPromptInfo.mistakes);
                    setWhatsappPromptInfo(null);
                  }
                }}
                disabled={!customPhoneInput.replace(/[^0-9]/g, '')}
                className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:hover:bg-emerald-600 rounded-xl shadow-md transition-all active:scale-95"
              >
                Open WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Authorization Modal to make removal password-protected */}
      {passwordModalOpen && (
        <div className="fixed inset-0 bg-[#141414]/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white border border-[#141414]/10 max-w-md w-full rounded-2xl shadow-2xl p-6 relative overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex items-start gap-3">
              <div className="p-3 bg-red-50 text-red-600 border border-red-100 rounded-xl shrink-0">
                <AlertTriangle className="w-6 h-6 animate-pulse" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-black text-[#141414] uppercase tracking-wide">Admin Security Authorization</h3>
                <p className="text-xs text-[#141414]/60 mt-1 leading-relaxed">
                  Removing stored records from Application Storage is a restricted catalog operation. Please verify your <strong className="text-red-600 font-bold uppercase">Admin Password</strong> to proceed:
                </p>

                <div className="mt-4">
                  <label className="block text-[9px] uppercase font-black text-[#141414]/40 tracking-widest mb-1">Enter Admin Password</label>
                  <input
                    type="password"
                    value={adminPasswordInput}
                    onChange={(e) => setAdminPasswordInput(e.target.value)}
                    placeholder="••••••••"
                    className="w-full text-xs font-mono font-bold bg-[#141414]/5 border border-[#141414]/10 rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-red-500 focus:bg-white text-[#141414] transition-all"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleDeleteFromStorage();
                      }
                    }}
                  />
                  {passwordError && (
                    <p className="text-red-600 text-[10px] font-bold mt-1.5 flex items-center gap-1 bg-red-50 border border-red-100 p-2 rounded-lg">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {passwordError}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-[#141414]/5 pt-4 text-xs font-bold">
              <button
                onClick={() => {
                  setPasswordModalOpen(false);
                  setPasswordTargetItem(null);
                  setAdminPasswordInput('');
                  setPasswordError('');
                }}
                className="px-4 py-2 text-[#141414]/70 hover:text-[#141414] bg-[#141414]/5 rounded-xl transition-all"
                disabled={isDeletingFromStorage}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteFromStorage}
                disabled={!adminPasswordInput || isDeletingFromStorage}
                className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:hover:bg-red-600 rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-1"
              >
                {isDeletingFromStorage && <RefreshCw className="w-3 h-3 animate-spin mr-1" />}
                Authorize Removal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
