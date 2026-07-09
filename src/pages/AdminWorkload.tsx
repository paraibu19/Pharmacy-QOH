import React, { useState, useEffect, useMemo } from 'react';
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
  FileDown
} from 'lucide-react';
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
  const [topMedications, setTopMedications] = useState<any[]>([]);
  const [topStaff, setTopStaff] = useState<any[]>([]);
  const [locationBreakdown, setLocationBreakdown] = useState<any>({
    'adult-emergency': { total: 0, mismatches: 0 },
    'pediatric': { total: 0, mismatches: 0 },
    'mesaieed-opd': { total: 0, mismatches: 0 }
  });
  const [workloadTrend, setWorkloadTrend] = useState<any[]>([]);
  const [selectedTrendLocation, setSelectedTrendLocation] = useState<string>('all');
  
  // Reset Password Modal State
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  const [isResetting, setIsResetting] = useState(false);

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
        const data = await res.json();
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
        setTimeout(() => {
          setIsResetModalOpen(false);
          setResetSuccess('');
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
        ['Aw-Pediatric Pharmacy', `${locationBreakdown['pediatric'].total} Recs`, `${locationBreakdown['pediatric'].mismatches} Mismatches`, `${locationBreakdown['pediatric'].total > 0 ? ((locationBreakdown['pediatric'].mismatches / locationBreakdown['pediatric'].total) * 100).toFixed(1) : '0.0'}%`],
        ['Aw-Mesaieed OPD Pharmacy', `${locationBreakdown['mesaieed-opd'].total} Recs`, `${locationBreakdown['mesaieed-opd'].mismatches} Mismatches`, `${locationBreakdown['mesaieed-opd'].total > 0 ? ((locationBreakdown['mesaieed-opd'].mismatches / locationBreakdown['mesaieed-opd'].total) * 100).toFixed(1) : '0.0'}%`]
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
        <div className="bg-white border border-[#141414]/10 rounded-2xl p-5 shadow-sm relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-extrabold tracking-widest text-[#141414]/40">Uploaded Workloads</span>
              <p className="text-2xl font-black text-indigo-700">{loading ? '...' : metrics.totalUploadedFiles.toLocaleString()}</p>
            </div>
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl" title={uploadedFilesList.map(f => f.filename).join('\n')}>
              <FileSpreadsheet className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-[11px] font-bold text-indigo-600">
            <span className="truncate max-w-[170px]" title={uploadedFilesList.map(f => f.filename).join(', ') || "No files uploaded yet"}>
              {uploadedFilesList.length > 0 
                ? `${uploadedFilesList[uploadedFilesList.length - 1].filename}` 
                : "Excel spreadsheets parsed"}
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
            <option value="all">All Locations</option>
            <option value="adult">Adult Emergency</option>
            <option value="pediatric">Pediatric Pharmacy</option>
            <option value="mesaieed">Mesaieed OPD</option>
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
                <option value="all">All Locations (Trend)</option>
                <option value="adult">Adult Emergency</option>
                <option value="pediatric">Pediatric Pharmacy</option>
                <option value="mesaieed">Mesaieed OPD</option>
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
              const maxVal = Math.max(1, ...Object.keys(locationBreakdown).map(k => locationBreakdown[k].total));
              return [
                { id: 'adult-emergency', label: 'Adult Emergency', color: 'bg-[#F27D26]', val: locationBreakdown['adult-emergency'] },
                { id: 'pediatric', label: 'Pediatric Pharmacy', color: 'bg-emerald-500', val: locationBreakdown['pediatric'] },
                { id: 'mesaieed-opd', label: 'Mesaieed OPD', color: 'bg-indigo-500', val: locationBreakdown['mesaieed-opd'] }
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

      {/* Filtered Records Log Table with Download Reports Actions */}
      <div className="bg-white border border-[#141414]/10 rounded-3xl p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-extrabold text-[#141414]">Detailed Workload Log</h3>
            <p className="text-xs text-[#141414]/50 font-medium">
              Showing {filteredRecords.length.toLocaleString()} out of {records.length.toLocaleString()} persistent entries.
            </p>
          </div>

          {/* Export Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[#141414]/5 hover:bg-[#141414]/10 text-[#141414]/80 rounded-xl text-xs font-bold border border-[#141414]/10 transition-all"
            >
              <Download className="w-3.5 h-3.5 text-blue-600" />
              <span>CSV</span>
            </button>
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold border border-emerald-200 transition-all"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Excel</span>
            </button>
            <button
              onClick={handleExportPDF}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl text-xs font-bold border border-red-200 transition-all"
            >
              <FileText className="w-3.5 h-3.5 text-red-600" />
              <span>PDF Report</span>
            </button>
          </div>
        </div>

        {/* Log table */}
        <div className="overflow-x-auto border border-[#141414]/10 rounded-2xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#141414]/[0.02] border-b border-[#141414]/10 text-[#141414]/60 font-black uppercase tracking-wider">
                <th className="p-4 whitespace-nowrap">Action Date & Time</th>
                <th className="p-4 whitespace-nowrap">Facility - Order</th>
                <th className="p-4 whitespace-nowrap">Nursing Location - Order</th>
                <th className="p-4 whitespace-nowrap">Encounter Type</th>
                <th className="p-4 whitespace-nowrap">MRN- Organization</th>
                <th className="p-4 whitespace-nowrap">Person Name- Full</th>
                <th className="p-4 whitespace-nowrap">Sex</th>
                <th className="p-4 whitespace-nowrap">Nationality</th>
                <th className="p-4 whitespace-nowrap">Age- Years (Visit)</th>
                <th className="p-4 whitespace-nowrap">Physician - Ordering</th>
                <th className="p-4 whitespace-nowrap">Pharmacy Location</th>
                <th className="p-4 whitespace-nowrap">Dispense Event Type</th>
                <th className="p-4 whitespace-nowrap">Action Type</th>
                <th className="p-4 whitespace-nowrap">Item Number</th>
                <th className="p-4 whitespace-nowrap">Label Description</th>
                <th className="p-4 whitespace-nowrap">Action Personnel - Pharmacy</th>
                <th className="p-4 text-center whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#141414]/5 font-medium">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={17} className="p-8 text-center text-xs text-[#141414]/30 font-bold uppercase tracking-wider">
                    {loading ? 'Retrieving persistent records from server...' : 'No workload records found matching the filters'}
                  </td>
                </tr>
              ) : (
                filteredRecords.slice(0, 50).map(rec => (
                  <tr 
                    key={rec.id} 
                    className={`hover:bg-[#141414]/[0.01] transition-colors ${rec.isMismatch ? 'bg-red-50/20 hover:bg-red-50/30' : ''}`}
                  >
                    <td className="p-4 font-mono text-[#141414]/60 whitespace-nowrap">{rec.actionDateTime}</td>
                    <td className="p-4 font-bold text-[#141414]/70 whitespace-nowrap">{rec.facilityOrder || '-'}</td>
                    <td className="p-4 font-bold text-[#141414]/70 whitespace-nowrap">{rec.nursingLocationOrder || '-'}</td>
                    <td className="p-4 font-bold text-[#141414]/70 whitespace-nowrap">{rec.encounterType || '-'}</td>
                    <td className="p-4 font-bold text-[#141414]/70 whitespace-nowrap">{rec.mrnOrganization || '-'}</td>
                    <td className="p-4 font-black text-[#141414] whitespace-nowrap">{rec.personNameFull || '-'}</td>
                    <td className="p-4 font-bold text-[#141414]/70 whitespace-nowrap">{rec.sex || '-'}</td>
                    <td className="p-4 font-bold text-[#141414]/70 whitespace-nowrap">{rec.nationality || '-'}</td>
                    <td className="p-4 font-bold text-[#141414]/70 whitespace-nowrap">{rec.ageYearsVisit || '-'}</td>
                    <td className="p-4 font-bold text-[#141414]/70 whitespace-nowrap">{rec.physicianOrdering || '-'}</td>
                    <td className="p-4 font-bold text-[#141414]/60 truncate max-w-[150px]" title={rec.pharmacyLocation}>
                      {rec.pharmacyLocation || '-'}
                    </td>
                    <td className="p-4 font-bold text-[#141414]/70 whitespace-nowrap">{rec.dispenseEventType || '-'}</td>
                    <td className="p-4 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-[#141414]/5 text-[#141414]/60">
                        {rec.actionType || '-'}
                      </span>
                    </td>
                    <td className="p-4 font-mono text-[#141414]/70 whitespace-nowrap">{rec.itemNumber || '-'}</td>
                    <td className="p-4 font-bold text-[#141414] max-w-[200px] truncate" title={rec.labelDescription}>
                      {rec.labelDescription || '-'}
                    </td>
                    <td className="p-4 font-black text-[#141414]/70 whitespace-nowrap">{rec.actionPersonnelPharmacy || '-'}</td>
                    <td className="p-4 text-center">
                      {rec.isMismatch ? (
                        <div className="flex flex-col items-center">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-red-100 text-red-700">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            <span>Mistake</span>
                          </span>
                          <span className="text-[9px] text-red-500 font-bold mt-1 max-w-[120px] leading-tight truncate" title={(rec.reasons || []).join(', ')}>
                            {(rec.reasons || []).join(', ')}
                          </span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-700">
                          <CheckCircle className="w-2.5 h-2.5" />
                          <span>Normal</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filteredRecords.length > 50 && (
          <p className="text-center text-[11px] font-bold text-[#141414]/40 uppercase tracking-widest mt-2">
            * Display limit set to first 50 rows. Download report (Excel or PDF) to view all {filteredRecords.length.toLocaleString()} filtered records.
          </p>
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
    </div>
  );
}
