import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  BarChart3, 
  Calendar, 
  Download, 
  FileSpreadsheet, 
  FileText, 
  RefreshCw, 
  Trash2, 
  TrendingUp, 
  Users, 
  Activity, 
  AlertTriangle, 
  Clock, 
  MapPin, 
  Search, 
  ShieldAlert, 
  CheckCircle,
  FileDown,
  Sparkles,
  Upload,
  Loader2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import Markdown from 'react-markdown';
import { WorkloadRecord } from '../types';
import { format, parse, startOfDay, endOfDay, subDays, isWithinInterval } from 'date-fns';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';

export default function AdminWorkload() {
  const [records, setRecords] = useState<WorkloadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [activeQuickFilter, setActiveQuickFilter] = useState<string>('all');
  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  const [mismatchOnlyFilter, setMismatchOnlyFilter] = useState(false);
  
  // Server-side aggregated metrics state
  const [metrics, setMetrics] = useState({
    total: 0,
    mismatches: 0,
    rate: '0.0',
    uniqueMrns: 0,
    activeStaff: 0,
    lastActionStr: 'No Data',
    totalUploadedFiles: 0
  });
  const [uploadedFilesList, setUploadedFilesList] = useState<any[]>([]);
  const sortedUploadedFiles = useMemo(() => {
    return [...uploadedFilesList].sort((a, b) => {
      const parseDateFromFilename = (filename: string) => {
        const match = filename?.match(/(?:^|[^0-9])(\d{2})[-/](\d{2})[-/](\d{4})(?:[^0-9]|$)/);
        if (match) {
          const month = parseInt(match[1], 10);
          const day = parseInt(match[2], 10);
          const year = parseInt(match[3], 10);
          return new Date(year, month - 1, day).getTime();
        }
        return 0;
      };
      const dateA = parseDateFromFilename(a.filename);
      const dateB = parseDateFromFilename(b.filename);
      if (dateA && dateB && dateA !== dateB) {
        return dateA - dateB;
      }
      const timeA = new Date(a.uploadedAt || 0).getTime();
      const timeB = new Date(b.uploadedAt || 0).getTime();
      if (timeA !== timeB) return timeA - timeB;
      return (a.filename || '').localeCompare(b.filename || '');
    });
  }, [uploadedFilesList]);
  const [topMedications, setTopMedications] = useState<any[]>([]);
  const [topStaff, setTopStaff] = useState<any[]>([]);
  const [locationBreakdown, setLocationBreakdown] = useState<any>({
    'adult-emergency': { total: 0, mismatches: 0 },
    'pediatric': { total: 0, mismatches: 0 }
  });
  const [workloadTrend, setWorkloadTrend] = useState<any[]>([]);
  const [selectedTrendLocation, setSelectedTrendLocation] = useState<string>('all');
  
  // Reset Password Modal State
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isFilesHistoryModalOpen, setIsFilesHistoryModalOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  // Multiple Excel Upload State
  const [dbState, setDbState] = useState<{
    configured: boolean;
    parameters: any[];
    pharmacists: any[];
  }>({
    configured: false,
    parameters: [],
    pharmacists: []
  });
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadProgressPercent, setUploadProgressPercent] = useState<number | null>(null);
  const [uploadProgressMsg, setUploadProgressMsg] = useState('');
  const [isDraggingUpload, setIsDraggingUpload] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [diagnosticLogs, setDiagnosticLogs] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const extractFuzzyValueCache = useRef<Record<string, string>>({});

  useEffect(() => {
    const fetchDb = async () => {
      try {
        const res = await fetch('/api/entry-mistakes/db');
        if (res.ok) {
          const data = await res.json();
          setDbState({
            configured: !!data?.configured,
            parameters: Array.isArray(data?.parameters) ? data.parameters : [],
            pharmacists: Array.isArray(data?.pharmacists) ? data.pharmacists : []
          });
        }
      } catch (err) {
        console.error('Failed to load database parameters for validation:', err);
      }
    };
    fetchDb();
  }, []);

  const formatActionDateTime = (val: any): string => {
    if (!val) return 'N/A';
    let date: Date;
    if (val instanceof Date) {
      date = val;
    } else if (typeof val === 'number') {
      const ms = (val - 25569) * 86400 * 1000;
      date = new Date(ms);
    } else {
      const strVal = String(val).trim();
      if (!strVal || strVal.toLowerCase() === 'n/a') return 'N/A';
      if (/^\d+(\.\d+)?$/.test(strVal)) {
        const ms = (parseFloat(strVal) - 25569) * 86400 * 1000;
        date = new Date(ms);
      } else {
        date = new Date(strVal);
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
    if (isNaN(date.getTime())) return String(val);
    return format(date, 'yyyy-MM-dd HH:mm:ss');
  };

  const extractFuzzyValue = (row: any, candidates: string[], cache?: Record<string, string>): string => {
    if (!row) return '';
    const cacheKey = candidates[0];
    const activeCache = cache || extractFuzzyValueCache.current;
    const cachedField = activeCache[cacheKey];
    if (cachedField !== undefined) {
      return cachedField ? String(row[cachedField] || '').trim() : '';
    }
    for (const cand of candidates) {
      if (row[cand] !== undefined && row[cand] !== null) {
        activeCache[cacheKey] = cand;
        return String(row[cand]).trim();
      }
    }
    const keys = Object.keys(row);
    for (const cand of candidates) {
      const normCand = cand.toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const k of keys) {
        const normK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (normK === normCand) {
          activeCache[cacheKey] = k;
          return String(row[k]).trim();
        }
      }
    }
    for (const cand of candidates) {
      const normCand = cand.toLowerCase();
      for (const k of keys) {
        const normK = k.toLowerCase();
        if (normK.includes(normCand) || normCand.includes(normK)) {
          activeCache[cacheKey] = k;
          return String(row[k]).trim();
        }
      }
    }
    activeCache[cacheKey] = '';
    return '';
  };

  const isLocationMatches = (loc1: string, loc2: string): boolean => {
    const clean1 = (loc1 || '').toLowerCase().replace(/[\u00A0\s]+/g, ' ').trim();
    const clean2 = (loc2 || '').toLowerCase().replace(/[\u00A0\s]+/g, ' ').trim();
    if (!clean1 || !clean2) return false;
    if (clean1 === clean2) return true;
    const stripChars = (val: string) => val.replace(/[^a-z0-9]/g, '');
    const stripped1 = stripChars(clean1);
    const stripped2 = stripChars(clean2);
    if (stripped1 === stripped2 || stripped1.includes(stripped2) || stripped2.includes(stripped1)) {
      return true;
    }
    const resolveGroup = (val: string): string => {
      const cleanVal = val.toLowerCase().trim();
      if (cleanVal.includes('pediatric') || cleanVal.includes('ped') || cleanVal.includes('peds') || cleanVal.includes('child') || cleanVal.includes('kids') || cleanVal.includes('infant')) {
        return 'pediatric';
      }
      if (cleanVal.includes('mesaieed') || cleanVal.includes('mesai') || cleanVal.includes('msd') || cleanVal.includes('mes') || cleanVal.includes('gopd') || cleanVal.includes('aw ms gopd rx') || cleanVal.includes('aw ms gopd')) {
        return 'mesaieed';
      }
      if (cleanVal.includes('adult') || cleanVal.includes('emergency') || cleanVal.includes('male') || cleanVal.includes('main') || cleanVal.includes('ip') || cleanVal.includes('opd') || cleanVal.includes('a&e') || cleanVal.includes('a/e') || cleanVal.includes('a & e') || cleanVal.includes('a and e') || cleanVal.includes('ae') || cleanVal.includes('er') || cleanVal.includes('acc') || cleanVal.includes('trauma') || cleanVal.includes('general') || cleanVal.includes('casualty')) {
        return 'adult';
      }
      return cleanVal;
    };
    return resolveGroup(clean1) === resolveGroup(clean2);
  };

  const parseSheetWithDynamicHeader = (ws: XLSX.WorkSheet): any[] => {
    const wsRows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
    if (wsRows.length === 0) return [];
    const headerKeywords = [
      'item number', 'item code', 'dispense quantity', 'dispensed quantity', 'qty',
      'person name', 'patient name', 'mrn', 'pharmacy location', 'action personnel', 'action date'
    ];
    let headerIndex = -1;
    let maxMatchedKeywords = 0;
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

  const parseSingleWorkloadFile = (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const ab = e.target?.result;
          const wb = XLSX.read(ab, { type: 'array' });
          let targetSheetName = wb.SheetNames.find(n => {
            const sName = n.trim().toLowerCase();
            return sName.includes('yesterday hbkmc workload') || 
                   (sName.includes('yesterday') && sName.includes('workload') && sName.includes('detai')) ||
                   sName.includes('hbkmc workload') ||
                   sName.includes('yesterday hbkmc');
          });
          if (!targetSheetName) {
            let maxScore = 0;
            let bestSheet = '';
            const workloadKeywords = [
              'item number', 'item code', 'dispense quantity', 'dispensed quantity', 
              'mrn', 'pharmacy location', 'action personnel', 'action date'
            ];
            for (const sName of wb.SheetNames) {
              const ws = wb.Sheets[sName];
              const wsRows = XLSX.utils.sheet_to_json(ws, { header: 1, range: 0 }) as any[][];
              if (!wsRows || wsRows.length === 0) continue;
              let matches = 0;
              for (let i = 0; i < Math.min(wsRows.length, 15); i++) {
                const r = wsRows[i];
                if (!r || !Array.isArray(r)) continue;
                for (const cell of r) {
                  if (cell !== undefined && cell !== null) {
                    const cStr = String(cell).toLowerCase();
                    if (workloadKeywords.some(kw => cStr.includes(kw))) {
                      matches++;
                    }
                  }
                }
              }
              if (matches > maxScore) {
                maxScore = matches;
                bestSheet = sName;
              }
            }
            if (maxScore >= 2 && bestSheet) {
              targetSheetName = bestSheet;
            }
          }
          if (!targetSheetName) {
            targetSheetName = wb.SheetNames.find(n => n.trim().toLowerCase().includes('detai'));
          }
          if (!targetSheetName) {
            targetSheetName = wb.SheetNames.find(n => {
              const sName = n.trim().toLowerCase();
              return sName.includes('workload') && !sName.includes('location') && !sName.includes('staff');
            });
          }
          if (!targetSheetName && wb.SheetNames.length >= 3) {
            targetSheetName = wb.SheetNames[2];
          }
          if (!targetSheetName && wb.SheetNames.length > 0) {
            targetSheetName = wb.SheetNames[0];
          }
          if (!targetSheetName) {
            throw new Error(`The file "${file.name}" does not contain a workload worksheet.`);
          }
          const ws = wb.Sheets[targetSheetName];
          const rawJson = parseSheetWithDynamicHeader(ws);
          if (rawJson.length === 0) {
            throw new Error(`The worksheet "${targetSheetName}" is empty.`);
          }
          resolve(rawJson);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
      reader.readAsArrayBuffer(file);
    });
  };

  const parseAndProcessWorkload = async (files: FileList | File[]) => {
    extractFuzzyValueCache.current = {};
    setUploadLoading(true);
    setUploadProgressMsg('Starting parser session...');
    setUploadProgressPercent(0);
    setUploadError('');
    setDiagnosticLogs([]);

    const logDiag = (msg: string) => {
      setDiagnosticLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
      console.log(`[Upload Diagnostics] ${msg}`);
    };

    try {
      const fileArray = Array.from(files);
      if (fileArray.length === 0) {
        setUploadLoading(false);
        return;
      }

      logDiag(`Selected files count: ${fileArray.length}`);
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        const allStructuredRows: any[] = [];
        
        const overallPct = Math.round((i / fileArray.length) * 100);
        setUploadProgressPercent(overallPct);
        setUploadProgressMsg(`Processing file ${i + 1} of ${fileArray.length}: ${file.name}...`);
        logDiag(`Parsing "${file.name}"...`);
        await new Promise(resolve => setTimeout(resolve, 30));

        try {
          const rawRows = await parseSingleWorkloadFile(file);
          logDiag(`Parsed ${file.name} - found ${rawRows.length} raw rows.`);
          const fileSpecificCache: Record<string, string> = {};

          for (let j = 0; j < rawRows.length; j++) {
            const rawRow = rawRows[j];

            const actionDateTimeRaw = extractFuzzyValue(rawRow, ['Action Date & Time', 'Action Date and Time', 'Action Date', 'Date & Time', 'Date Time', 'ActionDateTime'], fileSpecificCache);
            const actionDateTime = formatActionDateTime(actionDateTimeRaw);
            const facilityOrder = extractFuzzyValue(rawRow, ['Facility - Order', 'Facility', 'Facility Order', 'Facility_Order'], fileSpecificCache);
            const nursingLocationOrder = extractFuzzyValue(rawRow, ['Nursing Location - Order', 'Nursing Location', 'Nursing Location Order', 'Nursing_Location_Order', 'Nursing Location -Order'], fileSpecificCache);
            const encounterType = extractFuzzyValue(rawRow, ['Encounter Type', 'EncounterType', 'Encounter_Type'], fileSpecificCache);
            const orderDateTimePhysicianRaw = extractFuzzyValue(rawRow, ['Order Date & Time - Physician', 'Order Date & Time', 'Order Date and Time - Physician', 'Order Date & Time -Physician', 'Order Date and Time'], fileSpecificCache);
            const orderDateTimePhysician = formatActionDateTime(orderDateTimePhysicianRaw);
            const lastUpdateProvider = extractFuzzyValue(rawRow, ['Last Update Provider', 'LastUpdateProvider', 'Last_Update_Provider', 'Provider'], fileSpecificCache);
            const mrnOrganization = extractFuzzyValue(rawRow, ['MRN- Organization', 'MRN - Organization', 'MRN Organization', 'MRN', 'MRN_Organization'], fileSpecificCache);
            const personNameFull = extractFuzzyValue(rawRow, ['Person Name- Full', 'Person Name - Full', 'Person Name Full', 'Person Name', 'Patient Name', 'Full Name'], fileSpecificCache);
            const sex = extractFuzzyValue(rawRow, ['Sex', 'Gender', 'M/F'], fileSpecificCache);
            const nationality = extractFuzzyValue(rawRow, ['Nationality', 'Nation', 'Country'], fileSpecificCache);
            const ageYearsVisit = extractFuzzyValue(rawRow, ['Age- Years (Visit)', 'Age - Years (Visit)', 'Age', 'Age- Years(Visit)', 'Age Years', 'Age-Years'], fileSpecificCache);
            const parentOrderId = extractFuzzyValue(rawRow, ['Parent Order ID', 'Parent Order Id', 'Parent_Order_ID', 'ParentOrderID'], fileSpecificCache);
            const orderEntryMode = extractFuzzyValue(rawRow, ['Order Entry Mode', 'OrderEntryMode', 'Order_Entry_Mode'], fileSpecificCache);
            const mnemonicName = extractFuzzyValue(rawRow, ['Mnemonic Name', 'MnemonicName', 'Mnemonic'], fileSpecificCache);
            const orderedAsMnemonic = extractFuzzyValue(rawRow, ['Ordered As Mnemonic', 'OrderedAsMnemonic', 'Ordered As'], fileSpecificCache);
            const orderDisplayLine = extractFuzzyValue(rawRow, ['Order Display Line', 'OrderDisplayLine'], fileSpecificCache);
            const prn = extractFuzzyValue(rawRow, ['PRN'], fileSpecificCache);
            const oci = extractFuzzyValue(rawRow, ['OCI'], fileSpecificCache);
            const orderComments = extractFuzzyValue(rawRow, ['Order Comments', 'OrderComments', 'Comments'], fileSpecificCache);
            const physicianOrdering = extractFuzzyValue(rawRow, ['Physician - Ordering', 'Physician Ordering', 'Physician', 'Ordering Physician'], fileSpecificCache);
            const pharmacyLocation = extractFuzzyValue(rawRow, ['Pharmacy Location', 'Location', 'PharmacyName', 'Pharmacy_Location'], fileSpecificCache);
            const actionType = extractFuzzyValue(rawRow, ['Action Type', 'Type', 'Action_Type'], fileSpecificCache);
            const childOrderId = extractFuzzyValue(rawRow, ['Child Order ID', 'Child Order Id', 'Child_Order_ID', 'ChildOrderID'], fileSpecificCache);
            const itemId = extractFuzzyValue(rawRow, ['Item Id', 'ItemId', 'Item_Id'], fileSpecificCache);
            const itemNumber = extractFuzzyValue(rawRow, ['Item Number', 'Item Code', 'ItemNo', 'Item_No', 'Item'], fileSpecificCache);
            const labelDescription = extractFuzzyValue(rawRow, ['Label Description', 'Description', 'Item Description', 'Drug Name', 'Item Name'], fileSpecificCache);
            const pharmacyDisplayLine = extractFuzzyValue(rawRow, ['Pharmacy Display Line', 'PharmacyDisplayLine'], fileSpecificCache);
            const pharmacySig = extractFuzzyValue(rawRow, ['Pharmacy SIG', 'PharmacySIG', 'SIG'], fileSpecificCache);
            const pharmacyExpandedSig = extractFuzzyValue(rawRow, ['Pharmacy Expanded SIG', 'Pharmacy Expanded SIG', 'PharmacyExpandedSIG', 'Expanded SIG'], fileSpecificCache);
            const dispenseUnit = extractFuzzyValue(rawRow, ['Dispense Unit', 'DispenseUnit', 'Unit'], fileSpecificCache);
            const billQuantity = extractFuzzyValue(rawRow, ['Bill Quantity', 'BillQuantity', 'Bill Qty'], fileSpecificCache);
            const actionPersonnelPharmacy = extractFuzzyValue(rawRow, ['Action Personnel - Pharmacy', 'Action Personnel', 'Pharmacist', 'Personnel', 'Action Personnel Pharmacy', 'Staff', 'Action Personnel -Pharmacy'], fileSpecificCache);
            const departmentOrderStatus = extractFuzzyValue(rawRow, ['Department Order Status', 'DepartmentOrderStatus'], fileSpecificCache);
            const orderStatus = extractFuzzyValue(rawRow, ['Order Status', 'OrderStatus'], fileSpecificCache);
            const dispenseDateTime = extractFuzzyValue(rawRow, ['Dispense Date & Time', 'Dispense Date and Time', 'Dispense Date', 'Dispense Date/Time'], fileSpecificCache);
            const dispenseEventTypeVar = extractFuzzyValue(rawRow, ['Dispense Event Type', 'DispenseEventType', 'Event Type', 'Event'], fileSpecificCache);
            const productDispenseHXID = extractFuzzyValue(rawRow, ['Product Dispense HX ID', 'Product Dispense HX Id', 'ProductDispenseHXID', 'HX ID', 'HX_ID'], fileSpecificCache);
            const dispenseQuantity = extractFuzzyValue(rawRow, ['Dispense Quantity', 'Dispensed Quantity', 'Disp Qty', 'Dispensed Qty', 'Qty', 'Quantity'], fileSpecificCache);
            const trackingItemId = extractFuzzyValue(rawRow, ['Tracking Item Id', 'Tracking Item ID', 'TrackingItemId', 'Tracking_Item_ID'], fileSpecificCache);

            if (!itemNumber && !personNameFull && !actionPersonnelPharmacy) continue;

            const parsedDispenseQty = parseFloat(String(dispenseQuantity).trim());
            if (!isNaN(parsedDispenseQty) && parsedDispenseQty < 0) continue;

            allStructuredRows.push({
              actionDateTime, facilityOrder, nursingLocationOrder, encounterType, orderDateTimePhysician, lastUpdateProvider,
              mrnOrganization, personNameFull, sex, nationality, ageYearsVisit, parentOrderId, orderEntryMode, mnemonicName,
              orderedAsMnemonic, orderDisplayLine, prn, oci, orderComments, physicianOrdering, pharmacyLocation, actionType,
              childOrderId, itemId, itemNumber, labelDescription, dispenseQuantity, pharmacyDisplayLine, pharmacySig,
              pharmacyExpandedSig, dispenseUnit, billQuantity, actionPersonnelPharmacy, departmentOrderStatus, orderStatus,
              vDispenseDateTime: formatActionDateTime(dispenseDateTime),
              vDispenseEventType: dispenseEventTypeVar,
              vProductDispenseHXID: productDispenseHXID,
              vDispenseQuantity: dispenseQuantity,
              vTrackingItemId: trackingItemId
            });
          }
          rawRows.length = 0;

          if (allStructuredRows.length === 0) {
            logDiag(`File ${file.name} had empty workloads or failed to parse.`);
            continue; // Skip evaluating empty files
          }

          // Evaluate Parameter Database Matching for mistargets / reasons
          const evaluated: WorkloadRecord[] = [];
          allStructuredRows.forEach((row, index) => {
            const reasons: string[] = [];
            
            const normalizedPharmacist = String(row.actionPersonnelPharmacy || '').toLowerCase().trim();
            const pharmacistConfig = (dbState.pharmacists || []).find(p => String(p.name || '').toLowerCase().trim() === normalizedPharmacist);
            
            if (!pharmacistConfig && row.actionPersonnelPharmacy) {
              reasons.push(`Action Personnel "${row.actionPersonnelPharmacy}" not listed in Pharmacists sheet`);
            }

            const normalizedItemNum = String(row.itemNumber || '').toLowerCase().trim();
            const matchedItemDbParameters = (dbState.parameters || []).filter(p => String(p.itemNumber || '').toLowerCase().trim() === normalizedItemNum);

            if (matchedItemDbParameters.length === 0) {
              if (row.itemNumber) {
                reasons.push(`Item Number ${row.itemNumber} is not registered in base Parameter sheet`);
              }
            } else {
              const locationConfigWord = matchedItemDbParameters.find(p => isLocationMatches(p.pharmacyLocation, row.pharmacyLocation));
              if (!locationConfigWord) {
                if (row.pharmacyLocation) {
                  reasons.push(`Item ${row.itemNumber} is not configured to be dispensed from "${row.pharmacyLocation}" location`);
                }
              } else {
                const allowedList = locationConfigWord.allowedQuantities;
                const normalizedDispQty = String(row.dispenseQuantity || '').trim();
                const dNum = Number(normalizedDispQty);
                const isAllowed = allowedList.some(allowVal => {
                  const aNum = Number(allowVal);
                  if (!isNaN(dNum) && !isNaN(aNum)) return dNum === aNum;
                  return allowVal.toLowerCase().trim() === normalizedDispQty.toLowerCase();
                });
                if (!isAllowed && normalizedDispQty !== '') {
                  reasons.push(`Dispense Qty "${row.dispenseQuantity}" is unmatched (Allowed: [${allowedList.join(', ')}])`);
                }
              }
            }

            const uniqueId = `workload-rec-${index}-${Math.random().toString(36).substring(2, 9)}-${Date.now()}`;
            evaluated.push({
              id: uniqueId,
              actionDateTime: row.actionDateTime,
              mrnOrganization: row.mrnOrganization,
              personNameFull: row.personNameFull,
              sex: row.sex,
              nationality: row.nationality,
              pharmacyLocation: row.pharmacyLocation,
              actionType: row.actionType,
              itemNumber: row.itemNumber,
              labelDescription: row.labelDescription,
              dispenseQuantity: row.dispenseQuantity,
              actionPersonnelPharmacy: row.actionPersonnelPharmacy,
              reasons,
              isMismatch: reasons.length > 0,
              isExcludedByVariance: false,
              facilityOrder: row.facilityOrder,
              nursingLocationOrder: row.nursingLocationOrder,
              encounterType: row.encounterType,
              ageYearsVisit: row.ageYearsVisit,
              physicianOrdering: row.physicianOrdering,
              dispenseEventType: row.vDispenseEventType
            });
          });

          // Save to server
          const uploadFilenames = [file.name];
          if (evaluated.length <= 1500) {
            logDiag(`Saving ${evaluated.length} records to server for ${file.name}...`);
            const saveRes = await fetch('/api/workload-records', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ records: evaluated, filenames: uploadFilenames })
            });
            if (!saveRes.ok) throw new Error(`Failed to save records for ${file.name}.`);
          } else {
            logDiag(`Initializing chunked bulk upload for ${evaluated.length} records in ${file.name}...`);
            const startRes = await fetch('/api/workload-records/upload/start', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' }
            });
            const { uploadId } = await startRes.json();
            
            const CHUNK_SIZE = 1500;
            const totalChunks = Math.ceil(evaluated.length / CHUNK_SIZE);
            for (let chunk_i = 0; chunk_i < evaluated.length; chunk_i += CHUNK_SIZE) {
              const chunkItems = evaluated.slice(chunk_i, chunk_i + CHUNK_SIZE);
              const chunkIndex = Math.floor(chunk_i / CHUNK_SIZE) + 1;
              
              setUploadProgressMsg(`Saving ${file.name}: chunk ${chunkIndex} of ${totalChunks}...`);
              const chunkRes = await fetch('/api/workload-records/upload/chunk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uploadId, items: chunkItems })
              });
              if (!chunkRes.ok) throw new Error(`Failed to upload chunk starting at index ${chunk_i}`);
              await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            const endRes = await fetch('/api/workload-records/upload/end', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ uploadId, filenames: uploadFilenames })
            });
            if (!endRes.ok) throw new Error(`Failed to finalize upload session for ${file.name}.`);
          }

        } catch (singleErr: any) {
          logDiag(`Error parsing file ${file.name}: ${singleErr?.message || singleErr}`);
        }
      }

      setUploadProgressPercent(100);
      setUploadProgressMsg('All files processed successfully!');
      await new Promise(resolve => setTimeout(resolve, 500));
      fetchWorkloadData(); // REFRESH THE PAGE RECORDS IMMEDIATELY
    } catch (err: any) {
      logDiag(`Upload Error: ${err.message}`);
      setUploadError(err.message || 'Parsing / Uploading failed.');
    } finally {
      setUploadLoading(false);
      setUploadProgressPercent(null);
    }
  };

  const filterAlreadyUploadedFiles = (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const uploadedNames = new Set(sortedUploadedFiles.map(f => f.filename));
    const newFiles = fileArray.filter(f => !uploadedNames.has(f.name));
    
    if (newFiles.length < fileArray.length) {
      const skipped = fileArray.length - newFiles.length;
      setUploadError(`${skipped} file(s) were skipped because they have already been uploaded.`);
    }
    
    return newFiles;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const newFiles = filterAlreadyUploadedFiles(files);
      if (newFiles.length > 0) {
        parseAndProcessWorkload(newFiles);
      }
    }
    // reset input so the same file can be selected again if it failed
    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingUpload(true);
  };

  const handleDragLeave = () => {
    setIsDraggingUpload(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingUpload(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const newFiles = filterAlreadyUploadedFiles(files);
      if (newFiles.length > 0) {
        parseAndProcessWorkload(newFiles);
      }
    }
  };

  // AI Audit State
  const [adultAnalysis, setAdultAnalysis] = useState<string | null>(null);
  const [pediatricAnalysis, setPediatricAnalysis] = useState<string | null>(null);
  const [activeReportTab, setActiveReportTab] = useState<'adult' | 'pediatric'>('adult');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiLoadingStep, setAiLoadingStep] = useState('');
  const [aiError, setAiError] = useState<string | null>(null);

  const handleGenerateAIAnalysis = async () => {
    setAiLoading(true);
    setAiError(null);
    setAdultAnalysis(null);
    setPediatricAnalysis(null);
    
    const steps = [
      "Initializing Gemini Clinical Auditor...",
      "Analyzing Adult Emergency workload records...",
      "Analyzing Pediatric Pharmacy workload records...",
      "Cross-referencing Brand Prescription Policies...",
      "Evaluating Staff Duty Roster Compliance...",
      "Drafting separate clinical quality assessments...",
      "Compiling tailored JCI-compliant CAPA recommendations..."
    ];
    
    let stepIdx = 0;
    setAiLoadingStep(steps[0]);
    const stepInterval = setInterval(() => {
      stepIdx = (stepIdx + 1) % steps.length;
      setAiLoadingStep(steps[stepIdx]);
    }, 1400);

    try {
      // Run both adult and pediatric audit report generations in parallel
      const [resAdult, resPediatric] = await Promise.all([
        fetch('/api/workload-records/ai-analysis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            department: 'adult',
            startDate: startDate,
            endDate: endDate
          })
        }),
        fetch('/api/workload-records/ai-analysis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            department: 'pediatric',
            startDate: startDate,
            endDate: endDate
          })
        })
      ]);

      clearInterval(stepInterval);

      if (resAdult.ok && resPediatric.ok) {
        const dataAdult = await resAdult.json();
        const dataPediatric = await resPediatric.json();
        setAdultAnalysis(dataAdult.analysis);
        setPediatricAnalysis(dataPediatric.analysis);
        setActiveReportTab('adult'); // default view to adult
      } else {
        const errAdult = !resAdult.ok ? await resAdult.json().catch(() => ({})) : {};
        const errPediatric = !resPediatric.ok ? await resPediatric.json().catch(() => ({})) : {};
        setAiError(errAdult.error || errPediatric.error || 'Failed to compile department-specific clinical audits. Please retry.');
      }
    } catch (err: any) {
      clearInterval(stepInterval);
      setAiError('Network connection issue contacting the Gemini AI engine: ' + err.message);
    } finally {
      setAiLoading(false);
    }
  };

  // Load workload data with server-side filtering
  const fetchWorkloadData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedLocation && selectedLocation !== 'all') {
        params.append('location', selectedLocation);
      }
      if (selectedTrendLocation && selectedTrendLocation !== 'all') {
        params.append('trendLocation', selectedTrendLocation);
      }
      if (mismatchOnlyFilter) {
        params.append('mismatchOnly', 'true');
      }
      if (searchQuery.trim()) {
        params.append('search', searchQuery.trim());
      }
      if (startDate) {
        params.append('startDate', startDate);
      }
      if (endDate) {
        params.append('endDate', endDate);
      }
      
      const res = await fetch(`/api/workload-records?${params.toString()}`);
      if (res.ok) {
        let data = await res.json();
        if (data._base64) {
          const binaryString = window.atob(data._base64);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
          }
          data = JSON.parse(new TextDecoder().decode(bytes));
        }
        setRecords(data.records || []);
        if (data.summary) {
          setMetrics({
            total: data.summary.total,
            mismatches: data.summary.mismatches,
            rate: data.summary.rate,
            uniqueMrns: data.summary.uniqueMrns,
            activeStaff: data.summary.activeStaff,
            lastActionStr: data.summary.lastActionStr || 'No Data',
            totalUploadedFiles: data.summary.totalUploadedFiles || 0
          });
        }
        if (data.uploadedFilesList) {
          setUploadedFilesList(data.uploadedFilesList);
        }
        if (data.topMedications) {
          setTopMedications(data.topMedications);
        }
        if (data.topStaff) {
          setTopStaff(data.topStaff);
        }
        if (data.locationBreakdown) {
          setLocationBreakdown(data.locationBreakdown);
        }
        if (data.workloadTrend) {
          setWorkloadTrend(data.workloadTrend);
        }
      }
    } catch (err) {
      console.error('Failed to fetch workload records:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkloadData();
  }, [selectedLocation, mismatchOnlyFilter, searchQuery, startDate, endDate, selectedTrendLocation]);

  useEffect(() => {
    // Listen to real-time synchronization updates
    const handleSyncUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && customEvent.detail.type === 'workload-records') {
        fetchWorkloadData();
      }
    };

    window.addEventListener('sync-update', handleSyncUpdate);
    return () => {
      window.removeEventListener('sync-update', handleSyncUpdate);
    };
  }, [selectedLocation, mismatchOnlyFilter, searchQuery, startDate, endDate, selectedTrendLocation]);

  // Set date ranges according to quick filters
  const applyQuickFilter = (filter: string) => {
    setActiveQuickFilter(filter);
    const today = new Date();
    if (filter === 'today') {
      setStartDate(format(today, 'yyyy-MM-dd'));
      setEndDate(format(today, 'yyyy-MM-dd'));
    } else if (filter === '7days') {
      setStartDate(format(subDays(today, 6), 'yyyy-MM-dd'));
      setEndDate(format(today, 'yyyy-MM-dd'));
    } else if (filter === 'month') {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      setStartDate(format(startOfMonth, 'yyyy-MM-dd'));
      setEndDate(format(today, 'yyyy-MM-dd'));
    } else if (filter === 'year') {
      const startOfYear = new Date(today.getFullYear(), 0, 1);
      setStartDate(format(startOfYear, 'yyyy-MM-dd'));
      setEndDate(format(today, 'yyyy-MM-dd'));
    } else {
      setStartDate('');
      setEndDate('');
    }
  };

  // Safe helper to parse dates from the HBKMC string format (e.g., "01-07-2026 14:35" or ISO)
  const parseRecordDate = (dateStr: string): Date => {
    if (!dateStr) return new Date(0);
    try {
      // Direct ISO parse
      if (dateStr.includes('T')) return new Date(dateStr);
      // Custom parser for "dd-MM-yyyy HH:mm" or "dd-MM-yyyy"
      const cleaned = dateStr.replace(/\//g, '-').trim();
      if (cleaned.length >= 10) {
        const parts = cleaned.split(' ');
        const dateParts = parts[0].split('-');
        const day = parseInt(dateParts[0], 10);
        const month = parseInt(dateParts[1], 10) - 1;
        const year = parseInt(dateParts[2], 10);
        
        if (parts.length > 1) {
          const timeParts = parts[1].split(':');
          const hours = parseInt(timeParts[0], 10);
          const minutes = parseInt(timeParts[1], 10);
          return new Date(year, month, day, hours, minutes);
        }
        return new Date(year, month, day);
      }
      return new Date(dateStr);
    } catch {
      return new Date(0);
    }
  };

  // Reference the server-filtered dataset directly
  const filteredRecords = records;

  // Purge / Reset Workload Database Handler
  const handleResetWorkload = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');
    setResetSuccess('');
    setIsResetting(true);

    try {
      const res = await fetch('/api/workload-records/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPassword })
      });

      if (res.ok) {
        setResetSuccess('Workload data reset successfully.');
        setRecords([]);
        setAdminPassword('');
        setMetrics({
          total: 0,
          mismatches: 0,
          rate: '0.0',
          uniqueMrns: 0,
          activeStaff: 0,
          lastActionStr: 'No Data',
          totalUploadedFiles: 0
        });
        setUploadedFilesList([]);
        setTopMedications([]);
        setTopStaff([]);
        setLocationBreakdown({
          'adult-emergency': { total: 0, mismatches: 0 },
          'pediatric': { total: 0, mismatches: 0 }
        });
        setWorkloadTrend([]);
        setAdultAnalysis(null);
        setPediatricAnalysis(null);
        setTimeout(() => {
          setIsResetModalOpen(false);
          setResetSuccess('');
          fetchWorkloadData();
        }, 1500);
      } else {
        const data = await res.json();
        setResetError(data.error || 'Incorrect admin password.');
      }
    } catch {
      setResetError('Network error resetting workload records.');
    } finally {
      setIsResetting(false);
    }
  };

  // CSV Exporter
  const handleExportCSV = () => {
    if (filteredRecords.length === 0) {
      alert('No data available to export.');
      return;
    }

    const headers = [
      'Action Date & Time', 'Facility - Order', 'Nursing Location - Order', 'Encounter Type', 
      'MRN- Organization', 'Person Name- Full', 'Sex', 'Nationality', 'Age- Years (Visit)', 
      'Physician - Ordering', 'Pharmacy Location', 'Dispense Event Type', 'Action Type', 
      'Item Number', 'Label Description', 'Action Personnel - Pharmacy', 'Mismatch Detected', 'Reasons / Remarks'
    ];

    const rows = filteredRecords.map(rec => [
      `"${rec.actionDateTime || ''}"`,
      `"${rec.facilityOrder || ''}"`,
      `"${rec.nursingLocationOrder || ''}"`,
      `"${rec.encounterType || ''}"`,
      `"${rec.mrnOrganization || ''}"`,
      `"${rec.personNameFull || ''}"`,
      `"${rec.sex || ''}"`,
      `"${rec.nationality || ''}"`,
      `"${rec.ageYearsVisit || ''}"`,
      `"${rec.physicianOrdering || ''}"`,
      `"${rec.pharmacyLocation || ''}"`,
      `"${rec.dispenseEventType || ''}"`,
      `"${rec.actionType || ''}"`,
      `"${rec.itemNumber || ''}"`,
      `"${rec.labelDescription || ''}"`,
      `"${rec.actionPersonnelPharmacy || ''}"`,
      `"${rec.isMismatch ? 'YES' : 'NO'}"`,
      `"${(rec.reasons || []).join('; ')}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `HBKMC_Workload_Report_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Excel Exporter (Direct binary download via xlsx library)
  const handleExportExcel = () => {
    if (filteredRecords.length === 0) {
      alert('No data available to export.');
      return;
    }

    const dataForSheet = filteredRecords.map(rec => ({
      'Action Date & Time': rec.actionDateTime,
      'Facility - Order': rec.facilityOrder || '',
      'Nursing Location - Order': rec.nursingLocationOrder || '',
      'Encounter Type': rec.encounterType || '',
      'MRN- Organization': rec.mrnOrganization || '',
      'Person Name- Full': rec.personNameFull || '',
      'Sex': rec.sex || '',
      'Nationality': rec.nationality || '',
      'Age- Years (Visit)': rec.ageYearsVisit || '',
      'Physician - Ordering': rec.physicianOrdering || '',
      'Pharmacy Location': rec.pharmacyLocation || '',
      'Dispense Event Type': rec.dispenseEventType || '',
      'Action Type': rec.actionType || '',
      'Item Number': rec.itemNumber || '',
      'Label Description': rec.labelDescription || '',
      'Action Personnel - Pharmacy': rec.actionPersonnelPharmacy || '',
      'Is Mismatch': rec.isMismatch ? 'Yes' : 'No',
      'Remarks': (rec.reasons || []).join('; ')
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataForSheet);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Workload Analysis');
    
    // Auto-fit column widths
    const maxLens = Object.keys(dataForSheet[0] || {}).map(key => {
      const values = dataForSheet.map(row => String((row as any)[key] || ''));
      const maxLen = Math.max(key.length, ...values.map(val => val.length));
      return { wch: Math.min(35, maxLen + 2) };
    });
    worksheet['!cols'] = maxLens;

    XLSX.writeFile(workbook, `HBKMC_Workload_Report_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
  };

  // PDF Exporter (Structured high-fidelity report layout)
  const handleExportPDF = () => {
    if (filteredRecords.length === 0) {
      alert('No data available to export.');
      return;
    }

    const doc = new jsPDF();
    const timestamp = format(new Date(), 'dd-MM-yyyy hh:mm a');

    // Title & Header Accent Band
    doc.setFillColor(242, 125, 38); // Brand Primary #F27D26
    doc.rect(0, 0, 210, 8, 'F');

    // Document Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(20, 20, 20);
    doc.text('HBKMC Workload Summary Report', 14, 25);

    // Metadata Block
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`Report Generated On: ${timestamp.toUpperCase()}`, 14, 32);
    doc.text(`Database Mode: CLOUD FIRESTORE PERSISTENT`, 14, 37);
    doc.text(`Last Recorded Workload Action: ${metrics.lastActionStr.toUpperCase()}`, 14, 42);

    // Section 1: Dashboard KPI Performance
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(20, 20, 20);
    doc.text('Key Performance Indicators (KPIs)', 14, 52);

    // Add KPI metrics table
    (doc as any).autoTable({
      startY: 55,
      head: [['KPI metric', 'Value', 'Context / Threshold']],
      body: [
        ['Total Workload Volume', `${metrics.total} Records`, 'Total actions parsed within interval'],
        ['Total Entry Mismatches', `${metrics.mismatches} Incidents`, 'Records with validation discrepancies'],
        ['Error / Mismatch Rate', `${metrics.rate}%`, 'Target benchmark: < 1.0%'],
        ['Unique Patients (MRNs)', `${metrics.uniqueMrns} Patients`, 'Distinct patient medical records serviced'],
        ['Active Pharmacist Personnel', `${metrics.activeStaff} Staff`, 'Total staff contributing actions']
      ],
      headStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 3.5 },
      theme: 'grid'
    });

    // Section 2: Breakdown by Location
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(20, 20, 20);
    doc.text('Workload Volume by Pharmacy Location', 14, (doc as any).lastAutoTable.finalY + 12);

    (doc as any).autoTable({
      startY: (doc as any).lastAutoTable.finalY + 15,
      head: [['Pharmacy Location', 'Total Volume', 'Mismatch Incidents', 'Local Mismatch Rate']],
      body: [
        ['Aw-Adult Emergency Pharmacy', `${locationBreakdown['adult-emergency'].total} Recs`, `${locationBreakdown['adult-emergency'].mismatches} Mismatches`, `${locationBreakdown['adult-emergency'].total > 0 ? ((locationBreakdown['adult-emergency'].mismatches / locationBreakdown['adult-emergency'].total) * 100).toFixed(1) : '0.0'}%`],
        ['Aw-Pediatric Pharmacy', `${locationBreakdown['pediatric'].total} Recs`, `${locationBreakdown['pediatric'].mismatches} Mismatches`, `${locationBreakdown['pediatric'].total > 0 ? ((locationBreakdown['pediatric'].mismatches / locationBreakdown['pediatric'].total) * 100).toFixed(1) : '0.0'}%`]
      ],
      headStyles: { fillColor: [242, 125, 38], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 3.5 },
      theme: 'grid'
    });

    // Page Break for Top lists
    doc.addPage();
    doc.rect(0, 0, 210, 8, 'F');

    // Section 3: High Demand Medication Items
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('High-Frequency Medication Dispense List', 14, 20);

    (doc as any).autoTable({
      startY: 23,
      head: [['Rank', 'Item Number', 'Medication / Description', 'Dispense Count']],
      body: topMedications.map((med, idx) => [
        `#${idx + 1}`,
        med.itemNumber,
        med.desc,
        `${med.count} times`
      ]),
      headStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255] },
      styles: { fontSize: 9, cellPadding: 3.5 },
      theme: 'striped'
    });

    // Section 4: Incidents List (First 20 Mismatches)
    const mismatchRecords = filteredRecords.filter(r => r.isMismatch).slice(0, 25);
    if (mismatchRecords.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('Recent Entry Mistake Incidents Log (Max 25)', 14, (doc as any).lastAutoTable.finalY + 12);

      (doc as any).autoTable({
        startY: (doc as any).lastAutoTable.finalY + 15,
        head: [['Action Date', 'Patient Name', 'Item Code', 'Quantity', 'Personnel', 'Discrepancy Details']],
        body: mismatchRecords.map(rec => [
          rec.actionDateTime,
          rec.personNameFull,
          rec.itemNumber,
          rec.dispenseQuantity,
          rec.actionPersonnelPharmacy,
          (rec.reasons || []).join(', ')
        ]),
        headStyles: { fillColor: [220, 38, 38], textColor: [255, 255, 255] },
        styles: { fontSize: 8, cellPadding: 2.5 },
        columnStyles: {
          5: { cellWidth: 50 }
        },
        theme: 'grid'
      });
    }

    // Add footer signature on all pages
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`AW-PharmaStock Pro - Page ${i} of ${pageCount}`, 14, 287);
      doc.text('AL WAKRA & MESAIEED PHARMACY SYSTEM UTILITY - CONFIDENTIAL REPORT', 110, 287);
    }

    doc.save(`HBKMC_Workload_Report_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
  };

  // SVG Chart Maximum calculation helpers
  const maxTrendCount = useMemo(() => {
    if (workloadTrend.length === 0) return 10;
    return Math.max(...workloadTrend.map(t => t.count)) * 1.15;
  }, [workloadTrend]);

  // Advanced Field-by-Field Analysis State
  const [selectedAnalysisField, setSelectedAnalysisField] = useState<string>('facilityOrder');

  const ANALYZABLE_FIELDS = useMemo(() => [
    { key: 'actionDateTime', label: 'Action Date & Time' },
    { key: 'facilityOrder', label: 'Facility - Order' },
    { key: 'nursingLocationOrder', label: 'Nursing Location - Order' },
    { key: 'encounterType', label: 'Encounter Type' },
    { key: 'mrnOrganization', label: 'MRN- Organization' },
    { key: 'personNameFull', label: 'Person Name- Full' },
    { key: 'sex', label: 'Sex' },
    { key: 'nationality', label: 'Nationality' },
    { key: 'ageYearsVisit', label: 'Age- Years (Visit)' },
    { key: 'physicianOrdering', label: 'Physician - Ordering' },
    { key: 'pharmacyLocation', label: 'Pharmacy Location' },
    { key: 'dispenseEventType', label: 'Dispense Event Type' },
    { key: 'actionType', label: 'Action Type' },
    { key: 'itemNumber', label: 'Item Number' },
    { key: 'labelDescription', label: 'Label Description' },
    { key: 'actionPersonnelPharmacy', label: 'Action Personnel - Pharmacy' },
    { key: 'status', label: 'Status' }
  ], []);

  interface AnalysisItem {
    value: string;
    count: number;
    percentage: number;
    mismatches: number;
    mismatchRate: number;
  }

  const fieldAnalysis = useMemo(() => {
    const total = filteredRecords.length;
    if (total === 0) {
      return { items: [], totalRecords: 0, uniqueValuesCount: 0, topValue: 'N/A', topValueCount: 0, topValuePercentage: 0 };
    }

    const frequencyMap: Record<string, { count: number; mismatches: number }> = {};

    filteredRecords.forEach(rec => {
      let rawVal = '';
      if (selectedAnalysisField === 'status') {
        rawVal = rec.isMismatch ? 'Mistake' : 'Normal';
      } else {
        rawVal = String((rec as any)[selectedAnalysisField] || '').trim();
      }
      const val = rawVal === '' ? '(Blank)' : rawVal;

      if (!frequencyMap[val]) {
        frequencyMap[val] = { count: 0, mismatches: 0 };
      }
      frequencyMap[val].count++;
      if (rec.isMismatch) {
        frequencyMap[val].mismatches++;
      }
    });

    const items: AnalysisItem[] = Object.keys(frequencyMap).map(value => {
      const data = frequencyMap[value];
      return {
        value,
        count: data.count,
        percentage: Number(((data.count / total) * 100).toFixed(1)),
        mismatches: data.mismatches,
        mismatchRate: data.count > 0 ? Number(((data.mismatches / data.count) * 100).toFixed(1)) : 0
      };
    });

    items.sort((a, b) => b.count - a.count);

    const uniqueValuesCount = items.length;
    const topItem = items[0] || { value: 'N/A', count: 0, percentage: 0 };

    return {
      items,
      totalRecords: total,
      uniqueValuesCount,
      topValue: topItem.value,
      topValueCount: topItem.count,
      topValuePercentage: topItem.percentage
    };
  }, [filteredRecords, selectedAnalysisField]);

  const handlePrintFieldPDF = (fieldKey: string, fieldLabel: string) => {
    const total = filteredRecords.length;
    if (total === 0) {
      alert('No data available to print.');
      return;
    }

    // Recalculate directly for safety
    const frequencyMap: Record<string, { count: number; mismatches: number }> = {};
    filteredRecords.forEach(rec => {
      let rawVal = '';
      if (fieldKey === 'status') {
        rawVal = rec.isMismatch ? 'Mistake' : 'Normal';
      } else {
        rawVal = String((rec as any)[fieldKey] || '').trim();
      }
      const val = rawVal === '' ? '(Blank)' : rawVal;

      if (!frequencyMap[val]) {
        frequencyMap[val] = { count: 0, mismatches: 0 };
      }
      frequencyMap[val].count++;
      if (rec.isMismatch) {
        frequencyMap[val].mismatches++;
      }
    });

    const items: AnalysisItem[] = Object.keys(frequencyMap).map(value => {
      const data = frequencyMap[value];
      return {
        value,
        count: data.count,
        percentage: Number(((data.count / total) * 100).toFixed(1)),
        mismatches: data.mismatches,
        mismatchRate: data.count > 0 ? Number(((data.mismatches / data.count) * 100).toFixed(1)) : 0
      };
    });

    items.sort((a, b) => b.count - a.count);

    const uniqueValuesCount = items.length;
    const topItem = items[0] || { value: 'N/A', count: 0, percentage: 0 };

    const doc = new jsPDF();
    const timestamp = format(new Date(), 'dd-MM-yyyy hh:mm a');

    // Header Band
    doc.setFillColor(79, 70, 229); // Royal indigo
    doc.rect(0, 0, 210, 8, 'F');

    // Document Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(20, 20, 20);
    doc.text('HBKMC Workload Advanced Analysis Report', 14, 25);

    // Metadata Block
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`Report Subject: Field Analysis per "${fieldLabel}"`, 14, 32);
    doc.text(`Report Generated On: ${timestamp.toUpperCase()}`, 14, 37);
    doc.text(`Data Mode: CLOUD FIRESTORE PERSISTENT`, 14, 42);

    // Section 1: Dashboard KPI Performance
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(20, 20, 20);
    doc.text('Key Performance Indicators (KPIs)', 14, 52);

    // KPI Metrics table
    (doc as any).autoTable({
      startY: 55,
      head: [['Metric Description', 'Value', 'Context / Details']],
      body: [
        ['Total Analysed Workloads', `${total} Records`, 'Active records matching current filters'],
        [`Unique "${fieldLabel}" Values`, `${uniqueValuesCount} Unique Values`, `Distinct entries present for this field`],
        ['Most Dominant / Frequent Value', `${topItem.value}`, 'Value with highest occurrence frequency'],
        ['Top Value Share', `${topItem.count} Occurrences (${topItem.percentage}% of total)`, 'Proportional prevalence in active dataset']
      ],
      headStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 3.5 },
      theme: 'grid'
    });

    // Section 2: Frequency Breakdown Table
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(20, 20, 20);
    doc.text('Frequency Distribution Breakdown', 14, (doc as any).lastAutoTable.finalY + 12);

    (doc as any).autoTable({
      startY: (doc as any).lastAutoTable.finalY + 15,
      head: [['Rank', `${fieldLabel} Value`, 'Occurrences', 'Percentage Share', 'Mistakes', 'Mistake Rate']],
      body: items.slice(0, 50).map((item, idx) => [
        `#${idx + 1}`,
        item.value,
        `${item.count} times`,
        `${item.percentage}%`,
        `${item.mismatches} times`,
        `${item.mismatchRate}%`
      ]),
      headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 3.5 },
      theme: 'striped',
      columnStyles: {
        1: { cellWidth: 70 }
      }
    });

    // Section 3: Visual Chart Page
    doc.addPage();
    doc.setFillColor(79, 70, 229); // Royal indigo
    doc.rect(0, 0, 210, 8, 'F');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(20, 20, 20);
    doc.text(`Visual Frequency Distribution - Top 10 "${fieldLabel}" Values`, 14, 25);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text('This chart represents the proportional workload distribution of the top 10 most frequent records.', 14, 31);
    
    let chartY = 42;
    const chartWidth = 115; // Width in mm of the bar chart area
    const maxCount = Math.max(1, ...items.slice(0, 10).map(i => i.count));
    
    items.slice(0, 10).forEach((item, idx) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(50, 50, 50);
      
      const displayName = item.value.length > 40 ? item.value.substring(0, 37) + '...' : item.value;
      doc.text(`#${idx + 1} ${displayName}`, 14, chartY + 4);
      
      doc.setDrawColor(235, 235, 235);
      doc.setFillColor(248, 250, 252);
      doc.rect(70, chartY, chartWidth, 6, 'FD');
      
      const barLength = (item.count / maxCount) * chartWidth;
      if (item.mismatchRate > 10) {
        doc.setFillColor(245, 158, 11); // Amber-500 for high mismatch rates
      } else {
        doc.setFillColor(79, 70, 229); // Indigo-600
      }
      doc.rect(70, chartY, barLength, 6, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(30, 30, 30);
      doc.text(`${item.count} (${item.percentage}%)`, 70 + chartWidth + 3, chartY + 4.5);
      
      chartY += 10;
    });

    // Add footer signature on all pages
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`AW-PharmaStock Pro - Page ${i} of ${pageCount}`, 14, 287);
      doc.text('AL WAKRA & MESAIEED PHARMACY SYSTEM UTILITY - CONFIDENTIAL REPORT', 110, 287);
    }

    doc.save(`HBKMC_Analysis_${fieldKey}_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-[#141414]/10 rounded-3xl p-6 md:p-8 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-2xl">
            <BarChart3 className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-[#141414]">Workload Analysis Page</h1>
            <p className="text-sm text-[#141414]/50 mt-1 font-medium">
              Analyze Daily HBKMC Workloads, detect mistakes, and generate advanced reporting insights.
            </p>
          </div>
        </div>
        
        {/* Date and Reset Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={fetchWorkloadData}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-[#141414]/70 bg-[#141414]/5 hover:bg-[#141414]/10 transition-all border border-[#141414]/10"
            title="Reload Server Data"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reload</span>
          </button>
          
          <button
            onClick={() => setIsResetModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 transition-all border border-red-200"
            title="Reset/Purge Workload database"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Reset Database</span>
          </button>
        </div>
      </div>

      {/* Isolated Multi-File Excel Uploader Zone */}
      <div className="bg-white border border-[#141414]/10 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-[#141414] flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
              <span>Upload Workload Spreadsheet Files</span>
            </h2>
            <p className="text-xs text-[#141414]/50 mt-1 font-medium">
              Upload multiple yesterday HBKMC workload excel sheets to populate the workload analytics database directly.
            </p>
          </div>
          {diagnosticLogs.length > 0 && (
            <button
              onClick={() => setDiagnosticLogs([])}
              className="text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-all px-3 py-1.5 rounded-lg"
            >
              Clear Logs
            </button>
          )}
        </div>

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[140px] ${
            isDraggingUpload
              ? 'border-indigo-600 bg-indigo-50/50'
              : 'border-[#141414]/15 hover:border-[#141414]/30 hover:bg-[#141414]/5'
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            multiple
            className="hidden"
          />

          {uploadLoading ? (
            <div className="space-y-4 w-full max-w-md">
              <div className="flex items-center justify-center gap-3">
                <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
                <span className="text-sm font-bold text-[#141414]">{uploadProgressMsg}</span>
              </div>
              {uploadProgressPercent !== null && (
                <div className="w-full bg-[#141414]/5 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-indigo-600 h-full transition-all duration-300 rounded-full"
                    style={{ width: `${uploadProgressPercent}%` }}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl inline-block">
                <Upload className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-[#141414]">
                Drag and drop your Excel workload files here, or <span className="text-indigo-600 underline">browse</span>
              </p>
              <p className="text-[11px] text-[#141414]/40 font-medium">
                Supports multiple .xlsx or .xls files from Yesterday HBKMC Workload exports
              </p>
            </div>
          )}
        </div>



        {uploadError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1">
              <p className="text-xs font-bold text-red-800">Processing Failed</p>
              <p className="text-xs text-red-700/80 font-medium">{uploadError}</p>
            </div>
            <button
              onClick={() => setUploadError('')}
              className="text-xs font-bold text-red-600 bg-red-100 hover:bg-red-200 transition-all px-2 py-1 rounded-md"
            >
              Dismiss
            </button>
          </div>
        )}

        {diagnosticLogs.length > 0 && (
          <div className="border border-[#141414]/10 rounded-xl overflow-hidden bg-[#141414]/5">
            <div className="bg-[#141414]/5 px-4 py-2 border-b border-[#141414]/10 flex justify-between items-center text-xs font-bold text-[#141414]">
              <span>Parsing & Upload Logs ({diagnosticLogs.length})</span>
            </div>
            <div className="p-3 max-h-40 overflow-y-auto font-mono text-[11px] text-[#141414]/70 space-y-1 scrollbar-thin">
              {diagnosticLogs.map((log, idx) => (
                <div key={idx} className="leading-relaxed border-b border-[#141414]/5 pb-1 last:border-0">{log}</div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Overview Analytics Dashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* 1. Total records */}
        <div className="bg-white border border-[#141414]/10 rounded-2xl p-5 shadow-sm relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-extrabold tracking-widest text-[#141414]/40">Workload Volume</span>
              <p className="text-2xl font-black text-[#141414]">{loading ? '...' : metrics.total.toLocaleString()}</p>
            </div>
            <div className="p-2.5 bg-[#141414]/5 text-[#141414]/70 rounded-xl">
              <Activity className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-[11px] font-bold text-[#141414]/50">
            <span>Aggregated database count</span>
          </div>
        </div>

        {/* 2. Mismatches count */}
        <div className="bg-white border border-[#141414]/10 rounded-2xl p-5 shadow-sm relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-extrabold tracking-widest text-red-500">Mismatches Found</span>
              <p className="text-2xl font-black text-red-600">{loading ? '...' : metrics.mismatches.toLocaleString()}</p>
            </div>
            <div className="p-2.5 bg-red-50 text-red-600 rounded-xl">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-[11px] font-bold text-red-600">
            <span>Entry discrepancy incidents</span>
          </div>
        </div>

        {/* 3. Mismatch rate */}
        <div className="bg-white border border-[#141414]/10 rounded-2xl p-5 shadow-sm relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-extrabold tracking-widest text-amber-500">Mismatch Rate</span>
              <p className="text-2xl font-black text-amber-600">{loading ? '...' : `${metrics.rate}%`}</p>
            </div>
            <div className="p-2.5 bg-amber-50 text-amber-500 rounded-xl">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-[11px] font-bold text-amber-600">
            <span>Percentage total workload</span>
          </div>
        </div>

        {/* 4. Patients served */}
        <div className="bg-white border border-[#141414]/10 rounded-2xl p-5 shadow-sm relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-extrabold tracking-widest text-[#141414]/40">Unique Patients</span>
              <p className="text-2xl font-black text-[#141414]">{loading ? '...' : metrics.uniqueMrns.toLocaleString()}</p>
            </div>
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-[11px] font-bold text-indigo-600">
            <span>Unique patient MRNs</span>
          </div>
        </div>

        {/* 5. Last uploaded action datetime */}
        <div className="bg-white border border-[#141414]/10 rounded-2xl p-5 shadow-sm relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-extrabold tracking-widest text-emerald-500">Last Action Recorded</span>
              <p className="text-sm font-black text-emerald-700 truncate max-w-[160px]" title={metrics.lastActionStr}>
                {loading ? '...' : metrics.lastActionStr}
              </p>
            </div>
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-5 flex items-center text-[11px] font-bold text-emerald-600">
            <span>Latest action in table</span>
          </div>
        </div>

        {/* 6. Total Uploaded Files */}
        <div 
          onClick={() => setIsFilesHistoryModalOpen(true)}
          className="bg-white border border-[#141414]/10 rounded-2xl p-5 shadow-sm relative overflow-hidden group cursor-pointer hover:border-indigo-200 hover:shadow-md transition-all"
        >
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-extrabold tracking-widest text-[#141414]/40 flex items-center gap-1.5">
                <span>Uploaded Workloads</span>
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
              </span>
              <p className="text-2xl font-black text-indigo-700">{loading ? '...' : metrics.totalUploadedFiles.toLocaleString()}</p>
            </div>
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-100 transition-colors" title={sortedUploadedFiles.map(f => f.filename).join('\n')}>
              <FileSpreadsheet className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-[11px] font-bold text-indigo-600">
            <span className="truncate max-w-[120px]" title={sortedUploadedFiles.map(f => f.filename).join(', ') || "No files uploaded yet"}>
              {uploadedFilesList.length > 0 
                ? `${sortedUploadedFiles[sortedUploadedFiles.length - 1].filename}` 
                : "Excel spreadsheets parsed"}
            </span>
            <span className="text-[10px] underline decoration-indigo-300 font-extrabold uppercase group-hover:text-indigo-800 transition-colors">
              View History
            </span>
          </div>
        </div>
      </div>

      {/* Interactive Controls & Quick Filters panel */}
      <div className="bg-white border border-[#141414]/10 rounded-3xl p-6 shadow-sm space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#141414]/40 mr-1.5">Intervals:</span>
            {[
              { id: 'all', label: 'All Time' },
              { id: 'today', label: 'Today' },
              { id: '7days', label: 'Last 7 Days' },
              { id: 'month', label: 'This Month' },
              { id: 'year', label: 'This Year' }
            ].map(f => (
              <button
                key={f.id}
                onClick={() => applyQuickFilter(f.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                  activeQuickFilter === f.id
                    ? 'bg-[#141414] text-white border-[#141414]'
                    : 'bg-[#141414]/[0.02] text-[#141414]/60 border-[#141414]/10 hover:bg-[#141414]/5'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Date-to-Date inputs */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#141414]/40" />
              <input
                type="date"
                value={startDate}
                onChange={e => {
                  setStartDate(e.target.value);
                  setActiveQuickFilter('custom');
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-bold border border-[#141414]/10 bg-white"
              />
              <span className="text-xs font-bold text-[#141414]/30">to</span>
              <input
                type="date"
                value={endDate}
                onChange={e => {
                  setEndDate(e.target.value);
                  setActiveQuickFilter('custom');
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-bold border border-[#141414]/10 bg-white"
              />
            </div>

            {/* Clear date filter button */}
            {(startDate || endDate) && (
              <button
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                  setActiveQuickFilter('all');
                }}
                className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-[10px] font-black uppercase"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="border-t border-[#141414]/10 pt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search bar */}
          <div className="relative md:col-span-2">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#141414]/30" />
            <input
              type="text"
              placeholder="Search by Patient Name, MRN, Code, Pharmacist..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl text-xs font-bold border border-[#141414]/10 bg-[#141414]/[0.01] focus:bg-white focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Location selector */}
          <select
            value={selectedLocation}
            onChange={e => setSelectedLocation(e.target.value)}
            className="px-4 py-2.5 rounded-2xl text-xs font-bold border border-[#141414]/10 bg-white"
          >
            <option value="all">AWH-Emergency Pharmacy (Total)</option>
            <option value="adult">Adult Emergency Pharmacy</option>
            <option value="pediatric">Pediatric Pharmacy</option>
            <option value="mesaieed">Mesaieed OPD Pharmacy</option>
          </select>

          {/* Mismatch filter toggle */}
          <button
            onClick={() => setMismatchOnlyFilter(!mismatchOnlyFilter)}
            className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all border ${
              mismatchOnlyFilter 
                ? 'bg-red-50 border-red-200 text-red-700 font-extrabold' 
                : 'bg-white border-[#141414]/10 text-[#141414]/70 hover:bg-[#141414]/5'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>{mismatchOnlyFilter ? 'Showing Mismatches Only' : 'Filter by Mismatches'}</span>
          </button>
        </div>
      </div>

      {/* Graphical Dashboard Panel (Custom Interactive SVGs) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Trend line/area chart (Daily aggregate workload) */}
        <div className="bg-white border border-[#141414]/10 rounded-3xl p-6 shadow-sm col-span-1 lg:col-span-2 flex flex-col justify-between space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="space-y-0.5">
              <span className="text-[10px] uppercase font-extrabold tracking-widest text-[#141414]/40">Trend Timeline</span>
              <h3 className="text-base font-extrabold text-[#141414]">Daily Workload Volume (Last 10 Days)</h3>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <select
                id="trend-location-selector"
                value={selectedTrendLocation}
                onChange={e => setSelectedTrendLocation(e.target.value)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold border border-[#141414]/10 bg-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="all">AWH-Emergency Pharmacy (Total Trend)</option>
                <option value="adult">Adult Emergency Pharmacy</option>
                <option value="pediatric">Pediatric Pharmacy</option>
                <option value="mesaieed">Mesaieed OPD Pharmacy</option>
              </select>
              <div className="flex items-center gap-1.5">
                <span className="flex w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse"></span>
                <span className="text-[10px] font-bold uppercase text-[#141414]/40">Actions Captured</span>
              </div>
            </div>
          </div>

          {workloadTrend.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-[#141414]/30 space-y-2 bg-[#141414]/[0.01] border border-dashed border-[#141414]/10 rounded-2xl">
              <TrendingUp className="w-8 h-8" />
              <span className="text-xs font-bold uppercase tracking-wider">No Workload Data Within Selected Dates</span>
            </div>
          ) : (
            <div className="relative pt-6">
              {/* Responsive SVG Sparkline and Bar Graph combo */}
              <svg className="w-full h-64 overflow-visible" viewBox="0 0 600 240" preserveAspectRatio="none">
                {/* Horizontal Guide Grid Lines */}
                {[0, 0.25, 0.5, 0.75, 1].map((p, idx) => (
                  <line 
                    key={idx}
                    x1="40" 
                    y1={30 + p * 160} 
                    x2="580" 
                    y2={30 + p * 160} 
                    stroke="#141414" 
                    strokeOpacity="0.06" 
                    strokeWidth="1"
                    strokeDasharray="4 4"
                  />
                ))}

                {/* Y-axis metrics labels */}
                {[1, 0.75, 0.5, 0.25, 0].map((p, idx) => (
                  <text
                    key={idx}
                    x="10"
                    y={34 + (1 - p) * 160}
                    className="text-[9px] font-extrabold font-mono text-[#141414]/40"
                    textAnchor="start"
                  >
                    {Math.round(p * maxTrendCount)}
                  </text>
                ))}

                {/* Area Gradient Definitions */}
                <defs>
                  <linearGradient id="indigoGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Sparkline Area and Stroke */}
                {(() => {
                  const padding = 50;
                  const step = (580 - 40) / Math.max(1, workloadTrend.length - 1);
                  const points = workloadTrend.map((t, idx) => {
                    const x = 40 + idx * step;
                    const y = 190 - (t.count / maxTrendCount) * 160;
                    return { x, y };
                  });

                  const pathD = points.reduce((acc, p, idx) => 
                    idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`, ''
                  );

                  const areaD = `${pathD} L ${points[points.length - 1].x} 190 L ${points[0].x} 190 Z`;

                  return (
                    <>
                      {/* Fill under sparkline */}
                      <path d={areaD} fill="url(#indigoGrad)" />
                      {/* Stroke sparkline */}
                      <path d={pathD} fill="none" stroke="#4f46e5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      
                      {/* Data Dots */}
                      {points.map((p, idx) => (
                        <g key={idx} className="group/dot cursor-pointer">
                          <circle cx={p.x} cy={p.y} r="4" fill="#ffffff" stroke="#4f46e5" strokeWidth="2" />
                          <circle cx={p.x} cy={p.y} r="8" fill="#4f46e5" fillOpacity="0.0" className="hover:fill-opacity-15 transition-all" />
                          {/* Tooltip on hover */}
                          <title>{`Date: ${workloadTrend[idx].day}\nActions: ${workloadTrend[idx].count}`}</title>
                        </g>
                      ))}
                    </>
                  );
                })()}

                {/* X-axis labels (Dates) */}
                {workloadTrend.map((t, idx) => {
                  const step = (580 - 40) / Math.max(1, workloadTrend.length - 1);
                  const x = 40 + idx * step;
                  return (
                    <text
                      key={idx}
                      x={x}
                      y="215"
                      className="text-[8px] font-bold font-mono text-[#141414]/30"
                      textAnchor="middle"
                    >
                      {format(new Date(t.day), 'dd/MM')}
                    </text>
                  );
                })}
              </svg>
            </div>
          )}
        </div>

        {/* Location Breakdown Widget (Donut / Horizontal bar) */}
        <div className="bg-white border border-[#141414]/10 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-extrabold tracking-widest text-[#141414]/40">Location Metrics</span>
            <h3 className="text-base font-extrabold text-[#141414]">Actions by Pharmacy</h3>
          </div>

          <div className="space-y-5 py-4">
            {(() => {
              const safeBreakdown = {
                'adult-emergency': locationBreakdown['adult-emergency'] || { total: 0, mismatches: 0 },
                'pediatric': locationBreakdown['pediatric'] || { total: 0, mismatches: 0 }
              };
              const maxVal = Math.max(1, ...Object.keys(safeBreakdown).map(k => safeBreakdown[k as 'adult-emergency' | 'pediatric'].total));
              return [
                { id: 'adult-emergency', label: 'Adult Emergency', color: 'bg-[#F27D26]', val: safeBreakdown['adult-emergency'] },
                { id: 'pediatric', label: 'Pediatric Pharmacy', color: 'bg-emerald-500', val: safeBreakdown['pediatric'] }
              ].map(loc => {
                const widthPct = ((loc.val.total / maxVal) * 100).toFixed(0);
                const localMismatchRate = loc.val.total > 0 ? ((loc.val.mismatches / loc.val.total) * 100).toFixed(1) : '0.0';

                return (
                  <div key={loc.id} className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-extrabold text-[#141414]">{loc.label}</span>
                      <div className="flex items-center gap-1.5 font-mono text-[11px] text-[#141414]/50">
                        <span className="font-bold text-[#141414]">{loc.val.total}</span>
                        <span>recs</span>
                        <span className="text-red-500">({localMismatchRate}% err)</span>
                      </div>
                    </div>
                    {/* Custom progress bars */}
                    <div className="w-full h-3 bg-[#141414]/5 rounded-full overflow-hidden flex">
                      <div 
                        className={`h-full ${loc.color} rounded-full transition-all duration-500`}
                        style={{ width: `${Math.max(4, parseInt(widthPct, 10))}%` }}
                      />
                    </div>
                  </div>
                );
              });
            })()}
          </div>

          <div className="border-t border-[#141414]/10 pt-4 flex items-center justify-between text-[11px] font-bold text-[#141414]/40">
            <span>Location performance distribution</span>
            <div className="flex items-center gap-1 text-red-500">
              <AlertTriangle className="w-3" />
              <span>Errors tracked</span>
            </div>
          </div>
        </div>
      </div>

      {/* Field-by-Field Analysis Dashboard */}
      <div className="bg-white border border-[#141414]/10 rounded-3xl p-6 md:p-8 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#141414]/10 pb-6">
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-extrabold tracking-widest text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">
              Field Analyzer Hub
            </span>
            <h2 className="text-xl font-extrabold text-[#141414] mt-1.5">Interactive Field Analysis & Custom Reports</h2>
            <p className="text-xs text-[#141414]/50 font-medium">
              Analyze statistical breakdowns across all 17 workload properties. View instant charts and print customized high-fidelity PDFs per each.
            </p>
          </div>

          <button
            onClick={() => {
              const currentLabel = ANALYZABLE_FIELDS.find(f => f.key === selectedAnalysisField)?.label || selectedAnalysisField;
              handlePrintFieldPDF(selectedAnalysisField, currentLabel);
            }}
            disabled={filteredRecords.length === 0}
            className="flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-black shadow-md shadow-indigo-600/10 transition-all cursor-pointer disabled:opacity-50"
          >
            <FileText className="w-4 h-4" />
            <span>Print Current Field PDF</span>
          </button>
        </div>

        {/* Field Selector Section */}
        <div className="space-y-2.5">
          <label className="text-xs font-extrabold uppercase tracking-wider text-[#141414]/40">
            Select Workload Property to Analyze:
          </label>
          
          {/* Mobile Selector Dropdown */}
          <div className="block lg:hidden">
            <select
              value={selectedAnalysisField}
              onChange={e => setSelectedAnalysisField(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl text-xs font-bold border border-[#141414]/10 bg-white cursor-pointer"
            >
              {ANALYZABLE_FIELDS.map(f => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))}
            </select>
          </div>

          {/* Desktop Selector Grid */}
          <div className="hidden lg:grid grid-cols-6 gap-2">
            {ANALYZABLE_FIELDS.map(f => {
              const isActive = selectedAnalysisField === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setSelectedAnalysisField(f.key)}
                  className={`px-3 py-2.5 rounded-xl text-[11px] font-bold text-left transition-all border truncate ${
                    isActive
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-[#141414]/[0.01] hover:bg-[#141414]/5 text-[#141414]/70 border-[#141414]/10'
                  }`}
                  title={f.label}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Field Analytics Summary KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          {/* 1. Analyzed items */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-[#141414]/5">
            <p className="text-[10px] uppercase font-extrabold tracking-widest text-[#141414]/40">Active Sample Size</p>
            <p className="text-xl font-black text-[#141414] mt-1">{fieldAnalysis.totalRecords.toLocaleString()} Records</p>
            <p className="text-[10px] text-[#141414]/40 mt-1 font-medium">Currently filtered rows analyzed</p>
          </div>

          {/* 2. Unique values count */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-[#141414]/5">
            <p className="text-[10px] uppercase font-extrabold tracking-widest text-[#141414]/40">Unique Field Values</p>
            <p className="text-xl font-black text-[#141414] mt-1">{fieldAnalysis.uniqueValuesCount.toLocaleString()} Unique Keys</p>
            <p className="text-[10px] text-[#141414]/40 mt-1 font-medium">Distinct variations found</p>
          </div>

          {/* 3. Top Value */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-[#141414]/5 overflow-hidden">
            <p className="text-[10px] uppercase font-extrabold tracking-widest text-indigo-600">Top Value (Mode)</p>
            <p className="text-xl font-black text-indigo-700 mt-1 truncate" title={fieldAnalysis.topValue}>
              {fieldAnalysis.topValue}
            </p>
            <p className="text-[10px] text-indigo-600/70 mt-1 font-medium">
              {fieldAnalysis.topValueCount} times ({fieldAnalysis.topValuePercentage}% dominance)
            </p>
          </div>
        </div>

        {/* Charts and Data breakdowns Grid */}
        {fieldAnalysis.items.length === 0 ? (
          <div className="py-12 text-center text-xs text-[#141414]/30 font-bold uppercase tracking-wider border border-dashed border-[#141414]/10 rounded-2xl bg-[#141414]/[0.01]">
            No data currently loaded. Please sync database or upload workloads first.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Visual bar distribution chart */}
            <div className="bg-white border border-[#141414]/10 rounded-2xl p-5 shadow-xs lg:col-span-2 space-y-4">
              <div className="flex justify-between items-center border-b border-[#141414]/5 pb-3">
                <h3 className="text-sm font-black text-[#141414] flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-indigo-500" />
                  <span>Frequency Distribution (Top 10 Values)</span>
                </h3>
                <span className="text-[10px] uppercase font-extrabold tracking-widest text-[#141414]/40 font-mono">
                  Percentage share of workload
                </span>
              </div>

              <div className="space-y-4">
                {fieldAnalysis.items.slice(0, 10).map((item, idx) => {
                  const maxCount = Math.max(1, ...fieldAnalysis.items.slice(0, 10).map(i => i.count));
                  const percentWidth = ((item.count / maxCount) * 100).toFixed(0);
                  
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-extrabold text-[#141414] truncate max-w-[280px] md:max-w-[400px]" title={item.value}>
                          {item.value}
                        </span>
                        <div className="flex items-center gap-2 text-[11px] font-mono shrink-0">
                          <span className="font-bold text-[#141414]">{item.count} recs</span>
                          <span className="text-[#141414]/40">({item.percentage}%)</span>
                          {item.mismatches > 0 && (
                            <span className="text-red-500 font-bold">({item.mismatchRate}% error rate)</span>
                          )}
                        </div>
                      </div>
                      
                      {/* Bar indicator */}
                      <div className="w-full h-2.5 bg-slate-50 border border-slate-100 rounded-full overflow-hidden flex">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            item.mismatchRate > 10 ? 'bg-amber-500' : 'bg-indigo-500'
                          }`}
                          style={{ width: `${Math.max(2, parseInt(percentWidth, 10))}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Tabular summary leaderboards */}
            <div className="bg-white border border-[#141414]/10 rounded-2xl p-5 shadow-xs space-y-4 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b border-[#141414]/5 pb-3">
                  <h3 className="text-sm font-black text-[#141414]">Leaderboard Overview</h3>
                  <span className="text-[10px] uppercase font-extrabold tracking-widest text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                    Ranked
                  </span>
                </div>

                <div className="divide-y divide-[#141414]/5 max-h-[300px] overflow-y-auto pr-1">
                  {fieldAnalysis.items.slice(0, 15).map((item, idx) => (
                    <div key={idx} className="py-2.5 flex justify-between items-center text-xs font-bold gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-4 h-4 flex items-center justify-center bg-indigo-50 text-indigo-600 rounded text-[9px] font-mono">
                          {idx + 1}
                        </span>
                        <span className="text-[#141414] truncate font-black" title={item.value}>
                          {item.value}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[#141414] font-mono font-black">{item.count}</p>
                        <p className="text-[9px] uppercase font-extrabold tracking-wider text-[#141414]/30">{item.percentage}% share</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-[#141414]/10 pt-4 mt-4 bg-slate-50 -mx-5 -mb-5 p-4 rounded-b-2xl flex flex-col gap-2.5">
                <p className="text-[10px] font-bold text-[#141414]/50 leading-relaxed">
                  * Generate a comprehensive printable document showing full statistical frequencies, local mistake metrics, and ranking logs for this specific field.
                </p>
                <button
                  onClick={() => {
                    const currentLabel = ANALYZABLE_FIELDS.find(f => f.key === selectedAnalysisField)?.label || selectedAnalysisField;
                    handlePrintFieldPDF(selectedAnalysisField, currentLabel);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-black rounded-xl text-xs transition-all cursor-pointer border border-indigo-100"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Print Detailed Field PDF Report</span>
                </button>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* High Demand Lists Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Top Drug Items */}
        <div className="bg-white border border-[#141414]/10 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-base font-extrabold text-[#141414] flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-500" />
              <span>Top Dispensed Medications (Volume)</span>
            </h3>
            <span className="text-[10px] uppercase font-extrabold tracking-widest text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
              High Frequency
            </span>
          </div>

          {topMedications.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#141414]/30 font-bold uppercase tracking-wider">
              No Medication Data Captured
            </div>
          ) : (
            <div className="divide-y divide-[#141414]/5">
              {topMedications.map((item, idx) => (
                <div key={item.itemNumber} className="py-3 flex items-center justify-between text-xs font-bold gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-5 h-5 flex items-center justify-center bg-[#141414]/5 rounded text-[#141414]/50 font-mono text-[10px]">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[#141414] truncate font-black">{item.desc}</p>
                      <p className="text-[#141414]/40 font-mono text-[10px] mt-0.5">CODE: {item.itemNumber}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[#141414] font-black font-mono">{item.count}</p>
                    <p className="text-[9px] uppercase font-extrabold tracking-wider text-[#141414]/30">Actions</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Active Staff */}
        <div className="bg-white border border-[#141414]/10 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-base font-extrabold text-[#141414] flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-500" />
              <span>Top Contributive Pharmacist Personnel</span>
            </h3>
            <span className="text-[10px] uppercase font-extrabold tracking-widest text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
              Contribution Ranking
            </span>
          </div>

          {topStaff.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#141414]/30 font-bold uppercase tracking-wider">
              No Pharmacist Data Recorded
            </div>
          ) : (
            <div className="divide-y divide-[#141414]/5">
              {topStaff.map((staff, idx) => (
                <div key={staff.name} className="py-3 flex items-center justify-between text-xs font-bold gap-3">
                  <div className="flex items-center gap-3">
                    <span className="w-5 h-5 flex items-center justify-center bg-indigo-50 rounded text-indigo-500 font-mono text-[10px]">
                      {idx + 1}
                    </span>
                    <span className="text-[#141414] font-black">{staff.name}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-[#141414] font-black font-mono">{staff.count}</p>
                    <p className="text-[9px] uppercase font-extrabold tracking-wider text-[#141414]/30">Actions Logged</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Gemini AI Clinical Audit & Insights Panel */}
      <div className="bg-gradient-to-r from-slate-50 to-indigo-50/50 border border-indigo-100 rounded-3xl p-6 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-lg font-black text-indigo-950 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-600 animate-pulse" />
              <span>Gemini AI Clinical Audit Assistant</span>
            </h3>
            <p className="text-xs text-indigo-950/60 font-medium max-w-2xl">
              Leverage advanced AI to analyze currently filtered workloads, cross-reference brand prescription policies, evaluate staffing roster compliance, and produce executive quality audit reports.
            </p>
          </div>

          <button
            onClick={handleGenerateAIAnalysis}
            disabled={aiLoading || records.length === 0}
            className="self-start md:self-auto flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 disabled:from-indigo-300 disabled:to-indigo-400 text-white rounded-2xl text-xs font-black shadow-md shadow-indigo-600/10 active:scale-95 transition-all cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>{aiLoading ? 'Auditing Workloads...' : 'Generate AI Audit Report'}</span>
          </button>
        </div>

        {aiLoading && (
          <div className="bg-white/80 border border-indigo-100/50 rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-4 shadow-sm animate-pulse">
            <div className="relative">
              <div className="w-12 h-12 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin"></div>
              <Sparkles className="w-5 h-5 text-indigo-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-black text-indigo-950">{aiLoadingStep}</p>
              <p className="text-[10px] text-indigo-950/40 uppercase font-extrabold tracking-wider">Clinical Audit In Progress</p>
            </div>
          </div>
        )}

        {aiError && (
          <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 flex gap-3 text-xs text-rose-700 font-bold">
            <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
            <div>
              <p className="font-extrabold">Audit Insight Generation Failed</p>
              <p className="text-rose-600/80 font-normal mt-0.5">{aiError}</p>
            </div>
          </div>
        )}

        {(adultAnalysis || pediatricAnalysis) && (
          <div className="bg-white border border-indigo-100 rounded-3xl p-6 md:p-8 shadow-sm space-y-6">
            {/* Elegant Department Selector Tabs */}
            <div className="flex flex-col sm:flex-row gap-2 border-b border-indigo-50 pb-2">
              <button
                onClick={() => setActiveReportTab('adult')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                  activeReportTab === 'adult'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                    : 'bg-indigo-50/50 text-indigo-950/60 hover:bg-indigo-50 hover:text-indigo-950'
                }`}
              >
                🏥 Adult Emergency Audit Report
              </button>
              <button
                onClick={() => setActiveReportTab('pediatric')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                  activeReportTab === 'pediatric'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                    : 'bg-indigo-50/50 text-indigo-950/60 hover:bg-indigo-50 hover:text-indigo-950'
                }`}
              >
                👶 Pediatric Pharmacy Audit Report
              </button>
            </div>

            {/* Active Report Header */}
            <div className="flex items-center justify-between border-b border-indigo-50 pb-4">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping animate-duration-1000"></span>
                <p className="text-[10px] uppercase font-extrabold tracking-widest text-indigo-900 bg-indigo-50 px-2.5 py-1 rounded-full">
                  Verified {activeReportTab === 'adult' ? 'Adult' : 'Pediatric'} Clinical Audit Active
                </p>
              </div>
              <p className="text-[10px] font-mono text-[#141414]/40 font-bold uppercase">
                Audited Cohort: {
                  activeReportTab === 'adult'
                    ? records.filter(r => (r.pharmacyLocation || '').toLowerCase().includes('adult')).length
                    : records.filter(r => (r.pharmacyLocation || '').toLowerCase().includes('pediatric')).length
                } Workloads
              </p>
            </div>
            
            <div className="prose max-w-none max-h-[500px] overflow-y-auto pr-2">
              {activeReportTab === 'adult' ? (
                adultAnalysis ? (
                  <Markdown
                    components={{
                      h1: ({node, ...props}) => <h1 className="text-xs font-extrabold text-indigo-950 mt-6 mb-3 border-b pb-1.5 border-indigo-100 uppercase tracking-wide" {...props} />,
                      h2: ({node, ...props}) => <h2 className="text-xs font-extrabold text-indigo-900 mt-5 mb-2 flex items-center gap-1.5" {...props} />,
                      h3: ({node, ...props}) => <h3 className="text-xs font-bold text-indigo-800 mt-4 mb-2" {...props} />,
                      p: ({node, ...props}) => <p className="text-xs text-[#141414]/80 leading-relaxed mb-3" {...props} />,
                      ul: ({node, ...props}) => <ul className="list-disc pl-5 text-xs text-[#141414]/80 space-y-1.5 mb-4" {...props} />,
                      ol: ({node, ...props}) => <ol className="list-decimal pl-5 text-xs text-[#141414]/80 space-y-1.5 mb-4" {...props} />,
                      li: ({node, ...props}) => <li className="pl-1" {...props} />,
                      strong: ({node, ...props}) => <strong className="font-extrabold text-[#141414]" {...props} />,
                      blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-indigo-400 pl-4 italic text-[#141414]/70 my-3 bg-indigo-50/20 py-2 rounded-r" {...props} />,
                    }}
                  >
                    {adultAnalysis}
                  </Markdown>
                ) : (
                  <p className="text-xs text-indigo-950/40 text-center py-8 font-extrabold">Adult Audit Report data not loaded.</p>
                )
              ) : (
                pediatricAnalysis ? (
                  <Markdown
                    components={{
                      h1: ({node, ...props}) => <h1 className="text-xs font-extrabold text-indigo-950 mt-6 mb-3 border-b pb-1.5 border-indigo-100 uppercase tracking-wide" {...props} />,
                      h2: ({node, ...props}) => <h2 className="text-xs font-extrabold text-indigo-900 mt-5 mb-2 flex items-center gap-1.5" {...props} />,
                      h3: ({node, ...props}) => <h3 className="text-xs font-bold text-indigo-800 mt-4 mb-2" {...props} />,
                      p: ({node, ...props}) => <p className="text-xs text-[#141414]/80 leading-relaxed mb-3" {...props} />,
                      ul: ({node, ...props}) => <ul className="list-disc pl-5 text-xs text-[#141414]/80 space-y-1.5 mb-4" {...props} />,
                      ol: ({node, ...props}) => <ol className="list-decimal pl-5 text-xs text-[#141414]/80 space-y-1.5 mb-4" {...props} />,
                      li: ({node, ...props}) => <li className="pl-1" {...props} />,
                      strong: ({node, ...props}) => <strong className="font-extrabold text-[#141414]" {...props} />,
                      blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-indigo-400 pl-4 italic text-[#141414]/70 my-3 bg-indigo-50/20 py-2 rounded-r" {...props} />,
                    }}
                  >
                    {pediatricAnalysis}
                  </Markdown>
                ) : (
                  <p className="text-xs text-indigo-950/40 text-center py-8 font-extrabold">Pediatric Audit Report data not loaded.</p>
                )
              )}
            </div>
          </div>
        )}
      </div>

      {/* Admin Password Reset/Purge Modal */}
      {isResetModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#141414]/10 rounded-3xl p-6 max-w-md w-full shadow-2xl animate-scale-in">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <ShieldAlert className="w-8 h-8" />
              <h3 className="text-lg font-black tracking-tight">Purge Workload Database</h3>
            </div>

            <p className="text-xs text-[#141414]/60 font-medium mb-6 leading-relaxed">
              WARNING: This operation is destructive and irreversible. Continuing will permanently delete all stored Daily HBKMC Workload records from both this server and Cloud Firestore.
            </p>

            <form onSubmit={handleResetWorkload} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#141414]/70">Enter Administrator Password</label>
                <input
                  type="password"
                  required
                  value={adminPassword}
                  onChange={e => setAdminPassword(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-2xl text-sm border border-[#141414]/10 bg-[#141414]/[0.01]"
                  placeholder="Password"
                />
              </div>

              {resetError && (
                <div className="p-3 bg-red-50 text-red-700 border border-red-100 rounded-xl text-xs font-bold">
                  {resetError}
                </div>
              )}

              {resetSuccess && (
                <div className="p-3 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-xl text-xs font-bold">
                  {resetSuccess}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsResetModalOpen(false);
                    setAdminPassword('');
                    setResetError('');
                  }}
                  className="px-4 py-2 bg-[#141414]/5 text-[#141414]/60 hover:bg-[#141414]/10 text-xs font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isResetting || !adminPassword}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl disabled:opacity-50"
                >
                  {isResetting ? 'Processing...' : 'Confirm Destruction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Uploaded Spreadsheet Audit History Modal */}
      {isFilesHistoryModalOpen && (
        <div className="fixed inset-0 bg-[#141414]/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white border border-[#141414]/10 rounded-3xl p-6 md:p-8 max-w-2xl w-full shadow-2xl animate-scale-in flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-[#141414]/10 pb-4 mb-4">
              <div className="flex items-center gap-2.5 text-[#141414]">
                <FileSpreadsheet className="w-6 h-6 text-indigo-600" />
                <h3 className="text-base font-black tracking-tight">Spreadsheet Upload History & Deduplication Audit</h3>
              </div>
              <button 
                onClick={() => setIsFilesHistoryModalOpen(false)}
                className="p-1 rounded-full hover:bg-[#141414]/5 text-[#141414]/40 hover:text-[#141414]/80 transition-colors font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto space-y-5 pr-1 flex-1">
              <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4 space-y-2">
                <p className="text-xs font-black text-indigo-950 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                  How Deduplication Protects Your Database
                </p>
                <p className="text-[11px] text-indigo-950/80 leading-relaxed font-medium">
                  When a spreadsheet is uploaded, our parser matches prescription properties (such as Patient MRN, Action Date & Time, Item Code, Pharmacy Location) against previously saved records. 
                </p>
                <p className="text-[11px] text-indigo-950/80 leading-relaxed font-medium">
                  <strong>Re-uploading the same file:</strong> If you upload a file again to verify that all data has uploaded correctly, the system automatically skips all duplicate rows and saves <span className="bg-white px-1 py-0.5 rounded border border-indigo-100 font-mono text-indigo-700">0 New Saved</span>. This is fully expected and confirms your data was already safely loaded!
                </p>
              </div>

              {uploadedFilesList.length === 0 ? (
                <div className="py-12 text-center text-[#141414]/40 font-bold text-xs">
                  No spreadsheets uploaded yet. All metrics are currently empty.
                </div>
              ) : (
                <div className="border border-[#141414]/10 rounded-2xl overflow-hidden bg-white">
                  <div className="max-h-[350px] overflow-y-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-[#141414]/[0.02] border-b border-[#141414]/10 text-[#141414]/60 font-black">
                          <th className="p-3">Filename / Date</th>
                          <th className="p-3 text-center">Parsed Rows</th>
                          <th className="p-3 text-center">New Saved</th>
                          <th className="p-3 text-center">Duplicates Skipped</th>
                          <th className="p-3 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#141414]/5 font-medium">
                        {sortedUploadedFiles.map((file, idx) => {
                          const parsed = file.recordCount || 0;
                          const added = file.addedCount !== undefined ? file.addedCount : parsed;
                          const skipped = Math.max(0, parsed - added);
                          let uploadDate = 'Unknown Date';
                          try {
                            if (file.uploadedAt) {
                              uploadDate = format(new Date(file.uploadedAt), 'MMM dd, yyyy HH:mm');
                            }
                          } catch {
                            uploadDate = String(file.uploadedAt).substring(0, 16).replace('T', ' ');
                          }
                          
                          // Badges
                          let statusLabel = 'Saved';
                          let badgeStyle = 'bg-emerald-50 text-emerald-700 border-emerald-100';
                          if (added === 0 && parsed > 0) {
                            statusLabel = 'Re-upload skipped';
                            badgeStyle = 'bg-indigo-50 text-indigo-700 border-indigo-100';
                          } else if (skipped > 0) {
                            statusLabel = 'Partial skip';
                            badgeStyle = 'bg-amber-50 text-amber-700 border-amber-100';
                          }

                          return (
                            <tr key={idx} className="hover:bg-[#141414]/[0.01]">
                              <td className="p-3 space-y-0.5">
                                <p className="font-bold text-[#141414] truncate max-w-[200px]" title={file.filename}>
                                  {file.filename}
                                </p>
                                <p className="text-[10px] text-[#141414]/40 font-mono font-bold">
                                  {uploadDate}
                                </p>
                              </td>
                              <td className="p-3 text-center font-mono text-[#141414]/60 font-bold">
                                {parsed.toLocaleString()}
                              </td>
                              <td className="p-3 text-center font-bold text-emerald-600">
                                {added.toLocaleString()}
                              </td>
                              <td className="p-3 text-center font-bold text-red-500">
                                {skipped > 0 ? skipped.toLocaleString() : '-'}
                              </td>
                              <td className="p-3 text-right">
                                <span className={`inline-block px-2 py-0.5 text-[10px] font-bold border rounded-full ${badgeStyle}`}>
                                  {statusLabel}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-[#141414]/10 pt-4 flex justify-end">
              <button
                onClick={() => setIsFilesHistoryModalOpen(false)}
                className="px-5 py-2.5 bg-[#141414] hover:bg-[#141414]/80 text-white text-xs font-black rounded-xl transition-all"
              >
                Close Audit Log
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
