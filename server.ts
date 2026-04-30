import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';

const app = express();
const PORT = 3000;
const DATA_DIR = path.join(process.cwd(), 'data');
const MEDS_FILE = path.join(DATA_DIR, 'medications.json');
const AUDITS_FILE = path.join(DATA_DIR, 'audits.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

// Ensure files exist
if (!fs.existsSync(MEDS_FILE)) fs.writeFileSync(MEDS_FILE, '[]');
if (!fs.existsSync(AUDITS_FILE)) fs.writeFileSync(AUDITS_FILE, '[]');

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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
    const items = req.body;
    
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Body must be an array of medications' });
    }

    const newMeds = items.map((m: any) => {
      const existingIndex = meds.findIndex((em: any) => em.locationId === m.locationId && em.itemCode === m.itemCode);
      if (existingIndex !== -1) {
        meds[existingIndex] = { ...meds[existingIndex], ...m, lastUpdatedAt: new Date().toISOString() };
        return meds[existingIndex];
      } else {
        const nm = {
          ...m,
          id: Math.random().toString(36).substring(2, 11),
          addedAt: new Date().toISOString(),
          lastUpdatedAt: new Date().toISOString()
        };
        meds.push(nm);
        return nm;
      }
    });

    fs.writeFileSync(MEDS_FILE, JSON.stringify(meds, null, 2));
    console.log(`Successfully processed bulk import of ${newMeds.length} items.`);
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
