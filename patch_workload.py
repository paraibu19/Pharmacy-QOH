import re

with open('server.ts', 'r') as f:
    content = f.read()

old_json1 = """      return res.json({
        records,
        summary: {
          total: summary.total,
          mismatches: summary.mismatches,
          rate: summary.rate,
          uniqueMrns: summary.uniqueMrnsCount,
          activeStaff: summary.activeStaffCount,
          lastActionStr: summary.lastActionStr,
          totalUploadedFiles
        },
        uploadedFilesList,
        topMedications: summary.topMedications,
        topStaff: summary.topStaff,
        locationBreakdown: summary.locationBreakdown,
        workloadTrend: summary.workloadTrend
      });"""

new_json1 = """      const payload = JSON.stringify({
        records,
        summary: {
          total: summary.total,
          mismatches: summary.mismatches,
          rate: summary.rate,
          uniqueMrns: summary.uniqueMrnsCount,
          activeStaff: summary.activeStaffCount,
          lastActionStr: summary.lastActionStr,
          totalUploadedFiles
        },
        uploadedFilesList,
        topMedications: summary.topMedications,
        topStaff: summary.topStaff,
        locationBreakdown: summary.locationBreakdown,
        workloadTrend: summary.workloadTrend
      });
      return res.json({ _base64: Buffer.from(payload, 'utf8').toString('base64') });"""

content = content.replace(old_json1, new_json1)

old_json2 = """    res.json({
      records: filteredRecords,
      summary: {
        total,
        mismatches: totalMismatches,
        rate,
        uniqueMrns: mrnsSet.size,
        activeStaff: staffSet.size,
        lastActionStr,
        totalUploadedFiles
      },
      uploadedFilesList,
      topMedications,
      topStaff,
      locationBreakdown,
      workloadTrend
    });"""

new_json2 = """    const payload = JSON.stringify({
      records: filteredRecords,
      summary: {
        total,
        mismatches: totalMismatches,
        rate,
        uniqueMrns: mrnsSet.size,
        activeStaff: staffSet.size,
        lastActionStr,
        totalUploadedFiles
      },
      uploadedFilesList,
      topMedications,
      topStaff,
      locationBreakdown,
      workloadTrend
    });
    res.json({ _base64: Buffer.from(payload, 'utf8').toString('base64') });"""

content = content.replace(old_json2, new_json2)

with open('server.ts', 'w') as f:
    f.write(content)
