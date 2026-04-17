import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  updateDoc, 
  addDoc, 
  orderBy,
  setDoc
} from 'firebase/firestore';
import { db, DB_PATHS } from '../firebase';

export interface PointTransaction {
  id?: string;
  userId: string;
  points: number;
  type: 'earned' | 'spent' | 'adjusted' | 'order' | 'referral' | 'registration';
  description: string;
  reference?: string;
  createdAt: string;
}

export interface UserLevel {
  id: 'bronce' | 'plata' | 'oro' | 'diamante';
  label: string;
  minPoints: number;
  discount: number;
  emoji: string;
  color: string;
}

export const LEVEL_CONFIG: Record<string, UserLevel> = {
  bronce: { id: 'bronce', label: 'BRONCE', minPoints: 0, discount: 0, emoji: '🥉', color: '#CD7F32' },
  plata: { id: 'plata', label: 'PLATA', minPoints: 100, discount: 5, emoji: '🥈', color: '#C0C0C0' },
  oro: { id: 'oro', label: 'ORO', minPoints: 300, discount: 10, emoji: '🥇', color: '#FFD700' },
  diamante: { id: 'diamante', label: 'DIAMANTE', minPoints: 600, discount: 15, emoji: '💎', color: '#B9F2FF' }
};

export function getLevelFromPoints(points: number): UserLevel {
  if (points >= 600) return LEVEL_CONFIG.diamante;
  if (points >= 300) return LEVEL_CONFIG.oro;
  if (points >= 100) return LEVEL_CONFIG.plata;
  return LEVEL_CONFIG.bronce;
}

export async function awardPoints(
  userId: string,
  points: number,
  type: PointTransaction['type'],
  description: string,
  reference?: string
): Promise<void> {
  const userRef = doc(db, DB_PATHS.USERS, userId);
  const userSnap = await getDoc(userRef);
  
  if (!userSnap.exists()) {
    console.error('User not found for awarding points:', userId);
    return;
  }

  const userData = userSnap.data();
  const currentPoints = userData.points || 0;
  const newPoints = currentPoints + points;
  const newLevel = getLevelFromPoints(newPoints).id;

  await updateDoc(userRef, {
    points: newPoints,
    level: newLevel
  });

  await addDoc(collection(db, DB_PATHS.POINT_TRANSACTIONS), {
    userId,
    points,
    type,
    description,
    reference: reference || null,
    createdAt: new Date().toISOString()
  });
}

export async function requestPointsForOrder(
  userId: string,
  orderId: string,
  total: number
): Promise<void> {
  // Calculamos 1 punto cada $100
  const points = Math.floor(total / 100);
  
  if (points <= 0) return;

  await addDoc(collection(db, DB_PATHS.POINT_TRANSACTIONS), {
    userId,
    points,
    type: 'order',
    description: `Puntos por pedido #${orderId.substring(0, 6)}`,
    reference: orderId,
    approved: false, // Por defecto requiere entrega/pago confirmado
    createdAt: new Date().toISOString()
  });
}

export async function approveOrderPoints(orderId: string): Promise<void> {
  const q = query(
    collection(db, DB_PATHS.POINT_TRANSACTIONS),
    where('reference', '==', orderId),
    where('approved', '==', false)
  );
  
  const snap = await getDocs(q);
  if (snap.empty) return;

  const txDoc = snap.docs[0];
  const txData = txDoc.data();
  
  await awardPoints(
    txData.userId,
    txData.points,
    'earned',
    txData.description,
    orderId
  );

  // Marcar la original como procesada o simplemente eliminarla/actualizarla
  // Aquí optamos por marcarla aprobada
  await updateDoc(doc(db, DB_PATHS.POINT_TRANSACTIONS, txDoc.id), {
    approved: true
  });
}

export async function getUserTransactions(userId: string): Promise<PointTransaction[]> {
  const q = query(
    collection(db, DB_PATHS.POINT_TRANSACTIONS),
    where('userId', '==', userId)
  );
  const snap = await getDocs(q);
  const txs = snap.docs.map(d => ({ id: d.id, ...d.data() } as PointTransaction));
  return txs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function generateReferralCode(uid: string): string {
  return uid.substring(0, 6).toUpperCase();
}

export async function processReferral(newUserId: string, referralCode: string): Promise<boolean> {
  const usersRef = collection(db, DB_PATHS.USERS);
  const q = query(usersRef, where('referralCode', '==', referralCode.toUpperCase()));
  const snap = await getDocs(q);

  if (snap.empty) return false;

  const referrerDoc = snap.docs[0];
  const referrerId = referrerDoc.id;

  // Registrar quién refirió al usuario
  const newUserRef = doc(db, DB_PATHS.USERS, newUserId);
  await updateDoc(newUserRef, {
    referredBy: referrerId
  });

  // Premiar al referente (30 puntos)
  await awardPoints(
    referrerId,
    30,
    'referral',
    'Bonus por invitar a un amigo',
    newUserId
  );

  return true;
}

export async function getPendingApprovals(): Promise<PointTransaction[]> {
  const q = query(
    collection(db, DB_PATHS.POINT_TRANSACTIONS),
    where('approved', '==', false),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as PointTransaction));
}

export async function approvePoints(transactionId: string, _adminId: string): Promise<void> {
  const txRef = doc(db, DB_PATHS.POINT_TRANSACTIONS, transactionId);
  const txSnap = await getDoc(txRef);
  if (!txSnap.exists()) return;

  const txData = txSnap.data();

  await awardPoints(
    txData.userId,
    txData.points,
    'earned',
    txData.description,
    txData.reference
  );

  await updateDoc(txRef, { approved: true });
}

export async function adjustPoints(
  userId: string,
  points: number,
  description: string
): Promise<void> {
  await awardPoints(userId, points, 'adjusted', description);
}
