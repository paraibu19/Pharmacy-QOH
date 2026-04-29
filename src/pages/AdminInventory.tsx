import { useState, useMemo } from 'react';
import { 
  Search, Download, Save, RefreshCw, AlertTriangle, 
  CheckCircle2, ArrowUpRight, History, Loader2
} from 'lucide-react';
import { PharmacyLocation, Medication, PHARMACY_NAMES } from '../types';
import { LOCATIONS } from '../constants';
import { format } from 'date-fns';
import { useMedications } from '../hooks/useMedications';
import { auditOps } from '../lib/firebaseOperations';

export default function AdminInventory() {
  const [selectedLocation, setSelectedLocation] = useState<PharmacyLocation>(PharmacyLocation.ADULT);
  const [searchQuery, setSearchQuery] = useState('');
  
  const { medications, loading } = useMedications(selectedLocation);
  const [physicalCounts, setPhysicalCounts] = useState<Record<string, number>>({});

  const sortedMeds = useMemo(() => {
    let result = medications;
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(m => m.itemName.toLowerCase().includes(q) || m.itemCode.toLowerCase().includes(q));
    }
    
    return result.sort((a, b) => a.itemName.localeCompare(b.itemName));
  }, [medications, searchQuery]);

  const handlePhysicalCountChange = (id: string, value: string) => {
    setPhysicalCounts(prev => ({
      ...prev,
      [id]: parseInt(value) || 0
    }));
  };

  const handleAdjust = async (med: Medication) => {
    const physical = physicalCounts[med.id];
    if (physical === undefined) return;
    
    const variance = physical - med.qoh;
    if (confirm(`Adjust QOH for ${med.itemName}? Variance: ${variance > 0 ? '+' : ''}${variance}`)) {
      await auditOps.reconcille(med.id, physical, selectedLocation, med.itemCode, med.itemName, med.qoh);
      setPhysicalCounts(prev => {
        const next = { ...prev };
        delete next[med.id];
        return next;
      });
    }
  };

  const downloadCSV = () => {
    const headers = ['Item Code', 'Item Name', 'Current QOH', 'Physical Count', 'Variance', 'Last Updated'];
    const rows = sortedMeds.map(m => {
      const physical = physicalCounts[m.id] ?? m.qoh;
      const variance = physical - m.qoh;
      return [
        m.itemCode,
        m.itemName,
        m.qoh,
        physical,
        variance,
        format(new Date(m.lastUpdatedAt), 'yyyy-MM-dd HH:mm')
      ];
    });

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Inventory_Audit_${selectedLocation}_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Inventory Audit & Cycle Counting</h1>
          <p className="text-[#141414]/50">Perform physical stock verification and reconcile variances.</p>
        </div>
        
        <button 
          onClick={downloadCSV}
          className="flex items-center gap-2 px-6 py-2.5 bg-[#141414] text-white rounded-xl text-sm font-bold shadow-lg hover:shadow-black/20 hover:scale-[1.02] transition-all"
        >
          <Download className="w-4 h-4" />
          Export Audit data (CSV)
        </button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Total Items', value: sortedMeds.length, icon: History, color: 'blue' },
          { label: 'Variance Detected', value: Object.keys(physicalCounts).length, icon: AlertTriangle, color: 'orange' },
          { label: 'Last Sync', value: 'Today, 10:45 AM', icon: RefreshCw, color: 'emerald' },
        ].map((stat, i) => (
          <div key={i} className="bg-white p-5 rounded-2xl border border-[#141414]/10 flex items-center justify-between shadow-sm">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 mb-1">{stat.label}</p>
              <p className="text-2xl font-black">{stat.value}</p>
            </div>
            <stat.icon className={`w-8 h-8 opacity-20`} />
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white p-6 rounded-2xl border border-[#141414]/10 shadow-sm space-y-4">
        <div className="flex flex-wrap gap-2">
          {LOCATIONS.map(loc => (
            <button
              key={loc.id}
              onClick={() => setSelectedLocation(loc.id as PharmacyLocation)}
              className={`px-5 py-2 rounded-xl text-xs font-bold transition-all ${
                selectedLocation === loc.id 
                  ? 'bg-[#141414] text-white' 
                  : 'bg-[#141414]/5 text-[#141414]/60 hover:bg-[#141414]/10'
              }`}
            >
              {loc.name.replace('Aw-', '')}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#141414]/30" />
          <input
            type="text"
            placeholder="Search by code or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-[#141414]/[0.03] border-none rounded-xl focus:ring-2 focus:ring-[#141414]/5 transition-all text-sm"
          />
        </div>
      </div>

      {/* Audit Table */}
      <div className="bg-white rounded-2xl border border-[#141414]/10 shadow-sm overflow-hidden min-h-[400px]">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-[#141414]/[0.02] text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 border-b border-[#141414]/10">
                <th className="px-6 py-4">Medication</th>
                <th className="px-6 py-4">System QOH</th>
                <th className="px-6 py-4">Physical Count</th>
                <th className="px-6 py-4">Variance</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#141414]/5">
              {loading && (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-[#141414]/20" />
                  </td>
                </tr>
              )}
              {!loading && sortedMeds.map((med) => {
                const physical = physicalCounts[med.id] ?? med.qoh;
                const variance = physical - med.qoh;
                const hasVariance = variance !== 0;

                return (
                  <tr key={med.id} className="hover:bg-[#141414]/[0.01] transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-mono text-[#141414]/40 mb-0.5">{med.itemCode}</span>
                        <span className="text-sm font-bold text-[#141414]">{med.itemName}</span>
                        <span className="text-[9px] text-[#141414]/30 mt-1 uppercase italic">
                          Last Updated: {format(new Date(med.lastUpdatedAt), 'dd MMM, HH:mm')}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold bg-[#141414]/5 px-2 py-1 rounded">{med.qoh}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <input
                        type="number"
                        min="0"
                        value={physicalCounts[med.id] ?? ''}
                        placeholder={med.qoh.toString()}
                        onChange={(e) => handlePhysicalCountChange(med.id, e.target.value)}
                        className={`w-24 px-3 py-2 bg-transparent border rounded-lg text-sm font-bold transition-all ${
                          hasVariance ? 'border-orange-200 bg-orange-50' : 'border-[#141414]/10 focus:border-[#141414]'
                        }`}
                      />
                    </td>
                    <td className="px-6 py-4">
                      {hasVariance ? (
                        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold w-fit ${
                          variance > 0 ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'
                        }`}>
                          <ArrowUpRight className={`w-3 h-3 ${variance < 0 ? 'rotate-180' : ''}`} />
                          {variance > 0 ? '+' : ''}{variance}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-bold w-fit">
                          <CheckCircle2 className="w-3 h-3" />
                          MATCH
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleAdjust(med)}
                        disabled={!hasVariance}
                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                          hasVariance 
                            ? 'bg-[#141414] text-white hover:scale-105 active:scale-95 shadow-lg shadow-black/10' 
                            : 'bg-[#141414]/5 text-[#141414]/20 cursor-not-allowed'
                        }`}
                      >
                        <Save className="w-3 h-3" />
                        Reconcile
                      </button>
                    </td>
                  </tr>
                );
              })}
              
              {sortedMeds.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center opacity-30 italic font-medium">
                    No items to audit in this location.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
