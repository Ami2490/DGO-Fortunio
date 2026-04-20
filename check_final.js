
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkOrders() {
  try {
    const ordersRef = collection(db, 'orders');
    const q = query(ordersRef, orderBy('createdAt', 'desc'), limit(5));
    const snap = await getDocs(q);
    
    console.log(`--- Ultimas 5 Ordenes ---`);
    snap.forEach(doc => {
      const data = doc.data();
      console.log(`ID: ${doc.id} | Status: ${data.status} | Total: $${data.total} | Email: ${data.customerEmail} | Time: ${data.createdAt?.toDate?.() || data.createdAt}`);
    });
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}

checkOrders().then(() => process.exit(0));
