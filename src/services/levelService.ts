import { collection, doc, getDocs, setDoc, query, orderBy } from 'firebase/firestore';
import { db, DB_PATHS } from '../firebase';

export interface LevelConfig {
  id: string;
  level: string;
  label: string;
  minPoints: number;
  discountPercent: number;
  emoji: string;
  color: string;
}

const LEVELS_COLLECTION = [DB_PATHS.ROOT, DB_PATHS.LEVEL_CONFIG].filter(Boolean).join('/');

const DEFAULT_LEVELS: LevelConfig[] = [
  { id: 'bronce',   level: 'bronce',   label: 'Bronce',   minPoints: 0,   discountPercent: 0,  emoji: '🥉', color: '#CD7F32' },
  { id: 'plata',    level: 'plata',    label: 'Plata',    minPoints: 100, discountPercent: 5,  emoji: '🥈', color: '#C0C0C0' },
  { id: 'oro',      level: 'oro',      label: 'Oro',      minPoints: 300, discountPercent: 10, emoji: '🥇', color: '#FFD700' },
  { id: 'diamante', level: 'diamante', label: 'Diamante', minPoints: 600, discountPercent: 15, emoji: '💎', color: '#B9F2FF' },
];

export async function getLevelConfigs(): Promise<LevelConfig[]> {
  try {
    const q = query(collection(db, LEVELS_COLLECTION), orderBy('minPoints', 'asc'));
    const snap = await getDocs(q);
    if (snap.empty) {
      await Promise.all(DEFAULT_LEVELS.map(l => setDoc(doc(db, LEVELS_COLLECTION, l.id), l)));
      return DEFAULT_LEVELS;
    }
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as LevelConfig));
  } catch {
    return DEFAULT_LEVELS;
  }
}

export async function updateLevelConfig(config: LevelConfig): Promise<void> {
  await setDoc(doc(db, LEVELS_COLLECTION, config.id), config);
}

export function getLevelFromPoints(points: number, levels: LevelConfig[]): LevelConfig {
  let current = levels[0];
  for (const level of levels) {
    if (points >= level.minPoints) current = level;
  }
  return current;
}
