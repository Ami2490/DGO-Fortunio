import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    const saVar = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (saVar) {
      const serviceAccount = JSON.parse(saVar);
      
      // Corrección para saltos de línea en la clave privada si vienen escapados
      if (serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      }

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log("Firebase Admin inicializado correctamente.");
    } else {
      console.error("ERROR: Variable de entorno FIREBASE_SERVICE_ACCOUNT no encontrada.");
    }
  } catch (error) {
    console.error("Error crítico al inicializar Firebase Admin:", error);
  }
}

export const adminDb = admin.firestore();
