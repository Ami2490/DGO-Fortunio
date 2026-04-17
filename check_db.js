import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkPaths() {
  const paths = [
    'categories',
    'dgo/data/categories',
    'products',
    'dgo/data/products',
    'config',
    'dgo/data/settings'
  ];

  for (const p of paths) {
    try {
      const snap = await getDocs(collection(db, p));
      console.log(`Path [${p}]: ${snap.size} documents found.`);
    } catch (e) {
      console.log(`Path [${p}]: Error - ${e.message}`);
    }
  }
}

checkPaths().then(() => process.exit(0));
