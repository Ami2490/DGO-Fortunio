import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, addDoc } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

  const app = initializeApp(config);
  const db = getFirestore(app);

  const categoriesPath = 'dgo/data/categories';
  const productsPath = 'dgo/data/products';

  console.log('Fetching categories...');
  const catSnap = await getDocs(collection(db, categoriesPath));
  const categories = catSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  if (categories.length === 0) {
    console.log('No categories found.');
    return;
  }

  console.log(`Found ${categories.length} categories. Adding demo products...`);

  for (const cat of categories) {
    const demoItems = [
      { name: `Demo ${cat.name} 1`, price: 150, description: `Producto de prueba para ${cat.name}. Calidad DGO.` },
      { name: `Demo ${cat.name} 2`, price: 280, description: `Bandeja/Vaso premium de ${cat.name}.` }
    ];

    for (const item of demoItems) {
      await addDoc(collection(db, productsPath), {
        ...item,
        categoryId: cat.id,
        category: cat.name,
        image: '', 
        images: [],
        stock: 100,
        featured: false,
        active: true,
        createdAt: new Date().toISOString()
      });
      console.log(`Added ${item.name} to ${cat.name}`);
    }
  }

  console.log('Done!');
}

main().catch(console.error);
