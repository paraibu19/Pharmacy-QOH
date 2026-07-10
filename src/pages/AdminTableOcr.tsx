import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FileUp, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  FileSpreadsheet, 
  Trash2, 
  Plus, 
  Sparkles, 
  Edit3, 
  Grid, 
  Database, 
  Download, 
  RefreshCw, 
  Columns, 
  AlertCircle,
  FolderOpen,
  ArrowRightLeft,
  X,
  ArrowLeft
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { PharmacyLocation, PHARMACY_NAMES } from '../types';
import { storage } from '../lib/storage';

interface OCRRow {
  [key: string]: any;
}

interface OCRResult {
  filename: string;
  headers: string[];
  rows: OCRRow[];
}

interface UploadQueueItem {
  id: string;
  file: File;
  status: 'idle' | 'uploading' | 'parsing' | 'completed' | 'failed';
  error?: string;
  result?: OCRResult;
}

interface AdminTableOcrProps {
  isTechnicianView?: boolean;
  onNavigateToExpiryCheck?: () => void;
  onBackToOrderView?: () => void;
}

export default function AdminTableOcr({
  isTechnicianView = false,
  onNavigateToExpiryCheck,
  onBackToOrderView
}: AdminTableOcrProps = {}) {
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [activeTab, setActiveTab] = useState<'individual' | 'consolidated'>('individual');
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Syncing with local inventory status
  const [isSyncingWithInventory, setIsSyncingWithInventory] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'success' | 'error' | null>(null);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);

  // Drag and Drop Handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFilesToQueue(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFilesToQueue(Array.from(e.target.files));
    }
  };

  const addFilesToQueue = (files: File[]) => {
    const pdfs = files.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (pdfs.length === 0) {
      alert('Please upload PDF files only.');
      return;
    }

    const newItems: UploadQueueItem[] = pdfs.map(file => ({
      id: `${file.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file,
      status: 'idle'
    }));

    setQueue(prev => {
      const updated = [...prev, ...newItems];
      if (!selectedFileId && updated.length > 0) {
        setSelectedFileId(newItems[0].id);
      }
      return updated;
    });
  };

  const removeFromQueue = (id: string) => {
    setQueue(prev => {
      const updated = prev.filter(item => item.id !== id);
      if (selectedFileId === id) {
        setSelectedFileId(updated.length > 0 ? updated[0].id : null);
      }
      return updated;
    });
  };

  const clearQueue = () => {
    setQueue([]);
    setSelectedFileId(null);
  };

  // Convert File to Base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = error => reject(error);
    });
  };

  // Parse a specific file
  const parseFile = async (id: string) => {
    const item = queue.find(q => q.id === id);
    if (!item) return;

    setQueue(prev => prev.map(q => q.id === id ? { ...q, status: 'parsing' } : q));

    try {
      const base64 = await fileToBase64(item.file);
      const response = await fetch('/api/pdf-ocr/parse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          base64,
          filename: item.file.name,
          mimeType: item.file.type || 'application/pdf'
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP error ${response.status}`);
      }

      const resultData = await response.json();
      
      // Ensure resultData contains structured headers and rows
      const headers = resultData.headers || ['itemCode', 'itemName', 'qoh', 'expiryDate', 'batchNo', 'price'];
      const rows = resultData.rows || [];

      setQueue(prev => prev.map(q => q.id === id ? {
        ...q,
        status: 'completed',
        result: {
          filename: item.file.name,
          headers,
          rows
        }
      } : q));

    } catch (error: any) {
      console.error('Error parsing PDF:', error);
      setQueue(prev => prev.map(q => q.id === id ? {
        ...q,
        status: 'failed',
        error: error.message || 'Failed to extract data'
      } : q));
    }
  };

  // Parse all files currently idle or failed in parallel for extreme speed
  const parseAll = async () => {
    const itemsToParse = queue.filter(q => q.status === 'idle' || q.status === 'failed');
    await Promise.all(itemsToParse.map(item => parseFile(item.id)));
  };

  // Edit cell value directly
  const handleCellEdit = (fileId: string, rowIndex: number, key: string, val: any) => {
    setQueue(prev => prev.map(item => {
      if (item.id !== fileId || !item.result) return item;
      
      const updatedRows = [...item.result.rows];
      updatedRows[rowIndex] = { ...updatedRows[rowIndex], [key]: val };

      return {
        ...item,
        result: {
          ...item.result,
          rows: updatedRows
        }
      };
    }));
  };

  // Add row to extracted table
  const handleAddRow = (fileId: string) => {
    setQueue(prev => prev.map(item => {
      if (item.id !== fileId || !item.result) return item;

      const newRow: OCRRow = {};
      item.result.headers.forEach(h => {
        newRow[h] = '';
      });

      return {
        ...item,
        result: {
          ...item.result,
          rows: [...item.result.rows, newRow]
        }
      };
    }));
  };

  // Delete row from extracted table
  const handleDeleteRow = (fileId: string, rowIndex: number) => {
    setQueue(prev => prev.map(item => {
      if (item.id !== fileId || !item.result) return item;

      const updatedRows = [...item.result.rows];
      updatedRows.splice(rowIndex, 1);

      return {
        ...item,
        result: {
          ...item.result,
          rows: updatedRows
        }
      };
    }));
  };

  // Delete column
  const handleDeleteColumn = (fileId: string, columnHeader: string) => {
    setQueue(prev => prev.map(item => {
      if (item.id !== fileId || !item.result) return item;

      const updatedHeaders = item.result.headers.filter(h => h !== columnHeader);
      const updatedRows = item.result.rows.map(row => {
        const copy = { ...row };
        delete copy[columnHeader];
        return copy;
      });

      return {
        ...item,
        result: {
          ...item.result,
          headers: updatedHeaders,
          rows: updatedRows
        }
      };
    }));
  };

  // Get active item
  const activeItem = queue.find(q => q.id === selectedFileId);

  // Compute Consolidated Headers and Rows
  const getConsolidatedData = () => {
    const completedItems = queue.filter(q => q.status === 'completed' && q.result);
    if (completedItems.length === 0) return { headers: [], rows: [] };

    // Merge unique headers
    const allHeadersSet = new Set<string>();
    completedItems.forEach(item => {
      item.result?.headers.forEach(h => allHeadersSet.add(h));
    });

    const consolidatedHeaders = Array.from(allHeadersSet);
    
    // Concat all rows (annotating which file they came from)
    const consolidatedRows: OCRRow[] = [];
    completedItems.forEach(item => {
      if (item.result) {
        item.result.rows.forEach(row => {
          consolidatedRows.push({
            ...row,
            __sourceFile: item.file.name
          });
        });
      }
    });

    return { headers: consolidatedHeaders, rows: consolidatedRows };
  };

  // Export to Excel using XLSX
  const handleExportExcel = () => {
    const completedItems = queue.filter(q => q.status === 'completed' && q.result);
    if (completedItems.length === 0) {
      alert('No completed OCR tables to export.');
      return;
    }

    const workbook = XLSX.utils.book_new();

    if (activeTab === 'consolidated') {
      const { headers, rows } = getConsolidatedData();
      // Format rows beautifully (remove source file helper)
      const cleanRows = rows.map(r => {
        const clean: any = {};
        headers.forEach(h => {
          clean[h] = r[h] !== undefined ? r[h] : '';
        });
        clean['Source File'] = r.__sourceFile || '';
        return clean;
      });

      const worksheet = XLSX.utils.json_to_sheet(cleanRows);
      XLSX.utils.book_append_sheet(workbook, worksheet, "Consolidated Tab");
    } else {
      // Export each PDF's table to its own separate sheet
      completedItems.forEach(item => {
        if (item.result) {
          const worksheet = XLSX.utils.json_to_sheet(item.result.rows);
          // Limit sheet name to 30 chars
          const sheetName = item.file.name.replace(/\.[^/.]+$/, "").substring(0, 30);
          XLSX.utils.book_append_sheet(workbook, worksheet, sheetName || "Sheet");
        }
      });
    }

    XLSX.writeFile(workbook, `PharmaStock_OCR_Export_${Date.now()}.xlsx`);
  };

  // Sync to AW-PharmaStock Pro local DB
  const handleSyncToInventory = async () => {
    const completedItems = queue.filter(q => q.status === 'completed' && q.result);
    if (completedItems.length === 0) {
      alert('No completed OCR tables to sync.');
      return;
    }

    setIsSyncingWithInventory(true);
    setSyncMessage('Connecting to system database...');
    setSyncStatus(null);

    const { rows } = getConsolidatedData();

    // Map extracted rows to backend format
    // Extracting itemCode/itemName and matching against medications
    try {
      // 1. Fetch current medications in DB
      const res = await fetch('/api/medications');
      if (!res.ok) throw new Error('Failed to fetch existing medication inventory.');
      const currentMedications = await res.ok ? await res.json() : [];

      let matchedCount = 0;
      let updatedCount = 0;
      const medicationsToUpdate: any[] = [];

      rows.forEach(row => {
        const ocrCode = row.itemCode?.toString().trim();
        const ocrName = row.itemName?.toString().trim();
        const ocrQoh = parseFloat(row.qoh);

        if (isNaN(ocrQoh)) return; // Skip if QOH is not valid numeric

        // Try to match by itemCode or itemName
        const matchedMeds = currentMedications.filter((m: any) => {
          const mCode = m.itemNumber?.toString().trim() || m.id?.toString().trim();
          const mName = m.labelDescription?.toString().trim();

          const codeMatch = ocrCode && mCode && mCode.toLowerCase() === ocrCode.toLowerCase();
          const nameMatch = ocrName && mName && mName.toLowerCase() === ocrName.toLowerCase();
          return codeMatch || nameMatch;
        });

        if (matchedMeds.length > 0) {
          matchedCount++;
          matchedMeds.forEach((med: any) => {
            medicationsToUpdate.push({
              id: med.id,
              qoh: ocrQoh,
              updatedBy: 'Gemini PDF OCR'
            });
            updatedCount++;
          });
        }
      });

      if (medicationsToUpdate.length === 0) {
        setSyncStatus('error');
        setSyncMessage(`Found ${rows.length} rows in PDFs, but none of them matched existing medications in your system. Check item codes or item names.`);
        setIsSyncingWithInventory(false);
        return;
      }

      // 2. Perform bulk save updates
      setSyncMessage(`Matching successful! Syncing QOH for ${updatedCount} matched medications...`);
      
      const bulkRes = await fetch('/api/medications/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          medications: medicationsToUpdate.map(med => ({
            id: med.id,
            qoh: med.qoh
          })),
          updatedBy: 'Oracle QOH Upload' // reuse the bulk update pipeline which triggers audit logs!
        })
      });

      if (!bulkRes.ok) throw new Error('Failed to update medications in bulk.');

      setSyncStatus('success');
      setSyncMessage(`Successfully integrated OCR data! Matched and updated the QOH of ${updatedCount} medications in your system database.`);

    } catch (err: any) {
      console.error(err);
      setSyncStatus('error');
      setSyncMessage(`Synchronization failed: ${err.message}`);
    } finally {
      setIsSyncingWithInventory(false);
    }
  };

  const handleImportToExpiryCheck = (locationId: PharmacyLocation) => {
    const completedItems = queue.filter(q => q.status === 'completed' && q.result);
    if (completedItems.length === 0) {
      alert('No completed OCR tables to import.');
      return;
    }

    let sourceRows: OCRRow[] = [];
    let fileNameLabel = '';

    if (activeTab === 'consolidated') {
      const { rows } = getConsolidatedData();
      sourceRows = rows;
      fileNameLabel = `Consolidated OCR (${completedItems.length} PDFs)`;
    } else {
      if (!selectedFileId) {
        alert('Please select a parsed PDF file from the list.');
        return;
      }
      const activeItem = queue.find(q => q.id === selectedFileId);
      if (!activeItem || !activeItem.result) {
        alert('Please select a parsed PDF file from the list.');
        return;
      }
      sourceRows = activeItem.result.rows;
      fileNameLabel = `PDF OCR: ${activeItem.file.name}`;
    }

    // Now convert these sourceRows to Record<string, any> for ExcelGroupedRow
    const rowsByItem: Record<string, any> = {};

    sourceRows.forEach(row => {
      // Find key helper
      const getRowValue = (r: any, keys: string[]) => {
        const lowerKeys = keys.map(k => k.toLowerCase());
        const foundKey = Object.keys(r).find(k => lowerKeys.includes(k.toLowerCase()));
        return foundKey ? r[foundKey] : undefined;
      };

      const itemCode = String(getRowValue(row, ['itemCode', 'item', 'itemcode', 'code']) || '').trim();
      if (!itemCode) return;

      const description = String(getRowValue(row, ['itemName', 'description', 'desc', 'name']) || '').trim();
      const brand = String(getRowValue(row, ['brand']) || '').trim();
      const uom = String(getRowValue(row, ['uom', 'unit']) || '').trim();
      const lot = String(getRowValue(row, ['batchNo', 'batch', 'lot', 'serial', 'lot/serial']) || '').trim();
      const dateVal = getRowValue(row, ['expiryDate', 'expiry', 'exp', 'expiration', 'date']);
      const qtyVal = getRowValue(row, ['qoh', 'quantity', 'qty', 'units', 'physicalCount']);

      let qty = 0;
      if (typeof qtyVal === 'number') {
        qty = qtyVal;
      } else if (qtyVal !== undefined && qtyVal !== null && qtyVal !== '') {
        qty = parseFloat(String(qtyVal).replace(/,/g, ''));
        if (isNaN(qty)) qty = 0;
      }

      if (!rowsByItem[itemCode]) {
        rowsByItem[itemCode] = {
          itemCode,
          description,
          brand,
          uom,
          lotSerials: [],
          dates: [],
          totalQty: 0
        };
      }

      const group = rowsByItem[itemCode];
      if (lot && !group.lotSerials.includes(lot)) {
        group.lotSerials.push(lot);
      }

      // Format/Normalize date to DD/MM/YYYY
      let dateStr = '';
      if (dateVal) {
        const str = String(dateVal).trim();
        const parts = str.split(/[-/.]/).map(p => p.trim());
        if (parts.length === 3) {
          if (parts[0].length === 4) {
            // YYYY-MM-DD
            const y = parts[0];
            const m = parts[1].padStart(2, '0');
            const d = parts[2].padStart(2, '0');
            dateStr = `${d}/${m}/${y}`;
          } else {
            // DD/MM/YYYY or MM/DD/YYYY
            const d = parts[0].padStart(2, '0');
            const m = parts[1].padStart(2, '0');
            const y = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
            dateStr = `${d}/${m}/${y}`;
          }
        } else if (parts.length === 2) {
          // MM/YYYY -> 01/MM/YYYY
          const m = parts[0].padStart(2, '0');
          const y = parts[1].length === 2 ? `20${parts[1]}` : parts[1];
          dateStr = `01/${m}/${y}`;
        } else {
          dateStr = str;
        }
      }

      if (dateStr && !group.dates.includes(dateStr)) {
        group.dates.push(dateStr);
      }

      group.totalQty += qty;

      // Fill blanks
      if (!group.description && description) group.description = description;
      if (!group.brand && brand) group.brand = brand;
      if (!group.uom && uom) group.uom = uom;
    });

    const stateToStore = {
      fileName: fileNameLabel,
      excelDataGroups: rowsByItem,
      parseError: null,
      isProcessing: false,
      rawSheetNames: ["Combined Unified Table"]
    };

    // Save to local storage
    storage.setItem(`ocr_import_${locationId}`, JSON.stringify(stateToStore));

    // Display success
    setSyncStatus('success');
    setSyncMessage(`Extracted rows successfully imported to Expiration Verification Report for "${PHARMACY_NAMES[locationId]}". You can now open the Expiration Verification Report to view the results comparison!`);
    setIsLocationModalOpen(false);
  };

  return (
    <div className="space-y-8" id="pdf-table-ocr-container">
      {/* Top Banner Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-white rounded-3xl border border-[#141414]/10 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3.5 bg-amber-50 rounded-2xl text-[#F27D26] border border-amber-200">
            <Sparkles className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-[#141414]">PDF Table OCR & Excel Merger</h1>
            <p className="text-sm text-[#141414]/50 font-medium">
              Extract and consolidate structured table data from multiple PDF inventories using Gemini Multimodal AI.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isTechnicianView && (
            <>
              <button 
                onClick={onBackToOrderView}
                className="px-4 py-2.5 rounded-xl border border-stone-200 text-[#141414]/80 bg-white hover:bg-stone-50 text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Order View</span>
              </button>
              <button 
                onClick={onNavigateToExpiryCheck}
                className="px-4 py-2.5 rounded-xl bg-[#F27D26] text-white hover:bg-[#e06c15] text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Expiry Verification Report</span>
              </button>
            </>
          )}
          <button 
            onClick={clearQueue}
            disabled={queue.length === 0}
            className="px-4 py-2.5 rounded-xl border border-red-200 text-red-600 bg-red-50/50 hover:bg-red-50 text-xs font-bold transition-all disabled:opacity-40 disabled:pointer-events-none active:scale-95 cursor-pointer"
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Main Multi-File Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Side Panel: Drag/Drop & File Queue (ColSpan 4) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Custom Upload Dropzone */}
          <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative flex flex-col items-center justify-center border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all ${
              isDragging 
                ? 'border-[#F27D26] bg-[#F27D26]/5 shadow-inner' 
                : 'border-[#141414]/10 bg-white hover:border-[#F27D26]/40 hover:bg-[#F27D26]/[0.01]'
            }`}
          >
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleFileSelect}
              multiple 
              accept=".pdf" 
              className="hidden" 
            />
            <div className={`p-4 rounded-2xl mb-4 transition-transform ${isDragging ? 'scale-110 bg-[#F27D26]/10 text-[#F27D26]' : 'bg-[#141414]/5 text-[#141414]/40'}`}>
              <FileUp className="w-8 h-8" />
            </div>
            <span className="font-bold text-sm text-[#141414]">Drag & Drop your PDFs here</span>
            <span className="text-[11px] text-[#141414]/40 font-medium mt-1">or click to browse from computer</span>
            <span className="text-[9px] font-mono tracking-widest text-amber-600 uppercase mt-4 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">Supports Multi-Upload</span>
          </div>

          {/* Files List Queue */}
          <div className="bg-white rounded-3xl border border-[#141414]/10 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-[#141414]/5 bg-[#141414]/[0.01] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-[#F27D26]" />
                <span className="font-bold text-xs text-[#141414] uppercase tracking-wider">Queue ({queue.length})</span>
              </div>
              {queue.filter(q => q.status === 'idle' || q.status === 'failed').length > 0 && (
                <button
                  onClick={parseAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F27D26] text-white text-[11px] font-black rounded-lg hover:bg-orange-600 transition-all active:scale-95 shadow-sm"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Parse All</span>
                </button>
              )}
            </div>

            {queue.length === 0 ? (
              <div className="p-8 text-center text-[#141414]/30 flex flex-col items-center justify-center">
                <Grid className="w-8 h-8 opacity-40 mb-2 stroke-1" />
                <span className="text-xs font-semibold">No PDFs loaded yet</span>
                <span className="text-[10px] mt-1">Upload a PDF to get started with Gemini OCR</span>
              </div>
            ) : (
              <div className="divide-y divide-[#141414]/5 max-h-[350px] overflow-y-auto">
                {queue.map(item => {
                  const isActive = item.id === selectedFileId;
                  return (
                    <div 
                      key={item.id}
                      onClick={() => setSelectedFileId(item.id)}
                      className={`p-4 flex items-center justify-between transition-all cursor-pointer ${
                        isActive ? 'bg-[#F27D26]/5 border-l-4 border-[#F27D26]' : 'hover:bg-[#141414]/[0.01]'
                      }`}
                    >
                      <div className="flex flex-col min-w-0 pr-4">
                        <span className="text-xs font-bold text-[#141414] truncate">{item.file.name}</span>
                        <span className="text-[10px] text-[#141414]/40 font-mono mt-0.5">
                          {(item.file.size / 1024).toFixed(1)} KB
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2 shrink-0">
                        {item.status === 'idle' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              parseFile(item.id);
                            }}
                            className="p-1 px-2.5 text-[10px] bg-slate-100 text-slate-700 font-bold rounded hover:bg-[#F27D26] hover:text-white transition-all active:scale-95"
                          >
                            Parse
                          </button>
                        )}
                        {item.status === 'parsing' && (
                          <div className="flex items-center gap-1 text-[#F27D26] text-[10px] font-bold">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Parsing...</span>
                          </div>
                        )}
                        {item.status === 'completed' && (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        )}
                        {item.status === 'failed' && (
                          <span title={item.error}>
                            <XCircle className="w-4 h-4 text-red-500" />
                          </span>
                        )}

                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFromQueue(item.id);
                          }}
                          className="p-1 text-[#141414]/30 hover:text-red-500 transition-colors rounded hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Side Panel: Interactive Spreadsheet Grid (ColSpan 8) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Main Grid View Toolbar / Tab Switcher */}
          <div className="bg-white rounded-3xl border border-[#141414]/10 shadow-sm overflow-hidden">
            <div className="p-4 bg-[#141414]/[0.01] border-b border-[#141414]/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              {/* Tab Selector */}
              <div className="flex items-center gap-1.5 p-1 bg-[#141414]/5 rounded-2xl w-fit">
                <button
                  onClick={() => setActiveTab('individual')}
                  className={`px-4 py-2 text-xs font-black rounded-xl transition-all ${
                    activeTab === 'individual' 
                      ? 'bg-white text-[#141414] shadow-sm' 
                      : 'text-[#141414]/50 hover:text-[#141414]'
                  }`}
                >
                  Individual PDF Data
                </button>
                <button
                  onClick={() => setActiveTab('consolidated')}
                  className={`px-4 py-2 text-xs font-black rounded-xl transition-all ${
                    activeTab === 'consolidated' 
                      ? 'bg-white text-[#141414] shadow-sm' 
                      : 'text-[#141414]/50 hover:text-[#141414]'
                  }`}
                >
                  Consolidated Merge
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setIsLocationModalOpen(true)}
                  disabled={queue.filter(q => q.status === 'completed').length === 0}
                  className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black rounded-xl transition-all disabled:opacity-40 disabled:pointer-events-none active:scale-[1.02] active:scale-95 shadow-sm cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 animate-pulse text-amber-100" />
                  <span>Import to Expiry Verification</span>
                </button>

                <button
                  onClick={handleSyncToInventory}
                  disabled={queue.filter(q => q.status === 'completed').length === 0}
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl transition-all disabled:opacity-40 disabled:pointer-events-none active:scale-95 shadow-sm cursor-pointer"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  <span>Sync QOH to PharmaStock</span>
                </button>

                <button
                  onClick={handleExportExcel}
                  disabled={queue.filter(q => q.status === 'completed').length === 0}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl transition-all disabled:opacity-40 disabled:pointer-events-none active:scale-95 shadow-sm cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Export Excel</span>
                </button>
              </div>
            </div>

            {/* Sync Status Overlay Message */}
            <AnimatePresence>
              {syncMessage && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className={`p-4 border-b flex items-center justify-between gap-4 ${
                    syncStatus === 'success' 
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                      : syncStatus === 'error' 
                      ? 'bg-red-50 border-red-200 text-red-800'
                      : 'bg-indigo-50 border-indigo-200 text-indigo-800 animate-pulse'
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs font-bold">
                    {syncStatus === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    <span>{syncMessage}</span>
                  </div>
                  <button 
                    onClick={() => setSyncMessage(null)}
                    className="p-1 text-slate-400 hover:text-slate-600 text-xs font-bold"
                  >
                    Dismiss
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Tab Viewport rendering */}
            <div className="p-6">
              {activeTab === 'individual' ? (
                // ------------------ INDIVIDUAL TAB VIEW ------------------
                <div>
                  {!activeItem ? (
                    <div className="p-16 text-center text-[#141414]/30 flex flex-col items-center justify-center border border-dashed rounded-2xl bg-slate-50/50">
                      <Grid className="w-12 h-12 opacity-30 mb-3 stroke-1" />
                      <span className="text-sm font-bold">No file selected in queue</span>
                      <span className="text-xs mt-1">Select an item from the queue list on the left to inspect its data.</span>
                    </div>
                  ) : activeItem.status === 'parsing' ? (
                    <div className="p-16 text-center text-[#141414]/40 flex flex-col items-center justify-center border border-dashed rounded-2xl bg-amber-50/20 border-amber-200/50">
                      <Loader2 className="w-12 h-12 animate-spin text-[#F27D26] mb-4" />
                      <span className="text-sm font-extrabold text-[#141414]">Gemini Multimodal parsing in progress...</span>
                      <p className="text-xs max-w-sm text-slate-500 mt-2 font-medium">
                        Using OCR vision technology to read the tables in "{activeItem.file.name}" and convert them to rows.
                      </p>
                    </div>
                  ) : activeItem.status === 'failed' ? (
                    <div className="p-16 text-center text-[#141414]/40 flex flex-col items-center justify-center border border-dashed rounded-2xl bg-red-50/20 border-red-200/50">
                      <XCircle className="w-12 h-12 text-red-500 mb-4" />
                      <span className="text-sm font-extrabold text-red-800">OCR Extraction Failed</span>
                      <p className="text-xs max-w-sm text-red-700/60 mt-1 font-medium">
                        {activeItem.error || 'Gemini was unable to extract tabular data from this document.'}
                      </p>
                      <button
                        onClick={() => parseFile(activeItem.id)}
                        className="mt-4 px-4 py-2 bg-[#F27D26] text-white text-xs font-bold rounded-lg hover:bg-orange-600 transition-all"
                      >
                        Retry Parsing
                      </button>
                    </div>
                  ) : activeItem.status === 'idle' ? (
                    <div className="p-16 text-center text-[#141414]/40 flex flex-col items-center justify-center border border-dashed rounded-2xl bg-slate-50 border-slate-200">
                      <Sparkles className="w-12 h-12 text-slate-400 mb-4" />
                      <span className="text-sm font-extrabold text-slate-700">This file is ready for OCR parsing</span>
                      <p className="text-xs max-w-sm text-slate-500 mt-1 font-medium">
                        Click "Run Gemini OCR" to scan "{activeItem.file.name}" for structured medication tables.
                      </p>
                      <button
                        onClick={() => parseFile(activeItem.id)}
                        className="mt-4 flex items-center gap-1.5 px-5 py-2.5 bg-[#F27D26] text-white text-xs font-black rounded-xl hover:bg-orange-600 transition-all active:scale-95 shadow-sm"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Run Gemini OCR</span>
                      </button>
                    </div>
                  ) : activeItem.result ? (
                    // RENDER SPREADSHEET FOR INDIVIDUAL
                    <div className="space-y-4">
                      {/* Sub header for spreadsheet */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          <span className="text-xs font-bold text-slate-500 truncate">
                            Extracted {activeItem.result.rows.length} rows from <span className="font-bold text-slate-700">"{activeItem.file.name}"</span>
                          </span>
                        </div>
                        <button
                          onClick={() => handleAddRow(activeItem.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#141414]/5 text-[#141414] text-[11px] font-bold rounded-lg hover:bg-[#141414]/10 transition-all active:scale-95 border"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Insert Row</span>
                        </button>
                      </div>

                      {/* Spreadsheet Scrolling Container */}
                      <div className="border border-[#141414]/10 rounded-2xl overflow-hidden bg-white">
                        <div className="overflow-x-auto max-h-[450px]">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-50/80 border-b border-[#141414]/5">
                                {activeItem.result.headers.map(col => (
                                  <th key={col} className="p-3 text-[11px] font-extrabold text-[#141414]/50 uppercase tracking-wider relative group">
                                    <div className="flex items-center justify-between gap-2">
                                      <span>{col}</span>
                                      <button
                                        onClick={() => handleDeleteColumn(activeItem.id, col)}
                                        className="opacity-0 group-hover:opacity-100 p-0.5 text-[#141414]/30 hover:text-red-500 rounded hover:bg-red-50 transition-all"
                                        title={`Delete column ${col}`}
                                      >
                                        &times;
                                      </button>
                                    </div>
                                  </th>
                                ))}
                                <th className="p-3 text-[11px] font-extrabold text-[#141414]/50 uppercase tracking-wider text-center w-16">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#141414]/5">
                              {activeItem.result.rows.map((row, idx) => (
                                <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                  {activeItem.result!.headers.map(col => (
                                    <td key={col} className="p-1 px-3">
                                      <input 
                                        type="text"
                                        value={row[col] !== undefined && row[col] !== null ? row[col] : ''}
                                        onChange={(e) => handleCellEdit(activeItem.id, idx, col, e.target.value)}
                                        className="w-full bg-transparent border-0 border-b border-transparent focus:border-[#F27D26]/40 focus:bg-[#F27D26]/[0.02] p-1.5 rounded text-xs font-medium text-slate-700 focus:outline-none transition-all"
                                      />
                                    </td>
                                  ))}
                                  <td className="p-1 text-center">
                                    <button 
                                      onClick={() => handleDeleteRow(activeItem.id, idx)}
                                      className="p-1.5 text-[#141414]/30 hover:text-red-500 rounded hover:bg-red-50 transition-all active:scale-95 inline-flex"
                                      title="Delete Row"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                // ------------------ CONSOLIDATED TAB VIEW ------------------
                <div>
                  {queue.filter(q => q.status === 'completed').length === 0 ? (
                    <div className="p-16 text-center text-[#141414]/30 flex flex-col items-center justify-center border border-dashed rounded-2xl bg-slate-50/50">
                      <Grid className="w-12 h-12 opacity-30 mb-3 stroke-1" />
                      <span className="text-sm font-bold">No completed OCR tables found</span>
                      <span className="text-xs mt-1">Please upload and parse at least one PDF file using Gemini OCR on the left.</span>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Sub header for spreadsheet */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-[#F27D26]" />
                          <span className="text-xs font-bold text-slate-500">
                            Merged <span className="font-extrabold text-[#F27D26]">{getConsolidatedData().rows.length} rows</span> from <span className="font-extrabold text-slate-700">{queue.filter(q => q.status === 'completed').length} completed PDF scans</span>
                          </span>
                        </div>
                      </div>

                      {/* Consolidated Table Scroll Container */}
                      <div className="border border-[#141414]/10 rounded-2xl overflow-hidden bg-white">
                        <div className="overflow-x-auto max-h-[450px]">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-50/80 border-b border-[#141414]/5">
                                <th className="p-3 text-[11px] font-extrabold text-[#141414]/40 uppercase tracking-wider">Source PDF File</th>
                                {getConsolidatedData().headers.map(col => (
                                  <th key={col} className="p-3 text-[11px] font-extrabold text-[#141414]/50 uppercase tracking-wider">
                                    {col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#141414]/5">
                              {getConsolidatedData().rows.map((row, idx) => (
                                <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                  <td className="p-3 text-[10px] font-bold text-indigo-600 bg-indigo-50/30 truncate max-w-[150px]">
                                    {row.__sourceFile}
                                  </td>
                                  {getConsolidatedData().headers.map(col => (
                                    <td key={col} className="p-3 text-xs font-medium text-slate-700">
                                      {row[col] !== undefined && row[col] !== null ? row[col].toString() : ''}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Select Location Modal */}
      <AnimatePresence>
        {isLocationModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl border border-[#141414]/10 shadow-xl max-w-md w-full p-6 space-y-6"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-500 animate-pulse" />
                  <h3 className="font-black text-base text-[#141414] uppercase tracking-wider">Select Location</h3>
                </div>
                <button
                  onClick={() => setIsLocationModalOpen(false)}
                  className="p-1 hover:bg-[#141414]/5 rounded-xl transition-all cursor-pointer"
                >
                  <X className="w-5 h-5 text-[#141414]/50" />
                </button>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-[#141414]/60 leading-relaxed">
                  Select which pharmacy location to import the extracted PDF stock data into:
                </p>
                <p className="text-[10px] font-mono text-[#F27D26] uppercase tracking-wider font-bold">
                  {activeTab === 'consolidated' 
                    ? `Consolidating ${queue.filter(q => q.status === 'completed').length} PDF Tables` 
                    : `Active File: ${activeItem?.file.name}`
                  }
                </p>
              </div>

              <div className="space-y-3">
                {(Object.keys(PHARMACY_NAMES) as PharmacyLocation[]).map(loc => (
                  <button
                    key={loc}
                    onClick={() => handleImportToExpiryCheck(loc)}
                    className="w-full flex items-center justify-between p-4 bg-amber-50/20 hover:bg-amber-50 border border-amber-200/50 hover:border-amber-500/30 rounded-2xl text-left transition-all group cursor-pointer"
                  >
                    <div>
                      <h4 className="font-bold text-[#141414] text-sm group-hover:text-amber-800 transition-colors">
                        {PHARMACY_NAMES[loc]}
                      </h4>
                      <p className="text-[10px] font-mono text-[#141414]/40 uppercase tracking-widest mt-0.5">
                        {loc === PharmacyLocation.ADULT ? 'ADULT-EMERGENCY' : loc.toUpperCase()}
                      </p>
                    </div>
                    <div className="p-1.5 bg-amber-100 text-amber-700 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity">
                      <Sparkles className="w-3.5 h-3.5" />
                    </div>
                  </button>
                ))}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setIsLocationModalOpen(false)}
                  className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
