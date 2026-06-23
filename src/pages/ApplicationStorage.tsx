import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  AlertCircle, 
  Trash2, 
  Download, 
  FileSpreadsheet, 
  FileWarning, 
  Search, 
  RefreshCw, 
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Database,
  Lock,
  Pill,
  Inbox,
  UserCheck
} from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';

interface StoredMistake {
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
  reasons: string[];
  savedAt: string;
}

export default function ApplicationStorage() {
  const [items, setItems] = useState<StoredMistake[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('all');
  const [selectedPharmacist, setSelectedPharmacist] = useState('all');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 25;

  const tableContainerRef = React.useRef<HTMLDivElement>(null);
  const scrollTable = (direction: 'left' | 'right') => {
    if (tableContainerRef.current) {
      const scrollAmount = 350;
      tableContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  // Security Verification Modal
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [modalActionType, setModalActionType] = useState<'delete' | 'reset'>('delete');
  const [targetItem, setTargetItem] = useState<StoredMistake | null>(null);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined = undefined;

    if (db) {
      setLoading(true);
      try {
        const colRef = collection(db, 'application_storage');
        unsubscribe = onSnapshot(colRef, (snapshot) => {
          const loaded: StoredMistake[] = [];
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
          setItems(loaded);
          setLoading(false);
        }, (error) => {
          console.warn("Firestore onSnapshot error on application_storage, falling back to REST API:", error);
          fetchStoredItems(false);
        });
      } catch (err) {
        console.warn("Firestore subscription failed, falling back to REST API:", err);
        fetchStoredItems(false);
      }
    } else {
      fetchStoredItems(false);
    }

    // Set up background polling (unconditionally) as a robust fallback for sandboxed iframe environments
    const pollInterval = setInterval(() => {
      fetchStoredItems(true);
    }, 6000);

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, []);

  const fetchStoredItems = async (isBackground: any = false) => {
    const isBg = isBackground === true;
    if (!isBg) {
      setLoading(true);
    }
    try {
      const url = isBg 
        ? `/api/application-storage?t=${Date.now()}` 
        : `/api/application-storage?force=true&t=${Date.now()}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setItems(data);
      }
    } catch (err) {
      console.error('Failed to load storage items:', err);
    } finally {
      if (!isBg) {
        setLoading(false);
      }
    }
  };

  // Filters calculation
  const uniqueLocations = React.useMemo(() => {
    const set = new Set<string>();
    items.forEach(r => {
      if (r.pharmacyLocation) set.add(r.pharmacyLocation);
    });
    return Array.from(set).sort();
  }, [items]);

  const uniquePharmacists = React.useMemo(() => {
    const set = new Set<string>();
    items.forEach(r => {
      if (r.actionPersonnelPharmacy) set.add(r.actionPersonnelPharmacy);
    });
    return Array.from(set).sort();
  }, [items]);

  // Search filter matching
  const filteredItems = React.useMemo(() => {
    return items.filter(rec => {
      // Filter location
      if (selectedLocation !== 'all' && rec.pharmacyLocation !== selectedLocation) {
        return false;
      }
      // Filter pharmacist
      if (selectedPharmacist !== 'all' && rec.actionPersonnelPharmacy !== selectedPharmacist) {
        return false;
      }
      // Search Box matching MRN- Organization, Person Name- Full, Item Number, Label Description, Action Personnel- Pharmacy (Pharmacist)
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase().trim();
        const mrnMystake = String(rec.mrnOrganization || '').toLowerCase();
        const pName = String(rec.personNameFull || '').toLowerCase();
        const itemNum = String(rec.itemNumber || '').toLowerCase();
        const labelDesc = String(rec.labelDescription || '').toLowerCase();
        const staff = String(rec.actionPersonnelPharmacy || '').toLowerCase();
        
        const matches = 
          mrnMystake.includes(query) ||
          pName.includes(query) ||
          itemNum.includes(query) ||
          labelDesc.includes(query) ||
          staff.includes(query);
          
        if (!matches) return false;
      }
      return true;
    });
  }, [items, searchQuery, selectedLocation, selectedPharmacist]);

  // Pagination slice
  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE) || 1;
  const paginatedItems = React.useMemo(() => {
    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredItems.slice(startIdx, startIdx + ITEMS_PER_PAGE);
  }, [filteredItems, currentPage]);

  // Adjust page boundary if filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedLocation, selectedPharmacist]);

  // Trigger Deletion verification Modal
  const initiateDelete = (item: StoredMistake) => {
    setTargetItem(item);
    setModalActionType('delete');
    setAdminPasswordInput('');
    setPasswordError('');
    setPasswordModalOpen(true);
  };

  // Trigger Reset verification Modal
  const initiateReset = () => {
    setModalActionType('reset');
    setTargetItem(null);
    setAdminPasswordInput('');
    setPasswordError('');
    setPasswordModalOpen(true);
  };

  // Handles either individual delete or complete storage reset request
  const handleAuthorizeAction = async () => {
    setIsProcessingAction(true);
    setPasswordError('');
    try {
      if (modalActionType === 'delete' && targetItem) {
        const res = await fetch('/api/application-storage/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: targetItem.id,
            mrnOrganization: targetItem.mrnOrganization,
            actionDateTime: targetItem.actionDateTime,
            itemNumber: targetItem.itemNumber,
            adminPassword: adminPasswordInput
          })
        });
        
        const data = await res.json();
        if (res.ok && data.success) {
          setPasswordModalOpen(false);
          setTargetItem(null);
          setAdminPasswordInput('');
          fetchStoredItems();
        } else {
          setPasswordError(data.error || 'Incorrect admin password. Action unauthorized.');
        }
      } else if (modalActionType === 'reset') {
        const res = await fetch('/api/application-storage/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adminPassword: adminPasswordInput })
        });
        
        const data = await res.json();
        if (res.ok && data.success) {
          setPasswordModalOpen(false);
          setAdminPasswordInput('');
          fetchStoredItems();
        } else {
          setPasswordError(data.error || 'Incorrect admin password. Action unauthorized.');
        }
      }
    } catch (err) {
      console.error(err);
      setPasswordError('Server network request failed.');
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Downloads data in CSV format as Global Entry Mistakes Data Report
  const exportToCSV = () => {
    if (filteredItems.length === 0) return;
    
    const headers = [
      'Action Personnel', 
      'Action Date & Time', 
      'MRN- Organization', 
      'Patient Full Name', 
      'Sex', 
      'Nationality', 
      'Pharmacy Location', 
      'Action Type', 
      'Item Number', 
      'Label Description', 
      'Dispense Quantity', 
      'Discrepancies / Mismatch Reason',
      'Stored Date Time'
    ];

    const rows = filteredItems.map(item => [
      item.actionPersonnelPharmacy || 'N/A',
      item.actionDateTime || 'N/A',
      item.mrnOrganization || 'N/A',
      item.personNameFull || 'N/A',
      item.sex || 'N/A',
      item.nationality || 'N/A',
      item.pharmacyLocation || 'N/A',
      item.actionType || 'N/A',
      item.itemNumber || 'N/A',
      item.labelDescription || 'N/A',
      item.dispenseQuantity || '0',
      item.reasons ? item.reasons.join(' | ') : 'N/A',
      item.savedAt ? new Date(item.savedAt).toLocaleString() : 'N/A'
    ]);

    const csvContent = [headers, ...rows]
      .map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Global_Entry_Mistakes_Data_Report_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Downloads data in Excel format as Global Entry Mistakes Data Report
  const exportToExcel = () => {
    if (filteredItems.length === 0) return;

    const dataForExcel = filteredItems.map(item => ({
      'Action Personnel': item.actionPersonnelPharmacy || 'N/A',
      'Action Date & Time': item.actionDateTime || 'N/A',
      'MRN- Organization': item.mrnOrganization || 'N/A',
      'Patient Full Name': item.personNameFull || 'N/A',
      'Sex': item.sex || 'N/A',
      'Nationality': item.nationality || 'N/A',
      'Pharmacy Location': item.pharmacyLocation || 'N/A',
      'Action Type': item.actionType || 'N/A',
      'Item Number': item.itemNumber || 'N/A',
      'Label Description': item.labelDescription || 'N/A',
      'Quantity': item.dispenseQuantity || '0',
      'Mismatch Discrepancies': item.reasons ? item.reasons.join('\n') : 'N/A',
      'Database Storage Timestamp': item.savedAt ? new Date(item.savedAt).toLocaleString() : 'N/A'
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataForExcel);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Global Mistakes Storage');
    XLSX.writeFile(workbook, `Global_Entry_Mistakes_Data_Report_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  // Downloads data in secure high contrast PDF format as Global Entry Mistakes Data Report
  const exportToPDF = () => {
    if (filteredItems.length === 0) return;

    const doc = new jsPDF('l', 'pt', 'a4');
    
    // Cover/Header Banner
    doc.setFillColor(20, 20, 20);
    doc.rect(40, 30, 762, 55, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('GLOBAL ENTRY MISTAKES DATA REPORT', 55, 62);
    
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Generated on: ${new Date().toLocaleString()} | Security Level: Confidential`, 55, 74);
    
    // Page Title Info
    doc.setTextColor(20, 20, 20);
    doc.setFontSize(10);
    doc.text(`Total Authenticated Mistakes Logged in Storage: ${filteredItems.length} records.`, 40, 110);

    const headers = [
      ['Personnel', 'Date & Time', 'MRN-Org', 'Patient Name', 'Location', 'Item Num', 'Description', 'Qty', 'Stored Mismatch Details']
    ];

    const dataRows = filteredItems.map(item => [
      item.actionPersonnelPharmacy || 'N/A',
      item.actionDateTime || 'N/A',
      item.mrnOrganization || 'N/A',
      item.personNameFull || 'N/A',
      item.pharmacyLocation || 'N/A',
      item.itemNumber || 'N/A',
      item.labelDescription || 'N/A',
      item.dispenseQuantity || '0',
      item.reasons ? item.reasons.join('; ') : 'N/A'
    ]);

    autoTable(doc, {
      head: headers,
      body: dataRows,
      startY: 125,
      margin: { left: 40, right: 40 },
      styles: {
        fontSize: 7,
        cellPadding: 5,
        valign: 'middle',
        overflow: 'linebreak'
      },
      headStyles: {
        fillColor: [242, 125, 38], // Orange Accent
        textColor: [255, 255, 255],
        fontStyle: 'bold'
      },
      alternateRowStyles: {
        fillColor: [250, 250, 250]
      },
      columnStyles: {
        3: { cellWidth: 100 }, // patient name
        6: { cellWidth: 140 }, // description
        8: { cellWidth: 130 }  // mismatch details
      }
    });

    doc.save(`Global_Entry_Mistakes_Data_Report_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white border border-[#141414]/10 rounded-2xl p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100 shrink-0">
            <Database className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-xl font-black text-[#141414] uppercase tracking-wide flex items-center gap-2">
              Application Storage
            </h1>
            <p className="text-xs text-[#141414]/60 max-w-xl mt-1">
              Global centralized repository of verified workload transcription entry mistakes and item mismatches. Download authenticated reports in CSV, PDF, and Excel.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => fetchStoredItems(false)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-[#141414]/70 bg-[#141414]/5 hover:bg-[#141414]/10 transition-colors"
            title="Refresh database entries"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reload</span>
          </button>
          
          <button
            onClick={initiateReset}
            disabled={items.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black uppercase text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors disabled:opacity-40"
            title="Secure password-protected system wipe of stored data"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Reset Storage</span>
          </button>
        </div>
      </div>

      {/* Metrics Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#141414]/10 rounded-2xl p-4 shadow-sm">
          <span className="text-[10px] font-bold text-[#141414]/40 uppercase tracking-wider block">Total Stored Logs</span>
          <span className="text-2xl font-black text-[#141414] mt-1 block">{items.length}</span>
          <span className="text-[9px] font-semibold text-[#141414]/50 mt-1 block">Records in Database</span>
        </div>

        <div className="bg-white border border-[#141414]/10 rounded-2xl p-4 shadow-sm">
          <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider block">Filtered Views</span>
          <span className="text-2xl font-black text-indigo-600 mt-1 block">{filteredItems.length}</span>
          <span className="text-[9px] font-semibold text-indigo-600/60 mt-1 block">Matching current filters</span>
        </div>

        <div className="bg-white border border-[#141414]/10 rounded-2xl p-4 shadow-sm">
          <span className="text-[10px] font-bold text-[#F27D26] uppercase tracking-wider block">Active Locations</span>
          <span className="text-2xl font-black text-[#F27D26] mt-1 block">{uniqueLocations.length}</span>
          <span className="text-[9px] font-semibold text-[#F27D26]/50 mt-1 block">Locations with mistakes</span>
        </div>

        <div className="bg-white border border-[#141414]/10 rounded-2xl p-4 shadow-sm">
          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">Staff Involved</span>
          <span className="text-2xl font-black text-emerald-600 mt-1 block">{uniquePharmacists.length}</span>
          <span className="text-[9px] font-semibold text-emerald-600/50 mt-1 block">Distinct personnel tracking</span>
        </div>
      </div>

      {/* Main Section */}
      <div className="bg-white border border-[#141414]/10 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#141414]/5 pb-4">
          <div>
            <h3 className="text-sm font-black text-[#141414] uppercase tracking-wide">
              Global Entry Mistakes Data Library
            </h3>
            <p className="text-xs text-[#141414]/60">
              Browse securely logged clinical pharmacist dispensing errors. Access reports and trace workload logs.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase font-black text-[#141414]/40 tracking-widest mr-1">Download report:</span>
            <button 
              onClick={exportToCSV}
              disabled={filteredItems.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-[#141414]/70 bg-[#141414]/5 hover:bg-[#141414]/10 disabled:opacity-45 transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> CSV Sheet
            </button>
            <button 
              onClick={exportToExcel}
              disabled={filteredItems.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-45 transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Excel Workbook
            </button>
            <button 
              onClick={exportToPDF}
              disabled={filteredItems.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-45 transition-colors"
            >
              <FileWarning className="w-3.5 h-3.5" /> PDF Document
            </button>
          </div>
        </div>

        {/* Filters Matrix */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-[#141414]/[0.02] p-3 rounded-xl border border-[#141414]/5 text-xs font-bold">
          {/* Search Box - Matches MRN, Name, Item Number, Description, Pharmacist */}
          <div className="relative col-span-1 md:col-span-2">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-[#141414]/40" />
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by MRN, Name, Item Code, Description, Pharmacist..."
              className="w-full pl-8 pr-3 py-2 border border-[#141414]/12 rounded-lg bg-white focus:outline-none focus:border-indigo-500 text-xs font-medium"
            />
          </div>

          {/* Filter Location */}
          <div>
            <select 
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="w-full px-3 py-2 border border-[#141414]/12 rounded-lg bg-white focus:outline-none focus:border-indigo-500 cursor-pointer text-xs font-bold"
            >
              <option value="all">All Locations</option>
              {uniqueLocations.map((loc, idx) => (
                <option key={`loc-${loc}-${idx}`} value={loc}>{loc}</option>
              ))}
            </select>
          </div>

          {/* Filter Pharmacist */}
          <div>
            <select 
              value={selectedPharmacist}
              onChange={(e) => setSelectedPharmacist(e.target.value)}
              className="w-full px-3 py-2 border border-[#141414]/12 rounded-lg bg-white focus:outline-none focus:border-indigo-500 cursor-pointer text-xs font-bold"
            >
              <option value="all">All Pharmacists</option>
              {uniquePharmacists.map((ph, idx) => (
                <option key={`ph-${ph}-${idx}`} value={ph}>{ph}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Horizontal Scroll Helpers */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-indigo-50/50 border border-indigo-100 px-4 py-3 rounded-xl shadow-sm">
          <div className="flex items-center gap-2 text-xs font-extrabold text-[#141414]/70">
            <span className="text-indigo-600 text-sm animate-pulse">↔</span>
            <span>Horizontal Scroll Assistant: Swipe or slide table to view full columns. Use controls for fast navigation:</span>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => scrollTable('left')}
              className="px-3 py-1.5 bg-white hover:bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-lg text-xs font-bold transition-all flex items-center gap-1 active:scale-95 cursor-pointer shadow-sm"
              title="Scroll Left"
            >
              ← Scroll Left
            </button>
            <button
              type="button"
              onClick={() => scrollTable('right')}
              className="px-3 py-1.5 bg-white hover:bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-lg text-xs font-bold transition-all flex items-center gap-1 active:scale-95 cursor-pointer shadow-sm"
              title="Scroll Right"
            >
              Scroll Right →
            </button>
          </div>
        </div>

        {/* List Table with Desktop Friendly View */}
        <div ref={tableContainerRef} className="overflow-x-auto border border-[#141414]/8 rounded-xl bg-white">
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
                <th className="p-3 text-center">Wipe / Delete</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#141414]/8">
              {loading ? (
                <tr>
                  <td colSpan={13} className="p-10 text-center text-[#141414]/50 font-bold">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-[#F27D26]" />
                      <span>Fetching Stored Entry Mistakes...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={13} className="p-12 text-center text-[#141414]/40 font-bold">
                    <Inbox className="w-8 h-8 text-[#141414]/20 mx-auto mb-2" />
                    <span>No stored mistakes found in current database criteria.</span>
                  </td>
                </tr>
              ) : (
                paginatedItems.map((item, idx) => (
                  <tr key={`${item.id || 'stored-mistake'}-${idx}`} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-semibold text-indigo-700">{item.actionPersonnelPharmacy || 'N/A'}</td>
                    <td className="p-3 font-mono text-[11px] text-[#141414]/70">{item.actionDateTime || 'N/A'}</td>
                    <td className="p-3 font-mono text-[11px] font-bold text-[#141414]/80">{item.mrnOrganization || 'N/A'}</td>
                    <td className="p-3 font-bold text-[#141414]">{item.personNameFull || 'N/A'}</td>
                    <td className="p-3 text-center">{item.sex || 'N/A'}</td>
                    <td className="p-3 text-[#141414]/70">{item.nationality || 'N/A'}</td>
                    <td className="p-3 font-medium text-[#141414]">{item.pharmacyLocation || 'N/A'}</td>
                    <td className="p-3 text-[10px] uppercase font-bold text-[#141414]/60">{item.actionType || 'N/A'}</td>
                    <td className="p-3 font-bold font-mono text-slate-800">{item.itemNumber || 'N/A'}</td>
                    <td className="p-3 min-w-[200px] max-w-[280px] whitespace-normal break-words font-medium text-[#141414]/80">
                      {item.labelDescription || 'N/A'}
                    </td>
                    <td className="p-3 text-center font-extrabold text-[#F27D26] bg-[#F27D26]/5 font-mono">{item.dispenseQuantity || '0'}</td>
                    <td className="p-3 min-w-[240px] max-w-[320px] whitespace-normal break-words">
                      <div className="flex flex-col gap-1">
                        {item.reasons && item.reasons.map((re, rIdx) => (
                          <span key={`re-${rIdx}`} className="inline-flex items-center gap-1 bg-red-50 text-red-700 text-[10px] font-semibold px-2 py-0.5 rounded border border-red-100">
                            <AlertTriangle className="w-2.5 h-2.5 text-red-500 shrink-0" />
                            <span>{re}</span>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => initiateDelete(item)}
                        className="p-1.5 hover:p-1.5 rounded-lg text-red-500 hover:text-white hover:bg-red-600 transition-all border border-red-200/50 hover:border-red-600"
                        title="Delete from Application Storage"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination bar */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 border-t border-[#141414]/8 pt-4">
          <div className="text-xs text-[#141414]/50 font-bold">
            {filteredItems.length > 0 ? (
              <span>
                Showing <span className="text-[#141414]">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> to{' '}
                <span className="text-[#141414]">{Math.min(currentPage * ITEMS_PER_PAGE, filteredItems.length)}</span> of{' '}
                <span className="text-[#141414]">{filteredItems.length}</span> stored records
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
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
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
                ))}
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
            Confidential Health Organization Databases.
          </div>
        </div>
      </div>

      {/* Security Verification Popup (Restricts Deletion & Reset to Password check) */}
      {passwordModalOpen && (
        <div className="fixed inset-0 bg-[#141414]/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white border border-[#141414]/10 max-w-sm w-full rounded-2xl shadow-2xl p-6 relative overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex items-start gap-3">
              <div className="p-3 bg-red-50 text-red-600 border border-red-100 rounded-xl shrink-0">
                <Lock className="w-6 h-6 animate-pulse" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-black text-[#141414] uppercase tracking-wide">
                  {modalActionType === 'reset' ? 'Confirm Database Reset' : 'Confirm Record Deletion'}
                </h3>
                <p className="text-xs text-[#141414]/60 mt-1 leading-relaxed">
                  {modalActionType === 'reset' 
                    ? 'Entering this verification triggers a COMPLETE standard wipe of the Application Storage catalog.'
                    : 'Discarding individual files from the centralized audit catalog requires active administrator permission.'}
                </p>

                <div className="mt-4">
                  <label className="block text-[9px] uppercase font-black text-[#141414]/40 tracking-widest mb-1.5">
                    Verify Admin Password
                  </label>
                  <input
                    type="password"
                    value={adminPasswordInput}
                    onChange={(e) => setAdminPasswordInput(e.target.value)}
                    placeholder="••••••••"
                    className="w-full text-xs font-mono font-bold bg-[#141414]/5 border border-[#141414]/10 rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-red-500 focus:bg-white text-[#141414] transition-all"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleAuthorizeAction();
                      }
                    }}
                  />
                  {passwordError && (
                    <p className="text-red-600 text-[10px] font-bold mt-1.5 flex items-center gap-1 bg-red-50 border border-red-100 p-2 rounded-lg">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{passwordError}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-[#141414]/5 pt-4 text-xs font-bold">
              <button
                onClick={() => {
                  setPasswordModalOpen(false);
                  setTargetItem(null);
                  setAdminPasswordInput('');
                  setPasswordError('');
                }}
                className="px-4 py-2 text-[#141414]/70 bg-[#141414]/5 rounded-xl hover:bg-[#141414]/10 transition-all border border-[#141414]/5"
                disabled={isProcessingAction}
              >
                Cancel
              </button>
              <button
                onClick={handleAuthorizeAction}
                disabled={!adminPasswordInput || isProcessingAction}
                className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 disabled:opacity-45 rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-1"
              >
                {isProcessingAction && <RefreshCw className="w-3 h-3 animate-spin mr-1" />}
                Authorize Wipe
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
