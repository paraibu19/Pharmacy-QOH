import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';

const app = express();
const PORT = 3000;
const DATA_DIR = path.join(process.cwd(), 'data');
const MEDS_FILE = path.join(DATA_DIR, 'medications.json');
const AUDITS_FILE = path.join(DATA_DIR, 'audits.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

// Ensure files exist
if (!fs.existsSync(MEDS_FILE) || fs.readFileSync(MEDS_FILE, 'utf8') === '[]') {
  const seedData = [
    {
      id: "seed-1",
      itemCode: "1001",
      itemName: "Panadol Advance 500mg",
      generic: "Paracetamol",
      qoh: 250,
      minQty: 100,
      maxQty: 500,
      expiration1: "15-12-2026",
      locationId: "adult",
      addedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString()
    },
    {
      id: "seed-2",
      itemCode: "2002",
      itemName: "Amoxicillin 250mg Susp",
      generic: "Amoxicillin",
      qoh: 45,
      minQty: 50,
      maxQty: 150,
      expiration1: "01-08-2026",
      locationId: "pediatric",
      addedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString()
    },
    {
      id: "seed-3",
      itemCode: "3003",
      itemName: "Lipitor 20mg",
      generic: "Atorvastatin",
      qoh: 120,
      minQty: 50,
      maxQty: 200,
      expiration1: "10-10-2027",
      locationId: "mesaieed",
      addedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString()
    }
  ];
  fs.writeFileSync(MEDS_FILE, JSON.stringify(seedData, null, 2));
}

if (!fs.existsSync(AUDITS_FILE)) fs.writeFileSync(AUDITS_FILE, '[]');
if (!fs.existsSync(SETTINGS_FILE)) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify({
    adminPassword: 'admin123',
    pharmacistPassword: 'pharmacist123',
    orderPassword: 'order123'
  }, null, 2));
}

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Auth & Settings Routes
app.post('/api/auth/admin', (req, res) => {
  const { password } = req.body;
  const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  if (password === settings.adminPassword) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: 'Invalid password' });
  }
});

app.post('/api/auth/change-password', (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  
  if (currentPassword !== settings.adminPassword) {
    return res.status(401).json({ success: false, error: 'Current password incorrect' });
  }

  settings.adminPassword = newPassword;
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  res.json({ success: true });
});

// API Routes
app.get('/api/medications', (req, res) => {
  const data = fs.readFileSync(MEDS_FILE, 'utf8');
  res.json(JSON.parse(data));
});

app.post('/api/medications', (req, res) => {
  const meds = JSON.parse(fs.readFileSync(MEDS_FILE, 'utf8'));
  const newMed = {
    ...req.body,
    id: Math.random().toString(36).substring(2, 15),
    addedAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString()
  };
  meds.push(newMed);
  fs.writeFileSync(MEDS_FILE, JSON.stringify(meds, null, 2));
  res.status(201).json(newMed);
});

app.put('/api/medications/:id', (req, res) => {
  const { id } = req.params;
  const meds = JSON.parse(fs.readFileSync(MEDS_FILE, 'utf8'));
  const index = meds.findIndex((m: any) => m.id === id);
  if (index !== -1) {
    meds[index] = { ...meds[index], ...req.body, lastUpdatedAt: new Date().toISOString() };
    fs.writeFileSync(MEDS_FILE, JSON.stringify(meds, null, 2));
    res.json(meds[index]);
  } else {
    res.status(404).send('Not found');
  }
});

app.delete('/api/medications/:id', (req, res) => {
  const { id } = req.params;
  let meds = JSON.parse(fs.readFileSync(MEDS_FILE, 'utf8'));
  meds = meds.filter((m: any) => m.id !== id);
  fs.writeFileSync(MEDS_FILE, JSON.stringify(meds, null, 2));
  res.status(204).send();
});

app.post('/api/medications/bulk', (req, res) => {
  try {
    const meds = JSON.parse(fs.readFileSync(MEDS_FILE, 'utf8'));
    const { items, options } = req.body;
    
    const itemsToProcess = Array.isArray(items) ? items : req.body; // fallback for old format
    
    if (!Array.isArray(itemsToProcess)) {
      return res.status(400).json({ error: 'Body must contain an array of medications' });
    }

    // Pre-calculate photo map for efficiency
    const globalPhotoMap: Record<string, string> = {};
    if (options?.photoStrategy === 'keep') {
      meds.forEach((m: any) => {
        if (m.imageUrl) globalPhotoMap[m.itemCode] = m.imageUrl;
      });
    }

    const newMeds = itemsToProcess.map((m: any) => {
      const existingIndex = meds.findIndex((em: any) => em.locationId === m.locationId && em.itemCode === m.itemCode);
      
      let imageUrl = m.imageUrl;
      if (options?.photoStrategy === 'keep') {
        if (!imageUrl) {
          imageUrl = globalPhotoMap[m.itemCode];
        }
      } else if (options?.photoStrategy === 'remove') {
        imageUrl = null;
      }

      if (existingIndex !== -1) {
        meds[existingIndex] = { 
          ...meds[existingIndex], 
          ...m, 
          imageUrl: options?.photoStrategy === 'remove' ? null : (imageUrl || meds[existingIndex].imageUrl),
          lastUpdatedAt: new Date().toISOString() 
        };
        return meds[existingIndex];
      } else {
        const nm = {
          ...m,
          imageUrl: imageUrl || null,
          id: Math.random().toString(36).substring(2, 11),
          addedAt: new Date().toISOString(),
          lastUpdatedAt: new Date().toISOString()
        };
        meds.push(nm);
        return nm;
      }
    });

    fs.writeFileSync(MEDS_FILE, JSON.stringify(meds, null, 2));
    res.json({ count: newMeds.length });
  } catch (err: any) {
    console.error('Bulk import error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/audits', (req, res) => {
  const data = fs.readFileSync(AUDITS_FILE, 'utf8');
  res.json(JSON.parse(data));
});

app.post('/api/audits', (req, res) => {
  const audits = JSON.parse(fs.readFileSync(AUDITS_FILE, 'utf8'));
  const newAudit = {
    ...req.body,
    id: Math.random().toString(36).substring(2, 11),
    auditedAt: new Date().toISOString()
  };
  audits.push(newAudit);
  fs.writeFileSync(AUDITS_FILE, JSON.stringify(audits, null, 2));
  res.status(201).json(newAudit);
});

app.post('/api/system/reset', (req, res) => {
  fs.writeFileSync(MEDS_FILE, '[]');
  fs.writeFileSync(AUDITS_FILE, '[]');
  res.json({ success: true });
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
