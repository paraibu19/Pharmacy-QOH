import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Medication, PharmacyLocation, PHARMACY_NAMES } from '../types';
import { X, Image as ImageIcon, Download, FileSpreadsheet, ClipboardList, AlertCircle, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { formatNumber, formatSafeDate } from '../lib/formatters';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface BrandGenericReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  medications: Medication[];
  lastUpdate: string | null;
  selectedLocation: PharmacyLocation;
}

interface BrandGenericPair {
  brand: Medication | null;
  generic: Medication | null;
  brandCode: string;
  genericCode: string;
}

export function getItemStatus(med: Medication | null): 'in stock' | 'low stock' | 'out of stock' | 'not in the list' {
  if (!med) return 'not in the list';
  if (med.qoh <= 0) return 'out of stock';
  if (med.maxQty && med.qoh < med.maxQty * 0.3) return 'low stock';
  return 'in stock';
}

function getStatusBadgeClass(status: string) {
  switch (status) {
    case 'in stock':
      return 'bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest';
    case 'low stock':
      return 'bg-amber-100 text-amber-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest';
    case 'out of stock':
      return 'bg-red-100 text-red-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest';
    default:
      return 'bg-slate-100 text-slate-500 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border border-slate-200/30';
  }
}

export default function BrandGenericReportModal({
  isOpen,
  onClose,
  medications,
  lastUpdate,
  selectedLocation
}: BrandGenericReportModalProps) {
  
  const pairs = useMemo(() => {
    const list: BrandGenericPair[] = [];
    const pairedBrandsWithRealGeneric = new Set<string>();
    const pairedGenericsWithRealBrand = new Set<string>();

    const getLinkedCodes = (med: Medication) => {
      return med.to
        ? med.to.split(/[\s,;]+/).filter(Boolean).map(c => c.trim().toLowerCase())
        : [];
    };

    // 1. Identify brands inside medications list
    const brandMeds = medications.filter(m => m.generic && m.generic.toLowerCase().includes('brand'));
    const brandCodes = new Set(brandMeds.map(b => b.itemCode.trim().toLowerCase()));

    // 2. Identify generics under our robust connected definition:
    // Any item which is not a brand, and either explicitly contains "generic" or has bi-directional relation with any brand.
    const genericMeds = medications.filter(m => {
      const bCodeLower = m.itemCode.trim().toLowerCase();
      const isBrand = brandCodes.has(bCodeLower) || !!(m.generic && m.generic.toLowerCase().includes('brand'));
      if (isBrand) return false;

      // Explicitly marked as generic
      if (m.generic && m.generic.toLowerCase().includes('generic')) return true;

      // Has connection to/from any registered brand
      const mCodes = getLinkedCodes(m);
      if (mCodes.some(code => brandCodes.has(code))) return true;

      if (brandMeds.some(brand => getLinkedCodes(brand).includes(bCodeLower))) return true;

      return false;
    });

    const addedPairs = new Set<string>(); // "brandCode:genericCode"

    const addPair = (brand: Medication | null, generic: Medication | null, bCode: string, gCode: string) => {
      const sig = `${bCode.trim().toLowerCase()}:${gCode.trim().toLowerCase()}`;
      if (addedPairs.has(sig)) return;
      addedPairs.add(sig);
      
      list.push({
        brand,
        generic,
        brandCode: bCode.toUpperCase(),
        genericCode: gCode.toUpperCase()
      });

      if (brand && generic) {
        pairedBrandsWithRealGeneric.add(brand.itemCode.trim().toLowerCase());
        pairedGenericsWithRealBrand.add(generic.itemCode.trim().toLowerCase());
      }
    };

    // 3. Build real connections (bi-directional check)
    brandMeds.forEach(brand => {
      const bCodeLower = brand.itemCode.trim().toLowerCase();
      const bLinkedCodes = getLinkedCodes(brand);

      genericMeds.forEach(generic => {
        const gCodeLower = generic.itemCode.trim().toLowerCase();
        const gLinkedCodes = getLinkedCodes(generic);

        const isConnected = bLinkedCodes.includes(gCodeLower) || gLinkedCodes.includes(bCodeLower);
        if (isConnected) {
          addPair(brand, generic, brand.itemCode, generic.itemCode);
        }
      });

      // Handle linked generic codes that do not exist as active medications in the list
      bLinkedCodes.forEach(code => {
        const hasRealGeneric = genericMeds.some(g => g.itemCode.trim().toLowerCase() === code);
        if (!hasRealGeneric) {
          addPair(brand, null, brand.itemCode, code);
        }
      });
    });

    // 4. Handle remaining Generics without paired active Brands
    genericMeds.forEach(generic => {
      const gCodeLower = generic.itemCode.trim().toLowerCase();
      const gLinkedCodes = getLinkedCodes(generic);

      if (pairedGenericsWithRealBrand.has(gCodeLower)) {
        return;
      }

      let foundAnyBrand = false;
      gLinkedCodes.forEach(code => {
        const brand = brandMeds.find(b => b.itemCode.trim().toLowerCase() === code);
        if (brand) {
          addPair(brand, generic, brand.itemCode, generic.itemCode);
          foundAnyBrand = true;
        }
      });

      if (!foundAnyBrand) {
        if (gLinkedCodes.length > 0) {
          gLinkedCodes.forEach(code => {
            const hasRealBrand = brandMeds.some(b => b.itemCode.trim().toLowerCase() === code);
            if (!hasRealBrand) {
              addPair(null, generic, code, generic.itemCode);
            }
          });
        } else {
          addPair(null, generic, '', generic.itemCode);
        }
      }
    });

    // 5. Handle any remaining Brand items without any generic connections
    brandMeds.forEach(brand => {
      const bCodeLower = brand.itemCode.trim().toLowerCase();
      const hasAnyPair = Array.from(addedPairs).some(sig => sig.startsWith(`${bCodeLower}:`));
      if (!hasAnyPair) {
        addPair(brand, null, brand.itemCode, '');
      }
    });

    // 6. Sort the final list to keep Brand items with multiple connected generics grouped together
    list.sort((a, b) => {
      const aBrandName = a.brand ? a.brand.itemName.toLowerCase() : '';
      const bBrandName = b.brand ? b.brand.itemName.toLowerCase() : '';
      const aBrandCode = a.brandCode.toLowerCase();
      const bBrandCode = b.brandCode.toLowerCase();
      
      if (aBrandName && bBrandName) {
        if (aBrandName !== bBrandName) {
          return aBrandName.localeCompare(bBrandName);
        }
      } else if (aBrandName) {
        return -1;
      } else if (bBrandName) {
        return 1;
      } else {
        if (aBrandCode !== bBrandCode) {
          return aBrandCode.localeCompare(bBrandCode);
        }
      }

      // Grouped by same brand, sort by generic name next
      const aGenName = a.generic ? a.generic.itemName.toLowerCase() : '';
      const bGenName = b.generic ? b.generic.itemName.toLowerCase() : '';
      const aGenCode = a.genericCode.toLowerCase();
      const bGenCode = b.genericCode.toLowerCase();

      if (aGenName && bGenName) {
        return aGenName.localeCompare(bGenName);
      } else if (aGenName) {
        return -1;
      } else if (bGenName) {
        return 1;
      } else {
        return aGenCode.localeCompare(bGenCode);
      }
    });

    return list;
  }, [medications]);

  const reportDate = useMemo(() => format(new Date(), "yyyy-MM-dd HH:mm:ss"), []);
  const formattedLastUpdate = useMemo(() => {
    return formatSafeDate(lastUpdate, 'EEEE, dd-MM-yyyy hh:mm a', 'No Data').toUpperCase();
  }, [lastUpdate]);

  const handleCSVExport = () => {
    const csvRows = [];
    csvRows.push('"Brand vs Generic Report"');
    csvRows.push(`"Report Date and Time:","${reportDate}"`);
    csvRows.push(`"Pharmacy Location:","${PHARMACY_NAMES[selectedLocation] || selectedLocation}"`);
    csvRows.push(`"Note:","Please note that the report may show different item balances depending on the latest data update made by the administrator."`);
    csvRows.push(`"Last update:","${formattedLastUpdate}"`);
    csvRows.push('');
    csvRows.push([
      'Brand Item Code', 'Brand Item Name', 'Brand Stock Status', 'Brand QOH', 'Brand Exp1', 'Brand Exp2', 'Brand Exp3', 'Brand Photo URL',
      'Generic Item Code', 'Generic Item Name', 'Generic Stock Status', 'Generic QOH', 'Generic Exp1', 'Generic Exp2', 'Generic Exp3', 'Generic Photo URL'
    ].map(h => `"${h}"`).join(','));

    pairs.forEach(pair => {
      const brandStatus = getItemStatus(pair.brand);
      const genericStatus = getItemStatus(pair.generic);
      
      const row = [
        pair.brand ? pair.brand.itemCode : '',
        pair.brand ? pair.brand.itemName : 'Not in the list',
        brandStatus,
        pair.brand ? pair.brand.qoh : '',
        pair.brand ? pair.brand.expiration1 || '-' : '',
        pair.brand ? pair.brand.expiration2 || '-' : '',
        pair.brand ? pair.brand.expiration3 || '-' : '',
        pair.brand ? pair.brand.imageUrl || '' : '',
        
        pair.generic ? pair.generic.itemCode : (pair.genericCode || ''),
        pair.generic ? pair.generic.itemName : 'Not in the list',
        genericStatus,
        pair.generic ? pair.generic.qoh : '',
        pair.generic ? pair.generic.expiration1 || '-' : '',
        pair.generic ? pair.generic.expiration2 || '-' : '',
        pair.generic ? pair.generic.expiration3 || '-' : '',
        pair.generic ? pair.generic.imageUrl || '' : ''
      ];
      csvRows.push(row.map(val => `"${String(val ?? '').replace(/"/g, '""')}"`).join(','));
    });

    const csvContent = "\uFEFF" + csvRows.join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    const locationClean = (PHARMACY_NAMES[selectedLocation] || selectedLocation).replace(/\s+/g, '_');
    link.setAttribute("download", `Brand_vs_Generic_Report_${locationClean}_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleXLSXExport = () => {
    const wsData = [
      ['Brand vs Generic Report'],
      ['Report Date and Time:', reportDate],
      ['Pharmacy Location:', PHARMACY_NAMES[selectedLocation] || selectedLocation],
      ['Note:', 'Please note that the report may show different item balances depending on the latest data update made by the administrator.'],
      ['Last update:', formattedLastUpdate],
      [],
      [
        'Brand Item Code', 'Brand Item Name', 'Brand Stock Status', 'Brand QOH', 'Brand Exp1', 'Brand Exp2', 'Brand Exp3', 'Brand Photo URL',
        'Generic Item Code', 'Generic Item Name', 'Generic Stock Status', 'Generic QOH', 'Generic Exp1', 'Generic Exp2', 'Generic Exp3', 'Generic Photo URL'
      ]
    ];

    pairs.forEach(pair => {
      const brandStatus = getItemStatus(pair.brand);
      const genericStatus = getItemStatus(pair.generic);
      
      wsData.push([
        pair.brand ? pair.brand.itemCode : '',
        pair.brand ? pair.brand.itemName : 'Not in the list',
        brandStatus,
        pair.brand ? pair.brand.qoh : '',
        pair.brand ? pair.brand.expiration1 || '-' : '',
        pair.brand ? pair.brand.expiration2 || '-' : '',
        pair.brand ? pair.brand.expiration3 || '-' : '',
        pair.brand ? pair.brand.imageUrl || '' : '',
        
        pair.generic ? pair.generic.itemCode : (pair.genericCode || ''),
        pair.generic ? pair.generic.itemName : 'Not in the list',
        genericStatus,
        pair.generic ? pair.generic.qoh : '',
        pair.generic ? pair.generic.expiration1 || '-' : '',
        pair.generic ? pair.generic.expiration2 || '-' : '',
        pair.generic ? pair.generic.expiration3 || '-' : '',
        pair.generic ? pair.generic.imageUrl || '' : ''
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Brand_Generic_Report");
    const locationClean = (PHARMACY_NAMES[selectedLocation] || selectedLocation).replace(/\s+/g, '_');
    XLSX.writeFile(wb, `Brand_vs_Generic_Report_${locationClean}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const handlePDFExport = () => {
    const doc = new jsPDF('landscape');
    const width = doc.internal.pageSize.getWidth();

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
    
    // Title
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Brand vs Generic Report", 14, 15);
    
    // Metadata
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Report Date and Time: ${reportDate}`, 14, 21);
    doc.text(`Pharmacy Location: ${PHARMACY_NAMES[selectedLocation] || selectedLocation}`, 14, 26);
    doc.text(`Last update: ${formattedLastUpdate}`, 14, 31);
    
    // Warn note
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    const noteText = "Please note that the report may show different item balances depending on the latest data update made by the administrator.";
    const splitNote = doc.splitTextToSize(noteText, width - 28);
    doc.text(splitNote, 14, 36);

    const tableData = pairs.map(pair => {
      const brandStatus = getItemStatus(pair.brand);
      const genericStatus = getItemStatus(pair.generic);
      
      const brandExpiries = pair.brand 
        ? [pair.brand.expiration1, pair.brand.expiration2, pair.brand.expiration3].filter(Boolean).join('\n') || '-' 
        : '-';
      const genericExpiries = pair.generic 
        ? [pair.generic.expiration1, pair.generic.expiration2, pair.generic.expiration3].filter(Boolean).join('\n') || '-' 
        : '-';

      const getPdfStatusCell = (status: 'in stock' | 'low stock' | 'out of stock' | 'not in the list') => {
        let fillColor: [number, number, number] = [241, 245, 249]; // bg-slate-100
        let textColor: [number, number, number] = [100, 116, 139]; // text-slate-500
        
        if (status === 'in stock') {
          fillColor = [209, 250, 229]; // bg-emerald-100
          textColor = [5, 150, 105]; // text-emerald-600
        } else if (status === 'low stock') {
          fillColor = [254, 243, 199]; // bg-amber-100
          textColor = [217, 119, 6]; // text-amber-600
        } else if (status === 'out of stock') {
          fillColor = [254, 226, 226]; // bg-red-100
          textColor = [220, 38, 38]; // text-red-600
        }

        return {
          content: status.toUpperCase(),
          styles: {
            fillColor,
            textColor,
            fontStyle: 'bold',
            halign: 'center' as const
          }
        };
      };

      return [
        pair.brand ? pair.brand.itemCode : '-',
        pair.brand ? pair.brand.itemName : 'Not in the list',
        getPdfStatusCell(brandStatus) as any,
        pair.brand ? pair.brand.qoh.toLocaleString() : '-',
        brandExpiries,
        
        pair.generic ? pair.generic.itemCode : (pair.genericCode || '-'),
        pair.generic ? pair.generic.itemName : 'Not in the list',
        getPdfStatusCell(genericStatus) as any,
        pair.generic ? pair.generic.qoh.toLocaleString() : '-',
        genericExpiries
      ];
    });

    autoTable(doc, {
      startY: 42,
      head: [
        [
          { content: 'Brand Details', colSpan: 5, styles: { halign: 'center', fillColor: [120, 120, 120], textColor: [255, 255, 255] } },
          { content: 'Generic Details', colSpan: 5, styles: { halign: 'center', fillColor: [52, 168, 83], textColor: [255, 255, 255] } }
        ],
        [
          'Code', 'Item Name', 'Status', 'QOH', 'Expiries',
          'Code', 'Item Name', 'Status', 'QOH', 'Expiries'
        ]
      ],
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [45, 45, 45], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 'wrap' },
        1: { cellWidth: 45 },
        2: { cellWidth: 20 },
        3: { cellWidth: 15 },
        4: { cellWidth: 22 },
        5: { cellWidth: 'wrap' },
        6: { cellWidth: 45 },
        7: { cellWidth: 20 },
        8: { cellWidth: 15 },
        9: { cellWidth: 22 }
      },
      willDrawCell: (data) => {
        if (data.section === 'body' && (data.column.index === 4 || data.column.index === 9)) {
          const color = getExpirationPDFColor(data.cell.raw as string);
          if (color) {
            data.cell.styles.fillColor = color;
            data.cell.styles.textColor = color[0] === 250 ? [0, 0, 0] : [255, 255, 255];
          }
        }
      },
      didDrawCell: (data) => {
        if (data.section === 'body') {
          // Pale highlighted grey of the brand label or generic label
          // Let's highlight status or codes if desired
        }
      }
    });

    const locationClean = (PHARMACY_NAMES[selectedLocation] || selectedLocation).replace(/\s+/g, '_');
    doc.save(`Brand_vs_Generic_Report_${locationClean}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-0 md:p-4 bg-black/65 backdrop-blur-md overflow-hidden">
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 20, opacity: 0 }}
          className="relative max-w-6xl w-full bg-slate-50 md:rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[100dvh] md:h-[85vh] max-h-[100dvh] md:max-h-[85vh] border border-[#141414]/10"
        >
          {/* Header */}
          <div className="p-4 md:p-6 bg-white border-b border-[#141414]/5 flex items-center justify-between z-10 sticky top-0">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-[#F27D26]/10 rounded-xl text-[#F27D26]">
                <ClipboardList size={22} className="w-5 h-5 md:w-6 md:h-6" />
              </div>
              <div>
                <h2 className="text-base md:text-xl font-bold text-[#141414]">
                  Brand vs Generic Report
                </h2>
                <span className="text-[10px] md:text-xs text-[#141414]/50 block">
                  {PHARMACY_NAMES[selectedLocation]} • Generated {reportDate}
                </span>
              </div>
            </div>
            
            <button
              onClick={onClose}
              className="p-2 hover:bg-[#141414]/5 rounded-full text-[#141414]/20 hover:text-[#141414]/60 transition-all active:scale-95"
            >
              <X size={20} className="md:w-6 md:h-6" />
            </button>
          </div>

          {/* Warning banner and metadata */}
          <div className="bg-amber-50/85 border-b border-amber-100 p-4 shrink-0 flex items-start gap-2.5 md:mx-6 md:mt-4 md:rounded-2xl">
            <AlertCircle className="w-4.5 h-4.5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs text-amber-800 leading-normal">
                Please note that the report may show different item balances depending on the latest data update made by the administrator.
              </p>
              <span className="text-[9px] font-bold text-amber-700 font-mono tracking-wider block">
                LAST UPDATE: {formattedLastUpdate}
              </span>
            </div>
          </div>

          {/* Scrollable area */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 space-y-4">
            {pairs.length > 0 ? (
              <>
                {/* Mobile Responsive Cards (Visible on mobile/tablet) */}
                <div className="block md:hidden space-y-4">
                  {pairs.map((pair, idx) => {
                    const brandStatus = getItemStatus(pair.brand);
                    const genericStatus = getItemStatus(pair.generic);
                    
                    return (
                      <div 
                        key={idx} 
                        className="bg-white rounded-2xl border border-[#141414]/10 overflow-hidden shadow-sm flex flex-col divide-y divide-[#141414]/10"
                      >
                        {/* Brand Section */}
                        <div className="p-4 bg-slate-50/70">
                          <div className="flex items-center gap-1.5 mb-2">
                            <span className="bg-slate-200/80 text-slate-800 text-[9px] font-black px-2 py-0.5 rounded tracking-wider uppercase">
                              Brand Product
                            </span>
                          </div>
                          
                          <div className="flex gap-3">
                            {/* Photo */}
                            <div className="w-12 h-12 bg-white rounded-xl border border-[#141414]/10 flex items-center justify-center shrink-0 overflow-hidden">
                              {pair.brand?.imageUrl ? (
                                <img src={pair.brand.imageUrl} alt={pair.brand.itemName} className="w-full h-full object-cover" />
                              ) : (
                                <ImageIcon size={20} className="text-[#141414]/20" />
                              )}
                            </div>
                            
                            {/* Details */}
                            <div className="flex-1 min-w-0 space-y-1">
                              <h4 className="text-xs font-bold text-[#141414] line-clamp-2 leading-tight">
                                {pair.brand?.itemName || <span className="text-slate-400 font-normal italic">Not in the list</span>}
                              </h4>
                              {pair.brand && (
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1 py-0.5 rounded">
                                    {pair.brand.itemCode}
                                  </span>
                                  <span className={getStatusBadgeClass(brandStatus)}>
                                    {brandStatus}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* QOH & Exp */}
                            {pair.brand && (
                              <div className="text-right shrink-0">
                                <span className="text-xs font-black block text-slate-800">
                                  QOH: {formatNumber(pair.brand.qoh)}
                                </span>
                                <div className="text-[8px] text-slate-500 font-mono mt-0.5 leading-none space-y-0.5 text-right">
                                  {pair.brand.expiration1 && <p>E1: {pair.brand.expiration1}</p>}
                                  {pair.brand.expiration2 && <p>E2: {pair.brand.expiration2}</p>}
                                  {pair.brand.expiration3 && <p>E3: {pair.brand.expiration3}</p>}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Generic Section */}
                        <div className="p-4 bg-emerald-50/[0.15]">
                          <div className="flex items-center gap-1.5 mb-2">
                            <span className="bg-emerald-100 text-emerald-800 text-[9px] font-black px-1.5 py-0.5 rounded tracking-wider uppercase">
                              Generic Product
                            </span>
                          </div>

                          <div className="flex gap-3">
                            {/* Photo */}
                            <div className="w-12 h-12 bg-white rounded-xl border border-[#34A853]/20 flex items-center justify-center shrink-0 overflow-hidden">
                              {pair.generic?.imageUrl ? (
                                <img src={pair.generic.imageUrl} alt={pair.generic.itemName} className="w-full h-full object-cover" />
                              ) : (
                                <ImageIcon size={20} className="text-[#34A853]/35" />
                              )}
                            </div>

                            {/* Details */}
                            <div className="flex-1 min-w-0 space-y-1">
                              <h4 className="text-xs font-bold text-[#141414] line-clamp-2 leading-tight">
                                {pair.generic?.itemName || <span className="text-slate-400 font-normal italic">Not in the list</span>}
                              </h4>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[10px] font-mono bg-[#34A853]/10 text-[#34A853] px-1.5 py-0.5 rounded font-black">
                                  {pair.generic?.itemCode || pair.genericCode || '-'}
                                </span>
                                <span className={getStatusBadgeClass(genericStatus)}>
                                  {genericStatus}
                                </span>
                              </div>
                            </div>

                            {/* QOH & Exp */}
                            {pair.generic && (
                              <div className="text-right shrink-0">
                                <span className="text-xs font-black block text-emerald-700">
                                  QOH: {formatNumber(pair.generic.qoh)}
                                </span>
                                <div className="text-[8px] text-slate-500 font-mono mt-0.5 leading-none space-y-0.5 text-right font-semibold">
                                  {pair.generic.expiration1 && <p>E1: {pair.generic.expiration1}</p>}
                                  {pair.generic.expiration2 && <p>E2: {pair.generic.expiration2}</p>}
                                  {pair.generic.expiration3 && <p>E3: {pair.generic.expiration3}</p>}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop layout tables (Visible on desktop) */}
                <div className="hidden md:block bg-white rounded-2xl border border-[#141414]/5 overflow-hidden shadow-sm">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#141414]/5 text-[10px] font-bold uppercase tracking-widest text-[#141414]/50 border-b border-[#141414]/10">
                        <th className="px-6 py-4 border-r border-[#141414]/5 text-center bg-slate-100/50" colSpan={4}>
                          Brand Product
                        </th>
                        <th className="px-6 py-4 text-center bg-emerald-50/50" colSpan={4}>
                          Generic Product
                        </th>
                      </tr>
                      <tr className="bg-[#141414]/[0.02] text-[9px] font-bold uppercase tracking-wider text-[#141414]/40 border-b border-[#141414]/10">
                        <th className="px-4 py-3 text-center">Photo</th>
                        <th className="px-4 py-3">Code</th>
                        <th className="px-4 py-3">Item Name</th>
                        <th className="px-4 py-3 text-right border-r border-[#141414]/5">Status & QOH / Expiries</th>
                        
                        <th className="px-4 py-3 text-center">Photo</th>
                        <th className="px-4 py-3">Code</th>
                        <th className="px-4 py-3">Item Name</th>
                        <th className="px-4 py-3 text-right">Status & QOH / Expiries</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#141414]/5">
                      {pairs.map((pair, idx) => {
                        const brandStatus = getItemStatus(pair.brand);
                        const genericStatus = getItemStatus(pair.generic);
                        
                        return (
                          <tr key={idx} className="hover:bg-[#141414]/[0.01] transition-all">
                            {/* Brand Side */}
                            <td className="px-4 py-3 align-top text-center w-14">
                              <div className="w-10 h-10 mx-auto bg-slate-100 border border-[#141414]/10 rounded-lg flex items-center justify-center overflow-hidden">
                                {pair.brand?.imageUrl ? (
                                  <img src={pair.brand.imageUrl} alt={pair.brand.itemName} className="w-full h-full object-cover" />
                                ) : (
                                  <ImageIcon size={18} className="text-[#141414]/10" />
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 align-top font-mono text-xs font-bold text-slate-600">
                              {pair.brand?.itemCode || '-'}
                            </td>
                            <td className="px-4 py-3 align-top text-xs font-bold text-[#141414] max-w-[180px] truncate-2-lines">
                              {pair.brand?.itemName || <span className="text-slate-400 italic font-normal">Not in the list</span>}
                            </td>
                            <td className="px-4 py-3 align-top text-right border-r border-[#141414]/5 space-y-2">
                              {pair.brand ? (
                                <div className="flex flex-col items-end gap-1.5">
                                  <span className={getStatusBadgeClass(brandStatus)}>
                                    {brandStatus}
                                  </span>
                                  <p className="text-xs font-black text-slate-800">QOH: {formatNumber(pair.brand.qoh)}</p>
                                  <div className="text-[10px] text-slate-500 font-mono space-y-0.5">
                                    {pair.brand.expiration1 && <p>E1: {pair.brand.expiration1}</p>}
                                    {pair.brand.expiration2 && <p>E2: {pair.brand.expiration2}</p>}
                                    {pair.brand.expiration3 && <p>E3: {pair.brand.expiration3}</p>}
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-col items-end gap-1">
                                  <span className={getStatusBadgeClass('not in the list')}>
                                    not in the list
                                  </span>
                                  <p className="text-xs text-slate-400 font-bold">-</p>
                                </div>
                              )}
                            </td>

                            {/* Generic Side */}
                            <td className="px-4 py-3 align-top text-center w-14">
                              <div className="w-10 h-10 mx-auto bg-[#34A853]/10 border border-[#34A853]/20 rounded-lg flex items-center justify-center overflow-hidden">
                                {pair.generic?.imageUrl ? (
                                  <img src={pair.generic.imageUrl} alt={pair.generic.itemName} className="w-full h-full object-cover" />
                                ) : (
                                  <ImageIcon size={18} className="text-[#34A853]/20" />
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 align-top font-mono text-xs font-bold text-[#34A853]">
                              {pair.generic?.itemCode || pair.genericCode || '-'}
                            </td>
                            <td className="px-4 py-3 align-top text-xs font-bold text-[#141414] max-w-[180px] truncate-2-lines">
                              {pair.generic?.itemName || <span className="text-slate-400 italic font-normal">Not in the list</span>}
                            </td>
                            <td className="px-4 py-3 align-top text-right space-y-2">
                              <div className="flex flex-col items-end gap-1.5">
                                <span className={getStatusBadgeClass(genericStatus)}>
                                  {genericStatus}
                                </span>
                                {pair.generic ? (
                                  <>
                                    <p className="text-xs font-black text-emerald-700">QOH: {formatNumber(pair.generic.qoh)}</p>
                                    <div className="text-[10px] text-slate-500 font-mono space-y-0.5">
                                      {pair.generic.expiration1 && <p>E1: {pair.generic.expiration1}</p>}
                                      {pair.generic.expiration2 && <p>E2: {pair.generic.expiration2}</p>}
                                      {pair.generic.expiration3 && <p>E3: {pair.generic.expiration3}</p>}
                                    </div>
                                  </>
                                ) : (
                                  <p className="text-xs text-slate-400 font-bold">-</p>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="py-20 text-center flex flex-col items-center gap-4 bg-white rounded-3xl border border-[#141414]/5">
                <div className="w-16 h-16 bg-[#141414]/5 rounded-3xl flex items-center justify-center text-[#141414]/20 animate-bounce">
                  <ClipboardList size={32} />
                </div>
                <div className="space-y-1.5 max-w-sm px-6">
                  <p className="font-extrabold text-[#141414] tracking-tight text-base">No Brands or Generics Categorized</p>
                  <p className="text-xs text-[#141414]/40 leading-normal">
                    To showcase data here, please upload or register medications with "brand" or "generic" specified in their generic field.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Footer containing Exports Suite */}
          <div className="p-4 md:p-6 bg-white border-t border-[#141414]/5 flex flex-col md:flex-row items-center justify-between gap-4 sticky bottom-0 z-10 shrink-0">
            <span className="text-xs font-bold text-slate-500 tracking-tight text-center md:text-left">
              Export {pairs.length} brand vs generic comparisons:
            </span>
            <div className="grid grid-cols-2 gap-2 w-full md:flex md:w-auto md:items-center md:gap-2">
              <button
                onClick={handleCSVExport}
                disabled={pairs.length === 0}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
              >
                <FileSpreadsheet className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="truncate">CSV Report</span>
              </button>
              <button
                onClick={handleXLSXExport}
                disabled={pairs.length === 0}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-slate-700 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="truncate">Excel Report</span>
              </button>
              <button
                onClick={handlePDFExport}
                disabled={pairs.length === 0}
                className="px-3 py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span className="truncate">PDF Report</span>
              </button>
              <button
                onClick={onClose}
                className="px-3 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all active:scale-95 border border-red-200/40"
              >
                <X className="w-4 h-4 shrink-0" />
                <span className="truncate">Close Report</span>
               </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
