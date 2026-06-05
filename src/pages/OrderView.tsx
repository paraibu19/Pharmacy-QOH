import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, Download, MapPin, Sparkles, Filter, Loader2, X as XIcon, 
  RefreshCw, ArrowUpDown, AlertTriangle, Lock, LogIn, Edit3, Save, FileSpreadsheet,
  Eye, EyeOff, Settings, Key, LogOut, KeyRound, ThermometerSnowflake, UploadCloud
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PharmacyLocation, PHARMACY_NAMES, Medication } from '../types';
import { LOCATIONS } from '../constants';
import { format, differenceInDays, isSameMonth, addMonths, startOfMonth } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { useMedications } from '../hooks/useMedications';
import { medicationOps, technicianAuthOps } from '../lib/firebaseOperations';
import { formatNumber } from '../lib/formatters';
import LinkedItemsModal from '../components/LinkedItemsModal';
import { localDb } from '../lib/localStorageDb';
import { useSystemMetadata } from '../lib/useSystemMetadata';

type SortField = 'itemName' | 'itemCode' | 'qoh' | 'orderQty' | 'minQty' | 'maxQty' | 'consumption';
type SortOrder = 'asc' | 'desc';

export default function OrderView() {
  const { lastUpdate } = useSystemMetadata();

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [persistedPassword, setPersistedPassword] = useState('pharmacist123');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');

  // Password change states
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isAdminVerified, setIsAdminVerified] = useState(false);
  const [verifiedAdminPassword, setVerifiedAdminPassword] = useState('');
  const [adminPasswordAttempt, setAdminPasswordAttempt] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changeError, setChangeError] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [showAdminPassword, setShowAdminPassword] = useState(false);

  const [selectedLocation, setSelectedLocation] = useState<PharmacyLocation>(PharmacyLocation.ADULT);
  const [searchQuery, setSearchQuery] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'in' | 'low' | 'out'>('all');
  const [classificationFilter, setClassificationFilter] = useState<'qatari' | 'restricted' | null>(null);
  const [typeFilter, setTypeFilter] = useState<'generic' | 'brand' | 'non-generic-and-non-brand' | null>(null);
  const [refFilter, setRefFilter] = useState<'all' | 'refrigerated' | 'non-refrigerated'>('all');
  const [consumptionFilter, setConsumptionFilter] = useState<'all' | 'zero' | 'positive'>('all');
  const [expStart, setExpStart] = useState('');
  const [expEnd, setExpEnd] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [sortField, setSortField] = useState<SortField>('itemName');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [orderTarget, setOrderTarget] = useState<number>(1);
  
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const { medications, loading, error: fetchError, refresh, lastSynced, isSyncing } = useMedications(selectedLocation);
  const { medications: allMedications } = useMedications();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (fetchError) {
      setError(`Fetch Error: ${fetchError}`);
    }
  }, [fetchError]);

  const getOtherLocationsAvailability = (itemCode: string, currentLocationId: PharmacyLocation, showQoh: boolean) => {
    const matches = (allMedications || []).filter(m => m.itemCode === itemCode && m.locationId !== currentLocationId);
    const otherLocs = [PharmacyLocation.ADULT, PharmacyLocation.PEDIATRIC, PharmacyLocation.MESAIEED]
      .filter(loc => loc !== currentLocationId);

    return otherLocs.map(loc => {
      const match = matches.find(m => m.locationId === loc);
      const qoh = match ? match.qoh : 0;
      const name = loc === PharmacyLocation.ADULT ? 'Adult' : loc === PharmacyLocation.PEDIATRIC ? 'Pediatric' : 'Mesaieed';
      
      let isAvailable = qoh > 0;
      let label = '';
      let badgeClass = '';

      if (isAvailable) {
        if (showQoh) {
          label = `${name}: ${qoh}`;
        } else {
          label = `${name}: Available`;
        }
        badgeClass = 'bg-emerald-50 text-emerald-700 border border-emerald-100';
      } else {
        label = `${name}: Out of Stock`;
        badgeClass = 'bg-stone-50 text-[#141414]/40 border border-stone-200/60';
      }

      return (
        <span key={loc} className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold ${badgeClass}`}>
          {label}
        </span>
      );
    });
  };
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMin, setEditMin] = useState<string>('');
  const [editMax, setEditMax] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [showSyncPulse, setShowSyncPulse] = useState(false);
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [selectedMedForEdit, setSelectedMedForEdit] = useState<Medication | null>(null);
  const [selectedMedForLinks, setSelectedMedForLinks] = useState<Medication | null>(null);

  React.useEffect(() => {
    technicianAuthOps.getPassword('order').then(setPersistedPassword);
  }, []);

  // Visual feedback for real-time sync
  React.useEffect(() => {
    setShowSyncPulse(true);
    const timer = setTimeout(() => setShowSyncPulse(false), 2000);
    return () => clearTimeout(timer);
  }, [lastSynced]);

  const getExpirationColor = (dateStr: string) => {
    const date = parseExpDate(dateStr);
    if (!date) return '';
    
    const today = new Date();
    const currentM = startOfMonth(today);
    const nextM = startOfMonth(addMonths(today, 1));
    const afterNextM = startOfMonth(addMonths(today, 2));
    const monthAfterNextNextM = startOfMonth(addMonths(today, 3));
    
    const itemM = startOfMonth(date);
    
    if (isSameMonth(itemM, currentM)) return 'bg-red-500 text-white';
    if (isSameMonth(itemM, nextM)) return 'bg-yellow-400 text-black';
    if (isSameMonth(itemM, afterNextM)) return 'bg-blue-500 text-white';
    if (isSameMonth(itemM, monthAfterNextNextM)) return 'bg-green-500 text-white';
    
    return '';
  };

  const getExpirationPDFColor = (dateStr: string): [number, number, number] | null => {
    const date = parseExpDate(dateStr);
    if (!date) return null;
    
    const today = new Date();
    const currentM = startOfMonth(today);
    const nextM = startOfMonth(addMonths(today, 1));
    const afterNextM = startOfMonth(addMonths(today, 2));
    const monthAfterNextNextM = startOfMonth(addMonths(today, 3));
    
    const itemM = startOfMonth(date);
    
    if (isSameMonth(itemM, currentM)) return [239, 68, 68]; // Red-500
    if (isSameMonth(itemM, nextM)) return [250, 204, 21]; // Yellow-400
    if (isSameMonth(itemM, afterNextM)) return [59, 130, 246]; // Blue-500
    if (isSameMonth(itemM, monthAfterNextNextM)) return [34, 197, 94]; // Green-500
    
    return null;
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === persistedPassword) {
      setIsAuthenticated(true);
      setAuthError('');
    } else {
      setAuthError('Invalid password. Access denied.');
    }
  };

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

  const calculateOrder = (med: Medication, target: number = 1) => {
    const qoh = med.qoh || 0;
    const max = med.maxQty || 0;
    const min = med.minQty || 0;
    const targetMax = max * target;
    
    if (targetMax === 0 || min === 0) return 0;
    
    if (targetMax <= qoh || (targetMax - qoh) < min) {
      return 0;
    }
    
    // Formula: FLOOR(TargetMax-QOH, Min)
    return Math.floor((targetMax - qoh) / min) * min;
  };

  const targetCounts = useMemo(() => {
    return {
      full: medications.filter(m => calculateOrder(m, 1) > 0).length,
      seventy: medications.filter(m => (m.qoh || 0) < 0.7 * (m.maxQty || 0) && calculateOrder(m, 1) > 0).length,
      fifty: medications.filter(m => (m.qoh || 0) < 0.5 * (m.maxQty || 0) && calculateOrder(m, 1) > 0).length,
    };
  }, [medications]);

  const suggestions = useMemo(() => {
    if (searchQuery.length < 1) return [];
    const lowerQuery = searchQuery.toLowerCase();
    return medications.filter(m => 
      m.itemCode.toLowerCase().startsWith(lowerQuery) || 
      m.itemName.toLowerCase().startsWith(lowerQuery) ||
      (m.generic && m.generic.toLowerCase().startsWith(lowerQuery))
    ).slice(0, 5);
  }, [medications, searchQuery]);

  const sortedMeds = useMemo(() => {
    let result = medications;
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(m => 
        m.itemName.toLowerCase().includes(q) || 
        m.itemCode.toLowerCase().includes(q) ||
        (m.generic && m.generic.toLowerCase().includes(q))
      );
    }

    // Stock Status (Single-select, "all" default)
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

    // Classification (Single-select or unselect)
    if (classificationFilter) {
      result = result.filter(m => {
        const isQatari = !!(m.qatari && (m.qatari.trim().toUpperCase() === 'TRUE' || m.qatari.trim().toUpperCase() === 'QATARI'));
        const isRestricted = !!(m.restriction && m.restriction.trim() !== '');
        
        if (classificationFilter === 'qatari') return isQatari;
        if (classificationFilter === 'restricted') return isRestricted;
        return true;
      });
    }

    // Type (Single-select or unselect)
    if (typeFilter) {
      result = result.filter(m => {
        const isGeneric = !!(m.generic && m.generic.toLowerCase().includes('generic'));
        const isBrand = !!(m.generic && m.generic.toLowerCase().includes('brand'));
        
        if (typeFilter === 'generic') return isGeneric;
        if (typeFilter === 'brand') return isBrand;
        if (typeFilter === 'non-generic-and-non-brand') return !isGeneric && !isBrand;
        return true;
      });
    }

    // Refrigerated filter (Ref selection or unselect)
    if (refFilter === 'refrigerated') {
      result = result.filter(m => !!m.isRefrigerated);
    } else if (refFilter === 'non-refrigerated') {
      result = result.filter(m => !m.isRefrigerated);
    }

    // Consumption filter
    if (consumptionFilter === 'zero') {
      result = result.filter(m => (m.consumption || 0) === 0);
    } else if (consumptionFilter === 'positive') {
      result = result.filter(m => (m.consumption || 0) > 0);
    }

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

    const mapped = result.map(m => ({
      ...m,
      orderQty: calculateOrder(m, 1),
      isNew: m.addedAt ? differenceInDays(new Date(), (m.addedAt as any).toDate?.() || new Date(m.addedAt)) < 10 : false
    }));

    // Filter by order quantity if a specific target is selected (not 'All')
    let displayResult = mapped;
    if (orderTarget !== 0) {
      if (orderTarget === 1) {
        displayResult = displayResult.filter(m => m.orderQty > 0);
      } else if (orderTarget === 0.7) {
        displayResult = displayResult.filter(m => (m.qoh || 0) < 0.7 * (m.maxQty || 0) && m.orderQty > 0);
      } else if (orderTarget === 0.5) {
        displayResult = displayResult.filter(m => (m.qoh || 0) < 0.5 * (m.maxQty || 0) && m.orderQty > 0);
      }
    }

    return displayResult.sort((a, b) => {
      const multiplier = sortOrder === 'asc' ? 1 : -1;
      
      if (['qoh', 'orderQty', 'minQty', 'maxQty', 'consumption'].includes(sortField)) {
        const valA = Number(a[sortField as keyof typeof a]) || 0;
        const valB = Number(b[sortField as keyof typeof b]) || 0;
        return (valA - valB) * multiplier;
      }
      
      const valA = String(a[sortField as keyof typeof a] || '');
      const valB = String(b[sortField as keyof typeof b] || '');
      return valA.localeCompare(valB) * multiplier;
    });
  }, [medications, searchQuery, stockFilter, classificationFilter, typeFilter, refFilter, consumptionFilter, expStart, expEnd, sortField, sortOrder, orderTarget]);

  const filterCounts = useMemo(() => {
    const all = medications.length;
    const inStock = medications.filter(m => m.qoh > 0 && !(m.maxQty > 0 && m.qoh < m.maxQty * 0.3)).length;
    const lowStock = medications.filter(m => m.qoh > 0 && m.maxQty > 0 && m.qoh < m.maxQty * 0.3).length;
    const outOfStock = medications.filter(m => m.qoh <= 0).length;
    const qatari = medications.filter(m => m.qatari && (m.qatari.trim().toUpperCase() === 'TRUE' || m.qatari.trim().toUpperCase() === 'QATARI') && m.qoh > 0).length;
    const restricted = medications.filter(m => m.restriction && m.restriction.trim() !== '' && m.qoh > 0).length;
    const generics = medications.filter(m => m.generic && m.generic.toLowerCase().includes('generic') && m.qoh > 0).length;
    const brands = medications.filter(m => m.generic && m.generic.toLowerCase().includes('brand') && m.qoh > 0).length;
    const nonGenericAndNonBrand = medications.filter(m => {
      const isGeneric = !!(m.generic && m.generic.toLowerCase().includes('generic'));
      const isBrand = !!(m.generic && m.generic.toLowerCase().includes('brand'));
      return !isGeneric && !isBrand && m.qoh > 0;
    }).length;
    const refrigerated = medications.filter(m => m.isRefrigerated && m.qoh > 0).length;
    const nonRefrigerated = medications.filter(m => !m.isRefrigerated && m.qoh > 0).length;
    const zeroConsumption = medications.filter(m => (m.consumption || 0) === 0 && m.qoh > 0).length;
    const positiveConsumption = medications.filter(m => (m.consumption || 0) > 0 && m.qoh > 0).length;

    return { all, inStock, lowStock, outOfStock, qatari, restricted, generics, brands, nonGenericAndNonBrand, refrigerated, nonRefrigerated, zeroConsumption, positiveConsumption };
  }, [medications]);

  const availableGenericsCount = filterCounts.generics;
  const availableBrandsCount = filterCounts.brands;
  const availableNonGenericAndNonBrandCount = filterCounts.nonGenericAndNonBrand;

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const startEdit = (med: Medication) => {
    setSelectedMedForEdit(med);
    setEditMin(String(med.minQty || 0));
    setEditMax(String(med.maxQty || 0));
    setShowCorrectionModal(true);
  };

  const saveEdit = async () => {
    if (!selectedMedForEdit) return;
    setIsUpdating(true);
    try {
      await medicationOps.update(selectedMedForEdit.id, {
        minQty: Number(editMin),
        maxQty: Number(editMax)
      });
      setShowCorrectionModal(false);
      setSelectedMedForEdit(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsUpdating(false);
    }
  };

  const getActiveFiltersList = () => {
    const filters: { label: string; value: string; count?: number }[] = [];
    
    if (typeFilter) {
      let val = "";
      let cnt = 0;
      if (typeFilter === 'generic') {
        val = "GENERIC";
        cnt = availableGenericsCount;
      } else if (typeFilter === 'brand') {
        val = "BRAND";
        cnt = availableBrandsCount;
      } else if (typeFilter === 'non-generic-and-non-brand') {
        val = "NON-GENERIC & NON-BRAND";
        cnt = availableNonGenericAndNonBrandCount;
      }
      filters.push({ label: "Type:", value: val, count: cnt });
    }

    if (refFilter !== 'all') {
      const val = refFilter === 'refrigerated' ? 'REFRIGERATED' : 'NON-REFRIGERATED';
      const cnt = refFilter === 'refrigerated' ? filterCounts.refrigerated : filterCounts.nonRefrigerated;
      filters.push({ label: "Storage:", value: val, count: cnt });
    }

    if (consumptionFilter !== 'all') {
      const val = consumptionFilter === 'positive' ? '> 0 CONSUMPTION' : '0 CONSUMPTION';
      filters.push({ label: "Consumption:", value: val });
    }

    if (classificationFilter) {
      const val = classificationFilter === 'qatari' ? 'QATARI' : 'RESTRICTED';
      const cnt = classificationFilter === 'qatari' ? filterCounts.qatari : filterCounts.restricted;
      filters.push({ label: "Classification:", value: val, count: cnt });
    }

    if (stockFilter !== 'all') {
      let val = "";
      let cnt = 0;
      if (stockFilter === 'in') {
        val = "IN STOCK";
        cnt = filterCounts.inStock;
      } else if (stockFilter === 'low') {
        val = "LOW STOCK";
        cnt = filterCounts.lowStock;
      } else if (stockFilter === 'out') {
        val = "OUT OF STOCK";
        cnt = filterCounts.outOfStock;
      }
      filters.push({ label: "Stock Status:", value: val, count: cnt });
    }

    if (searchQuery) {
      filters.push({ label: "Search:", value: `"${searchQuery.toUpperCase()}"` });
    }

    return filters;
  };

  const downloadCSV = () => {
    const orderItems = sortedMeds.filter(m => m.orderQty > 0);
    const activeFilters = getActiveFiltersList();
    const headers = ['Serial no.', 'Item code', 'Item name', 'QOH', 'Order quantity', 'Exp1'];
    const rows = orderItems.map((m, i) => [
      i + 1,
      m.itemCode,
      `${m.itemName} [${m.consumption || 0}]`,
      m.qoh,
      m.orderQty,
      m.expiration1 || '-'
    ]);

    const metaRows: string[] = [];
    if (activeFilters.length > 0) {
      metaRows.push('ACTIVE FILTERS:');
      activeFilters.forEach(f => {
        metaRows.push(f.label);
        metaRows.push(f.value);
        if (f.count !== undefined) {
          metaRows.push(`[${f.count}]`);
        }
      });
      metaRows.push(`${orderItems.length} items to order`);
      metaRows.push(''); // blank row separator
    }

    const csvContent = [
      ...metaRows.map(row => `"${row}"`),
      headers.join(','),
      ...rows.map(r => r.map((field, idx) => {
        if ((idx === 3 || idx === 4) && typeof field === 'number') return `"${formatNumber(field)}"`;
        return `"${field}"`;
      }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Store_Order_${PHARMACY_NAMES[selectedLocation].replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  const downloadExcel = () => {
    const orderItems = sortedMeds.filter(m => m.orderQty > 0);
    const activeFilters = getActiveFiltersList();
    const aoa: any[][] = [];

    if (activeFilters.length > 0) {
      aoa.push(['ACTIVE FILTERS:']);
      activeFilters.forEach(f => {
        aoa.push([f.label]);
        aoa.push([f.value]);
        if (f.count !== undefined) {
          aoa.push([`[${f.count}]`]);
        }
      });
      aoa.push([`${orderItems.length} items to order`]);
      aoa.push([]); // blank row
    }

    const headers = ['Serial no.', 'Item code', 'Item name', 'QOH', 'Order quantity', 'Exp1'];
    aoa.push(headers);

    orderItems.forEach((m, i) => {
      aoa.push([
        i + 1,
        m.itemCode,
        `${m.itemName} [${m.consumption || 0}]`,
        m.qoh,
        m.orderQty,
        m.expiration1 || '-'
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Store_Order");
    
    XLSX.writeFile(wb, `Store_Order_${PHARMACY_NAMES[selectedLocation].replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const downloadPDF = () => {
    const doc = new jsPDF() as any;
    const orderItems = sortedMeds.filter(m => m.orderQty > 0);
    const activeFilters = getActiveFiltersList();
    
    doc.setFontSize(20);
    doc.text('Pharmacy Store Order', 14, 22);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Location: ${PHARMACY_NAMES[selectedLocation]}`, 14, 30);
    doc.text(`Generated: ${format(new Date(), 'EEEE, dd-MM-yyyy, hh:mm a').toUpperCase()}`, 14, 35);
    doc.text(`Total Items to Order: ${orderItems.length}`, 14, 40);

    let currentY = 48;
    if (activeFilters.length > 0) {
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(20, 20, 20);
      doc.text('ACTIVE FILTERS:', 14, currentY);
      currentY += 5;

      activeFilters.forEach(f => {
        // Label
        doc.setFont("Helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text(f.label, 14, currentY);
        currentY += 4.5;

        // Value
        doc.setFont("Helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(40, 40, 40);
        doc.text(f.value, 14, currentY);
        currentY += 4.5;

        // Count (Bold)
        if (f.count !== undefined) {
          doc.setFont("Helvetica", "bold");
          doc.setFontSize(9);
          doc.setTextColor(20, 20, 20);
          doc.text(`[${f.count}]`, 14, currentY);
          currentY += 5;
        }
      });

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(40, 40, 40);
      doc.text(`${orderItems.length} items to order`, 14, currentY);
      currentY += 8; // spatial padding
    }

    const headers = [['S.No', 'Item Code', 'Item Name', 'QOH', 'Order Qty', 'Exp 1']];
    const data = orderItems.map((m, i) => [
      i + 1,
      m.itemCode,
      `${m.itemName} [${m.consumption || 0}]`,
      formatNumber(m.qoh),
      formatNumber(m.orderQty),
      m.expiration1 || '-'
    ]);

    const formatIndicatorMonth = (date: Date) => {
      const m = date.getMonth();
      const yearStr = format(date, 'yy');
      if (m === 6) return `July-${yearStr}`; // July index is 6
      return format(date, 'MMM-yy');
    };

    autoTable(doc, {
      startY: activeFilters.length > 0 ? currentY : 45,
      head: headers,
      body: data,
      theme: 'grid',
      headStyles: { fillColor: [242, 125, 38], textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 3 },
      columnStyles: {
        0: { cellWidth: 15 },
        1: { cellWidth: 25 },
        3: { cellWidth: 20 },
        4: { cellWidth: 20 },
        5: { cellWidth: 25 },
      },
      didDrawCell: (data) => {
        if (data.section === 'body' && data.column.index === 2) {
          const med = orderItems[data.row.index];
          if (med) {
            const paddingLeft = data.cell.padding('left');
            const paddingRight = data.cell.padding('right');
            const writableWidth = data.cell.width - paddingLeft - paddingRight;

            const fullText = `${med.itemName} [${med.consumption || 0}]`;
            
            doc.setFont("Helvetica", "normal");
            doc.setFontSize(8);
            const lines = doc.splitTextToSize(fullText, writableWidth) as string[];
            const numLines = lines.length;

            // Draw solid inset background matching cell background to paint over default text
            const fillColor = data.cell.styles.fillColor;
            if (Array.isArray(fillColor)) {
              doc.setFillColor(...fillColor);
            } else if (typeof fillColor === 'string') {
              doc.setFillColor(fillColor);
            } else {
              doc.setFillColor(255, 255, 255);
            }
            doc.rect(data.cell.x + 0.5, data.cell.y + 0.5, data.cell.width - 1, data.cell.height - 1, 'F');

            doc.setTextColor(20, 20, 20);

            // Calculate vertical center and spacing in mm
            const lineHeightMm = 3.2;
            const startY = data.cell.y + data.cell.height / 2 - ((numLines - 1) * lineHeightMm) / 2 + 1.2;

            for (let j = 0; j < numLines; j++) {
              const lineY = startY + j * lineHeightMm;
              const lineText = lines[j];
              const x = data.cell.x + paddingLeft;

              if (j === numLines - 1) {
                // Last line contains our bracket component
                const suffix = `[${med.consumption || 0}]`;
                const suffixWithSpace = ` [${med.consumption || 0}]`;

                let textBeforeBracket = lineText;
                let hasSuffix = false;
                let spaceBefore = false;

                if (lineText.endsWith(suffix)) {
                  hasSuffix = true;
                  if (lineText.endsWith(suffixWithSpace)) {
                    spaceBefore = true;
                    textBeforeBracket = lineText.slice(0, -suffixWithSpace.length);
                  } else {
                    textBeforeBracket = lineText.slice(0, -suffix.length);
                  }
                }

                if (hasSuffix) {
                  // Draw Name (Normal font)
                  doc.setFont("Helvetica", "normal");
                  doc.text(textBeforeBracket, x, lineY);

                  // Measure normal text width
                  const textWidth = doc.getTextWidth(textBeforeBracket);

                  // Draw Brackets (Bold font)
                  doc.setFont("Helvetica", "bold");
                  const bracketStr = spaceBefore ? suffixWithSpace : suffix;
                  doc.text(bracketStr, x + textWidth, lineY);
                } else {
                  doc.setFont("Helvetica", "normal");
                  doc.text(lineText, x, lineY);
                }
              } else {
                // Normal lines
                doc.setFont("Helvetica", "normal");
                doc.text(lineText, x, lineY);
              }
            }

            // Restore normal font styling context
            doc.setFont("Helvetica", "normal");
          }
        }

        if (data.section === 'body' && data.column.index === 5) {
          const color = getExpirationPDFColor(data.cell.raw as string);
          if (color) {
            doc.setFillColor(...color);
            doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, 'F');
            doc.setTextColor(color[0] === 250 ? 0 : 255); // Black text for yellow, white for others
            doc.text(data.cell.text, data.cell.x + data.cell.padding('left'), data.cell.y + data.cell.height / 2 + 2);
          }
        }
      },
      didDrawPage: (data) => {
        // Draw the color indicators at the top of each page
        const today = new Date();
        const currentM = startOfMonth(today);
        const nextM = startOfMonth(addMonths(today, 1));
        const afterNextM = startOfMonth(addMonths(today, 2));
        const monthAfterNextNextM = startOfMonth(addMonths(today, 3));

        const monthLabels = [
          { label: formatIndicatorMonth(currentM), color: [239, 68, 68] as [number, number, number], name: 'Red' },
          { label: formatIndicatorMonth(nextM), color: [250, 204, 21] as [number, number, number], name: 'Yellow' },
          { label: formatIndicatorMonth(afterNextM), color: [59, 130, 246] as [number, number, number], name: 'Blue' },
          { label: formatIndicatorMonth(monthAfterNextNextM), color: [34, 197, 94] as [number, number, number], name: 'Green' }
        ];

        const pageWidth = doc.internal.pageSize.width || 210;
        doc.setFontSize(8);
        doc.setFont("Helvetica", "bold");
        
        let startX = pageWidth - 14; // Right-aligned margins
        const yPos = 8; // Top margin position

        // Draw from right to left so they align beautifully to the right
        for (let i = monthLabels.length - 1; i >= 0; i--) {
          const item = monthLabels[i];
          const textStr = `${item.name}: ${item.label}`;
          const textWidth = doc.getTextWidth(textStr);
          const boxSize = 3;
          const textSep = 1.5;
          const itemSep = 5;
          const totalWidth = boxSize + textSep + textWidth + itemSep;
          
          startX -= totalWidth;
          
          // Draw colored rect
          doc.setFillColor(...item.color);
          doc.rect(startX, yPos - 2.2, boxSize, boxSize, 'F');
          
          // Draw text
          doc.setTextColor(80, 80, 80);
          doc.text(textStr, startX + boxSize + textSep, yPos);
        }
      }
    });

    doc.save(`Store_Order_${PHARMACY_NAMES[selectedLocation].replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  const handleVerifyAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangeError('');
    setIsSavingPassword(true);
    try {
      const res = await fetch('/api/auth/verify-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPasswordAttempt.trim() })
      });
      
      if (res.ok) {
        setIsAdminVerified(true);
        setVerifiedAdminPassword(adminPasswordAttempt.trim());
        setAdminPasswordAttempt('');
      } else {
        setChangeError('Invalid Admin Password');
      }
    } catch (err) {
      setChangeError('Verification failed. Server unreachable.');
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 4) {
      setChangeError('Minimum 4 characters required.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setChangeError('Passwords do not match.');
      return;
    }

    setIsSavingPassword(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          currentPassword: verifiedAdminPassword, 
          newPassword,
          role: 'order'
        })
      });

      if (res.ok) {
        // Also update Firebase for global sync if enabled
        await technicianAuthOps.updatePassword('order', newPassword);
        
        setIsChangingPassword(false);
        setIsAdminVerified(false);
        setVerifiedAdminPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setChangeError('');
        setPersistedPassword(newPassword);
      } else {
        const data = await res.json();
        setChangeError(data.error || 'Failed to update password.');
      }
    } catch (err) {
      setChangeError('Failed to update password. Server error.');
    } finally {
      setIsSavingPassword(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white p-8 rounded-3xl border border-[#141414]/10 shadow-xl"
        >
          <div className="w-16 h-16 bg-[#F27D26]/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Lock className="w-8 h-8 text-[#F27D26]" />
          </div>
          <h1 className="text-2xl font-bold text-center mb-2">Order View</h1>
          <p className="text-[#141414]/50 text-center text-sm mb-8">Please enter the access password</p>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">Password</label>
              <div className="relative">
                <input 
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-4 pr-20 py-3 bg-[#141414]/5 border-none rounded-xl focus:ring-2 focus:ring-[#F27D26]/20 transition-all font-medium"
                  placeholder="••••••••"
                  autoFocus
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="p-1.5 text-[#141414]/20 hover:text-[#141414]/40 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                  <LogIn className="w-5 h-5 text-[#141414]/20" />
                </div>
              </div>
              {authError && (
                <div className="mt-2 px-1">
                  <p className="text-red-500 text-xs font-bold">{authError}</p>
                </div>
              )}
            </div>
            
            <button 
              type="submit"
              className="w-full py-4 bg-[#141414] text-white rounded-xl font-bold hover:bg-[#F27D26] transition-all flex items-center justify-center gap-2"
            >
              Access View
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-12 space-y-6 md:space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 md:gap-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Order View</h1>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 bg-[#F27D26]/10 text-[#F27D26] border border-[#F27D26]/20 rounded-full text-[10px] font-bold uppercase tracking-widest">
                Advanced
              </span>
              <div className="flex items-center gap-2 px-3 py-1 bg-[#F27D26]/5 rounded-full text-[10px] font-bold text-[#F27D26] uppercase tracking-widest border border-[#F27D26]/10">
                <UploadCloud className="w-3 h-3" />
                <span className="opacity-60 text-[#141414]">Last Update:</span>
                <span className="text-[#F27D26]">
                  {lastUpdate ? format(new Date(lastUpdate), 'EEEE, dd-MM-yyyy hh:mm a').toUpperCase() : 'No Data'}
                </span>
              </div>
            </div>
          </div>
          <p className="text-[#141414]/60 max-w-xl text-sm md:text-base">
            Manage min/max stock quantities and generate automated store orders.
          </p>
        </div>
        
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <button 
            onClick={() => setIsAuthenticated(false)}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-red-100 rounded-full text-[10px] font-bold uppercase tracking-widest text-red-500 hover:bg-red-50 transition-all shadow-sm"
          >
            <LogOut className="w-3 h-3" />
            Logout
          </button>
          
          <button 
            onClick={() => refresh(true)}
            disabled={isSyncing}
            className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-3 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all relative ${
              showSyncPulse 
                ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-sm' 
                : 'bg-emerald-50/30 text-emerald-600/50 border border-emerald-100'
            }`}
          >
            <div className={`w-1.5 h-1.5 rounded-full ${showSyncPulse ? 'bg-emerald-500 animate-ping' : 'bg-emerald-400 opacity-50'}`} />
            {isSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            {showSyncPulse ? 'Live Update' : `Synced ${format(lastSynced, 'HH:mm')}`}
          </button>

          <div className="flex w-full md:w-auto items-center gap-1 bg-[#141414]/5 p-1 rounded-full border border-[#141414]/10">
            <button 
              onClick={() => {
                setIsChangingPassword(true);
                setIsAdminVerified(false);
                setAdminPasswordAttempt('');
                setChangeError('');
              }}
              title="Security Settings"
              className="flex-1 md:flex-none p-2 hover:bg-[#F27D26]/10 hover:text-[#F27D26] rounded-full transition-colors text-[#141414]/40"
            >
              <KeyRound className="w-4 h-4" />
            </button>
            <button 
              onClick={downloadCSV}
              className="flex-1 md:flex-none px-4 py-2 bg-white text-[#141414] rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-50 hover:text-emerald-600 transition-all shadow-sm flex items-center justify-center gap-2 border border-[#141414]/5"
            >
              <FileSpreadsheet className="w-3 h-3" />
              CSV
            </button>
            <button 
              onClick={downloadPDF}
              className="flex-1 md:flex-none px-4 py-2 bg-white text-[#141414] rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-red-50 hover:text-red-600 transition-all shadow-sm flex items-center justify-center gap-2 border border-[#141414]/5"
            >
              <Download className="w-3 h-3" />
              PDF
            </button>
            <button 
              onClick={downloadExcel}
              className="flex-1 md:flex-none px-4 py-2 bg-white text-[#141414] rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-50 hover:text-emerald-600 transition-all shadow-sm flex items-center justify-center gap-2 border border-[#141414]/5"
            >
              <FileSpreadsheet className="w-3 h-3 text-[#F27D26]" />
              EXCEL
            </button>
          </div>
        </div>
      </div>

      {(stockFilter !== 'all' || classificationFilter !== null || typeFilter !== null || refFilter !== 'all' || consumptionFilter !== 'all' || expStart || expEnd || orderTarget !== 1) && (
        <div className="flex flex-wrap items-center gap-2 p-3 bg-[#F27D26]/5 rounded-xl border border-[#F27D26]/10 animate-in slide-in-from-top-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#F27D26]/60 flex items-center gap-2">
            <Filter className="w-3 h-3" />
            Active Filters:
          </span>
          {stockFilter !== 'all' && (
            <span className="px-2 py-1 bg-white rounded-lg text-[10px] font-bold shadow-sm border border-[#F27D26]/10 flex items-center gap-1.5">
              Stock: <span className="text-[#F27D26] uppercase">{stockFilter === 'in' ? 'In Stock' : stockFilter === 'low' ? 'Low Stock' : 'Out of Stock'}</span>
              <span className="px-1 bg-emerald-50 text-emerald-700 text-[9px] rounded font-extrabold border border-emerald-200">
                {sortedMeds.filter(m => m.orderQty > 0).length} items to order
              </span>
            </span>
          )}
          {classificationFilter !== null && (
            <span className="px-2 py-1 bg-white rounded-lg text-[10px] font-bold shadow-sm border border-[#F27D26]/10 flex items-center gap-1.5">
              Class: <span className="text-[#F27D26] uppercase">{classificationFilter === 'qatari' ? 'Qatari' : 'Restricted'}</span>
              <span className="px-1 bg-emerald-50 text-emerald-700 text-[9px] rounded font-extrabold border border-emerald-200">
                {sortedMeds.filter(m => m.orderQty > 0).length} items to order
              </span>
            </span>
          )}
          {typeFilter !== null && (
            <span className="px-2 py-1 bg-white rounded-lg text-[10px] font-bold shadow-sm border border-[#F27D26]/10 flex items-center gap-1.5">
              Type: <span className="text-[#F27D26] uppercase">
                {typeFilter === 'generic' ? 'Generics' : typeFilter === 'brand' ? 'Brands' : 'Non-Generic & Non-Brand'}
              </span>
              <span className="px-1 bg-emerald-50 text-emerald-700 text-[9px] rounded font-extrabold border border-emerald-200">
                {sortedMeds.filter(m => m.orderQty > 0).length} items to order
              </span>
            </span>
          )}
          {refFilter !== 'all' && (
            <span className="px-2 py-1 bg-white rounded-lg text-[10px] font-bold shadow-sm border border-[#F27D26]/10 flex items-center gap-1.5">
              <ThermometerSnowflake className="w-2.5 h-2.5 text-[#F27D26]" /> 
              Storage: <span className="text-[#F27D26] uppercase">{refFilter === 'refrigerated' ? 'Refrigerated' : 'Non-Refrigerated'}</span>
              <span className="px-1 bg-emerald-50 text-emerald-700 text-[9px] rounded font-extrabold border border-emerald-200">
                {sortedMeds.filter(m => m.orderQty > 0).length} items to order
              </span>
            </span>
          )}
          {consumptionFilter !== 'all' && (
            <span className="px-2 py-1 bg-white rounded-lg text-[10px] font-bold shadow-sm border border-[#F27D26]/10 flex items-center gap-1.5">
              Consumption: <span className="text-[#F27D26] uppercase">{consumptionFilter === 'zero' ? '0 Consumption' : '> 0 Consumption'}</span>
              <span className="px-1 bg-emerald-50 text-emerald-700 text-[9px] rounded font-extrabold border border-emerald-200">
                {sortedMeds.filter(m => m.orderQty > 0).length} items to order
              </span>
            </span>
          )}
          {orderTarget !== 1 && (
            <span className="px-2 py-1 bg-white rounded-lg text-[10px] font-bold shadow-sm border border-[#F27D26]/10 flex items-center gap-1.5">
              Target: <span className="text-[#F27D26]">{orderTarget === 0 ? 'ALL' : `${orderTarget * 100}%`}</span>
              <span className="px-1 bg-emerald-50 text-emerald-700 text-[9px] rounded font-extrabold border border-emerald-200">
                {sortedMeds.filter(m => m.orderQty > 0).length} items to order
              </span>
            </span>
          )}
          {(expStart || expEnd) && (
            <span className="px-2 py-1 bg-white rounded-lg text-[10px] font-bold shadow-sm flex items-center gap-1.5 border border-[#F27D26]/10">
              Expiry: <span className="text-[#F27D26]">{expStart || 'Any'}</span> – <span className="text-[#F27D26]">{expEnd || 'Any'}</span>
              <span className="px-1 bg-emerald-50 text-emerald-700 text-[9px] rounded font-extrabold border border-emerald-200">
                {sortedMeds.filter(m => m.orderQty > 0).length} items to order
              </span>
            </span>
          )}
          <button 
            onClick={() => { setStockFilter('all'); setClassificationFilter(null); setTypeFilter(null); setRefFilter('all'); setConsumptionFilter('all'); setExpStart(''); setExpEnd(''); setOrderTarget(1); }}
            className="ml-auto text-[10px] font-bold text-red-500 hover:underline"
          >
            Clear All
          </button>
        </div>
      )}

      {/* Controls */}
      <div className="bg-white p-4 md:p-6 rounded-3xl border border-[#141414]/10 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row justify-between gap-4">
          <div className="flex flex-col gap-4 w-full">
            {/* Pharmacy Locations Selector - Styled responsive grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 p-1 bg-[#141414]/5 rounded-2xl w-full md:w-auto">
              {LOCATIONS.map(loc => (
                <button
                  key={loc.id}
                  onClick={() => setSelectedLocation(loc.id as PharmacyLocation)}
                  className={`px-4 py-3 sm:py-2.5 rounded-xl text-xs font-bold transition-all text-center select-none ${
                    selectedLocation === loc.id 
                      ? loc.id === PharmacyLocation.ADULT
                        ? 'bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-md shadow-emerald-700/10'
                        : loc.id === PharmacyLocation.PEDIATRIC
                          ? 'bg-sky-100 text-sky-700 border border-sky-200 shadow-md shadow-sky-700/10'
                          : loc.id === PharmacyLocation.MESAIEED
                            ? 'bg-orange-100 text-orange-700 border border-orange-200 shadow-md shadow-orange-700/10'
                            : 'bg-[#141414] text-white shadow-lg'
                      : 'text-[#141414]/50 hover:text-[#141414] hover:bg-white/45'
                  }`}
                >
                  {loc.name.replace('Aw-', '')}
                </button>
              ))}
            </div>

            {/* Other Quick Filters */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setTypeFilter(prev => prev === 'generic' ? null : 'generic');
                }}
                className={`px-4 md:px-6 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 ${
                  typeFilter === 'generic' 
                    ? 'bg-yellow-400 text-white shadow-lg ring-2 ring-yellow-400/20' 
                    : 'bg-yellow-50 text-yellow-700 border border-yellow-100 hover:bg-yellow-100 shadow-sm'
                }`}
              >
                <Sparkles className="w-3 h-3" />
                Available Generics ({availableGenericsCount})
              </button>
              <button
                onClick={() => {
                  setTypeFilter(prev => prev === 'brand' ? null : 'brand');
                }}
                className={`px-4 md:px-6 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 ${
                  typeFilter === 'brand' 
                    ? 'bg-orange-400 text-white shadow-lg ring-2 ring-orange-400/20' 
                    : 'bg-orange-50 text-orange-700 border border-orange-100 hover:bg-orange-100 shadow-sm'
                }`}
              >
                <Sparkles className="w-3 h-3" />
                Available Brands ({availableBrandsCount})
              </button>
              <button
                onClick={() => {
                  setTypeFilter(prev => prev === 'non-generic-and-non-brand' ? null : 'non-generic-and-non-brand');
                }}
                className={`px-4 md:px-6 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 ${
                  typeFilter === 'non-generic-and-non-brand' 
                    ? 'bg-purple-600 text-white shadow-lg ring-2 ring-purple-600/20' 
                    : 'bg-purple-50 text-purple-700 border border-purple-100 hover:bg-purple-100 shadow-sm'
                }`}
              >
                <Sparkles className="w-3 h-3" />
                Non-Generic & Non-Brand ({availableNonGenericAndNonBrandCount})
              </button>
              <button
                onClick={() => {
                  setRefFilter(prev => prev === 'refrigerated' ? 'all' : 'refrigerated');
                }}
                className={`px-4 md:px-6 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 ${
                  refFilter === 'refrigerated' 
                    ? 'bg-blue-400 text-white shadow-lg ring-2 ring-blue-400/20' 
                    : 'bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 shadow-sm'
                }`}
              >
                <ThermometerSnowflake className="w-3.5 h-3.5" />
                Ref ({filterCounts.refrigerated})
              </button>
              <button
                onClick={() => {
                  setRefFilter(prev => prev === 'non-refrigerated' ? 'all' : 'non-refrigerated');
                }}
                className={`px-4 md:px-6 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 ${
                  refFilter === 'non-refrigerated' 
                    ? 'bg-cyan-500 text-white shadow-lg ring-2 ring-cyan-500/20' 
                    : 'bg-cyan-50 text-cyan-700 border border-cyan-100 hover:bg-cyan-100 shadow-sm'
                }`}
              >
                <ThermometerSnowflake className="w-3.5 h-3.5" />
                Non-Ref ({filterCounts.nonRefrigerated})
              </button>
              <button
                onClick={() => {
                  setConsumptionFilter(prev => prev === 'zero' ? 'all' : 'zero');
                }}
                className={`px-4 md:px-6 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 ${
                  consumptionFilter === 'zero' 
                    ? 'bg-slate-700 text-white shadow-lg ring-2 ring-slate-700/20' 
                    : 'bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 shadow-sm'
                }`}
              >
                <Sparkles className="w-3 h-3" />
                0 Consumption ({filterCounts.zeroConsumption})
              </button>
              <button
                onClick={() => {
                  setConsumptionFilter(prev => prev === 'positive' ? 'all' : 'positive');
                }}
                className={`px-4 md:px-6 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 ${
                  consumptionFilter === 'positive' 
                    ? 'bg-lime-600 text-white shadow-lg ring-2 ring-lime-600/20' 
                    : 'bg-lime-50 text-lime-700 border border-lime-100 hover:bg-lime-100 shadow-sm'
                }`}
              >
                <Sparkles className="w-3 h-3" />
                &gt; 0 Consumption ({filterCounts.positiveConsumption})
              </button>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 whitespace-nowrap ml-1">Order Target:</span>
              <div className="flex bg-[#141414]/5 p-1 rounded-2xl border border-[#141414]/5 overflow-x-auto no-scrollbar">
                {[
                  { label: 'All', value: 0, count: medications.length },
                  { label: 'Full', value: 1, count: targetCounts.full },
                  { label: '70%', value: 0.7, count: targetCounts.seventy },
                  { label: '50%', value: 0.5, count: targetCounts.fifty }
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setOrderTarget(opt.value)}
                    className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 whitespace-nowrap ${
                      orderTarget === opt.value
                        ? 'bg-[#F27D26] text-white shadow-md'
                        : 'text-[#141414]/40 hover:text-[#141414]'
                    }`}
                  >
                    {opt.label}
                    <span className={`px-1.5 py-0.5 rounded-md text-[9px] ${
                      orderTarget === opt.value ? 'bg-white/20' : 'bg-[#141414]/10'
                    }`}>
                      {opt.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-start">
            <button 
              onClick={() => setShowFilters(!showFilters)}
              className={`w-full md:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold transition-all ${
                showFilters || stockFilter !== 'all' || classificationFilter !== null || typeFilter !== null || refFilter !== 'all' || expStart || expEnd || orderTarget !== 1
                ? 'bg-[#F27D26] text-white shadow-lg'
                : 'bg-[#141414]/5 text-[#141414]/60 hover:bg-[#141414]/10'
              }`}
            >
              <Filter className="w-4 h-4" />
              {showFilters ? 'Hide' : 'Filters'}
            </button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#141414]/30" />
          <input 
            type="text"
            placeholder="Search name or code..."
            value={searchQuery}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-12 py-4 bg-[#141414]/[0.03] border border-transparent rounded-2xl focus:ring-2 focus:ring-[#F27D26]/20 transition-all text-sm font-medium"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-2 hover:bg-[#141414]/5 rounded-xl text-[#141414]/40 transition-colors z-10"
            >
              <XIcon size={18} />
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
                    className="w-full px-4 py-3 text-left hover:bg-[#141414]/5 flex items-center justify-between transition-colors border-b border-[#141414]/5 last:border-0"
                  >
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-[#141414]">{s.itemName}</span>
                        {s.isRefrigerated && (
                          <ThermometerSnowflake size={10} className="text-blue-500" />
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-[#141414]/40">{s.itemCode}</span>
                    </div>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mb-4"
            >
              <div className="flex flex-col gap-5 bg-[#141414]/[0.02] p-5 rounded-2xl border border-[#141414]/10 shadow-sm">
                
                {/* Row 1: Filter Categories */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                  
                  {/* Stock Status Category */}
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 ml-1">Stock Status</span>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => setStockFilter('all')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                          stockFilter === 'all'
                            ? 'bg-[#141414] text-white border-[#141414]'
                            : 'bg-white text-[#141414]/65 border-[#141414]/10 hover:bg-[#141414]/5'
                        }`}
                      >
                        All ({filterCounts.all})
                      </button>
                      
                      {[
                        { id: 'in', label: 'In Stock', count: filterCounts.inStock, activeColor: 'bg-emerald-500 text-white border-emerald-500' },
                        { id: 'low', label: 'Low Stock', count: filterCounts.lowStock, activeColor: 'bg-amber-500 text-white border-amber-500' },
                        { id: 'out', label: 'Out of Stock', count: filterCounts.outOfStock, activeColor: 'bg-red-500 text-white border-red-500' }
                      ].map((f) => {
                        const active = stockFilter === f.id;
                        return (
                          <button
                            key={f.id}
                            onClick={() => setStockFilter(f.id as any)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                              active
                                ? f.activeColor
                                : 'bg-white text-[#141414]/65 border-[#141414]/10 hover:bg-[#141414]/5'
                            }`}
                          >
                            {f.label} ({f.count})
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Classification Category */}
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 ml-1 font-sans">Classification</span>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { id: 'qatari', label: 'Qatari', count: filterCounts.qatari, activeColor: 'bg-[#F27D26] text-white border-[#F27D26]' },
                        { id: 'restricted', label: 'Restricted', count: filterCounts.restricted, activeColor: 'bg-blue-500 text-white border-blue-500' }
                      ].map((f) => {
                        const active = classificationFilter === f.id;
                        return (
                          <button
                            key={f.id}
                            onClick={() => {
                              setClassificationFilter(prev => prev === f.id ? null : f.id as any);
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                              active
                                ? f.activeColor
                                : 'bg-white text-[#141414]/65 border-[#141414]/10 hover:bg-[#141414]/5'
                            }`}
                          >
                            {f.label} ({f.count})
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Type Category */}
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 ml-1 font-sans">Type</span>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { id: 'generic', label: 'Generics', count: filterCounts.generics, activeColor: 'bg-yellow-500 text-white border-yellow-500' },
                        { id: 'brand', label: 'Brands', count: filterCounts.brands, activeColor: 'bg-orange-500 text-white border-orange-500' },
                        { id: 'non-generic-and-non-brand', label: 'Non-Generic & Non-Brand', count: filterCounts.nonGenericAndNonBrand, activeColor: 'bg-purple-600 text-white border-purple-600' }
                      ].map((f) => {
                        const active = typeFilter === f.id;
                        return (
                          <button
                            key={f.id}
                            onClick={() => {
                              setTypeFilter(prev => prev === f.id ? null : f.id as any);
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                              active
                                ? f.activeColor
                                : 'bg-white text-[#141414]/65 border-[#141414]/10 hover:bg-[#141414]/5'
                            }`}
                          >
                            {f.label} ({f.count})
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Refrigeration (Ref) Category */}
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 ml-1 font-sans">Storage</span>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => setRefFilter(prev => prev === 'refrigerated' ? 'all' : 'refrigerated')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border flex items-center gap-1.5 ${
                          refFilter === 'refrigerated'
                            ? 'bg-blue-500 text-white border-blue-500'
                            : 'bg-white text-[#141414]/65 border-[#141414]/10 hover:bg-[#141414]/5'
                        }`}
                      >
                        <ThermometerSnowflake className="w-3 h-3" />
                        Ref Storage ({filterCounts.refrigerated})
                      </button>
                      <button
                        onClick={() => setRefFilter(prev => prev === 'non-refrigerated' ? 'all' : 'non-refrigerated')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border flex items-center gap-1.5 ${
                          refFilter === 'non-refrigerated'
                            ? 'bg-[#06B6D4] text-white border-[#06B6D4]'
                            : 'bg-white text-[#141414]/65 border-[#141414]/10 hover:bg-[#141414]/5'
                        }`}
                      >
                        <ThermometerSnowflake className="w-3 h-3" />
                        Non-Ref Storage ({filterCounts.nonRefrigerated})
                      </button>
                    </div>
                  </div>

                  {/* Consumption Category */}
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 ml-1 font-sans">Consumption</span>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => setConsumptionFilter(prev => prev === 'zero' ? 'all' : 'zero')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border flex items-center gap-1.5 ${
                          consumptionFilter === 'zero'
                            ? 'bg-slate-700 text-white border-slate-700'
                            : 'bg-white text-[#141414]/65 border-[#141414]/10 hover:bg-[#141414]/5'
                        }`}
                      >
                        <Sparkles className="w-3 h-3" />
                        0 Consumption ({filterCounts.zeroConsumption})
                      </button>
                      <button
                        onClick={() => setConsumptionFilter(prev => prev === 'positive' ? 'all' : 'positive')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border flex items-center gap-1.5 ${
                          consumptionFilter === 'positive'
                            ? 'bg-lime-600 text-white border-lime-600'
                            : 'bg-white text-[#141414]/56 border-[#141414]/10 hover:bg-[#141414]/5'
                        }`}
                      >
                        <Sparkles className="w-3 h-3" />
                        &gt; 0 Consumption ({filterCounts.positiveConsumption})
                      </button>
                    </div>
                  </div>

                </div>

                {/* Row 2: Expiry & Reset */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-[#141414]/5">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 ml-1 font-sans">
                      Exp. Range (Start)
                    </label>
                    <input
                      type="date"
                      value={expStart}
                      onChange={(e) => setExpStart(e.target.value)}
                      className="w-full px-4 py-2 bg-white border border-[#141414]/10 rounded-xl text-sm focus:ring-2 focus:ring-[#F27D26]/10 transition-all font-medium text-[#141414]/80"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 ml-1 font-sans">
                      Exp. Range (End)
                    </label>
                    <input
                      type="date"
                      value={expEnd}
                      onChange={(e) => setExpEnd(e.target.value)}
                      className="w-full px-4 py-2 bg-white border border-[#141414]/10 rounded-xl text-sm focus:ring-2 focus:ring-[#F27D26]/10 transition-all font-medium text-[#141414]/80"
                    />
                  </div>

                  <div className="flex items-end">
                    <button
                      onClick={() => {
                        setStockFilter('all');
                        setClassificationFilter(null);
                        setTypeFilter(null);
                        setRefFilter('all');
                        setConsumptionFilter('all');
                        setExpStart('');
                        setExpEnd('');
                        setSearchQuery('');
                        setOrderTarget(1);
                      }}
                      className="w-full h-10 flex items-center justify-center gap-2 bg-red-50 text-red-500 border border-red-100 rounded-xl text-xs font-bold hover:bg-red-100 transition-all cursor-pointer"
                    >
                      <XIcon className="w-4 h-4" />
                      Reset All Filters
                    </button>
                  </div>
                </div>

              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Main Content View - Table on desktop, Cards on mobile */}
      <div className="bg-white rounded-3xl border border-[#141414]/10 shadow-sm overflow-hidden animate-in fade-in duration-300">
        {loading ? (
          <div className="p-24 flex flex-col items-center justify-center gap-4">
            <Loader2 className="w-10 h-10 text-[#141414]/20 animate-spin" />
            <p className="text-sm font-bold text-[#141414]/40 uppercase tracking-widest">Inventory Loading...</p>
          </div>
        ) : (
          <>
            {/* Filter Result Counter Bar */}
            <div className="px-6 py-4 border-b border-[#141414]/5 bg-[#141414]/[0.01] flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-[#F27D26]" />
                  Filtered List Info:
                </span>
                <span className="px-2.5 py-1 bg-[#141414]/5 border border-[#141414]/10 rounded-xl text-xs font-bold text-[#141414]/80">
                  Total Items Matching: <strong className="text-[#F27D26]">{sortedMeds.length}</strong>
                </span>
                <span className="px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                  Items to Order (in downloaded PDF/Excel/CSV): <strong className="text-emerald-600 font-extrabold text-sm">{sortedMeds.filter(m => m.orderQty > 0).length}</strong>
                </span>
              </div>
              <div className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-widest">
                Showing {sortedMeds.length} of {medications.length} items for {PHARMACY_NAMES[selectedLocation]}
              </div>
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto max-h-[75vh]">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-20 bg-white shadow-sm">
                  <tr className="bg-[#141414]/5 border-b border-[#141414]/10">
                    <th 
                      className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 cursor-pointer hover:bg-[#141414]/5 transition-colors sticky top-0 bg-[#F9F9F9]"
                      onClick={() => toggleSort('itemCode')}
                    >
                      <div className="flex items-center gap-1">
                        Item Code
                        {sortField === 'itemCode' && <ArrowUpDown className="w-3 h-3 text-[#F27D26]" />}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 cursor-pointer hover:bg-[#141414]/5 transition-colors sticky top-0 bg-[#F9F9F9]"
                      onClick={() => toggleSort('itemName')}
                    >
                      <div className="flex items-center gap-1">
                        Item Name
                        {sortField === 'itemName' && <ArrowUpDown className="w-3 h-3 text-[#F27D26]" />}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 cursor-pointer hover:bg-[#141414]/5 transition-colors sticky top-0 bg-[#F9F9F9]"
                      onClick={() => toggleSort('qoh')}
                    >
                      <div className="flex items-center gap-1">
                        QOH
                        {sortField === 'qoh' && <ArrowUpDown className="w-3 h-3 text-[#F27D26]" />}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 cursor-pointer hover:bg-[#141414]/5 transition-colors sticky top-0 bg-[#F9F9F9]"
                      onClick={() => toggleSort('consumption')}
                    >
                      <div className="flex items-center gap-1">
                        Consumption
                        {sortField === 'consumption' && <ArrowUpDown className="w-3 h-3 text-[#F27D26]" />}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 bg-[#F27D26]/[0.02] sticky top-0 cursor-pointer hover:bg-[#141414]/5 transition-colors"
                      onClick={() => toggleSort('minQty')}
                    >
                      <div className="flex items-center gap-1">
                        Min
                        {sortField === 'minQty' && <ArrowUpDown className="w-3 h-3 text-[#F27D26]" />}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 bg-[#F27D26]/[0.02] sticky top-0 cursor-pointer hover:bg-[#141414]/5 transition-colors"
                      onClick={() => toggleSort('maxQty')}
                    >
                      <div className="flex items-center gap-1">
                        Max
                        {sortField === 'maxQty' && <ArrowUpDown className="w-3 h-3 text-[#F27D26]" />}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 cursor-pointer hover:bg-[#141414]/5 transition-colors bg-emerald-50/30 sticky top-0"
                      onClick={() => toggleSort('orderQty')}
                    >
                      <div className="flex items-center gap-1">
                        Order Qty
                        {sortField === 'orderQty' && <ArrowUpDown className="w-3 h-3 text-emerald-500" />}
                      </div>
                    </th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 sticky top-0 bg-[#F9F9F9]">Expiry Date</th>
                    <th className="px-6 py-4 text-right text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 sticky top-0 bg-[#F9F9F9]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#141414]/5">
                  {sortedMeds.map((med) => {
                    const isOrdered = med.orderQty > 0;
                    
                    return (
                      <motion.tr 
                        layout
                        key={med.id} 
                        className={`group border-b border-[#141414]/5 transition-colors hover:bg-[#141414]/[0.02] ${isOrdered ? 'bg-emerald-50/10' : ''}`}
                      >
                        <td className="px-6 py-4 font-mono text-xs text-[#141414]/50">{med.itemCode}</td>
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
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (med.to) {
                                    setSelectedMedForLinks(med);
                                  } else {
                                    startEdit(med);
                                  }
                                }}
                                className="flex flex-col group/name text-left hover:opacity-80 transition-all"
                              >
                                <div className="flex flex-col gap-0.5">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-[#141414] group-hover/name:text-[#F27D26] transition-colors">{med.itemName}</span>
                                    {med.isNew && (
                                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[9px] font-black uppercase tracking-widest">
                                        NEW
                                      </span>
                                    )}
                                    {med.to && (
                                      <div className="flex items-center gap-1">
                                        <ArrowUpDown size={10} className="text-[#F27D26] animate-pulse" />
                                        <span className="text-[8px] font-black text-[#F27D26] uppercase tracking-tighter">Links</span>
                                      </div>
                                    )}
                                    <Edit3 className="w-3 h-3 text-[#141414]/20 opacity-0 group-hover/name:opacity-100 transition-all" />
                                  </div>
                                  {med.isRefrigerated && (
                                    <div className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[8px] font-black uppercase tracking-tighter w-fit">
                                      <ThermometerSnowflake size={8} />
                                      Refrigerated (2-8°C)
                                    </div>
                                  )}
                                </div>
                                {med.generic && (
                                  <span className="text-[10px] italic text-[#141414]/40 leading-tight group-hover/name:text-[#F27D26]/60 transition-colors">{med.generic}</span>
                                )}
                                <div className="flex flex-wrap gap-1 mt-1.5" onClick={(e) => e.stopPropagation()}>
                                  <span className="text-[9px] font-bold uppercase tracking-wider text-[#141414]/40 self-center">Other locations:</span>
                                  {getOtherLocationsAvailability(med.itemCode, selectedLocation, true)}
                                </div>
                              </button>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap ${
                            med.qoh <= 0 
                              ? 'bg-red-100 text-red-600' 
                              : (med.maxQty > 0 && med.qoh < med.maxQty * 0.3)
                              ? 'bg-amber-100 text-amber-600'
                              : 'bg-emerald-100 text-emerald-600'
                          }`}>
                            {med.qoh <= 0 ? 'Out of Stock' : (med.maxQty > 0 && med.qoh < med.maxQty * 0.3 ? 'Low Stock' : 'In Stock')}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded text-xs font-bold font-mono ${
                            (med.consumption || 0) > 0 
                              ? 'bg-lime-50 text-lime-700 border border-lime-200' 
                              : 'bg-slate-50 text-slate-500 border border-slate-200'
                          }`}>
                            {med.consumption !== undefined ? formatNumber(med.consumption) : '0'}
                          </span>
                        </td>
                        <td className="px-6 py-4 bg-[#F27D26]/[0.02]">
                          <span className="font-medium text-[#141414]/60">{formatNumber(med.minQty || 0)}</span>
                        </td>
                        <td className="px-6 py-4 bg-[#F27D26]/[0.02]">
                          <span className="font-medium text-[#141414]/60">{formatNumber(med.maxQty || 0)}</span>
                        </td>
                        <td className="px-6 py-4 bg-emerald-50/30">
                          {isOrdered ? (
                            <span className="flex items-center gap-2 text-emerald-600 font-black">
                              <span className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-xs px-2 min-w-[32px]">
                                {formatNumber(med.orderQty)}
                              </span>
                            </span>
                          ) : (
                            <span className="text-[#141414]/20 text-xs">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded text-[10px] font-bold font-mono ${getExpirationColor(med.expiration1)}`}>
                            {med.expiration1 || '-'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={() => startEdit(med)}
                            className="w-8 h-8 opacity-0 group-hover:opacity-100 bg-[#141414]/5 text-[#141414]/40 rounded-lg flex items-center justify-center hover:bg-[#F27D26] hover:text-white transition-all ml-auto"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-[#141414]/5">
              {sortedMeds.map((med) => {
                const isOrdered = med.orderQty > 0;
                return (
                  <motion.div 
                    layout
                    key={med.id}
                    className={`p-4 space-y-4 ${isOrdered ? 'bg-emerald-50/10' : ''}`}
                    onClick={() => startEdit(med)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex gap-4 items-start">
                        {med.imageUrl && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedImage(med.imageUrl!);
                            }}
                            className="w-12 h-12 flex-shrink-0 bg-[#141414]/5 rounded-xl border border-[#141414]/10 overflow-hidden"
                          >
                            <img src={med.imageUrl} alt={med.itemName} className="w-full h-full object-cover" />
                          </button>
                        )}
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                if (med.to) setSelectedMedForLinks(med);
                                else startEdit(med);
                              }}
                              className="font-bold text-[#141414] text-left hover:text-[#F27D26] transition-colors flex flex-col items-start gap-1"
                            >
                              {med.itemName}
                              {med.isRefrigerated && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[8px] font-black uppercase tracking-tighter">
                                  <ThermometerSnowflake size={8} />
                                  Refrigerated
                                </span>
                              )}
                              {med.consumption !== undefined && (
                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter ${
                                  (med.consumption || 0) > 0 
                                    ? 'bg-lime-50 text-lime-700 border border-lime-200' 
                                    : 'bg-slate-50 text-slate-500 border border-slate-200'
                                }`}>
                                  Consumption: {formatNumber(med.consumption)}
                                </span>
                              )}
                            </button>
                            {med.isNew && (
                              <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[8px] font-black uppercase tracking-widest">
                                NEW
                              </span>
                            )}
                            {med.to && (
                              <ArrowUpDown size={10} className="text-[#F27D26] animate-pulse" />
                            )}
                          </div>
                          <p className="text-[10px] font-mono text-[#141414]/40 uppercase tracking-widest leading-none">{med.itemCode}</p>
                          <div className="flex flex-wrap gap-1 mt-1.5 mb-1 bg-[#141414]/[0.02] p-1.5 rounded-lg border border-[#141414]/5" onClick={(e) => e.stopPropagation()}>
                            <span className="text-[9px] font-bold uppercase tracking-wider text-[#141414]/40 self-center">Other locations:</span>
                            {getOtherLocationsAvailability(med.itemCode, selectedLocation, true)}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`px-3 py-1 rounded-full text-xs font-black ${
                          med.qoh <= 0 
                            ? 'bg-red-100 text-red-600' 
                            : (med.maxQty > 0 && med.qoh < med.maxQty * 0.3)
                            ? 'bg-amber-100 text-amber-600'
                            : 'bg-emerald-100 text-emerald-600'
                        }`}>
                          {formatNumber(med.qoh)}
                        </div>
                        <p className="text-[8px] font-bold uppercase tracking-widest text-[#141414]/40 mt-1 whitespace-nowrap">
                          {med.qoh <= 0 ? 'Out of Stock' : (med.maxQty > 0 && med.qoh < med.maxQty * 0.3 ? 'Low Stock' : 'In Stock')}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-0 border border-[#141414]/5 rounded-xl overflow-hidden bg-[#141414]/[0.02]">
                      <div className="p-2 border-r border-[#141414]/5 text-center bg-[#F27D26]/[0.03]">
                        <p className="text-[8px] font-bold uppercase tracking-wider text-[#141414]/40 mb-0.5">Min</p>
                        <p className="text-xs font-bold text-[#F27D26]">{formatNumber(med.minQty || 0)}</p>
                      </div>
                      <div className="p-2 border-r border-[#141414]/5 text-center bg-[#F27D26]/[0.03]">
                        <p className="text-[8px] font-bold uppercase tracking-wider text-[#141414]/40 mb-0.5">Max</p>
                        <p className="text-xs font-bold text-[#F27D26]">{formatNumber(med.maxQty || 0)}</p>
                      </div>
                      <div className="p-2 border-r border-[#141414]/5 text-center bg-emerald-500/10">
                        <p className="text-[8px] font-bold uppercase tracking-wider text-emerald-600/60 mb-0.5">Order</p>
                        <p className="text-xs font-black text-emerald-600">{med.orderQty ? formatNumber(med.orderQty) : '-'}</p>
                      </div>
                      <div className={`p-2 text-center flex flex-col justify-center items-center ${getExpirationColor(med.expiration1)}`}>
                        <p className="text-[8px] font-bold uppercase tracking-wider opacity-60 mb-0.5">Expiry</p>
                        <p className="text-[10px] font-black">{med.expiration1 || '-'}</p>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </>
        )}

        {sortedMeds.length === 0 && !loading && (
          <div className="p-20 text-center flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-[#141414]/5 rounded-full flex items-center justify-center">
              <Search className="w-8 h-8 text-[#141414]/20" />
            </div>
            <p className="font-bold text-[#141414]/40 uppercase tracking-widest text-sm">No results found</p>
          </div>
        )}
      </div>

      {sortedMeds.length === 0 && !loading && (
        <div className="text-center py-24 bg-white rounded-3xl border border-[#141414]/10 p-12">
          <div className="w-20 h-20 bg-[#141414]/5 rounded-full flex items-center justify-center mx-auto mb-6">
            <Search className="w-10 h-10 text-[#141414]/20" />
          </div>
          <h2 className="text-xl font-bold mb-2">No items found</h2>
          <p className="text-[#141414]/40 max-w-xs mx-auto">Try adjusting your search query or location filters to see results.</p>
        </div>
      )}

      {/* Security Modal */}
      <AnimatePresence>
        {isChangingPassword && (
          <div className="fixed inset-0 z-[120] flex items-end md:items-center justify-center p-0 md:p-6 bg-black/40 backdrop-blur-sm">
            <motion.div 
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white p-6 md:p-8 rounded-t-[2.5rem] md:rounded-3xl shadow-2xl max-w-sm w-full"
            >
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#F27D26]/10 text-[#F27D26] rounded-xl flex items-center justify-center">
                    {isAdminVerified ? <KeyRound className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
                  </div>
                  <h3 className="text-xl font-bold">Portal Security</h3>
                </div>
                <button 
                  onClick={() => setIsChangingPassword(false)}
                  className="p-2 hover:bg-[#141414]/5 rounded-full transition-colors"
                >
                  <XIcon className="w-5 h-5 text-[#141414]/20" />
                </button>
              </div>

              {!isAdminVerified ? (
                <form onSubmit={handleVerifyAdmin} className="space-y-4">
                  <div className="p-4 bg-[#F27D26]/5 rounded-2xl border border-[#F27D26]/10 mb-4">
                    <p className="text-[10px] font-bold text-[#F27D26] uppercase tracking-widest leading-relaxed">
                      Admin authorization required to modify portal access.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">Admin Password</label>
                    <div className="relative">
                      <input 
                        type={showAdminPassword ? "text" : "password"}
                        value={adminPasswordAttempt}
                        onChange={(e) => setAdminPasswordAttempt(e.target.value)}
                        className="w-full px-4 py-3 bg-[#141414]/5 border-none rounded-xl focus:ring-2 focus:ring-[#F27D26]/20 transition-all font-bold tracking-widest text-sm"
                        placeholder="••••••••"
                        required
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setShowAdminPassword(!showAdminPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#141414]/20 hover:text-[#141414]/40"
                      >
                        {showAdminPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {changeError && (
                    <p className="text-red-500 text-[10px] font-bold uppercase tracking-tight">{changeError}</p>
                  )}

                  <button 
                    type="submit"
                    className="w-full py-4 bg-[#141414] text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-[#F27D26] transition-all flex items-center justify-center gap-2"
                  >
                    Verify Admin
                  </button>
                </form>
              ) : (
                <form onSubmit={handleChangePassword} className="space-y-4">
                  <p className="text-[10px] font-extrabold text-[#F27D26] uppercase tracking-[0.2em] mb-4">
                    CHANGING PORTAL ACCESS
                  </p>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">New Password</label>
                    <div className="relative">
                      <input 
                        type={showPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full px-4 py-3 bg-[#141414]/5 border-none rounded-xl focus:ring-2 focus:ring-[#F27D26]/20 transition-all font-bold tracking-widest text-sm"
                        placeholder="••••"
                        required
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#141414]/20 hover:text-[#141414]/40"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">Confirm Password</label>
                    <input 
                      type={showPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-4 py-3 bg-[#141414]/5 border-none rounded-xl focus:ring-2 focus:ring-[#F27D26]/20 transition-all font-bold tracking-widest text-sm"
                      placeholder="••••"
                      required
                    />
                  </div>

                  {changeError && (
                    <p className="text-red-500 text-[10px] font-bold uppercase tracking-tight">{changeError}</p>
                  )}

                  <button 
                    type="submit"
                    disabled={isSavingPassword}
                    className="w-full py-4 bg-[#141414] text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-[#F27D26] transition-all disabled:opacity-20 flex items-center justify-center gap-2"
                  >
                    {isSavingPassword ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>Update Access Code</>
                    )}
                  </button>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Quantity Correction Window */}
      <AnimatePresence>
        {showCorrectionModal && selectedMedForEdit && (
          <div className="fixed inset-0 z-[110] flex items-end md:items-center justify-center p-0 md:p-6 bg-black/40 backdrop-blur-sm">
            <motion.div 
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white p-6 md:p-8 rounded-t-[2.5rem] md:rounded-3xl shadow-2xl max-w-sm w-full"
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
                    <span>Current QOH</span>
                    <span className="text-[#141414]">{formatNumber(selectedMedForEdit.qoh)}</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">
                    <span>New Order Qty</span>
                    <span className="text-[#F27D26]">
                      {(() => {
                        const qoh = selectedMedForEdit.qoh;
                        const min = Number(editMin) || 0;
                        const max = Number(editMax) || 0;
                        if (max === 0 || min === 0 || max <= qoh || (max-qoh) <= min) return 0;
                        const val = Math.floor((max - qoh) / min) * min;
                        return formatNumber(val);
                      })()}
                    </span>
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
                    onClick={saveEdit}
                    disabled={isUpdating}
                    className="flex-1 py-3 bg-[#141414] text-white rounded-xl font-bold hover:bg-[#F27D26] transition-all flex items-center justify-center gap-2"
                  >
                    {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Apply Sync'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Image Preview Modal */}
      <AnimatePresence>
        {selectedImage && (
          <div className="fixed inset-0 z-[130] flex items-end md:items-center justify-center p-0 md:p-4 bg-black/80 backdrop-blur-sm shadow-2xl">
            <motion.div 
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              className="relative max-w-2xl w-full bg-white rounded-t-[2.5rem] md:rounded-3xl overflow-hidden shadow-2xl"
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
