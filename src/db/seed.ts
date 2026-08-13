import { hashSecret, makeSalt } from '../lib/crypto'
import { uid } from '../lib/id'
import { DEFAULT_STREAK_DEFS } from '../lib/streak'
import type { Settings, StreakDef, Task, User } from '../types'

export const DEFAULT_SECRETS: Record<string, string> = {
  Marion: 'parent',
  Julien: 'parent',
  Lorenzo: '1111',
  Kelly: '2222',
}

async function makeUser(
  base: Omit<User, 'id' | 'secretHash' | 'secretSalt' | 'usesDefaultSecret' | 'createdAt' | 'isActive'>,
  secret: string,
): Promise<User> {
  const secretSalt = makeSalt()
  return {
    ...base,
    id: uid(),
    secretHash: await hashSecret(secret, secretSalt),
    secretSalt,
    usesDefaultSecret: true,
    createdAt: Date.now(),
    isActive: true,
  }
}

export async function seedUsers(): Promise<User[]> {
  return Promise.all([
    makeUser(
      { role: 'parent', name: 'Marion', email: 'marion@kidsup.family', avatar: '🌸', color: '#F59E0B' },
      DEFAULT_SECRETS.Marion,
    ),
    makeUser(
      { role: 'parent', name: 'Julien', email: 'julien@kidsup.family', avatar: '🎸', color: '#F59E0B' },
      DEFAULT_SECRETS.Julien,
    ),
    makeUser(
      { role: 'child', name: 'Lorenzo', avatar: '⚡', color: '#3B82F6' },
      DEFAULT_SECRETS.Lorenzo,
    ),
    makeUser(
      { role: 'child', name: 'Kelly', avatar: '🌈', color: '#EC4899' },
      DEFAULT_SECRETS.Kelly,
    ),
  ])
}

// Catalogue canonique (16 tâches) : mêmes titres/points que la migration de la famille de
// production (voir supabase/migrations) — une nouvelle famille démarre avec le même barème.
export function seedTasks(users: User[]): Task[] {
  const parent = users.find((u) => u.role === 'parent')!
  const children = users.filter((u) => u.role === 'child').map((u) => u.id)
  const base = {
    assignedTo: children,
    createdBy: parent.id,
    createdAt: Date.now(),
    isActive: true,
    type: 'recurrente' as const,
  }
  return [
    // Quotidiennes
    { ...base, id: uid(), title: 'Vider le lave-vaisselle', points: 10, category: 'cuisine', icon: '🍽️', difficulty: 'easy', recurrence: { frequency: 'daily' } },
    { ...base, id: uid(), title: 'Remplir le lave-vaisselle', points: 10, category: 'cuisine', icon: '🫧', difficulty: 'easy', recurrence: { frequency: 'daily' } },
    { ...base, id: uid(), title: 'Mettre la table', points: 10, category: 'cuisine', icon: '🍽️', difficulty: 'easy', recurrence: { frequency: 'daily' } },
    { ...base, id: uid(), title: 'Débarrasser et essuyer la table', points: 10, category: 'cuisine', icon: '🧽', difficulty: 'easy', recurrence: { frequency: 'daily' } },
    { ...base, id: uid(), title: 'Ranger le canapé', points: 8, category: 'rangement', icon: '🛋️', difficulty: 'easy', recurrence: { frequency: 'daily' } },
    { ...base, id: uid(), title: 'Ranger chaussures et sac à l’entrée', points: 8, category: 'rangement', icon: '👟', difficulty: 'easy', recurrence: { frequency: 'daily' } },
    // Quotidienne, faible en points : le vrai gain vient du bonus de série (5j/20j — voir seedStreakDefs).
    { ...base, id: uid(), title: 'Se brosser les dents', points: 5, category: 'autre', icon: '🦷', difficulty: 'easy', recurrence: { frequency: 'daily' }, dailyLimit: 2 },
    // 2× par semaine
    { ...base, id: uid(), title: 'Vider les poubelles', points: 20, category: 'menage', icon: '🗑️', difficulty: 'easy', recurrence: { frequency: 'twice-weekly' } },
    { ...base, id: uid(), title: 'Ramasser le linge', points: 25, category: 'linge', icon: '👕', difficulty: 'easy', recurrence: { frequency: 'twice-weekly' } },
    { ...base, id: uid(), title: 'Étendre le linge', points: 30, category: 'linge', icon: '🧺', difficulty: 'medium', recurrence: { frequency: 'twice-weekly' } },
    { ...base, id: uid(), title: 'Réviser 15 minutes une leçon', points: 30, category: 'devoirs', icon: '✏️', difficulty: 'medium', recurrence: { frequency: 'twice-weekly' } },
    { ...base, id: uid(), title: "Faire ses devoirs sans qu'on le demande", points: 35, category: 'devoirs', icon: '📚', difficulty: 'medium', recurrence: { frequency: 'twice-weekly' } },
    // Hebdomadaires
    { ...base, id: uid(), title: 'Arroser les plantes', points: 25, category: 'autre', icon: '🌱', difficulty: 'easy', recurrence: { frequency: 'weekly', dayOfWeek: 0 } },
    { ...base, id: uid(), title: 'Passer la pièce', points: 45, category: 'menage', icon: '🪣', difficulty: 'medium', recurrence: { frequency: 'weekly', dayOfWeek: 2 } },
    { ...base, id: uid(), title: "Passer l'aspirateur", points: 55, category: 'menage', icon: '🧹', difficulty: 'medium', recurrence: { frequency: 'weekly', dayOfWeek: 5 } },
    { ...base, id: uid(), title: 'Aider à préparer le repas', points: 75, category: 'cuisine', icon: '🍳', difficulty: 'hard', recurrence: { frequency: 'weekly', dayOfWeek: 4 } },
    // Passée en quotidienne (était hebdomadaire) pour porter le streak "chambre nickel" —
    // points individuels baissés en conséquence, le vrai gain vient désormais du bonus de série.
    { ...base, id: uid(), title: 'Ranger sa chambre', points: 10, category: 'rangement', icon: '🛏️', difficulty: 'medium', recurrence: { frequency: 'daily' } },
  ]
}

/**
 * Catalogue de séries pour une nouvelle famille locale : le socle agnostique
 * (DEFAULT_STREAK_DEFS) complété par les deux séries liées à une tâche précise
 * (brossage de dents, rangement de chambre), qui ont besoin des id réels des tâches
 * fraîchement créées par seedTasks().
 */
export function seedStreakDefs(tasks: Task[]): StreakDef[] {
  const teeth = tasks.find((t) => t.title === 'Se brosser les dents')
  const room = tasks.find((t) => t.title === 'Ranger sa chambre')
  const taskStreaks: StreakDef[] = []
  if (teeth) {
    taskStreaks.push({
      id: 'brossage-dents',
      kind: 'task',
      label: 'Brossage de dents',
      emoji: '🦷',
      taskId: teeth.id,
      tiers: [
        { days: 5, points: 25 },
        { days: 20, points: 100 },
      ],
      isActive: true,
      createdBy: 'system',
      createdAt: Date.now(),
    })
  }
  if (room) {
    taskStreaks.push({
      id: 'rangement-chambre',
      kind: 'task',
      label: 'Chambre rangée',
      emoji: '🧹',
      taskId: room.id,
      tiers: [
        { days: 5, points: 30 },
        { days: 20, points: 120 },
      ],
      isActive: true,
      createdBy: 'system',
      createdAt: Date.now(),
    })
  }
  return [...DEFAULT_STREAK_DEFS, ...taskStreaks]
}

export const defaultSettings: Settings = {
  familyName: 'KidsUp',
  initiativeBonusPercent: 20,
  pointsMultiplierPetit: 1,
  pointsMultiplierGrand: 1,
  minBalance: -1000,
  theme: 'dark',
  features: {
    savingsGoals: true,
    streaks: true,
    leaderboard: true,
    shop: true,
    inactivityPenalties: false,
    // GODCLAUDE phase 3 : les pénalités automatiques (récurrentes + inactivité) restent
    // premium — une famille toute neuve (gratuite par défaut) ne doit pas démarrer avec ce
    // réglage déjà activé. La famille de Julien n'est pas concernée (ses réglages réels
    // existent déjà côté Supabase). Ajustement du 31/07 : les propositions de tâches sont
    // repassées gratuites (voir lib/access.ts), donc de nouveau activées par défaut.
    recurringPenalties: false,
    taskSuggestions: true,
  },
  pointsPerEuro: 100,
  inactivityPenalty: {
    thresholdDays: 1,
    baseAmountCents: 50,
    baseAmountPoints: 0,
    applyMoney: true,
    applyPoints: false,
    severityMultiplier: 1,
  },
  weeklyPointsCap: {
    enabled: false,
    amount: 500,
  },
  dailyReminder: {
    enabled: false,
    hour: 18,
  },
}
