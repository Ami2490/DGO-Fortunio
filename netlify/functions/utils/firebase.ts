import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  projectId: "distribuidoradgo",
  appId: "1:426156884455:web:872cf38febc9bf447f3d42",
  apiKey: "AIzaSyD5u_6UrDCQ287oeopDsIj6DGTfPUcVxKM",
  authDomain: "distribuidoradgo.firebaseapp.com",
  storageBucket: "distribuidoradgo.firebasestorage.app",
  messagingSenderId: "426156884455",
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
export const db = getFirestore(app);
export const DB_PATHS = {
  ORDERS: 'orders'
};
