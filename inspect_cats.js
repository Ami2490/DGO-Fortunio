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

async function inspectCategories() {
  const snap = await getDocs(collection(db, 'categories'));
  console.log(`Found ${snap.size} categories:`);
  snap.forEach(doc => {
    console.log(`- ${doc.id}: ${JSON.stringify(doc.data())}`);
  });
}

inspectCategories().then(() => process.exit(0));
