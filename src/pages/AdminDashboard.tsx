import React, { useState, useRef, useMemo, useEffect } from 'react';
import { 
  Plus, Upload, Trash2, Edit2, Check, X as XIcon, FileSpreadsheet, 
  ClipboardPaste, ClipboardList, AlertCircle, Info, ArrowLeftRight, Loader2,
  AlertTriangle, Filter, Settings2, CalendarClock, History, RotateCcw, Search, Sparkles, RefreshCw,
  Camera, Image as ImageIcon, CheckCircle2, ThermometerSnowflake, UploadCloud, Cloud, ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Link } from 'react-router-dom';
import { PharmacyLocation, Medication, PHARMACY_NAMES } from '../types';
import { LOCATIONS } from '../constants';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { format, differenceInDays, isBefore, startOfToday, isSameMonth, addMonths, startOfMonth } from 'date-fns';
import { useMedications } from '../hooks/useMedications';
import { useAudits } from '../hooks/useAudits';
import { medicationOps, systemOps } from '../lib/firebaseOperations';
import { sharedDb } from '../lib/sharedDb';
import { formatNumber } from '../lib/formatters';
import { localDb } from '../lib/localStorageDb';
import { useSystemMetadata } from '../lib/useSystemMetadata';

import { db, auth } from '../lib/firebase';
import { signInAnonymously } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';

import LinkedItemsModal from '../components/LinkedItemsModal';

const DRAFT_STORAGE_KEY = 'admin_medication_draft';

export default function AdminDashboard() {
  const { lastUpdate } = useSystemMetadata();

  const [selectedLocation, setSelectedLocation] = useState<PharmacyLocation>(PharmacyLocation.ADULT);
    const { medications, loading, error: fetchError, refresh, lastSynced, isSyncing } = useMedications(selectedLocation);
    const { audits, loading: auditsLoading } = useAudits(10);
    const [searchQuery, setSearchQuery] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'in' | 'low' | 'out'>('all');
  const [isAdding, setIsAdding] = useState(false);
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [bulkInput, setBulkInput] = useState('');
  const [importPhotoStrategy, setImportPhotoStrategy] = useState<'keep' | 'remove'>('keep');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [alertThreshold, setAlertThreshold] = useState<number>(90);
  const [hasDraft, setHasDraft] = useState(false);
  const [expSearchQuery, setExpSearchQuery] = useState('');
  const [expSearchMonth, setExpSearchMonth] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isBulkPhotoUploading, setIsBulkPhotoUploading] = useState(false);
  const [bulkPhotoProgress, setBulkPhotoProgress] = useState<{current: number, total: number} | null>(null);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [showSyncPulse, setShowSyncPulse] = useState(false);
  const [skippedUploads, setSkippedUploads] = useState<string[]>([]);
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [selectedMedForEdit, setSelectedMedForEdit] = useState<Medication | null>(null);
  const [selectedMedForLinks, setSelectedMedForLinks] = useState<Medication | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  
  const [isCapturing, setIsCapturing] = useState(false);
  const [isStreamActive, setIsStreamActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 400;
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;

        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        setForm(prev => ({ ...prev, imageUrl: dataUrl }));
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const startCamera = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError("Your browser does not support camera access or you are in an insecure context. IMPORTANT: In the AI Studio preview, browsers block camera access inside iframes. You MUST click 'Open in New Tab' (top right icon) for the camera to work.");
      return;
    }
    setError(null);
    
    try {
      // Warm up device enumeration - sometimes helps trigger permission prompt in iframes
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        await navigator.mediaDevices.enumerateDevices().catch(() => []);
      }

      // First ensure the UI state reflects capturing mode so video element is rendered
      setIsCapturing(true);

      const constraints: MediaStreamConstraints = {
        video: { 
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err: any) {
        console.warn("Initial camera request failed, trying fallback:", err.name);
        // Fallback to any camera
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: true 
        });
      }

      cameraStreamRef.current = stream;

      // Use a more reliable way to wait for the video element and attach stream
      let attempts = 0;
      const attachStreamToVideo = () => {
        if (videoRef.current) {
          const video = videoRef.current;
          console.log("Found video element, attaching stream");
          video.setAttribute('playsinline', 'true');
          video.setAttribute('webkit-playsinline', 'true');
          video.muted = true;
          video.srcObject = stream;
          
          const handlePlay = () => {
            console.log("Attempting to play video");
            video.play()
              .then(() => {
                setIsStreamActive(true);
                console.log("Camera stream active and playing");
              })
              .catch(e => {
                console.warn("Autoplay blocked:", e);
                // Allow the TAP TO START button overlay to handle manual play
              });
          };

          if (video.readyState >= 2) {
            handlePlay();
          } else {
            video.onloadedmetadata = handlePlay;
            video.onloadeddata = handlePlay; // Backup event
          }
        } else if (attempts < 200) {
          attempts++;
          setTimeout(() => requestAnimationFrame(attachStreamToVideo), 50); // Small delay can help Safari mount the element
        } else {
          setError("Video preview element failed to initialize. Please try restarting the camera.");
          setIsCapturing(false);
          stopCamera();
        }
      };
      
      requestAnimationFrame(attachStreamToVideo);

    } catch (err: any) {
      console.error("Camera Error details:", err);
      let msg = "Could not access camera.";
      
      const errorName = err.name || '';
      const errorMessage = (err.message || '').toLowerCase();

      if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError' || errorMessage.includes('denied') || errorMessage.includes('not allowed')) {
        msg = "Camera access BLOCKED. In the AI Studio preview, browsers block camera access inside iframes. SOLUTION: Use the 'Open in New Tab' button provided below or the icon in the top-right corner of the editor.";
      } else if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError') {
        msg = "No camera hardware detected. If on mobile, check your privacy settings.";
      } else if (errorName === 'NotReadableError' || errorName === 'TrackStartError' || errorMessage.includes('could not start')) {
        msg = "Camera is likely in use by another tab or app.";
      } else {
        msg = `Camera Error: ${err.message || 'Initialization failed'}`;
      }
      
      setError(msg);
      setIsCapturing(false);
      
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach(t => t.stop());
        cameraStreamRef.current = null;
      }
    }
  };

  const stopCamera = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(track => track.stop());
      cameraStreamRef.current = null;
    }
    setIsStreamActive(false);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCapturing(false);
  };

  useEffect(() => {
    return () => {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach(track => track.stop());
        cameraStreamRef.current = null;
      }
    };
  }, []);

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Resize
      const resizeCanvas = document.createElement('canvas');
      const MAX_WIDTH = 400;
      const scaleSize = MAX_WIDTH / canvas.width;
      resizeCanvas.width = MAX_WIDTH;
      resizeCanvas.height = canvas.height * scaleSize;
      const resizeCtx = resizeCanvas.getContext('2d');
      resizeCtx?.drawImage(canvas, 0, 0, resizeCanvas.width, resizeCanvas.height);

      const dataUrl = resizeCanvas.toDataURL('image/jpeg', 0.7);
      setForm(prev => ({ ...prev, imageUrl: dataUrl }));
      stopCamera();
    }
  };

  useEffect(() => {
    // Sign in anonymously for Firestore rules that might require a UID
    if (auth && !auth.currentUser) {
      signInAnonymously(auth).catch(err => {
        console.warn("Anonymous sign-in failed:", err);
      });
    }
  }, []);

  const [editMin, setEditMin] = useState<string>('');
  const [editMax, setEditMax] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [sortField, setSortField] = useState<string>('itemName');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bulkPhotoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Mini stats refresh or other side effects if needed
  }, []);

  const handleUpdatePortalPass = async (portal: 'pharmacist' | 'order') => {
    // Function removed
  };

  // Auto-dismiss alerts
  useEffect(() => {
    if (success || error) {
      const timer = setTimeout(() => {
        setSuccess(null);
        setError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [success, error]);

  // Form state for new/edit
  const [form, setForm] = useState<Partial<Medication>>({
    itemCode: '',
    itemName: '',
    qoh: 0,
    minQty: 0,
    maxQty: 0,
    generic: '',
    expiration1: '',
    expiration2: '',
    expiration3: '',
    to: '',
    isRefrigerated: false
  });

  // Check for draft on mount
  useEffect(() => {
    const savedDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (savedDraft) {
      setHasDraft(true);
    }
  }, []);

  // Auto-save logic
  useEffect(() => {
    if (isAdding || editingId) {
      const draft = {
        form,
        isAdding,
        editingId,
        locationId: selectedLocation,
        timestamp: Date.now()
      };
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    }
  }, [form, isAdding, editingId, selectedLocation]);

  const restoreDraft = () => {
    const savedDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (savedDraft) {
      const { form: draftForm, isAdding: draftAdding, editingId: draftEditingId, locationId: draftLocationId } = JSON.parse(savedDraft);
      setSelectedLocation(draftLocationId);
      setForm(draftForm);
      setIsAdding(draftAdding);
      setEditingId(draftEditingId);
      setHasDraft(false);
    }
  };

  const clearDraft = () => {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    setHasDraft(false);
  };

  useEffect(() => {
    setShowSyncPulse(true);
    const timer = setTimeout(() => setShowSyncPulse(false), 2000);
    return () => clearTimeout(timer);
  }, [lastSynced]);

  useEffect(() => {
    if (fetchError) {
      setError(`Fetch Error: ${fetchError}`);
    }
  }, [fetchError]);

  const isFirebaseConnected = !!db;

  // Expiration helper
  const parseExpDate = (dateStr: string) => {
    if (!dateStr || dateStr === '-' || dateStr === '.') return null;
    try {
      // Try parsing dd-mm-yyyy explicitly first
      const parts = dateStr.split(/[-/.]/);
      if (parts.length === 3) {
        const d = parseInt(parts[0]);
        const m = parseInt(parts[1]);
        const y = parseInt(parts[2]);
        // Handle 2-digit years if they appear
        const fullYear = y < 100 ? 2000 + y : y;
        const date = new Date(fullYear, m - 1, d);
        if (!isNaN(date.getTime())) return date;
      } else if (parts.length === 2) {
        // Handle mm-yyyy
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

  const expiringItems = useMemo(() => {
    const today = startOfToday();
    let result = medications.map(med => {
      const dates = [med.expiration1, med.expiration2, med.expiration3]
        .map(parseExpDate)
        .filter(d => d !== null && !isBefore(d, today)) as Date[];
      
      if (dates.length === 0) return null;
      
      const nextExp = new Date(Math.min(...dates.map(d => d.getTime())));
      const daysLeft = differenceInDays(nextExp, today);
      
      if (daysLeft <= alertThreshold) {
        return { ...med, daysLeft, nextExp };
      }
      return null;
    }).filter(Boolean) as (Medication & { daysLeft: number; nextExp: Date })[];

    if (expSearchMonth) {
      const [year, month] = expSearchMonth.split('-').map(Number);
      result = result.filter(item => {
        return item.nextExp.getFullYear() === year && (item.nextExp.getMonth() + 1) === month;
      });
    }

    if (expSearchQuery) {
      const query = expSearchQuery.toLowerCase();
      result = result.filter(item => {
        const formattedDate = format(item.nextExp, 'dd-MM-yyyy').toLowerCase();
        const itemName = item.itemName.toLowerCase();
        const itemCode = item.itemCode.toLowerCase();
        return formattedDate.includes(query) || itemName.includes(query) || itemCode.includes(query);
      });
    }

    return result.sort((a, b) => (a.daysLeft || 0) - (b.daysLeft || 0));
  }, [medications, alertThreshold, expSearchQuery, expSearchMonth]);

  const expirationStats = useMemo(() => {
    const today = new Date();
    const currentM = startOfMonth(today);
    const nextM = startOfMonth(addMonths(today, 1));
    const thirdM = startOfMonth(addMonths(today, 2));

    let current = 0;
    let next = 0;
    let third = 0;

    medications.forEach(med => {
      const d1 = parseExpDate(med.expiration1);
      if (d1) {
        const m = startOfMonth(d1);
        if (isSameMonth(m, currentM)) current++;
        else if (isSameMonth(m, nextM)) next++;
        else if (isSameMonth(m, thirdM)) third++;
      }
    });

    return { current, next, third };
  }, [medications]);

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const sortedMedications = useMemo(() => {
    let result = [...medications];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(m => 
        (m.itemName && m.itemName.toLowerCase().includes(q)) || 
        (m.itemCode && m.itemCode.toLowerCase().includes(q)) ||
        (m.generic && m.generic.toLowerCase().includes(q)) ||
        (m.to && m.to.toLowerCase().includes(q)) ||
        (q === 'refrig' && m.isRefrigerated) ||
        (q === 'refridge' && m.isRefrigerated) ||
        (q === 'refrigerated' && m.isRefrigerated)
      );
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

    return result.sort((a, b) => {
      const multiplier = sortOrder === 'asc' ? 1 : -1;
      
      if (['qoh', 'minQty', 'maxQty'].includes(sortField)) {
        const valA = Number(a[sortField as keyof Medication]) || 0;
        const valB = Number(b[sortField as keyof Medication]) || 0;
        return (valA - valB) * multiplier;
      }
      
      if (sortField.startsWith('expiration')) {
        const dateA = parseExpDate(a[sortField as keyof Medication] as string);
        const dateB = parseExpDate(b[sortField as keyof Medication] as string);
        
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1 * multiplier;
        if (!dateB) return -1 * multiplier;
        
        return (dateA.getTime() - dateB.getTime()) * multiplier;
      }
      
      const valA = String(a[sortField as keyof Medication] || '').toLowerCase();
      const valB = String(b[sortField as keyof Medication] || '').toLowerCase();
      
      if (valA < valB) return -1 * multiplier;
      if (valA > valB) return 1 * multiplier;
      return 0;
    });
  }, [medications, sortField, sortOrder, stockFilter, searchQuery]);

  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        setIsImporting(true);
        setError(null);
        setSuccess(null);
        const dataBuffer = evt.target?.result;
        const wb = XLSX.read(dataBuffer, { type: 'array', cellDates: true });
        const allMedsList: any[] = [];
        let sheetsFound = 0;

        const getRowValue = (row: any, keys: string[]) => {
          const rowKeys = Object.keys(row);
          for (const k of keys) {
            const normalizedK = k.toLowerCase().replace(/[\s\-_.]/g, '');
            const found = rowKeys.find(rk => {
              const normalizedRK = rk.toLowerCase().replace(/[\s\-_.]/g, '');
              
              // Exact match or prefix/suffix match
              if (normalizedRK === normalizedK || normalizedRK.includes(normalizedK) || normalizedK.includes(normalizedRK)) {
                return true;
              }

              // Common variants for Item Code
              if (normalizedK === 'itemcode' && (normalizedRK === 'code' || normalizedRK === 'id' || normalizedRK === 'artno' || normalizedRK === 'material')) return true;
              // Common variants for QOH
              if (normalizedK === 'qoh' && (normalizedRK === 'qty' || normalizedRK === 'quantity' || normalizedRK === 'stock' || normalizedRK === 'count')) return true;

              // Special handling for Exp 1, 2, 3
              const digitMatch = normalizedK.match(/\d/);
              if (digitMatch && (normalizedK.includes('exp') || normalizedK.includes('expiry'))) {
                const digit = digitMatch[0];
                const rkHasDigit = normalizedRK.includes(digit);
                const rkIsExp = normalizedRK.includes('exp') || normalizedRK.includes('expiry') || normalizedRK.includes('date');
                if (rkHasDigit && rkIsExp) return true;
              }
              
              return false;
            });
            if (found !== undefined) return row[found];
          }
          return undefined;
        };

        const formatExp = (val: any) => {
          if (val === undefined || val === null || val === '') return '';
          
          let dateObj: Date | null = null;

          if (val instanceof Date) {
            dateObj = val;
          } else if (typeof val === 'number') {
            // Excel serial date fallback
            try {
              const parsed = XLSX.SSF.parse_date_code(val);
              dateObj = new Date(parsed.y, parsed.m - 1, parsed.d);
            } catch (e) {
              return String(val);
            }
          } else if (typeof val === 'string') {
            dateObj = parseExpDate(val);
          }

          if (dateObj && !isNaN(dateObj.getTime())) {
            return format(dateObj, 'dd-MM-yyyy');
          }
          
          return String(val);
        };

        let sheetsTotal = wb.SheetNames.length;
        wb.SheetNames.forEach(wsname => {
          let locationId: PharmacyLocation | null = null;
          const lowerName = wsname.toLowerCase().trim();
          
          // Location keywords with more variants
          if (lowerName.match(/adult|male|main/i)) locationId = PharmacyLocation.ADULT;
          else if (lowerName.match(/pediatric|peds|child|ped/i)) locationId = PharmacyLocation.PEDIATRIC;
          else if (lowerName.match(/mesaieed|mesai|msd|mes/i)) locationId = PharmacyLocation.MESAIEED;

          // Single sheet fallback - if only 1 sheet, use selectedLocation regardless of name
          if (!locationId && sheetsTotal === 1) {
            locationId = selectedLocation;
            console.log(`Single sheet detected, defaulting to location: ${locationId}`);
          }

          if (!locationId) {
            console.warn(`Skipping sheet "${wsname}" - could not identify location.`);
            return;
          }
          sheetsFound++;

          const ws = wb.Sheets[wsname];
          const dataRows = XLSX.utils.sheet_to_json(ws) as any[];

          const sheetMeds = dataRows.map((row) => {
            // Very permissive field mapping
            const itemCode = String(getRowValue(row, ['itemCode', 'Code', 'ItemNo', 'Item No', 'Product Code', 'Reference']) || '');
            const itemName = String(getRowValue(row, ['itemName', 'Name', 'Description', 'ItemName', 'Item Name', 'Product']) || '');
            const generic = String(getRowValue(row, ['generic', 'Generic Name', 'GenericName', 'Generic', 'GenericName']) || '');
            const to = String(getRowValue(row, ['to', 'Linked', 'Cross Reference', 'BrandItem', 'GenericItem']) || '');
            
            // Comprehensive Refrigerated Detection
            let isRefrigerated = false;
            
            // 1. Check specific columns first
            const refridgeRaw = getRowValue(row, ['isRefrigerated', 'Refridge', 'Refrig', 'Fridge', 'Cold', 'Refrigerator', 'Temp', 'Temperature', 'Storage', 'Notes', 'Instructions', 'Remarks', 'Comment']);
            if (refridgeRaw === true || 
                (typeof refridgeRaw === 'string' && (
                  refridgeRaw.toLowerCase().includes('yes') || 
                  refridgeRaw.toLowerCase().includes('keep') || 
                  refridgeRaw.toLowerCase().includes('refrig') ||
                  refridgeRaw.toLowerCase().includes('fridge') ||
                  refridgeRaw.toLowerCase().includes('cold') ||
                  refridgeRaw.toLowerCase().includes('2-8') ||
                  refridgeRaw.toLowerCase().includes('*')
                ))
            ) {
              isRefrigerated = true;
            }
            
            // 2. Check Item Name, Generic, and Linked fields
            if (!isRefrigerated) {
              const combinedText = `${itemName} ${generic} ${to}`.toLowerCase();
              if (combinedText.includes('refrig') || 
                  combinedText.includes('fridge') || 
                  combinedText.includes('2-8') || 
                  combinedText.includes('(ref)') || 
                  combinedText.includes('cold') || 
                  combinedText.includes('*')) {
                isRefrigerated = true;
              }
            }

            // 3. Last resort: Scan EVERY single value in the row if still not identified as refrigerated
            if (!isRefrigerated) {
              isRefrigerated = Object.values(row).some(val => {
                const s = String(val || '').toLowerCase();
                return s.includes('refrig') || s.includes('2-8') || s.includes('fridge') || (s.includes('cold') && !s.includes('cold flu'));
              });
            }
            
            if (!itemName) return null;

            return {
              itemCode: itemCode || `TEMP-${Math.random().toString(36).substr(2, 5)}`,
              itemName,
              generic,
              to,
              isRefrigerated: !!isRefrigerated,
              qoh: Number(getRowValue(row, ['qoh', 'Quantity', 'Qty', 'Stock', 'Inventory', 'Total', 'Available']) || 0),
              minQty: Number(getRowValue(row, ['minQty', 'Min', 'Order Min', 'Minimum']) || 0),
              maxQty: Number(getRowValue(row, ['maxQty', 'Max', 'Order Max', 'Maximum']) || 0),
              expiration1: formatExp(getRowValue(row, ['exp1', 'expir1', 'expir_1', 'expiry1', 'primary exp', 'expiration1', 'exp date 1'])),
              expiration2: formatExp(getRowValue(row, ['exp2', 'expir2', 'expir_2', 'expiry2', 'secondary exp', 'expiration2', 'exp date 2'])),
              expiration3: formatExp(getRowValue(row, ['exp3', 'expir3', 'expir_3', 'expiry3', 'final exp', 'expiration3', 'exp date 3'])),
              locationId: locationId!,
            };
          }).filter(Boolean) as any[];

          allMedsList.push(...sheetMeds);
        });

        if (allMedsList.length === 0) {
          if (sheetsFound === 0) {
            throw new Error(`Could not identify locations from sheet names: ${wb.SheetNames.join(', ')}. Please rename sheets to 'Adult', 'Pediatric', or 'Mesaieed'.`);
          }
          throw new Error("No valid medication data found in the matched sheets.");
        }

        await medicationOps.bulkAdd(allMedsList, { photoStrategy: importPhotoStrategy });
        await refresh();
        setSuccess(`Success: Imported/Updated ${allMedsList.length} items to ${sheetsFound} locations.`);
        setIsBulkMode(false);
      } catch (error: any) {
        setError(error.message);
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleBulkPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsBulkPhotoUploading(true);
      setError(null);
      setSuccess(null);
      setBulkPhotoProgress({ current: 0, total: 0 });

      const zip = new JSZip();
      const content = await zip.loadAsync(file);
      
      const imageFiles = Object.keys(content.files).filter(fileName => {
        const lower = fileName.toLowerCase();
        return !content.files[fileName].dir && (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp'));
      });

      if (imageFiles.length === 0) {
        throw new Error("No valid image files found in the ZIP archive.");
      }

      setBulkPhotoProgress({ current: 0, total: imageFiles.length });
      setSkippedUploads([]);
      
      let updatedCount = 0;
      let skipped: string[] = [];

      // If we don't have Firebase, fetch ALL medications once to matching against all locations
      let allMeds: Medication[] = medications;
      if (!db) {
        try {
          allMeds = await sharedDb.getMedications();
        } catch (e) {
          console.warn("Could not fetch all meds for bulk matching, using current location list only.");
        }
      }

      // Process in small batches to avoid blocking UI too much
      for (let i = 0; i < imageFiles.length; i++) {
        const fileName = imageFiles[i];
        
        // Parse location from folder name if present
        // Expected structure: "Adult/itemcode.jpg" or just "itemcode.jpg"
        const pathParts = fileName.split('/');
        let targetLocationId: PharmacyLocation | null = null;
        let itemCode = '';

        if (pathParts.length >= 2) {
          const folderName = pathParts[pathParts.length - 2].toLowerCase();
          itemCode = pathParts[pathParts.length - 1].replace(/\.[^/.]+$/, "").trim();
          
          if (folderName.includes('adult') || folderName.includes('male') || folderName.includes('main')) targetLocationId = PharmacyLocation.ADULT;
          else if (folderName.includes('pediatric') || folderName.includes('peds') || folderName.includes('child')) targetLocationId = PharmacyLocation.PEDIATRIC;
          else if (folderName.includes('mesaieed') || folderName.includes('msd') || folderName.includes('mes')) targetLocationId = PharmacyLocation.MESAIEED;
        } else {
          itemCode = pathParts[0].replace(/\.[^/.]+$/, "").trim();
        }
        
        if (!itemCode) continue;

        // MATCHING LOGIC
        let matchingMeds: Medication[] = [];

        if (targetLocationId) {
          // 1. If folder specified, strictly match that location first
          matchingMeds = allMeds.filter(m => 
            m.itemCode.trim().toLowerCase() === itemCode.toLowerCase() && 
            m.locationId === targetLocationId
          );
        } else {
          // 2. If no folder, match in ALL locations (global photo)
          matchingMeds = allMeds.filter(m => 
            m.itemCode.trim().toLowerCase() === itemCode.toLowerCase()
          );
        }
        
        // 3. Fallback search (only if not found yet and targetLocation was specified but item doesn't exist there, maybe it's miscategorized in zip?)
        // Actually, the user's intent is likely strict if they have folders.
        
        if (matchingMeds.length > 0) {
          const fileData = await content.files[fileName].async('blob');
          
          // Resize image helper
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (event) => {
              const img = new Image();
              img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 400;
                const scaleSize = MAX_WIDTH / img.width;
                canvas.width = MAX_WIDTH;
                canvas.height = img.height * scaleSize;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.7));
              };
              img.src = event.target?.result as string;
            };
            reader.readAsDataURL(fileData);
          });

          // Update all matching medications
          for (const med of matchingMeds) {
            await medicationOps.update(med.id, { imageUrl: dataUrl });
          }
          updatedCount++;
        } else {
          skipped.push(itemCode);
        }
        
        setBulkPhotoProgress(prev => prev ? { ...prev, current: i + 1 } : null);
      }

      setSkippedUploads(skipped);
      await refresh();
      if (skipped.length > 0) {
        setSuccess(`Bulk update complete: ${updatedCount} items updated. ${skipped.length} items skipped (could not find matching item code in any location).`);
      } else {
        setSuccess(`Bulk update complete: ${updatedCount} items successfully updated across all locations.`);
      }
    } catch (err: any) {
      setError(`Bulk photo upload failed: ${err.message}`);
      console.error(err);
    } finally {
      setIsBulkPhotoUploading(false);
      setBulkPhotoProgress(null);
      if (bulkPhotoInputRef.current) bulkPhotoInputRef.current.value = '';
    }
  };

  const handlePasteImport = async () => {
    try {
      setIsImporting(true);
      setError(null);
      const rows = bulkInput.split('\n');
      const newMedsList = rows.map((row) => {
        const parts = row.split(/\t|,/);
        if (parts.length < 3) return null;
        return {
          itemCode: parts[0]?.trim(),
          itemName: parts[1]?.trim(),
          qoh: Number(parts[2]?.trim()) || 0,
          generic: parts[3]?.trim() || '',
          minQty: Number(parts[4]?.trim()) || 0,
          maxQty: Number(parts[5]?.trim()) || 0,
          expiration1: parts[6]?.trim() || '',
          expiration2: parts[7]?.trim() || '',
          expiration3: parts[8]?.trim() || '',
          isRefrigerated: 
            row.toLowerCase().includes('refrig') || 
            row.toLowerCase().includes('fridge') || 
            row.toLowerCase().includes('cold') || 
            row.toLowerCase().includes('2-8') ||
            (parts[9]?.trim()?.toLowerCase() === 'yes' || parts[9]?.trim()?.toLowerCase() === 'true'),
          locationId: selectedLocation,
        };
      }).filter(m => m !== null) as any[];

      await medicationOps.bulkAdd(newMedsList);
      await refresh();
      setBulkInput('');
      setSuccess(`Successfully imported ${newMedsList.length} items.`);
      setIsBulkMode(false);
    } catch (error: any) {
      setError(error.message);
    } finally {
      setIsImporting(false);
    }
  };

  const handleSave = async (id?: string) => {
    if (!form.itemCode || !form.itemName) return;
    
    // Check for duplicate item code within the same location
    const formattedCode = form.itemCode.trim().toLowerCase();
    const isDuplicate = medications.some(m => 
      m.itemCode.trim().toLowerCase() === formattedCode && 
      m.id !== editingId
    );

    if (isDuplicate) {
      setError(`Duplicate Item Code: "${form.itemCode}" already exists in this location.`);
      return;
    }
    
    try {
      setError(null);
      if (editingId) {
        await medicationOps.update(editingId, form);
      } else {
        await medicationOps.add({
          ...form,
          locationId: selectedLocation,
        } as any);
      }
      
      await refresh();
      setEditingId(null);
      setIsAdding(false);
      setForm({ itemCode: '', itemName: '', generic: '', to: '', qoh: 0, minQty: 0, maxQty: 0, expiration1: '', expiration2: '', expiration3: '', imageUrl: '', isRefrigerated: false });
      clearDraft();
    } catch (error: any) {
      setError(error.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this item?')) {
      try {
        setError(null);
        await medicationOps.delete(id);
        await refresh();
      } catch (err: any) {
        setError(err.message || 'Failed to delete medication. Please try again.');
        console.error(err);
      }
    }
  };

  const startEdit = (med: Medication) => {
    setEditingId(med.id);
    setForm({
      itemCode: med.itemCode,
      itemName: med.itemName,
      generic: med.generic || '',
      to: med.to || '',
      qoh: med.qoh,
      minQty: med.minQty ?? 0,
      maxQty: med.maxQty ?? 0,
      expiration1: med.expiration1,
      expiration2: med.expiration2,
      expiration3: med.expiration3,
      imageUrl: med.imageUrl || '',
      isRefrigerated: med.isRefrigerated || false
    });
  };

  const handleSystemReset = async () => {
    const currentAdminPassword = localStorage.getItem('adminPassword') || 'admin123';
    
    if (resetPassword !== currentAdminPassword) {
      setResetError('Incorrect password. Reset aborted.');
      return;
    }

    if (auth && !auth.currentUser) {
      try {
        await signInAnonymously(auth);
      } catch (err) {
        console.warn('Anonymous sign-in failed during reset, proceeding as guest:', err);
        // We don't return here anymore, we'll let Firestore decide if permissions are sufficient
      }
    }

    try {
      setIsResetting(true);
      setResetError('');
      await systemOps.resetAll();
      await refresh();
      setSuccess('Application has been successfully reset.');
      setIsResetModalOpen(false);
      setResetPassword('');
    } catch (err: any) {
      setResetError(err.message || 'Reset failed.');
    } finally {
      setIsResetting(false);
    }
  };

  const startCorrection = (med: Medication) => {
    setSelectedMedForEdit(med);
    setEditMin(String(med.minQty || 0));
    setEditMax(String(med.maxQty || 0));
    setShowCorrectionModal(true);
  };

  const saveCorrection = async () => {
    if (!selectedMedForEdit) return;
    setIsUpdating(true);
    try {
      await medicationOps.update(selectedMedForEdit.id, {
        minQty: Number(editMin),
        maxQty: Number(editMax)
      });
      setShowCorrectionModal(false);
      setSelectedMedForEdit(null);
      await refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-6 md:space-y-8 pb-20 px-4 md:px-0">
      {skippedUploads.length > 0 && (
        <div className="bg-red-50 border border-red-200 p-4 rounded-2xl animate-in fade-in zoom-in-95">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold text-red-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Upload Summary
            </h4>
            <button onClick={() => setSkippedUploads([])} className="text-[10px] font-bold text-red-400 hover:text-red-600">Dismiss</button>
          </div>
          <div className="space-y-1 text-[10px] text-red-700/60 leading-tight">
            <p>The following item codes were in the ZIP but didn't match ANY items in the database:</p>
            <div className="flex flex-wrap gap-1.5 pt-1 mb-2">
              {skippedUploads.map(code => (
                <span key={code} className="px-2 py-0.5 bg-white/50 border border-red-100 rounded text-[9px] font-mono font-medium text-red-600">{code}</span>
              ))}
            </div>
            <div className="bg-amber-50 p-4 rounded-xl border border-amber-200">
               <div className="flex items-center gap-2 text-amber-800 mb-1">
                 <Info size={14} />
                 <p className="font-bold text-[10px] uppercase tracking-wider">Pro Tip: Location-Specific Photos</p>
               </div>
               <p className="text-amber-700/80 text-[10px] leading-relaxed italic">
                 To upload different photos for the same item in different stores, place images in folders named: <br/>
                 <span className="font-bold">"Adult/"</span>, <span className="font-bold">"Pediatric/"</span>, or <span className="font-bold">"Mesaieed/"</span> inside your ZIP. <br/>
                 Files in the root folder will be applied globally to all locations.
               </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-6">
          <div className="flex flex-col w-full md:w-auto">
            <div className="flex items-center flex-wrap gap-2 mb-4">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-[#141414]/10 rounded-full shadow-sm">
                <div className={`w-2 h-2 rounded-full ${isFirebaseConnected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-amber-400 animate-pulse'}`} />
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#141414]/60">
                  Cloud Status: {isFirebaseConnected ? 'Online (Firebase)' : 'Local Mode (Fallback)'}
                </span>
                {!isFirebaseConnected && (
                  <div className="group relative ml-1">
                    <AlertCircle size={12} className="text-amber-500 cursor-help" />
                    <div className="absolute left-0 top-full pt-2 z-50 hidden group-hover:block w-48">
                      <div className="bg-[#141414] text-white text-[10px] p-3 rounded-xl shadow-xl leading-relaxed">
                        Firebase not configured or disabled. App is using local storage and API routes.
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 px-3 py-1 bg-[#F27D26]/5 rounded-full text-[10px] font-bold text-[#F27D26] uppercase tracking-widest border border-[#F27D26]/10 shadow-sm">
                <UploadCloud className="w-3 h-3" />
                <span className="opacity-60 text-[#141414]">Inventory Updated:</span>
                <span className="text-[#F27D26]">
                  {lastUpdate ? format(new Date(lastUpdate), 'EEEE, dd-MM-yyyy hh:mm a').toUpperCase() : 'No Data'}
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2">
              {[
                { id: 'all', label: 'All', icon: Filter },
                { id: 'in', label: 'In Stock', icon: Check },
                { id: 'low', label: 'Low Stock', icon: AlertTriangle },
                { id: 'out', label: 'Out of Stock', icon: Trash2 }
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setStockFilter(f.id as any)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap border ${
                    stockFilter === f.id
                      ? f.id === 'in' ? 'bg-emerald-500 text-white border-emerald-500 shadow-md' :
                        f.id === 'low' ? 'bg-amber-500 text-white border-amber-500 shadow-md' :
                        f.id === 'out' ? 'bg-red-500 text-white border-red-500 shadow-md' :
                        'bg-[#141414] text-white border-[#141414] shadow-md'
                      : 'bg-white text-[#141414]/60 border-[#141414]/10 hover:bg-[#141414]/5'
                  }`}
                >
                  <f.icon size={14} />
                  {f.label}
                </button>
              ))}
            </div>
            
            <div className="flex items-center justify-between md:justify-start gap-3">
            <h1 className="text-2xl md:text-3xl font-bold text-[#141414]">Management</h1>
            <div className="flex items-center gap-2 px-3 py-1 bg-[#F27D26]/5 rounded-full text-[10px] font-bold text-[#F27D26] uppercase tracking-widest border border-[#F27D26]/10">
              <UploadCloud className="w-3 h-3" />
              <span className="opacity-60 text-[#141414]">Last Update:</span>
              <span className="text-[#F27D26]">
                {lastUpdate ? format(new Date(lastUpdate), 'EEEE, dd-MM-yyyy hh:mm a').toUpperCase() : 'No Data'}
              </span>
            </div>
            <button 
              onClick={() => refresh(true)}
              disabled={isSyncing}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all relative ${
                showSyncPulse
                ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-sm'
                : 'bg-emerald-50/30 text-emerald-600/60 border border-emerald-100'
              } disabled:opacity-50 shadow-sm`}
            >
              <div className={`w-1.5 h-1.5 rounded-full ${showSyncPulse ? 'bg-emerald-500 animate-ping' : 'bg-emerald-400 opacity-50'}`} />
              {isSyncing ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Cloud className="w-3 h-3" />
              )}
              {showSyncPulse ? 'Live Update' : `Sync Logged ${format(lastSynced, 'HH:mm')}`}
            </button>
          </div>
          <p className="text-[#141414]/50 text-sm md:text-base">Stock inventory control panel</p>
        </div>
        
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <Link 
            to="/admin/inventory"
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-3 md:py-2 bg-[#141414] text-white rounded-xl text-xs sm:text-sm font-bold hover:bg-[#F27D26] transition-colors shadow-lg shadow-black/10"
          >
            <History className="w-4 h-4" />
            Stock Take
          </Link>
          <button 
            onClick={() => setIsBulkMode(true)}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-3 md:py-2 border border-[#141414]/10 rounded-xl text-xs sm:text-sm font-bold hover:bg-[#141414]/5 transition-colors"
          >
            <ArrowLeftRight className="w-4 h-4" />
            Bulk Import
          </button>
          
          <button 
            onClick={() => bulkPhotoInputRef.current?.click()}
            disabled={isBulkPhotoUploading}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-3 md:py-2 border border-[#141414]/10 rounded-xl text-xs sm:text-sm font-bold hover:bg-[#141414]/5 transition-colors relative"
          >
            {isBulkPhotoUploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            Bulk Photos
            {bulkPhotoProgress && (
              <span className="absolute -top-2 -right-2 bg-[#F27D26] text-white text-[8px] px-1.5 py-0.5 rounded-full shadow-sm font-black">
                {Math.round((bulkPhotoProgress.current / bulkPhotoProgress.total) * 100)}%
              </span>
            )}
          </button>
          <input 
            type="file" 
            ref={bulkPhotoInputRef}
            onChange={handleBulkPhotoUpload}
            accept=".zip,.rar" 
            className="hidden" 
          />

          <button 
            onClick={() => setIsAdding(true)}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-3 md:py-2 bg-[#F27D26] text-white rounded-xl text-xs sm:text-sm font-bold hover:bg-[#F27D26]/90 transition-colors shadow-lg shadow-[#F27D26]/20"
          >
            <Plus className="w-4 h-4" />
            Add New
          </button>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="p-6 bg-red-50/30 border border-red-100 rounded-3xl animate-in fade-in slide-in-from-top-4 duration-500">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle size={18} />
              <h3 className="text-base font-bold uppercase tracking-tight">Danger Zone</h3>
            </div>
            <p className="text-xs text-red-600/60 max-w-xl leading-relaxed">
              Resetting will permanently delete all medications across all locations and clear the entire audit history. This action cannot be undone.
            </p>
          </div>
          <button 
            onClick={() => setIsResetModalOpen(true)}
            className="w-full md:w-auto px-5 py-3 bg-red-600 text-white rounded-xl text-xs font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-200 flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Reset Application Data
          </button>
        </div>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-between gap-4 shadow-sm"
          >
            <div className="flex items-center gap-3 text-red-700">
              <AlertCircle size={18} />
              <p className="text-sm font-bold">{error}</p>
            </div>
            <button 
              onClick={() => setError(null)}
              className="p-1 hover:bg-red-100 rounded-lg transition-colors text-red-500"
            >
              <XIcon size={16} />
            </button>
          </motion.div>
        )}
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between gap-4 shadow-sm"
          >
            <div className="flex items-center gap-3 text-emerald-700">
              <Check size={18} />
              <p className="text-sm font-bold">{success}</p>
            </div>
            <button 
              onClick={() => setSuccess(null)}
              className="p-1 hover:bg-emerald-100 rounded-lg transition-colors text-emerald-500"
            >
              <XIcon size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expiration Alerts Widget */}
      <div className="flex flex-col gap-6 md:gap-8">
        {/* Top Horizontal Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Inventory Stats Mini Card */}
          <div className="bg-[#141414] text-white p-5 rounded-3xl shadow-xl flex flex-col justify-between border border-white/5">
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-[#F27D26]/20 rounded-xl text-[#F27D26]">
                <Settings2 size={18} />
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Total Items</p>
                <p className="text-xl font-bold">{formatNumber(medications.length)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Expiring Items</p>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-red-400">{formatNumber(expirationStats.current)}</span>
                  <span className="text-[9px] text-white/30 truncate">this month</span>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Low Stock</p>
                <p className="text-sm font-bold text-amber-400">
                  {formatNumber(medications.filter(m => m.maxQty > 0 && m.qoh < m.maxQty * 0.3).length)}
                </p>
              </div>
            </div>
          </div>

          {/* Activity Feed Card */}
          <div className="bg-white rounded-3xl p-5 border border-[#141414]/10 shadow-sm flex flex-col h-[180px]">
             <div className="flex items-center gap-2 mb-3">
               <History size={16} className="text-[#F27D26]" />
               <p className="text-[10px] font-black uppercase tracking-widest text-[#141414]/40">Live Activity</p>
             </div>
             <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-hide">
               {auditsLoading ? (
                 <div className="flex justify-center py-4">
                    <Loader2 className="animate-spin w-4 h-4 text-[#F27D26]/40" />
                 </div>
               ) : audits.length > 0 ? (
                 audits.map((audit) => (
                   <div key={audit.id} className="flex flex-col gap-1 border-l-2 border-[#F27D26]/10 pl-2">
                      <p className="text-[10px] font-bold text-[#141414] truncate">{audit.itemName}</p>
                      <div className="flex items-center justify-between text-[8px]">
                        <span className={`font-black uppercase tracking-widest ${audit.variance !== 0 ? 'text-[#F27D26]' : 'text-emerald-600'}`}>
                          {audit.variance > 0 ? `+${audit.variance}` : audit.variance < 0 ? audit.variance : 'MATCH'}
                        </span>
                        <span className="text-[#141414]/30">{audit.auditedAt ? format(audit.auditedAt.toDate ? audit.auditedAt.toDate() : new Date(audit.auditedAt), 'HH:mm') : 'Now'}</span>
                      </div>
                   </div>
                 ))
               ) : (
                 <p className="text-[10px] text-center text-[#141414]/20 italic py-4">No recent edits</p>
               )}
             </div>
          </div>

          {/* System Status Mini Card */}
          <div className="bg-emerald-50 p-5 rounded-3xl border border-emerald-100 flex flex-col justify-between shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-emerald-100 rounded-xl text-emerald-600">
                <RefreshCw size={18} className="animate-spin-slow" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-emerald-800">Cloud Link</h3>
                <p className="text-[9px] text-emerald-600 font-bold uppercase tracking-tight">Real-time Connected</p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-[9px] text-emerald-700/60 font-bold uppercase">Last Sync</div>
              <div className="text-xs font-bold text-emerald-700">{format(lastSynced, 'HH:mm:ss')}</div>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white rounded-2xl border border-[#141414]/10 shadow-sm overflow-hidden">
            <div className="p-4 bg-[#F27D26]/5 border-b border-[#141414]/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-[#F27D26]/10 rounded-lg text-[#F27D26]">
                  <AlertTriangle size={18} />
                </div>
                <h3 className="font-bold text-sm">Expiration Alerts</h3>
                <span className="bg-[#F27D26] text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                  {expiringItems.length}
                </span>
              </div>
              
              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                <div className="relative flex-1 md:flex-none">
                  <CalendarClock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#141414]/30" />
                  <input 
                    type="month" 
                    value={expSearchMonth}
                    onChange={(e) => setExpSearchMonth(e.target.value)}
                    className="w-full md:w-40 pl-9 pr-2 py-1.5 bg-white border border-[#141414]/10 rounded-lg text-[10px] font-bold focus:outline-none focus:ring-2 focus:ring-[#F27D26]/20 transition-all cursor-pointer"
                  />
                  {expSearchMonth && (
                    <button 
                      onClick={() => setExpSearchMonth('')}
                      className="absolute right-8 top-1/2 -translate-y-1/2 p-0.5 hover:bg-[#141414]/5 rounded text-[#141414]/40"
                    >
                      <XIcon size={12} />
                    </button>
                  )}
                </div>

                <div className="relative flex-1 md:flex-none">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#141414]/30" />
                  <input 
                    type="text" 
                    placeholder="Search name/code..."
                    value={expSearchQuery}
                    onChange={(e) => setExpSearchQuery(e.target.value)}
                    className="w-full md:w-40 pl-9 pr-8 py-1.5 bg-white border border-[#141414]/10 rounded-lg text-[10px] font-bold focus:outline-none focus:ring-2 focus:ring-[#F27D26]/20 transition-all"
                  />
                  {expSearchQuery && (
                    <button 
                      onClick={() => setExpSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-[#141414]/5 rounded text-[#141414]/40"
                    >
                      <XIcon size={12} />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest hidden sm:inline">Alert Threshold:</span>
                  <div className="flex bg-white border border-[#141414]/10 rounded-lg p-1">
                    {[30, 60, 90].map(val => (
                      <button
                        key={val}
                        onClick={() => setAlertThreshold(val)}
                        className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${
                          alertThreshold === val ? 'bg-[#141414] text-white' : 'text-[#141414]/40 hover:text-[#141414]'
                        }`}
                      >
                        {val}d
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="max-h-[300px] overflow-y-auto">
              {expiringItems.length > 0 ? (
                <div className="divide-y divide-[#141414]/5">
                  {expiringItems.map(item => item && (
                    <div key={item.id} className="p-4 flex items-center justify-between hover:bg-[#F27D26]/[0.02] transition-colors">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#141414]">{item.itemName}</span>
                          {item.isRefrigerated && (
                            <ThermometerSnowflake size={10} className="text-blue-500" />
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-[#141414]/40">{item.itemCode}</span>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <div className="text-[10px] text-[#141414]/40 font-bold uppercase tracking-widest mb-0.5">Expires On</div>
                          <div className="text-[10px] font-bold text-[#141414]">
                            {format(item.nextExp, 'dd-MM-yyyy')}
                          </div>
                        </div>
                        <div className="text-right min-w-[70px]">
                          <div className="text-[10px] text-[#141414]/40 font-bold uppercase tracking-widest mb-0.5">In</div>
                          <div className={`text-sm font-bold ${item.daysLeft <= 15 ? 'text-red-500' : item.daysLeft <= 30 ? 'text-[#F27D26]' : 'text-amber-500'}`}>
                            {formatNumber(item.daysLeft)}d
                          </div>
                        </div>
                        <div className="text-right min-w-[80px]">
                          <div className="text-[10px] text-[#141414]/40 font-bold uppercase tracking-widest mb-0.5">Qty</div>
                          <div className="text-sm font-bold">{formatNumber(item.qoh)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-10 text-center text-[#141414]/20 font-bold italic text-sm">
                  No medications expiring within {alertThreshold} days.
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
    
    <AnimatePresence>
        {isBulkMode && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsBulkMode(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-4xl bg-[#141414] text-white p-6 md:p-8 rounded-[2rem] md:rounded-3xl shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center sticky top-0 bg-[#141414] z-10 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 md:p-3 bg-[#F27D26]/20 rounded-2xl text-[#F27D26]">
                    <FileSpreadsheet size={20} className="md:w-6 md:h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg md:text-xl font-bold">Bulk Stock Import</h3>
                    <p className="text-white/40 text-[10px] md:text-sm">Upload Excel or paste a list of items</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsBulkMode(false)}
                  className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                >
                  <XIcon className="w-6 h-6 opacity-50" />
                </button>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
                <div className="space-y-6">
                  <div className="p-4 md:p-6 bg-white/5 rounded-2xl border border-white/10 flex flex-col items-center text-center">
                    <div className="w-12 h-12 md:w-16 md:h-16 bg-[#F27D26]/10 rounded-full flex items-center justify-center mb-4">
                      <Upload className="w-6 h-6 md:w-8 md:h-8 text-[#F27D26]" />
                    </div>
                    <p className="text-xs font-bold text-white mb-2 uppercase tracking-widest">Option 1: Excel File</p>
                    <p className="text-[10px] md:text-xs text-white/40 mb-6 leading-relaxed">
                      Upload an Excel workbook with sheets named <br className="hidden md:block"/>
                      <span className="text-[#F27D26] font-bold">"Adult"</span>, 
                      <span className="text-[#F27D26] font-bold"> "Pediatric"</span>, or 
                      <span className="text-[#F27D26] font-bold"> "Mesaieed"</span>.<br/>
                      Columns: itemCode, itemName, QOH, Min, Max, Exp1, Exp2, Exp3
                    </p>
                    
                    <div className="w-full space-y-4">
                      <button 
                        onClick={() => { setImportPhotoStrategy('keep'); fileInputRef.current?.click(); }}
                        disabled={isImporting}
                        className="w-full p-4 bg-white text-black hover:bg-white/90 rounded-2xl text-sm font-bold transition-all shadow-xl shadow-white/5 disabled:opacity-50 flex items-center justify-between group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-[#F27D26]/10 rounded-xl text-[#F27D26]">
                            <Cloud size={18} />
                          </div>
                          <div className="text-left">
                            <p className="font-bold">Keep items photos</p>
                            <p className="text-[10px] text-black/40 font-medium">Auto-sync photos from cloud by code</p>
                          </div>
                        </div>
                        <ChevronRight size={18} className="opacity-20 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                      </button>

                      <div className="relative">
                        <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-white/5"></span></div>
                        <div className="relative flex justify-center text-[8px] uppercase tracking-widest"><span className="bg-[#141414] px-2 text-white/20 font-black tracking-[0.2em]">or</span></div>
                      </div>

                      <button 
                        onClick={() => { setImportPhotoStrategy('remove'); fileInputRef.current?.click(); }}
                        disabled={isImporting}
                        className="w-full p-4 bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500 hover:text-white rounded-2xl text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-between group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-red-500/20 rounded-xl">
                            <Trash2 size={18} />
                          </div>
                          <div className="text-left">
                            <p className="font-bold">Remove items photos</p>
                            <p className="text-[10px] opacity-60 font-medium">Wipe all photos for these items</p>
                          </div>
                        </div>
                        <ChevronRight size={18} className="opacity-20 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                      </button>
                    </div>

                    <input 
                      type="file"
                      ref={fileInputRef}
                      onChange={handleExcelUpload}
                      accept=".xlsx, .xls"
                      className="hidden"
                    />
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="p-4 md:p-6 bg-white/5 rounded-2xl border border-white/10">
                    <p className="text-[10px] font-bold text-white mb-4 uppercase tracking-widest">Option 2: Paste List</p>
                    <textarea 
                      value={bulkInput}
                      onChange={(e) => setBulkInput(e.target.value)}
                      placeholder="code,name,qoh,min,max,exp1,exp2,exp3..."
                      className="w-full h-32 md:h-40 bg-[#141414] border border-white/10 rounded-xl p-4 text-[10px] font-mono focus:outline-none focus:border-[#F27D26] transition-colors resize-none"
                    />
                    <button 
                      onClick={handlePasteImport}
                      disabled={!bulkInput.trim() || isImporting}
                      className="w-full mt-4 py-4 bg-[#F27D26] hover:bg-[#F27D26]/90 rounded-2xl text-sm font-bold transition-all disabled:opacity-50 shadow-xl shadow-[#F27D26]/20 flex items-center justify-center gap-2"
                    >
                      {isImporting ? <Loader2 className="animate-spin w-4 h-4" /> : null}
                      Process to {selectedLocation.split('-').pop()}
                    </button>
                    <p className="text-[9px] text-white/30 text-center mt-3 lowercase italic font-mono">
                      * Paste uses current selected location ({selectedLocation})
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Location Filter & Table Header */}
      <div className="flex flex-col gap-4 px-4 md:px-0">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#F27D26]/10 rounded-xl text-[#F27D26]">
              <ClipboardList size={20} />
            </div>
            <h2 className="text-xl font-bold tracking-tight">Inventory Management</h2>
          </div>
          
          <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
            {/* Search Bar */}
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#141414]/30" />
              <input 
                type="text" 
                placeholder="Search code or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2.5 bg-[#141414]/5 border border-transparent rounded-2xl text-xs font-bold focus:outline-none focus:bg-white focus:border-[#F27D26]/20 transition-all"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 hover:bg-[#141414]/5 rounded-md text-[#141414]/40"
                >
                  <XIcon size={14} />
                </button>
              )}
            </div>

            <div className="flex gap-2 p-1 bg-[#141414]/5 rounded-2xl w-full md:w-fit overflow-x-auto no-scrollbar">
              {LOCATIONS.map(loc => (
                <button
                  key={loc.id}
                  onClick={() => setSelectedLocation(loc.id as PharmacyLocation)}
                  className={`flex-1 md:flex-none whitespace-nowrap px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                    selectedLocation === loc.id 
                      ? loc.id === PharmacyLocation.ADULT
                        ? 'bg-emerald-100 border border-emerald-200 text-emerald-700 shadow-sm'
                        : loc.id === PharmacyLocation.PEDIATRIC
                          ? 'bg-sky-100 border border-sky-200 text-sky-700 shadow-sm'
                          : loc.id === PharmacyLocation.MESAIEED
                            ? 'bg-orange-100 border border-orange-200 text-orange-700 shadow-sm'
                            : 'bg-white shadow-sm text-[#141414]'
                      : 'text-[#141414]/40 hover:text-[#141414]'
                  }`}
                >
                  {loc.name.replace('Aw-', '')}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-white rounded-3xl border border-[#141414]/10 shadow-sm overflow-hidden min-h-[400px]">
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto max-h-[75vh]">
          <table className="w-full text-left">
            <thead className="sticky top-0 z-20 bg-white shadow-sm">
              <tr className="bg-[#141414]/5 text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 border-b border-[#141414]/10">
              <th 
                className="px-6 py-4 sticky top-0 bg-[#F9F9F9] cursor-pointer hover:bg-[#141414]/5 transition-colors"
                onClick={() => toggleSort('itemName')}
              >
                <div className="flex items-center gap-1">
                  Item Details
                  {sortField === 'itemName' && (
                    sortOrder === 'asc' ? <Sparkles className="w-3 h-3 text-[#F27D26]" /> : <RefreshCw className="w-3 h-3 text-[#F27D26]" />
                  )}
                </div>
              </th>
              <th 
                className="px-6 py-4 sticky top-0 bg-[#F9F9F9] cursor-pointer hover:bg-[#141414]/5 transition-colors"
                onClick={() => toggleSort('qoh')}
              >
                <div className="flex items-center gap-1">
                  Quantity on Hand
                  {sortField === 'qoh' && (
                    sortOrder === 'asc' ? <Sparkles className="w-3 h-3 text-[#F27D26]" /> : <RefreshCw className="w-3 h-3 text-[#F27D26]" />
                  )}
                </div>
              </th>
              <th 
                className="px-6 py-4 sticky top-0 bg-[#F9F9F9] cursor-pointer hover:bg-[#141414]/5 transition-colors"
                onClick={() => toggleSort('minQty')}
              >
                <div className="flex items-center gap-1">
                  Min / Max
                  {sortField === 'minQty' && (
                    sortOrder === 'asc' ? <Sparkles className="w-3 h-3 text-[#F27D26]" /> : <RefreshCw className="w-3 h-3 text-[#F27D26]" />
                  )}
                </div>
              </th>
              <th 
                className="px-6 py-4 sticky top-0 bg-[#F9F9F9] cursor-pointer hover:bg-[#141414]/5 transition-colors"
                onClick={() => toggleSort('expiration1')}
              >
                <div className="flex items-center gap-1">
                  Expirations (1 / 2 / 3)
                  {sortField === 'expiration1' && (
                    sortOrder === 'asc' ? <Sparkles className="w-3 h-3 text-[#F27D26]" /> : <RefreshCw className="w-3 h-3 text-[#F27D26]" />
                  )}
                </div>
              </th>
              <th className="px-6 py-4 text-right sticky top-0 bg-[#F9F9F9]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#141414]/5">
            {loading && (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-[#F27D26]" />
                </td>
              </tr>
            )}
            {/* Inline Add/Edit Form */}
            {(isAdding || editingId) && (
              <tr className="bg-[#F27D26]/5 animate-in fade-in duration-300">
                <td className="px-6 py-4">
                  <div className="flex gap-4">
                    <div className="flex flex-col items-center gap-2">
                       <div className="w-16 h-16 bg-[#141414]/5 rounded-xl border border-[#141414]/10 flex items-center justify-center overflow-hidden relative group">
                         {form.imageUrl ? (
                           <>
                             <img src={form.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                             <button 
                               onClick={() => setForm(prev => ({ ...prev, imageUrl: '' }))}
                               className="absolute inset-0 bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-[8px] font-bold"
                             >
                               REMOVE
                             </button>
                           </>
                         ) : (
                           <ImageIcon size={20} className="text-[#141414]/20" />
                         )}
                       </div>
                       <div className="flex gap-1">
                         <button 
                           onClick={() => startCamera()}
                           className="p-1.5 bg-[#141414]/5 hover:bg-[#141414]/10 rounded-lg text-[#141414]/40 hover:text-[#F27D26] transition-all"
                           title="Take Photo"
                         >
                           <Camera size={14} />
                         </button>
                         <label className="p-1.5 bg-[#141414]/5 hover:bg-[#141414]/10 rounded-lg text-[#141414]/40 hover:text-[#F27D26] transition-all cursor-pointer">
                           <ImageIcon size={14} />
                           <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                         </label>
                       </div>
                    </div>
                    <div className="flex-1 space-y-2">
                      <input 
                        type="text" 
                        placeholder="Code" 
                        autoFocus
                        className="w-full text-xs font-mono p-1 border rounded"
                        value={form.itemCode}
                        onChange={e => setForm({...form, itemCode: e.target.value})}
                      />
                      <input 
                        type="text" 
                        placeholder="Item Name" 
                        className="w-full text-sm font-bold p-1 border rounded"
                        value={form.itemName}
                        onChange={e => setForm({...form, itemName: e.target.value})}
                      />
                      <input 
                        type="text" 
                        placeholder="Generic Name" 
                        className="w-full text-[10px] p-1 border rounded italic text-[#141414]/60"
                        value={form.generic}
                        onChange={e => setForm({...form, generic: e.target.value})}
                      />
                      <input 
                        type="text" 
                        placeholder="Linked Codes (To)" 
                        className="w-full text-[10px] p-1 border rounded text-[#F27D26] font-bold"
                        value={form.to}
                        onChange={e => setForm({...form, to: e.target.value})}
                      />
                      <label className="flex items-center gap-2 cursor-pointer select-none mt-1">
                        <input 
                          type="checkbox" 
                          className="w-3 h-3 rounded text-[#F27D26] focus:ring-[#F27D26]/20 border-[#141414]/10"
                          checked={form.isRefrigerated}
                          onChange={e => setForm({...form, isRefrigerated: e.target.checked})}
                        />
                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-[9px] font-black uppercase tracking-tighter border border-blue-100/50">
                          <ThermometerSnowflake size={10} className="text-blue-500" />
                          Refrigerated (2-8°C)
                        </div>
                      </label>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                       <input 
                         type="checkbox" 
                         id="isRefrigerated"
                         checked={form.isRefrigerated}
                         onChange={e => setForm({...form, isRefrigerated: e.target.checked})}
                         className="w-4 h-4 rounded border-[#141414]/10 text-[#F27D26] focus:ring-[#F27D26]/20"
                       />
                       <label htmlFor="isRefrigerated" className="text-[10px] font-bold text-[#141414]/60 uppercase tracking-widest flex items-center gap-1">
                          <ThermometerSnowflake size={12} className="text-blue-500" />
                          Refrigerated (2-8°C)
                       </label>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest">Qty:</span>
                    <input 
                      type="number" 
                      step="any"
                      className="w-20 p-1 border rounded text-sm"
                      value={form.qoh}
                      onChange={e => setForm({...form, qoh: e.target.value === '' ? 0 : parseFloat(e.target.value)})}
                    />
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest">Min:</span>
                      <input 
                        type="number" 
                        step="any"
                        className="w-20 p-1 border rounded text-sm"
                        value={form.minQty}
                        onChange={e => setForm({...form, minQty: e.target.value === '' ? 0 : parseFloat(e.target.value)})}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest">Max:</span>
                      <input 
                        type="number" 
                        step="any"
                        className="w-20 p-1 border rounded text-sm"
                        value={form.maxQty}
                        onChange={e => setForm({...form, maxQty: e.target.value === '' ? 0 : parseFloat(e.target.value)})}
                      />
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex gap-2 text-xs">
                    <input type="text" placeholder="Exp1" className="w-24 p-1 border rounded" value={form.expiration1} onChange={e => setForm({...form, expiration1: e.target.value})} />
                    <input type="text" placeholder="Exp2" className="w-24 p-1 border rounded" value={form.expiration2} onChange={e => setForm({...form, expiration2: e.target.value})} />
                    <input type="text" placeholder="Exp3" className="w-24 p-1 border rounded" value={form.expiration3} onChange={e => setForm({...form, expiration3: e.target.value})} />
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => { setIsAdding(false); setEditingId(null); clearDraft(); }} className="p-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-colors"><XIcon className="w-4 h-4" /></button>
                    <button onClick={() => handleSave()} className="p-1.5 bg-green-50 text-green-500 rounded-lg hover:bg-green-500 hover:text-white transition-colors"><Check className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            )}
            {!loading && sortedMedications.length === 0 && (searchQuery || stockFilter !== 'all') && (
              <tr>
                <td colSpan={5} className="px-6 py-20 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Search className="w-8 h-8 text-[#141414]/10" />
                    <p className="text-sm font-bold text-[#141414]/40 italic">No products match your search or filter.</p>
                    <button 
                      onClick={() => { setSearchQuery(''); setStockFilter('all'); }}
                      className="text-[10px] font-bold text-[#F27D26] hover:underline uppercase tracking-widest mt-2"
                    >
                      Clear all filters
                    </button>
                  </div>
                </td>
              </tr>
            )}
            {!loading && sortedMedications.map(med => {
              const isOutOfStock = med.qoh <= 0;
              const isLowStock = !isOutOfStock && med.maxQty > 0 && med.qoh < med.maxQty * 0.3;
              const isNew = med.addedAt ? differenceInDays(new Date(), (med.addedAt as any).toDate?.() || new Date(med.addedAt)) < 10 : false;
              
              // Expiration check for highlighting
              const today = startOfToday();
              const dates = [med.expiration1, med.expiration2, med.expiration3]
                .map(parseExpDate)
                .filter(d => d !== null && !isBefore(d, today)) as Date[];
              
              let expirationAlertClass = '';
              if (dates.length > 0) {
                const nextExp = new Date(Math.min(...dates.map(d => d.getTime())));
                const daysLeft = differenceInDays(nextExp, today);
                if (daysLeft <= 15) {
                  expirationAlertClass = 'bg-red-100/80';
                } else if (daysLeft <= 30) {
                  expirationAlertClass = 'bg-yellow-100/80';
                }
              }
              
              return (
                <tr key={med.id} className={`group hover:bg-[#141414]/[0.02] transition-colors ${editingId === med.id ? 'hidden' : ''} ${expirationAlertClass || (isOutOfStock ? 'bg-red-50/50' : isLowStock ? 'bg-amber-50/30' : '')}`}>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono font-bold text-[#141414]/40">{med.itemCode}</span>
                        {isNew ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-[1px] bg-[#F27D26]/10 text-[#F27D26] text-[8px] font-extrabold rounded-full tracking-tight whitespace-nowrap">
                            <Sparkles className="w-2 h-2" />
                            NEW
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-[#141414]/20">-</span>
                        )}
                      </div>
                      <button 
                        onClick={() => med.to ? setSelectedMedForLinks(med) : startCorrection(med)}
                        className="flex flex-col items-start gap-0.5 group/name"
                      >
                        <span className="text-sm font-bold text-[#141414] group-hover/name:text-[#F27D26] transition-colors">{med.itemName}</span>
                        {med.isRefrigerated && (
                          <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-[10px] font-black uppercase tracking-tight w-fit border border-blue-200 shadow-sm mt-1">
                            <ThermometerSnowflake size={12} className="text-blue-600 animate-pulse" />
                            REFRIGERATED
                          </div>
                        )}
                        {med.generic && (
                          <span className="text-[10px] italic text-[#141414]/40 leading-tight group-hover/name:text-[#F27D26]/60 transition-colors">
                            {med.generic}
                          </span>
                        )}
                        {med.to && (
                          <div className="flex items-center gap-1 mt-0.5">
                             <div className="w-1 h-1 rounded-full bg-[#F27D26] animate-pulse" />
                             <span className="text-[8px] font-black text-[#F27D26] uppercase tracking-tighter">Linked items available</span>
                          </div>
                        )}
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${isOutOfStock ? 'text-red-600' : isLowStock ? 'text-amber-600' : 'text-emerald-600'}`}>{formatNumber(med.qoh)}</span>
                        <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${
                          isOutOfStock ? 'bg-red-100 text-red-600' : isLowStock ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'
                        }`}>
                          {isOutOfStock ? (
                            <>
                              <AlertCircle size={8} />
                              Out of Stock
                            </>
                          ) : isLowStock ? (
                            <>
                              <AlertCircle size={8} />
                              Low Stock
                            </>
                          ) : (
                            <>
                              <CheckCircle2 size={8} className="text-emerald-500" />
                              In Stock
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">
                      <span>Min: <span className="text-[#141414]">{formatNumber(med.minQty)}</span></span>
                      <span>Max: <span className="text-[#141414]">{formatNumber(med.maxQty)}</span></span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                  <div className="flex gap-2 font-mono text-[10px]">
                    <span className="bg-[#141414]/5 px-1.5 py-0.5 rounded italic">{med.expiration1 || '-'}</span>
                    <span className="bg-[#141414]/5 px-1.5 py-0.5 rounded italic">{med.expiration2 || '-'}</span>
                    <span className="bg-[#141414]/5 px-1.5 py-0.5 rounded italic">{med.expiration3 || '-'}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => startEdit(med)} className="p-1.5 hover:bg-black rounded-lg hover:text-white transition-colors"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(med.id)} className="p-1.5 hover:bg-red-500 rounded-lg hover:text-white transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            );
          })}
            
            {!loading && medications.length === 0 && !isAdding && (
              <tr>
                <td colSpan={4} className="px-6 py-20 text-center text-[#141414]/20 font-bold italic">
                  No medications in this location yet. Use "+" to add some!
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden divide-y divide-[#141414]/5">
        {loading && (
          <div className="p-10 flex flex-col items-center justify-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-[#F27D26]" />
            <p className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest">Loading Items...</p>
          </div>
        )}

        {!loading && sortedMedications.length === 0 && (searchQuery || stockFilter !== 'all') && (
           <div className="p-16 text-center flex flex-col items-center gap-3">
             <Search className="w-10 h-10 text-[#141414]/10" />
             <p className="font-bold text-[#141414]/40 uppercase tracking-widest text-xs leading-relaxed px-4">
               No medications match your <br/> current search criteria
             </p>
             <button 
                onClick={() => { setSearchQuery(''); setStockFilter('all'); }}
                className="mt-2 px-6 py-2.5 bg-[#F27D26]/10 text-[#F27D26] rounded-full text-[10px] font-bold uppercase tracking-widest"
             >
                Reset Search
             </button>
           </div>
        )}
        
        {/* Inline Add/Edit Form for Mobile */}
        {(isAdding || editingId) && (
          <div className="p-4 bg-[#F27D26]/5 space-y-4">
            <div className="flex justify-center mb-2">
               <div className="flex flex-col items-center gap-2">
                  <div className="w-24 h-24 bg-white rounded-3xl border border-[#141414]/10 flex items-center justify-center overflow-hidden relative group shadow-sm">
                    {form.imageUrl ? (
                      <>
                        <img src={form.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                        <button 
                          onClick={() => setForm(prev => ({ ...prev, imageUrl: '' }))}
                          className="absolute inset-0 bg-black/60 text-white flex items-center justify-center text-[10px] font-bold"
                        >
                          REMOVE
                        </button>
                      </>
                    ) : (
                      <ImageIcon size={32} className="text-[#141414]/10" />
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => startCamera()}
                      className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl text-[10px] font-bold text-[#141414] shadow-sm border border-[#141414]/5"
                    >
                      <Camera size={14} className="text-[#F27D26]" />
                      CAMERA
                    </button>
                    <label className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl text-[10px] font-bold text-[#141414] shadow-sm border border-[#141414]/5 cursor-pointer">
                      <ImageIcon size={14} className="text-[#F27D26]" />
                      UPLOAD
                      <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                    </label>
                  </div>
               </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input 
                type="text" 
                placeholder="Item Code" 
                autoFocus
                className="w-full text-xs font-mono p-3 bg-white border rounded-xl"
                value={form.itemCode}
                onChange={e => setForm({...form, itemCode: e.target.value})}
              />
              <input 
                type="number" 
                placeholder="Stock Qty" 
                className="w-full text-xs p-3 bg-white border rounded-xl"
                value={form.qoh}
                onChange={e => setForm({...form, qoh: e.target.value === '' ? 0 : parseFloat(e.target.value)})}
              />
            </div>
            <input 
              type="text" 
              placeholder="Full Medication Name" 
              className="w-full text-sm font-bold p-3 bg-white border rounded-xl"
              value={form.itemName}
              onChange={e => setForm({...form, itemName: e.target.value})}
            />
            <input 
              type="text" 
              placeholder="Generic Name (Optional)" 
              className="w-full text-xs italic p-3 bg-white border rounded-xl"
              value={form.generic}
              onChange={e => setForm({...form, generic: e.target.value})}
            />
            <div className="flex items-center gap-3 p-3 bg-white border rounded-xl">
               <input 
                 type="checkbox" 
                 id="isRefrigeratedMobile"
                 checked={form.isRefrigerated}
                 onChange={e => setForm({...form, isRefrigerated: e.target.checked})}
                 className="w-5 h-5 rounded border-[#141414]/10 text-[#F27D26] focus:ring-[#F27D26]/20"
               />
               <label htmlFor="isRefrigeratedMobile" className="text-xs font-bold text-[#141414]/60 flex items-center gap-2">
                  <ThermometerSnowflake size={16} className="text-blue-500" />
                  Refrigerated (2-8°C)
               </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 bg-white p-2 rounded-xl border">
                <span className="text-[10px] font-bold text-[#141414]/40">Min:</span>
                <input type="number" className="w-full text-sm font-bold" value={form.minQty} onChange={e => setForm({...form, minQty: e.target.value === '' ? 0 : parseFloat(e.target.value)})} />
              </div>
              <div className="flex items-center gap-2 bg-white p-2 rounded-xl border">
                <span className="text-[10px] font-bold text-[#141414]/40">Max:</span>
                <input type="number" className="w-full text-sm font-bold" value={form.maxQty} onChange={e => setForm({...form, maxQty: e.target.value === '' ? 0 : parseFloat(e.target.value)})} />
              </div>
            </div>
            <div className="flex gap-2">
              <input type="text" placeholder="Exp 1" className="flex-1 p-2 bg-white border rounded-lg text-xs" value={form.expiration1} onChange={e => setForm({...form, expiration1: e.target.value})} />
              <input type="text" placeholder="Exp 2" className="flex-1 p-2 bg-white border rounded-lg text-xs" value={form.expiration2} onChange={e => setForm({...form, expiration2: e.target.value})} />
              <input type="text" placeholder="Exp 3" className="flex-1 p-2 bg-white border rounded-lg text-xs" value={form.expiration3} onChange={e => setForm({...form, expiration3: e.target.value})} />
            </div>
            <div className="flex gap-3 pt-2">
              <button 
                onClick={() => { setIsAdding(false); setEditingId(null); clearDraft(); }} 
                className="flex-1 py-3 bg-white text-red-500 rounded-xl font-bold border border-red-100"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleSave()} 
                className="flex-1 py-3 bg-[#F27D26] text-white rounded-xl font-bold"
              >
                Save Item
              </button>
            </div>
          </div>
        )}

        {!loading && sortedMedications.map(med => {
          const isOutOfStock = med.qoh <= 0;
          const isLowStock = !isOutOfStock && med.maxQty > 0 && med.qoh < med.maxQty * 0.3;
          const isNew = med.addedAt ? differenceInDays(new Date(), (med.addedAt as any).toDate?.() || new Date(med.addedAt)) < 10 : false;
          
          return (
            <motion.div 
              layout
              key={med.id} 
              className={`p-4 space-y-4 ${editingId === med.id ? 'hidden' : ''} ${isOutOfStock ? 'bg-red-50/50' : isLowStock ? 'bg-amber-50/30' : ''}`}
            >
              <div className="flex justify-between items-start">
                <div className="flex gap-4">
                  {med.imageUrl && (
                    <button 
                      onClick={() => setSelectedImage(med.imageUrl!)}
                      className="w-12 h-12 bg-[#141414]/5 rounded-xl border border-[#141414]/10 overflow-hidden hover:scale-105 transition-transform flex-shrink-0"
                    >
                      <img src={med.imageUrl} alt={med.itemName} className="w-full h-full object-cover" />
                    </button>
                  )}
                  <div className="space-y-1">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => med.to ? setSelectedMedForLinks(med) : startEdit(med)}
                          className="font-bold text-[#141414] leading-tight text-left hover:text-[#F27D26] transition-colors flex flex-col items-start gap-1"
                        >
                          {med.itemName}
                          {med.isRefrigerated && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-600 text-white rounded-full text-[9px] font-black uppercase tracking-tight shadow-md border border-white/20">
                              <ThermometerSnowflake size={10} />
                              REF
                            </span>
                          )}
                        </button>
                      {isNew && (
                        <span className="px-1.5 py-0.5 bg-[#F27D26]/10 text-[#F27D26] rounded text-[8px] font-black uppercase tracking-widest whitespace-nowrap">
                          NEW
                        </span>
                      )}
                      {med.to && (
                        <ArrowLeftRight size={10} className="text-[#F27D26] animate-pulse" />
                      )}
                    </div>
                    {med.generic && (
                      <button 
                        onClick={() => med.to ? setSelectedMedForLinks(med) : null}
                        className="text-[10px] italic text-[#141414]/40 leading-tight text-left hover:text-[#F27D26] transition-colors"
                      >
                        {med.generic}
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] font-mono text-[#141414]/40 uppercase tracking-widest">{med.itemCode}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => startEdit(med)} className="p-2 bg-[#141414]/5 rounded-lg text-[#141414]/40"><Edit2 className="w-3.5 h-3.5" /></button>
                <button onClick={() => handleDelete(med.id)} className="p-2 bg-red-50 rounded-lg text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-[8px] font-bold uppercase tracking-widest text-[#141414]/40">Stock Status</p>
                  <div className="flex items-center gap-2">
                    <span className={`text-xl font-black ${
                      isOutOfStock 
                        ? 'text-red-600' 
                        : isLowStock 
                        ? 'text-amber-600' 
                        : 'text-emerald-600'
                    }`}>{formatNumber(med.qoh)}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase whitespace-nowrap ${
                      isOutOfStock ? 'bg-red-100 text-red-600' : isLowStock ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'
                    }`}>
                      {isOutOfStock ? 'Out of Stock' : isLowStock ? 'Low Stock' : 'In Stock'}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col justify-center border-l border-[#141414]/10 pl-4">
                   <div className="flex items-center gap-4 text-[10px] font-bold">
                     <div className="flex flex-col">
                       <span className="text-[#141414]/40 text-[8px] uppercase">Min</span>
                       <span>{formatNumber(med.minQty)}</span>
                     </div>
                     <div className="flex flex-col">
                       <span className="text-[#141414]/40 text-[8px] uppercase">Max</span>
                       <span>{formatNumber(med.maxQty)}</span>
                     </div>
                   </div>
                </div>
              </div>

              <div className="bg-[#141414]/[0.03] p-2 rounded-xl">
                 <p className="text-[8px] font-bold uppercase tracking-widest text-[#141414]/40 mb-1 ml-1">Expirations</p>
                 <div className="flex gap-2 font-mono text-[9px]">
                   <span className="flex-1 bg-white px-2 py-1.5 rounded border border-[#141414]/5 text-center">{med.expiration1 || '-'}</span>
                   <span className="flex-1 bg-white px-2 py-1.5 rounded border border-[#141414]/5 text-center">{med.expiration2 || '-'}</span>
                   <span className="flex-1 bg-white px-2 py-1.5 rounded border border-[#141414]/5 text-center">{med.expiration3 || '-'}</span>
                 </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>

      {/* Quantity Correction Window */}
      <AnimatePresence>
        {showCorrectionModal && selectedMedForEdit && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white p-8 rounded-3xl shadow-2xl max-w-sm w-full"
            >
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#F27D26]/10 text-[#F27D26] rounded-xl flex items-center justify-center font-black">
                    QTY
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">Correction Window</h3>
                    <p className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest">{selectedMedForEdit.itemName}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowCorrectionModal(false)}
                  className="p-2 hover:bg-[#141414]/5 rounded-full transition-colors"
                >
                  <XIcon className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">Min Quantity</label>
                    <input 
                      type="number"
                      value={editMin}
                      onChange={(e) => setEditMin(e.target.value)}
                      className="w-full px-4 py-3 bg-[#141414]/5 border-none rounded-xl focus:ring-2 focus:ring-[#F27D26]/20 transition-all font-bold"
                      placeholder="Min"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">Max Quantity</label>
                    <input 
                      type="number"
                      value={editMax}
                      onChange={(e) => setEditMax(e.target.value)}
                      className="w-full px-4 py-3 bg-[#141414]/5 border-none rounded-xl focus:ring-2 focus:ring-[#F27D26]/20 transition-all font-bold"
                      placeholder="Max"
                    />
                  </div>
                </div>

                <div className="p-4 bg-[#F27D26]/5 rounded-2xl space-y-2">
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">
                    <span>Item Code</span>
                    <span className="text-[#141414] font-mono">{selectedMedForEdit.itemCode}</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">
                    <span>Current QOH</span>
                    <span className="text-[#141414] font-bold">{formatNumber(selectedMedForEdit.qoh)}</span>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => setShowCorrectionModal(false)}
                    className="flex-1 py-3 bg-[#141414]/5 text-[#141414]/60 rounded-xl font-bold hover:bg-[#141414]/10 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={saveCorrection}
                    disabled={isUpdating}
                    className="flex-1 py-3 bg-[#141414] text-white rounded-xl font-bold hover:bg-[#F27D26] transition-all flex items-center justify-center gap-2"
                  >
                    {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Apply Sync'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Camera Capture Modal */}
      <AnimatePresence>
        {isCapturing && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm shadow-2xl">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-lg bg-[#141414] rounded-3xl overflow-hidden flex flex-col"
            >
              <div className="p-4 flex justify-between items-center bg-[#141414]/50 border-b border-white/10">
                 <div className="flex items-center gap-3">
                   <div className="p-2 bg-[#F27D26]/20 rounded-xl text-[#F27D26]">
                     <Camera size={20} />
                   </div>
                   <h3 className="text-white font-bold">Capture Item Photo</h3>
                 </div>
                 <button 
                   onClick={stopCamera}
                   className="p-2 hover:bg-white/10 rounded-full text-white/40 transition-colors"
                 >
                   <XIcon size={20} />
                 </button>
              </div>
              
              <div className="relative aspect-square bg-black overflow-hidden flex items-center justify-center">
                  {isCapturing && error && (
                    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center p-8 text-center bg-black/90 animate-in fade-in zoom-in duration-300">
                      <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center text-red-500 mb-4 animate-pulse">
                        <AlertCircle size={32} />
                      </div>
                      <p className="text-white text-sm font-bold leading-relaxed mb-6 max-w-xs">{error}</p>
                      
                      <div className="flex flex-col gap-3 w-full max-w-xs">
                        <button 
                          onClick={() => {
                            setError(null);
                            startCamera();
                          }} 
                          className="w-full py-4 bg-[#F27D26] text-white rounded-2xl text-xs font-bold hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-[#F27D26]/20 flex items-center justify-center gap-2"
                        >
                          <RefreshCw size={14} />
                          TRY AGAIN
                        </button>
                        
                        <a 
                          href={window.location.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full py-4 bg-white/10 text-white/60 rounded-2xl text-xs font-bold hover:bg-white/10 hover:text-white transition-all flex items-center justify-center gap-2"
                        >
                          <Cloud className="w-4 h-4" />
                          OPEN IN NEW TAB
                        </a>

                        <button 
                          onClick={stopCamera} 
                          className="w-full py-2 text-white/40 text-[10px] font-bold hover:text-white transition-colors"
                        >
                          CLOSE CAMERA
                        </button>
                      </div>
                    </div>
                  )}

                 <video 
                   ref={videoRef}
                   autoPlay
                   playsInline
                   muted
                   onPlay={() => setIsStreamActive(true)}
                   onPlaying={() => setIsStreamActive(true)}
                   className="w-full h-full object-cover transition-opacity duration-300"
                 />
                 <canvas ref={canvasRef} className="hidden" />
                 
                 {/* Safari Play Button Overlay */}
                  {/* UI Overlays: Loading & Safari Kickstart */}
                  {!isStreamActive && !error && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-black/60 backdrop-blur-md z-30 text-center">
                      <div className="flex flex-col items-center gap-3">
                         <Loader2 className="w-8 h-8 text-[#F27D26] animate-spin" />
                         <div className="space-y-1">
                           <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest animate-pulse">Initializing Lens...</p>
                           <p className="text-[9px] text-white/30 uppercase tracking-widest">Connect cloud stream</p>
                         </div>
                      </div>
                      
                      <div className="flex flex-col items-center gap-4 mt-2">
                        <button 
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (videoRef.current) {
                              videoRef.current.play()
                                .then(() => setIsStreamActive(true))
                                .catch(err => {
                                  console.error("Manual play failed:", err);
                                  startCamera();
                                });
                            }
                          }}
                          className="px-8 py-4 bg-[#F27D26] text-white rounded-full font-bold text-xs shadow-2xl active:scale-95 transition-all flex items-center gap-3 border border-white/20"
                        >
                          <Camera size={16} />
                          TAP TO START CAMERA
                        </button>
                        <p className="text-[9px] text-white/20 uppercase tracking-widest max-w-[200px] leading-relaxed">
                          Safari/iOS requires a manual touch if autoplay is blocked
                        </p>
                      </div>
                    </div>
                  )}
                  
                  {isCapturing && isStreamActive && (
                    <div className="absolute top-4 right-4 z-20">
                      <a 
                        href={window.location.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-2 bg-black/40 hover:bg-black/60 rounded-lg text-[10px] font-bold text-white/60 hover:text-white transition-all backdrop-blur-md border border-white/10"
                        title="If camera is black, open in new tab"
                      >
                        <Cloud size={14} />
                        NEW TAB
                      </a>
                    </div>
                 )}
                 
                 {/* Safe zone overlay */}
                 <div className="absolute inset-8 border-2 border-[#F27D26]/50 rounded-2xl pointer-events-none after:content-[''] after:absolute after:inset-0 after:border after:border-[#F27D26]/20 after:rounded-2xl after:scale-95" />
              </div>

              <div className="p-8 flex flex-col items-center gap-6 bg-[#141414]">
                <button 
                  onClick={capturePhoto}
                  className="w-20 h-20 bg-white rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl shadow-white/10 group"
                >
                  <div className="w-16 h-16 border-4 border-[#141414] rounded-full flex items-center justify-center bg-white group-hover:bg-[#F27D26]/5 group-active:bg-[#F27D26]/10 transition-colors">
                    <Camera className="w-8 h-8 text-[#141414]" />
                   </div>
                </button>
                <p className="text-[10px] text-white/40 font-bold uppercase tracking-[0.2em]">Click to capture</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Global Reset Confirmation Modal */}
      <AnimatePresence>
        {isResetModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-hidden">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (!isResetting) {
                  setIsResetModalOpen(false);
                  setResetPassword('');
                  setResetError('');
                }
              }}
              className="absolute inset-0 bg-red-950/20 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-white p-8 rounded-[32px] shadow-2xl border border-red-100 space-y-6"
            >
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center text-red-600 animate-pulse">
                  <AlertTriangle size={40} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-2xl font-bold text-[#141414]">Master System Reset</h3>
                  <p className="text-sm text-[#141414]/60">
                    This will wipe all data across Adult, Pediatric, and Mesaieed pharmacies.
                  </p>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-[#141414]/5">
                <div className="space-y-2">
                  <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 ml-1">
                    Re-enter Admin Password
                  </label>
                  <input 
                    type="password"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-5 py-4 bg-[#141414]/5 border border-transparent rounded-2xl focus:bg-white focus:border-red-500 transition-all font-bold tracking-widest"
                    autoFocus
                  />
                </div>

                {resetError && (
                  <motion.p 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="text-red-500 text-xs font-bold ml-1 text-center"
                  >
                    {resetError}
                  </motion.p>
                )}

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button 
                    onClick={() => {
                      setIsResetModalOpen(false);
                      setResetPassword('');
                      setResetError('');
                    }}
                    disabled={isResetting}
                    className="py-4 bg-[#141414]/5 rounded-2xl text-sm font-bold hover:bg-[#141414]/10 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleSystemReset}
                    disabled={!resetPassword || isResetting}
                    className="py-4 bg-red-600 text-white rounded-2xl text-sm font-bold hover:bg-red-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isResetting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                    Wipe Data
                  </button>
                </div>
              </div>
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

      <AnimatePresence>
        {selectedImage && (
          <div 
            className="fixed inset-0 bg-[#141414]/90 z-[100] flex items-center justify-center p-4 backdrop-blur-sm"
            onClick={() => setSelectedImage(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-lg w-full bg-white rounded-3xl overflow-hidden shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <img src={selectedImage} alt="Full size" className="w-full h-auto" />
              <button 
                onClick={() => setSelectedImage(null)}
                className="absolute top-4 right-4 p-2 bg-white/20 hover:bg-white/40 text-white rounded-full backdrop-blur-md transition-colors"
              >
                <XIcon size={20} />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
