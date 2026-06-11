import React, { useState, useMemo, useRef } from 'react';
import { 
  Plus, Upload, Trash2, Edit2, Check, FileSpreadsheet, 
  AlertCircle, Info, Loader2, AlertTriangle, Search, RefreshCw, 
  UploadCloud, Cloud, ChevronRight, FileText, Download, ArrowLeft, 
  Calendar, CheckSquare, Square, CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { PharmacyLocation, Medication, PHARMACY_NAMES } from '../types';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { useMedications } from '../hooks/useMedications';
import { useSystemMetadata } from '../lib/useSystemMetadata';
import { formatNumber } from '../lib/formatters';

interface ExcelGroupedRow {
  itemCode: string;
  description: string;
  brand: string;
  uom: string;
  lotSerials: string[];
  dates: string[]; // unique date strings parsed DD/MM/YYYY
  totalQty: number;
}

interface MismatchedItem {
  locationId: PharmacyLocation;
  locationName: string;
  itemCode: string;
  systemItemName: string;
  systemQoh: number | string;
  systemExp1: string;
  systemExp2: string;
  systemExp3: string;
  totalDeliveredQty: number;
  deliveredDates: string[];
  isCrossLocation?: boolean;
  crossSourceLocationName?: string;
}

interface LocationExcelState {
  fileName: string | null;
  excelDataGroups: Record<string, ExcelGroupedRow> | null;
  parseError: string | null;
  isProcessing: boolean;
  rawSheetNames: string[];
}

export default function AdminExpiryCheck() {
  const { isMesaieedHidden } = useSystemMetadata();

  // Load ALL medications from Firestore across all locations
  const { medications, loading: loadingMeds, refresh } = useMedications();

  // Selected Pharmacy Locations
  const [selectedLocations, setSelectedLocations] = useState<Record<PharmacyLocation, boolean>>({
    [PharmacyLocation.ADULT]: true,
    [PharmacyLocation.PEDIATRIC]: true,
    [PharmacyLocation.MESAIEED]: true
  });

  const [activeTab, setActiveTab] = useState<'all' | PharmacyLocation>('all');

  // Automatically uncheck and ignore Mesaieed if it is hidden in system settings
  React.useEffect(() => {
    if (isMesaieedHidden) {
      setSelectedLocations(prev => ({
        ...prev,
        [PharmacyLocation.MESAIEED]: false
      }));
      if (activeTab === PharmacyLocation.MESAIEED) {
        setActiveTab('all');
      }
    }
  }, [isMesaieedHidden, activeTab]);

  // Uploaded Excel States (separated per location)
  const [activeUploadLocation, setActiveUploadLocation] = useState<PharmacyLocation | null>(null);
  const [draggingLocation, setDraggingLocation] = useState<PharmacyLocation | null>(null);
  const [locationExcelData, setLocationExcelData] = useState<Record<PharmacyLocation, LocationExcelState>>({
    [PharmacyLocation.ADULT]: { fileName: null, excelDataGroups: null, parseError: null, isProcessing: false, rawSheetNames: [] },
    [PharmacyLocation.PEDIATRIC]: { fileName: null, excelDataGroups: null, parseError: null, isProcessing: false, rawSheetNames: [] },
    [PharmacyLocation.MESAIEED]: { fileName: null, excelDataGroups: null, parseError: null, isProcessing: false, rawSheetNames: [] }
  });
  const [searchQuery, setSearchQuery] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Toggle individual location
  const toggleLocation = (loc: PharmacyLocation) => {
    setSelectedLocations(prev => ({
      ...prev,
      [loc]: !prev[loc]
    }));
  };

  // Helper to extract calendar date components (year, month, day) from a JS Date object.
  // Whichever representation (UTC vs Local) is closer to midnight is assumed to be the correct intended date.
  // This solves timezone offset differences (e.g. GMT-5 or GMT+3 shifting dates by one day).
  const getSafeDateComponents = (d: Date): { year: number; month: number; day: number } => {
    const t = d.getTime();
    
    // Local midnight candidates
    const prevLocal = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    const nextLocal = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0);
    const distPrevLocal = Math.abs(t - prevLocal.getTime());
    const distNextLocal = Math.abs(nextLocal.getTime() - t);
    const closestLocal = distPrevLocal < distNextLocal ? prevLocal : nextLocal;
    const minLocalDist = Math.min(distPrevLocal, distNextLocal);

    // UTC midnight candidates
    const prevUTCVal = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0);
    const nextUTCVal = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0);
    const distPrevUTC = Math.abs(t - prevUTCVal);
    const distNextUTC = Math.abs(nextUTCVal - t);
    const closestUTCVal = distPrevUTC < distNextUTC ? prevUTCVal : nextUTCVal;
    const minUTCDist = Math.min(distPrevUTC, distNextUTC);

    if (minUTCDist < minLocalDist) {
      const dUtc = new Date(closestUTCVal);
      return {
        year: dUtc.getUTCFullYear(),
        month: dUtc.getUTCMonth() + 1,
        day: dUtc.getUTCDate()
      };
    } else {
      return {
        year: closestLocal.getFullYear(),
        month: closestLocal.getMonth() + 1,
        day: closestLocal.getDate()
      };
    }
  };

  // Helper to parse individual dates from Excel strings/numbers safely while preventing timezone-shift day discrepancies
  const parseDateString = (val: any): { year: number; month: number; day: number } | null => {
    if (!val) return null;

    if (val instanceof Date) {
      if (isNaN(val.getTime())) return null;
      return getSafeDateComponents(val);
    }

    if (typeof val === 'number') {
      try {
        const parsed = XLSX.SSF.parse_date_code(val);
        return {
          year: parsed.y,
          month: parsed.m,
          day: parsed.d
        };
      } catch {
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
          return getSafeDateComponents(d);
        }
      }
    }

    if (typeof val !== 'string') return null;
    const str = val.trim();
    if (!str || str === '-' || str === '.') return null;

    // Check custom patterns like DD/MM/YYYY or YYYY-MM-DD
    const parts = str.split(/[-/.]/).map(p => p.trim());
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        // YYYY-MM-DD
        const y = parseInt(parts[0]);
        const m = parseInt(parts[1]);
        const d = parseInt(parts[2]);
        if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
          return { year: y, month: m, day: d };
        }
      } else {
        // DD/MM/YYYY
        const p0 = parseInt(parts[0]);
        const p1 = parseInt(parts[1]);
        const p2 = parseInt(parts[2]);
        const y = p2 < 100 ? 2000 + p2 : p2;
        if (!isNaN(p0) && !isNaN(p1) && !isNaN(y)) {
          return { year: y, month: p1, day: p0 };
        }
      }
    } else if (parts.length === 2) {
      // MM/YYYY
      const m = parseInt(parts[0]);
      const y = parts[1].length === 2 ? 2000 + parseInt(parts[1]) : parseInt(parts[1]);
      if (!isNaN(m) && !isNaN(y)) {
        return { year: y, month: m, day: 1 };
      }
    }

    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return getSafeDateComponents(d);
    }

    return null;
  };

  // Convert parsed date component back to simple DD/MM/YYYY
  const formatDateObj = (parsed: { year: number; month: number; day: number } | null): string => {
    if (!parsed) return '';
    const d = String(parsed.day).padStart(2, '0');
    const m = String(parsed.month).padStart(2, '0');
    return `${d}/${m}/${parsed.year}`;
  };

  // Checks if Date A (Excel) matches Date B (System database string)
  const isDateMatch = (a: any, b: any): boolean => {
    if (!a || !b) return false;
    
    const strA = String(a).trim().toLowerCase();
    const strB = String(b).trim().toLowerCase();
    if (strA === strB) return true;

    const parsedA = parseDateString(a);
    const parsedB = parseDateString(b);
    if (!parsedA || !parsedB) return false;

    // Exact match including day, month and year
    return parsedA.year === parsedB.year && parsedA.month === parsedB.month && parsedA.day === parsedB.day;
  };

  // Checks if a value is a "Non-expiry" placeholder or empty
  const isNonExpiryValue = (val: any): boolean => {
    if (!val) return true;
    const clean = String(val).trim().toLowerCase();
    return (
      clean === '' ||
      clean === '-' ||
      clean === '.' ||
      clean === 'n/a' ||
      clean === 'na' ||
      clean === 'nil' ||
      clean === 'null' ||
      clean === 'none' ||
      clean.startsWith('non') ||
      clean.startsWith('no') ||
      clean.includes('no exp') ||
      clean.includes('لا يوجد')
    );
  };

  // Bulletproof item code matching (casing, trimming, and zero-padding normalization)
  const isItemCodeMatch = (code1: string, code2: string): boolean => {
    if (!code1 || !code2) return false;
    const c1 = String(code1).trim().toLowerCase();
    const c2 = String(code2).trim().toLowerCase();
    if (c1 === c2) return true;

    const stripZeroes = (s: string) => {
      const stripped = s.replace(/^0+/, '');
      return stripped === '' ? '0' : stripped;
    };
    return stripZeroes(c1) === stripZeroes(c2);
  };

  // Safe Excel Row Key Matcher
  const getRowValue = (row: any, keys: string[]) => {
    const rowKeys = Object.keys(row);
    for (const k of keys) {
      const normalizedK = k.toLowerCase().replace(/[\s\-_./]/g, '');
      const found = rowKeys.find(rk => {
        const normalizedRK = rk.toLowerCase().replace(/[\s\-_./]/g, '');
        return normalizedRK === normalizedK || normalizedRK.includes(normalizedK) || normalizedK.includes(normalizedRK);
      });
      if (found !== undefined) return row[found];
    }
    return undefined;
  };

  // Handle core workbook import per location
  const processWorkbookBytes = (dataBuffer: any, locId: PharmacyLocation) => {
    try {
      // Set downloading / processing state
      setLocationExcelData(prev => ({
        ...prev,
        [locId]: {
          ...prev[locId],
          isProcessing: true,
          parseError: null
        }
      }));

      const wb = XLSX.read(dataBuffer, { type: 'array', cellDates: true });

      // Find 'Combined Unified Table' case-insensitive, trimmed
      const targetSheetName = wb.SheetNames.find(name => 
        name.trim().toLowerCase() === "combined unified table"
      );

      if (!targetSheetName) {
        throw new Error(`The worksheet "Combined Unified Table" was not found in the uploaded file.`);
      }

      const ws = wb.Sheets[targetSheetName];
      const dataRows = XLSX.utils.sheet_to_json(ws) as any[];

      if (dataRows.length === 0) {
        throw new Error(`The "Combined Unified Table" worksheet is empty.`);
      }

      const rowsByItem: Record<string, ExcelGroupedRow> = {};

      for (const row of dataRows) {
        // Map Item Code
        const item = String(getRowValue(row, ['item', 'itemcode', 'code']) || '').trim();
        if (!item) continue;

        // Map other columns
        const description = String(getRowValue(row, ['description', 'desc', 'name', 'itemname']) || '').trim();
        const brand = String(getRowValue(row, ['brand']) || '').trim();
        const uom = String(getRowValue(row, ['uom', 'unit']) || '').trim();
        const lot = String(getRowValue(row, ['lot', 'serial', 'lot/serial', 'lot_serial']) || '').trim();
        const dateVal = getRowValue(row, ['date', 'expiry', 'exp', 'expiration']);
        const qtyVal = getRowValue(row, ['quantity', 'qty', 'units']);

        let qty = 0;
        if (typeof qtyVal === 'number') {
          qty = qtyVal;
        } else if (qtyVal !== undefined && qtyVal !== null && qtyVal !== '') {
          qty = parseFloat(String(qtyVal).replace(/,/g, ''));
          if (isNaN(qty)) qty = 0;
        }

        if (!rowsByItem[item]) {
          rowsByItem[item] = {
            itemCode: item,
            description,
            brand,
            uom,
            lotSerials: [],
            dates: [],
            totalQty: 0
          };
        }

        const group = rowsByItem[item];
        if (lot && !group.lotSerials.includes(lot)) {
          group.lotSerials.push(lot);
        }

        // Parse and add unique date
        const parsedDate = parseDateString(dateVal);
        const dateStr = parsedDate ? formatDateObj(parsedDate) : (dateVal ? String(dateVal).trim() : '');
        if (dateStr && !group.dates.includes(dateStr)) {
          group.dates.push(dateStr);
        }

        group.totalQty += qty;

        // Fill blanks if we didn't have one
        if (!group.description && description) group.description = description;
        if (!group.brand && brand) group.brand = brand;
        if (!group.uom && uom) group.uom = uom;
      }

      setLocationExcelData(prev => ({
        ...prev,
        [locId]: {
          fileName: prev[locId].fileName,
          excelDataGroups: rowsByItem,
          parseError: null,
          isProcessing: false,
          rawSheetNames: wb.SheetNames
        }
      }));
    } catch (err: any) {
      console.error(`Error reading file for ${locId}:`, err);
      setLocationExcelData(prev => ({
        ...prev,
        [locId]: {
          fileName: prev[locId].fileName,
          excelDataGroups: null,
          parseError: err.message || 'Failed to parse Excel file correctly.',
          isProcessing: false,
          rawSheetNames: []
        }
      }));
    }
  };

  const triggerUploadForLocation = (loc: PharmacyLocation) => {
    setActiveUploadLocation(loc);
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const resetLocationUploader = (locId: PharmacyLocation) => {
    setLocationExcelData(prev => ({
      ...prev,
      [locId]: {
        fileName: null,
        excelDataGroups: null,
        parseError: null,
        isProcessing: false,
        rawSheetNames: []
      }
    }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && activeUploadLocation) {
      const loc = activeUploadLocation;
      setLocationExcelData(prev => ({
        ...prev,
        [loc]: {
          ...prev[loc],
          fileName: file.name
        }
      }));
      const reader = new FileReader();
      reader.onload = (evt) => {
        processWorkbookBytes(evt.target?.result, loc);
      };
      reader.readAsArrayBuffer(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Mismatch Calculations
  const mismatchedItems: MismatchedItem[] = useMemo(() => {
    const activeLocations = (Object.keys(selectedLocations) as PharmacyLocation[]).filter(
      loc => selectedLocations[loc]
    );

    if (activeLocations.length === 0) return [];

    const list: MismatchedItem[] = [];

    // For each active checked target location (the report we are building)
    activeLocations.forEach(locId => {
      // Get medications for this pharmacy location
      const locMeds = (medications || []).filter(m => m.locationId === locId);

      // We matches delivered items from any of the checked locations (representing Overlap items)
      activeLocations.forEach(sourceLocId => {
        const sourceExcel = locationExcelData[sourceLocId].excelDataGroups;
        if (!sourceExcel) return; // Skip if no Excel file uploaded for this source location

        const isCrossLocation = sourceLocId !== locId;

        (Object.values(sourceExcel) as ExcelGroupedRow[]).forEach(excelGroup => {
          const systemMed = locMeds.find(m => isItemCodeMatch(m.itemCode, excelGroup.itemCode));

          if (!systemMed) {
            // If it is a cross-location match and we don't find it in our system records,
            // then it is not an overlap item. Skip it!
            if (isCrossLocation) return;

            // Case 1: Item delivered exists in Excel, but NOT found in system database for this location at all.
            // This must be checked physically because we have no record of it in the warehouse!
            list.push({
              locationId: locId,
              locationName: PHARMACY_NAMES[locId],
              itemCode: excelGroup.itemCode,
              systemItemName: excelGroup.description || 'Not Declared (Unregistered in System)',
              systemQoh: '0 (New Item)',
              systemExp1: 'Not Configured',
              systemExp2: 'Not Configured',
              systemExp3: 'Not Configured',
              totalDeliveredQty: excelGroup.totalQty,
              deliveredDates: excelGroup.dates,
              isCrossLocation: false
            });
          } else {
            // Case 2: Item exists in system. Check if any delivered Excel date is mismatched (NOT present in Exp1, Exp2, Exp3)
            const systemDates = [systemMed.expiration1, systemMed.expiration2, systemMed.expiration3].filter(Boolean);
            
            const hasNonInExp1 = isNonExpiryValue(systemMed.expiration1);

            // Get active system dates (excluding "Non" placeholders)
            const activeSystemDates = systemDates.filter(d => !isNonExpiryValue(d));

            let hasDiscrepancy = false;
            const systemQohVal = (systemMed.qoh === undefined || systemMed.qoh === null) ? 0 : Number(systemMed.qoh);

            const deliveredDates = excelGroup.dates;
            const hasDeliveredDates = deliveredDates.length > 0;
            const allDeliveredDatesMatch = hasDeliveredDates && deliveredDates.every(delivDate => {
              return [systemMed.expiration1, systemMed.expiration2, systemMed.expiration3].some(sysDate => isDateMatch(delivDate, sysDate));
            });

            if (hasDeliveredDates && allDeliveredDatesMatch) {
              hasDiscrepancy = false;
            } else if (systemQohVal <= 0) {
              // If the application system QOH is zero or less, always include this item in the report
              hasDiscrepancy = true;
            } else if (hasNonInExp1) {
              // If the item has "Non" (no expiry) in Exp1, and the Excel sheet has some delivered expiry dates,
              // this is a mismatch (especially if QOH is 0 or any other value) and must be included in the report.
              if (hasDeliveredDates) {
                hasDiscrepancy = true;
              }
            } else {
              // Standard check against system configurated active dates
              if (!hasDeliveredDates && activeSystemDates.length > 0) {
                // Excel row was uploaded with no dates, but system expects some active expiration dates
                hasDiscrepancy = true;
              } else if (hasDeliveredDates && activeSystemDates.length === 0) {
                // Excel row was uploaded with dates, but system has no active configured expiration dates
                hasDiscrepancy = true;
              } else {
                // Check direction A: Every excel delivered date must match exactly with one of the active system dates
                for (const delivDate of deliveredDates) {
                  const matchesAny = activeSystemDates.some(sysDate => isDateMatch(delivDate, sysDate));
                  if (!matchesAny) {
                    hasDiscrepancy = true;
                    break;
                  }
                }

                // Check direction B (vice-versa): Any active system date that shares month & year with any of the delivered dates 
                // should match exactly. If we have an active system date with same MM-YYYY but a different DD (mismatched day), 
                // it is a discrepancy and must be reported!
                if (!hasDiscrepancy) {
                  for (const sysDate of activeSystemDates) {
                    const parsedSys = parseDateString(sysDate);
                    if (!parsedSys) continue;

                    // If this active system expiration date does not have an exact match in the delivered dates
                    const hasExactMatch = deliveredDates.some(delivDate => isDateMatch(delivDate, sysDate));
                    if (!hasExactMatch) {
                      // Check if there is a day mismatch (excel has same month & year but different day)
                      const hasDayMismatch = deliveredDates.some(delivDate => {
                        const parsedDeliv = parseDateString(delivDate);
                        return parsedDeliv && parsedDeliv.year === parsedSys.year && parsedDeliv.month === parsedSys.month;
                      });
                      if (hasDayMismatch) {
                        hasDiscrepancy = true;
                        break;
                      }
                    }
                  }
                }
              }
            }

            if (hasDiscrepancy) {
              const displayLocName = isCrossLocation 
                ? `${PHARMACY_NAMES[locId]} (Deliv: ${PHARMACY_NAMES[sourceLocId]})` 
                : PHARMACY_NAMES[locId];

              list.push({
                locationId: locId,
                locationName: displayLocName,
                itemCode: excelGroup.itemCode,
                systemItemName: systemMed.itemName || excelGroup.description,
                systemQoh: systemMed.qoh,
                systemExp1: systemMed.expiration1 || '-',
                systemExp2: systemMed.expiration2 || '-',
                systemExp3: systemMed.expiration3 || '-',
                totalDeliveredQty: excelGroup.totalQty,
                deliveredDates: excelGroup.dates,
                isCrossLocation: isCrossLocation,
                crossSourceLocationName: isCrossLocation ? PHARMACY_NAMES[sourceLocId] : undefined
              });
            }
          }
        });
      });
    });

    // Sort by system item name alphabetically A-Z
    list.sort((a, b) => a.systemItemName.localeCompare(b.systemItemName));

    return list;
  }, [locationExcelData, medications, selectedLocations]);

  // Filter calculations on mismatched items list
  const filteredMismatchedItems = useMemo(() => {
    let result = mismatchedItems;

    if (activeTab !== 'all') {
      result = result.filter(item => item.locationId === activeTab);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(item => 
        item.itemCode.toLowerCase().includes(q) || 
        item.systemItemName.toLowerCase().includes(q)
      );
    }

    return result;
  }, [mismatchedItems, activeTab, searchQuery]);

  // Check if at least one location is selected
  const hasActiveLoc = Object.values(selectedLocations).some(v => v);

  const selectedLocNamesStr = (Object.keys(selectedLocations) as PharmacyLocation[])
    .filter(loc => selectedLocations[loc])
    .map(loc => PHARMACY_NAMES[loc])
    .join(', ');

  // Filtered items to export based on active tab (all or a specific PharmacyLocation)
  const itemsToExport = useMemo(() => {
    if (activeTab === 'all') {
      return mismatchedItems;
    }
    return mismatchedItems.filter(item => item.locationId === activeTab);
  }, [mismatchedItems, activeTab]);

  // Report Exporters
  const exportCSV = () => {
    if (itemsToExport.length === 0) return;

    const locNameSuffix = activeTab === 'all' ? 'All_Locations' : activeTab;
    const locDisplayName = activeTab === 'all' ? selectedLocNamesStr : PHARMACY_NAMES[activeTab as PharmacyLocation];

    const headers = [
      "Pharmacy Location",
      "Item code",
      "System item name",
      "System QOH",
      "System Exp1, Exp2, Exp3",
      "Total Delivered Quantity",
      "Delivered Date1,Date2,Date3,Date4,Date5"
    ];

    const dataRows = itemsToExport.map(item => [
      item.locationName,
      item.itemCode,
      item.systemItemName,
      item.systemQoh,
      [item.systemExp1, item.systemExp2, item.systemExp3].filter(f => f && f !== '-').join(", ") || '-',
      item.totalDeliveredQty,
      item.deliveredDates.slice(0, 5).join(", ") || '-'
    ]);

    const csvContent = [
      ["Report Name", "Pharmacy Expiration Date Discrepancy & Verification Report"],
      ["The Selected Location Names", locDisplayName],
      ["Time Stamp", new Date().toLocaleString()],
      ["Number of items should be checked", `${itemsToExport.length} items to checked`],
      ["Please check physically the expiry date for these items"],
      [],
      headers,
      ...dataRows
    ].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Expiry_Mismatch_Report_${locNameSuffix}_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportExcel = () => {
    if (itemsToExport.length === 0) return;

    const locNameSuffix = activeTab === 'all' ? 'All_Locations' : activeTab;
    const locDisplayName = activeTab === 'all' ? selectedLocNamesStr : PHARMACY_NAMES[activeTab as PharmacyLocation];

    const aoa: any[][] = [
      ["Report Name", "Pharmacy Expiration Date Discrepancy & Verification Report"],
      ["The Selected Location Names", locDisplayName],
      ["Time Stamp", new Date().toLocaleString()],
      ["Number of items should be checked", `${itemsToExport.length} items to checked`],
      ["Please check physically the expiry date for these items"],
      [],
      [
        "Pharmacy Location",
        "Item code",
        "System item name",
        "System QOH",
        "System Exp1, Exp2, Exp3",
        "Total Delivered Quantity",
        "Delivered Date1,Date2,Date3,Date4,Date5"
      ]
    ];

    itemsToExport.forEach(item => {
      aoa.push([
        item.locationName,
        item.itemCode,
        item.systemItemName,
        item.systemQoh,
        [item.systemExp1, item.systemExp2, item.systemExp3].filter(f => f && f !== '-').join(", ") || '-',
        item.totalDeliveredQty,
        item.deliveredDates.slice(0, 5).join(", ") || '-'
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Expiry Discrepancy");
    XLSX.writeFile(wb, `Expiry_Mismatch_Report_${locNameSuffix}_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.xlsx`);
  };

  const exportPDF = () => {
    if (itemsToExport.length === 0) return;

    const locNameSuffix = activeTab === 'all' ? 'All_Locations' : activeTab;
    const locDisplayName = activeTab === 'all' ? selectedLocNamesStr : PHARMACY_NAMES[activeTab as PharmacyLocation];

    const parseExpDate = (dateStr: string) => {
      if (!dateStr || dateStr === '-' || dateStr === '.') return null;
      try {
        const parts = dateStr.trim().split(/[-/.]/);
        if (parts.length === 3) {
          let d = parseInt(parts[0]);
          let m = parseInt(parts[1]);
          let y = parseInt(parts[2]);
          
          // If the first part is 4 digits, or the first part is > 31 (cannot be a day),
          // it is in YYYY-MM-DD format!
          if (parts[0].length === 4 || d > 31) {
            y = parseInt(parts[0]);
            m = parseInt(parts[1]);
            d = parseInt(parts[2]);
          }
          
          const fullYear = y < 100 ? 2000 + y : y;
          const date = new Date(fullYear, m - 1, d);
          if (!isNaN(date.getTime())) return date;
        } else if (parts.length === 2) {
          // Could be MM-YYYY or YYYY-MM
          let m = parseInt(parts[0]);
          let y = parseInt(parts[1]);
          if (parts[0].length === 4 || m > 12) {
            y = parseInt(parts[0]);
            m = parseInt(parts[1]);
          }
          const fullYear = y < 100 ? 2000 + y : y;
          const date = new Date(fullYear, m - 1, 1);
          if (!isNaN(date.getTime())) return date;
        }
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) return d;
      } catch { }
      return null;
    };

    const getExpirationPDFColor = (dateStr: string): [number, number, number] | null => {
      if (!dateStr || dateStr === '-' || dateStr === '.') return null;
      const parts = dateStr.split(/[\n,]/).map(p => p.trim()).filter(Boolean);
      let bestColor: [number, number, number] | null = null;
      let highestPriority = 0; // 0 = none, 1 = green, 2 = blue, 3 = yellow, 4 = red
      
      for (const part of parts) {
        const date = parseExpDate(part);
        if (!date) continue;
        
        const today = new Date();
        const currentM = new Date(today.getFullYear(), today.getMonth(), 1);
        const nextM = new Date(today.getFullYear(), today.getMonth() + 1, 1);
        const afterNextM = new Date(today.getFullYear(), today.getMonth() + 2, 1);
        const monthAfterNextNextM = new Date(today.getFullYear(), today.getMonth() + 3, 1);
        
        const itemM = new Date(date.getFullYear(), date.getMonth(), 1);
        const isSameM = (d1: Date, d2: Date) => d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth();
        
        if (isSameM(itemM, currentM)) {
          if (highestPriority < 4) {
            highestPriority = 4;
            bestColor = [239, 68, 68];
          }
        } else if (isSameM(itemM, nextM)) {
          if (highestPriority < 3) {
            highestPriority = 3;
            bestColor = [250, 204, 21];
          }
        } else if (isSameM(itemM, afterNextM)) {
          if (highestPriority < 2) {
            highestPriority = 2;
            bestColor = [59, 130, 246];
          }
        } else if (isSameM(itemM, monthAfterNextNextM)) {
          if (highestPriority < 1) {
            highestPriority = 1;
            bestColor = [34, 197, 94];
          }
        }
      }
      return bestColor;
    };

    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    // Outer frame or top boundary
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(242, 125, 38); // Brand #F27D26
    doc.text("Report Name: Pharmacy Expiration Date Discrepancy & Verification Report", 14, 20);

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(20, 20, 20);

    doc.text("The Selected Location Names:", 14, 26);
    doc.setFont("Helvetica", "normal");
    doc.text(locDisplayName, 68, 26);

    doc.setFont("Helvetica", "bold");
    doc.text("Time Stamp:", 14, 31);
    doc.setFont("Helvetica", "normal");
    doc.text(new Date().toLocaleString(), 68, 31);

    doc.setFont("Helvetica", "bold");
    doc.text("Number of items should be checked:", 14, 36);
    doc.setFont("Helvetica", "normal");
    doc.text(`${itemsToExport.length} items to checked`, 68, 36);

    doc.setFont("Helvetica", "bold");
    doc.setTextColor(220, 38, 38); // Strict red
    doc.text("Please check physically the expiry date for these items", 14, 42);

    const headers = [
      "Pharmacy Location",
      "Item code",
      "System item name",
      "System QOH",
      "System Exp1, Exp2, Exp3",
      "Total Delivered Quantity",
      "Delivered Date1,Date2,Date3,Date4,Date5"
    ];

    const body = itemsToExport.map(item => [
      item.locationName,
      item.itemCode,
      item.systemItemName,
      item.systemQoh,
      [item.systemExp1, item.systemExp2, item.systemExp3].filter(f => f && f !== '-').join(", ") || '-',
      item.totalDeliveredQty,
      item.deliveredDates.slice(0, 5).join(", ") || '-'
    ]);

    autoTable(doc, {
      startY: 47,
      head: [headers],
      body: body,
      theme: 'grid',
      headStyles: {
        fillColor: [242, 125, 38], // Brand #F27D26 color
        textColor: [255, 255, 255],
        fontSize: 7.5,
        fontStyle: 'bold'
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: [40, 40, 40]
      },
      columnStyles: {
        0: { cellWidth: 28 }, // Location
        1: { cellWidth: 'wrap' }, // Item Code
        2: { cellWidth: 50 }, // System item name
        3: { cellWidth: 16, halign: 'center' }, // System QOH
        4: { cellWidth: 52 }, // System Expirations
        5: { cellWidth: 20, halign: 'center' }, // Total qty
      },
      styles: {
        font: "Helvetica",
        cellPadding: 1.5,
        overflow: 'linebreak'
      },
      didParseCell: (data) => {
        if (data.section === 'body') {
          const item = itemsToExport[data.row.index];
          if (item && item.isCrossLocation) {
            data.cell.styles.textColor = [220, 38, 38]; // Red font
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
      willDrawCell: (data) => {
        if (data.section === 'body' && data.column.index === 4) {
          const color = getExpirationPDFColor(data.cell.raw as string);
          if (color) {
            data.cell.styles.fillColor = color;
            data.cell.styles.textColor = color[0] === 250 ? [0, 0, 0] : [255, 255, 255];
          }
        }
      },
      didDrawPage: (data) => {
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 150);
        doc.text(`Page ${data.pageNumber} of ${doc.getNumberOfPages()}`, doc.internal.pageSize.width - 25, doc.internal.pageSize.height - 8);
      }
    });

    doc.save(`Expiry_Mismatch_Report_${locNameSuffix}_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.pdf`);
  };

  const resetAllUploaders = () => {
    setLocationExcelData({
      [PharmacyLocation.ADULT]: { fileName: null, excelDataGroups: null, parseError: null, isProcessing: false, rawSheetNames: [] },
      [PharmacyLocation.PEDIATRIC]: { fileName: null, excelDataGroups: null, parseError: null, isProcessing: false, rawSheetNames: [] },
      [PharmacyLocation.MESAIEED]: { fileName: null, excelDataGroups: null, parseError: null, isProcessing: false, rawSheetNames: [] }
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-8 animate-fade-in" id="expiry-check-page">
      {/* Primary Breadcrumb and Navigation Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#141414]/10 pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-[#F27D26] uppercase tracking-[0.2em] mb-2">
            <Link to="/admin/dashboard" className="hover:underline flex items-center gap-1">
              <ArrowLeft className="w-3 h-3" /> Dashboard
            </Link>
            <ChevronRight className="w-3 h-3 text-[#141414]/20" />
            <span>IT Operations</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#141414]">
            Expiration Verification Report
          </h1>
          <p className="text-[#141414]/60 text-sm mt-1">
            Compare delivered Excel stock sheet expiration dates with database configurations.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => refresh()}
            disabled={loadingMeds}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-[#141414]/10 rounded-xl text-sm font-bold text-[#141414]/60 hover:text-[#141414]/90 hover:bg-[#141414]/3 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loadingMeds ? 'animate-spin' : ''}`} />
            <span>Refresh System Data</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Control & Upload Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Selector for Multiple Pharmacy Locations */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white border border-[#141414]/10 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Cloud className="w-5 h-5 text-[#F27D26]" />
              <h2 className="text-lg font-bold tracking-tight">1. Select Target Locations</h2>
            </div>
            
            <p className="text-[#141414]/50 text-xs mb-4">
              Check multiple pharmacy portals to cross-verify discrepancies across physical stocks.
            </p>

            <div className="space-y-3">
              {(Object.keys(selectedLocations) as PharmacyLocation[])
                .filter(loc => !(isMesaieedHidden && loc === PharmacyLocation.MESAIEED))
                .map(loc => {
                const isActive = selectedLocations[loc];
                const label = PHARMACY_NAMES[loc];
                return (
                  <button
                    key={loc}
                    onClick={() => toggleLocation(loc)}
                    className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-left transition-all ${
                      isActive 
                        ? 'border-[#F27D26] bg-[#F27D26]/[0.02] text-[#141414]' 
                        : 'border-[#141414]/10 bg-transparent text-[#141414]/55 hover:border-[#141414]/25'
                    }`}
                  >
                    <div className="flex flex-col pr-2">
                      <span className="text-sm font-bold">{label}</span>
                      <span className="text-[10px] font-mono text-[#141414]/40 mt-0.5 uppercase tracking-wider">{loc}</span>
                    </div>
                    {isActive ? (
                      <div className="p-1 rounded-lg bg-[#F27D26]/10 text-[#F27D26]">
                        <Check className="w-4 h-4 stroke-[3]" />
                      </div>
                    ) : (
                      <div className="w-6 h-6 border-2 border-[#141414]/10 rounded-lg" />
                    )}
                  </button>
                );
              })}
            </div>

            {!hasActiveLoc && (
              <div className="flex items-center gap-2 mt-4 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-xs font-medium">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>You must check at least one location to run the validation.</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Columns: Drag & Drop Excel Uploader */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-[#141414]/10 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4 border-b border-[#141414]/5 pb-4 mb-4">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                <h2 className="text-lg font-bold tracking-tight">2. Import Delivered Stock Worksheet</h2>
              </div>
              
              {/* Optional master reset */}
              <button
                onClick={resetAllUploaders}
                className="text-[11px] font-bold text-red-500 hover:text-red-700 hover:underline transition-all cursor-pointer"
              >
                Reset All Streams
              </button>
            </div>

            <p className="text-[#141414]/50 text-xs mb-6">
              Upload the physical delivered stock spreadsheet specifically for each location portal. The application will unpack each file, looking for a sheet named EXACTLY <strong className="font-semibold text-[#141414]">"Combined Unified Table"</strong>.
            </p>

            {/* General Hidden File Selector */}
            <input 
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".xlsx, .xls, .csv"
              className="hidden"
            />

            <div className="space-y-4">
              {(Object.keys(locationExcelData) as PharmacyLocation[])
                .filter(loc => !(isMesaieedHidden && loc === PharmacyLocation.MESAIEED))
                .map(loc => {
                const state = locationExcelData[loc];
                const label = PHARMACY_NAMES[loc];
                const isParsing = state.isProcessing;

                return (
                  <div 
                    key={loc}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDraggingLocation(loc);
                    }}
                    onDragLeave={() => {
                      setDraggingLocation(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDraggingLocation(null);
                      const file = e.dataTransfer.files?.[0];
                      if (file) {
                        setLocationExcelData(prev => ({
                          ...prev,
                          [loc]: { ...prev[loc], fileName: file.name }
                        }));
                        const reader = new FileReader();
                        reader.onload = (evt) => {
                          processWorkbookBytes(evt.target?.result, loc);
                        };
                        reader.readAsArrayBuffer(file);
                      }
                    }}
                    className={`p-4 border rounded-2xl transition-all ${
                      draggingLocation === loc 
                        ? 'border-[#F27D26] bg-[#F27D26]/5' 
                        : state.excelDataGroups 
                          ? 'border-emerald-100 bg-emerald-50/10' 
                          : 'border-zinc-200 hover:border-zinc-300 bg-white'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-2.5 rounded-xl shrink-0 ${state.excelDataGroups ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-[#F27D26]'}`}>
                          <FileSpreadsheet className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-[#141414] text-sm">{label}</h4>
                          <p className="text-[10px] font-mono text-[#141414]/40 uppercase tracking-widest mt-0.5">{loc}</p>
                          {state.excelDataGroups ? (
                            <p className="text-xs text-emerald-600 font-bold mt-1">
                              Ready: Unpacked {Object.keys(state.excelDataGroups).length} unique items
                            </p>
                          ) : isParsing ? (
                            <div className="flex items-center gap-1.5 text-xs text-[#F27D26] font-bold mt-1">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>Unpacking worksheet...</span>
                            </div>
                          ) : (
                            <p className="text-xs text-[#141414]/40 mt-1">
                              No stock worksheet uploaded for this location.
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {state.excelDataGroups ? (
                          <button
                            onClick={() => resetLocationUploader(loc)}
                            className="px-3 py-1.5 bg-white hover:bg-red-50 hover:text-red-600 border border-zinc-200 text-zinc-600 rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer"
                          >
                            Clear
                          </button>
                        ) : (
                          <button
                            onClick={() => triggerUploadForLocation(loc)}
                            className="px-3 py-1.5 bg-white hover:bg-orange-50 text-[#F27D26] border border-orange-200 rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer flex items-center gap-1"
                          >
                            <UploadCloud className="w-3.5 h-3.5" />
                            <span>Upload Excel</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Display file name if uploaded */}
                    {state.fileName && (
                      <div className="mt-2.5 px-3 py-1.5 bg-[#141414]/3 rounded-lg text-xs font-semibold text-[#141414]/70 flex items-center gap-1.5">
                        <span className="font-bold text-[#141414]">File:</span> {state.fileName}
                      </div>
                    )}

                    {/* Display error if failed */}
                    {state.parseError && (
                      <div className="mt-3 p-3 bg-red-50 border border-red-100 text-red-700 rounded-xl flex items-start gap-2.5">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
                        <div className="space-y-0.5">
                          <h5 className="font-bold text-xs">Spreadsheet Import Failure</h5>
                          <p className="text-[11px] leading-relaxed opacity-90">{state.parseError}</p>
                          {state.rawSheetNames.length > 0 && (
                            <p className="text-[10px] font-mono opacity-80 mt-1">
                              Sheets found in uploaded file: {state.rawSheetNames.join(', ')}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Expiry Analysis Report Section */}
      <AnimatePresence>
        {(Object.values(locationExcelData) as LocationExcelState[]).some(state => state.excelDataGroups !== null) && hasActiveLoc && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
            className="space-y-6"
          >
            {/* Disclaimer & Critical Warning */}
            <div className="bg-orange-50 border-2 border-orange-200/80 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-orange-100 text-orange-600 rounded-xl shrink-0">
                  <AlertCircle className="w-6 h-6 stroke-[2.5]" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-black text-[#F27D26] uppercase tracking-wider">Pharmacy Physical Instructions</p>
                  <blockquote className="text-lg md:text-xl font-bold tracking-tight text-[#141414] leading-snug">
                    “Please check physically the expiry date for these items”
                  </blockquote>
                  <p className="text-[#141414]/65 text-xs">
                    Discrepancies identified: delivered dates do not conform to current database expiration tags (Exp1, Exp2, Exp3).
                  </p>
                </div>
              </div>

              {/* Counts Indicator */}
              <div className="flex flex-col text-left md:text-right shrink-0 bg-white/60 md:bg-transparent border md:border-none p-4 md:p-0 rounded-xl">
                <span className="text-[34px] font-black text-red-600 leading-none">{mismatchedItems.length}</span>
                <span className="text-[10px] font-black text-[#141414]/40 uppercase tracking-wider mt-1.5">Items to check physically</span>
              </div>
            </div>

            {/* Action Bar for Downloading Reports */}
            <div className="bg-white border border-[#141414]/10 rounded-2xl p-6 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold tracking-tight">3. Generate {activeTab === 'all' ? 'All' : PHARMACY_NAMES[activeTab as PharmacyLocation]} Discrepancy Reports</h2>
                  <p className="text-[#141414]/50 text-xs">
                    {activeTab === 'all' 
                      ? 'Download combined matching sheets to assist warehouse personnel in physical verification.' 
                      : `Download matching sheet specifically filtered for ${PHARMACY_NAMES[activeTab as PharmacyLocation]}.`
                    }
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={exportPDF}
                    disabled={itemsToExport.length === 0}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-[#F27D26] hover:bg-[#e06c15] text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Print {activeTab === 'all' ? 'All' : 'Location'} PDF</span>
                  </button>

                  <button
                    onClick={exportExcel}
                    disabled={itemsToExport.length === 0}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 border border-[#141414]/10 hover:bg-[#141414]/5 rounded-xl text-xs font-bold text-[#141414]/80 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Export {activeTab === 'all' ? 'All' : 'Location'} Excel</span>
                  </button>

                  <button
                    onClick={exportCSV}
                    disabled={itemsToExport.length === 0}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 border border-[#141414]/10 hover:bg-[#141414]/5 rounded-xl text-xs font-bold text-[#141414]/80 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 text-blue-500" />
                    <span>Download {activeTab === 'all' ? 'All' : 'Location'} CSV</span>
                  </button>
                </div>
              </div>

              {/* Search and Filter Tabs for Screen Validation */}
              <div className="border-t border-[#141414]/5 pt-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                {/* Tabs to toggle between selected locations */}
                <div className="flex items-center gap-1 bg-[#141414]/3 p-1 rounded-xl w-fit">
                  <button
                    onClick={() => setActiveTab('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      activeTab === 'all' 
                        ? 'bg-white text-[#141414] shadow-sm' 
                        : 'text-[#141414]/50 hover:text-[#141414]/80'
                    }`}
                  >
                    All Locations ({mismatchedItems.length})
                  </button>
                  
                  {(Object.keys(selectedLocations) as PharmacyLocation[]).filter(loc => selectedLocations[loc]).map(loc => {
                    const count = mismatchedItems.filter(item => item.locationId === loc).length;
                    const isTabActive = activeTab === loc;
                    const suffix = loc === PharmacyLocation.ADULT ? 'Adult' : loc === PharmacyLocation.PEDIATRIC ? 'Pediatric' : 'Mesaieed';
                    return (
                      <button
                        key={loc}
                        onClick={() => setActiveTab(loc)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          isTabActive 
                            ? 'bg-white text-[#141414] shadow-sm' 
                            : 'text-[#141414]/50 hover:text-[#141414]/80'
                        }`}
                      >
                        {suffix} ({count})
                      </button>
                    );
                  })}
                </div>

                {/* Instant Search Bar */}
                <div className="relative max-w-sm w-full">
                  <Search className="w-4 h-4 text-[#141414]/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search mismatch list by ID or name..."
                    className="w-full pl-10 pr-4 py-2 bg-[#141414]/3 border border-transparent rounded-xl text-xs font-semibold placeholder-[#141414]/30 focus:bg-white focus:border-[#F27D26]/30 transition-all outline-none"
                  />
                </div>
              </div>

              {/* The Discrepancy Table */}
              <div className="overflow-x-auto border border-[#141414]/5 rounded-2xl">
                <table className="w-full border-collapse truncate table-auto text-left text-xs bg-white">
                  <thead>
                    <tr className="bg-[#141414]/2 text-[#141414]/60 border-b border-[#141414]/10 font-bold">
                      <th className="px-4 py-3.5 font-bold">Pharmacy Location</th>
                      <th className="px-4 py-3.5 font-bold">Item code</th>
                      <th className="px-4 py-3.5 font-bold">System item name</th>
                      <th className="px-4 py-3.5 font-bold text-center">System QOH</th>
                      <th className="px-4 py-3.5 font-bold">System Exp1, Exp2, Exp3</th>
                      <th className="px-4 py-3.5 font-bold text-center">Total Deliv Qty</th>
                      <th className="px-4 py-3.5 font-bold">Delivered Date1, Date2...</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#141414]/5 font-medium">
                    {filteredMismatchedItems.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-10 text-center text-zinc-400">
                          <CheckCircle2 className="w-8 h-8 text-emerald-500/80 mx-auto mb-2" />
                          <p className="font-bold text-sm text-[#141414]/80">No Expiration Discrepancies Found!</p>
                          <p className="text-xs text-[#141414]/40 mt-1 max-w-md mx-auto">
                            All delivered items conform completely to current database expiration records in checked locations.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      filteredMismatchedItems.map((item, index) => {
                        const itemCompositeKey = `${item.locationId}-${item.itemCode}-${index}`;
                        return (
                          <tr key={itemCompositeKey} className={`hover:bg-[#141414]/[0.01] transition-all ${item.isCrossLocation ? 'bg-red-50/20' : ''}`}>
                            <td className="px-4 py-3 font-semibold text-[#141414]/80">
                              <div className="flex flex-col gap-1">
                                <span className={`inline-flex items-center w-fit px-2 py-1 rounded-lg text-[10px] font-bold uppercase ${
                                  item.isCrossLocation 
                                    ? 'bg-red-100/70 text-red-700' 
                                    : 'bg-zinc-100 text-[#141414]/70'
                                }`}>
                                  {item.locationId === PharmacyLocation.ADULT ? 'Adult' : item.locationId === PharmacyLocation.PEDIATRIC ? 'Pediatric' : 'Mesaieed'}
                                </span>
                                {item.isCrossLocation && item.crossSourceLocationName && (
                                  <span className="text-[9px] font-extrabold text-red-500 uppercase tracking-tight">
                                    Deliv: {item.crossSourceLocationName}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className={`px-4 py-3 font-mono text-xs font-black ${item.isCrossLocation ? 'text-red-600' : ''}`}>{item.itemCode}</td>
                            <td className="px-4 py-3 leading-tight pr-6">
                              <div className={`font-bold text-xs ${item.isCrossLocation ? 'text-red-700 font-extrabold' : 'text-[#141414]'}`}>{item.systemItemName}</div>
                              {item.isCrossLocation && (
                                <div className="text-[9px] font-bold text-red-500 mt-0.5">Cross-Location Overlap Mismatch</div>
                              )}
                            </td>
                            <td className={`px-4 py-3 text-center font-bold ${item.isCrossLocation ? 'text-red-600' : ''}`}>
                              {typeof item.systemQoh === 'number' ? formatNumber(item.systemQoh) : item.systemQoh}
                            </td>
                            <td className="px-4 py-3 font-mono text-zinc-500">
                              {item.systemExp1 === 'Not Configured' ? (
                                <span className="text-amber-600 bg-amber-50 px-2 py-0.5 rounded text-[10px] font-bold">Unregistered</span>
                              ) : (
                                <div className="space-y-0.5">
                                  {[item.systemExp1, item.systemExp2, item.systemExp3].filter(Boolean).map((exp, expIdx) => (
                                    <span key={expIdx} className={`block text-[10px] font-bold px-1.5 py-0.5 rounded w-fit ${
                                      item.isCrossLocation 
                                        ? 'bg-red-50 text-red-700 border border-red-100' 
                                        : 'bg-zinc-50 text-zinc-600 border border-zinc-100'
                                    }`}>
                                      E{expIdx + 1}: {exp}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className={`px-4 py-3 text-center text-sm font-extrabold ${item.isCrossLocation ? 'text-red-600' : 'text-[#F27D26]'}`}>
                              {formatNumber(item.totalDeliveredQty)}
                            </td>
                            <td className="px-4 py-3 gap-1">
                              <div className="flex flex-wrap gap-1 leading-normal">
                                {item.deliveredDates.map((delivDate, dateIdx) => (
                                  <span key={dateIdx} className="inline-block text-[11px] font-black text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">
                                    {delivDate}
                                  </span>
                                ))}
                                {item.deliveredDates.length === 0 && (
                                  <span className="text-[#141414]/30">-</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
