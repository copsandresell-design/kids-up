import { DEFAULT_BADGE_DEFS } from './badges'
import { uid } from './id'
import { DEFAULT_RANK_DEFS } from './ranks'
import { DEFAULT_STREAK_DEFS } from './streak'
import type {
  AppNotification,
  AuditLog,
  Message,
  PenaltyRule,
  PointsTransaction,
  Redemption,
  RewardClaim,
  SavingsGoal,
  Settings,
  ShopItem,
  Task,
  TaskSubmission,
  TaskSuggestion,
  Transaction,
  User,
} from '../types'

// Jeu de données statique pour le mode démo (voir store/demoStore.ts) : une famille fictive,
// totalement déconnectée de Supabase, qui sert à faire découvrir l'app sans exposer les
// vraies données de la famille (ni risquer que l'invité les modifie). Reconstruit à chaque
// chargement de page (les id sont générés au chargement du module, pas figés), mais toujours
// interne cohérente : mêmes id réutilisés entre tâches/soumissions/transactions ci-dessous.

const DAY = 24 * 60 * 60 * 1000
const now = Date.now()
/** Timestamp à `daysAgo` jours, à `hour`h locale — donne un historique qui reste crédible quel que soit le jour de consultation. */
function at(daysAgo: number, hour = 9, minute = 0): number {
  const d = new Date(now - daysAgo * DAY)
  d.setHours(hour, minute, 0, 0)
  return d.getTime()
}

export const demoParent: User = {
  id: uid(),
  role: 'parent',
  name: 'Alex',
  email: 'demo@kidsup.family',
  secretHash: '',
  secretSalt: '',
  usesDefaultSecret: false,
  avatar: '🧑‍🚀',
  color: '#911DE6',
  createdAt: at(60),
  isActive: true,
}

export const demoNina: User = {
  id: uid(),
  role: 'child',
  name: 'Nina',
  secretHash: '',
  secretSalt: '',
  usesDefaultSecret: false,
  avatar: '🦄',
  color: '#EC4899',
  createdAt: at(60),
  isActive: true,
}

export const demoSacha: User = {
  id: uid(),
  role: 'child',
  name: 'Sacha',
  secretHash: '',
  secretSalt: '',
  usesDefaultSecret: false,
  avatar: '🐯',
  color: '#3B82F6',
  createdAt: at(60),
  isActive: true,
}

export const demoMilo: User = {
  id: uid(),
  role: 'child',
  name: 'Milo',
  secretHash: '',
  secretSalt: '',
  usesDefaultSecret: false,
  avatar: '🐸',
  color: '#22C55E',
  createdAt: at(60),
  isActive: true,
}

export const demoUsers: User[] = [demoParent, demoNina, demoSacha, demoMilo]
const ALL_KIDS = [demoNina.id, demoSacha.id, demoMilo.id]

const taskBase = { createdBy: demoParent.id, createdAt: at(60), isActive: true }

export const taskTable: Task = { ...taskBase, id: uid(), title: 'Mettre la table', points: 10, category: 'cuisine', icon: '🍽️', type: 'recurrente', recurrence: { frequency: 'daily' }, assignedTo: ALL_KIDS, difficulty: 'easy' }
export const taskClear: Task = { ...taskBase, id: uid(), title: 'Débarrasser la table', points: 10, category: 'cuisine', icon: '🧽', type: 'recurrente', recurrence: { frequency: 'daily' }, assignedTo: ALL_KIDS, difficulty: 'easy' }
export const taskRoom: Task = { ...taskBase, id: uid(), title: 'Ranger sa chambre', points: 10, category: 'rangement', icon: '🛏️', type: 'recurrente', recurrence: { frequency: 'daily' }, assignedTo: ALL_KIDS, difficulty: 'medium' }
export const taskTrash: Task = { ...taskBase, id: uid(), title: 'Vider les poubelles', points: 20, category: 'menage', icon: '🗑️', type: 'recurrente', recurrence: { frequency: 'twice-weekly' }, assignedTo: [demoSacha.id, demoMilo.id], difficulty: 'easy' }
export const taskLaundry: Task = { ...taskBase, id: uid(), title: 'Ramasser le linge', points: 25, category: 'linge', icon: '👕', type: 'recurrente', recurrence: { frequency: 'twice-weekly' }, assignedTo: ALL_KIDS, difficulty: 'easy' }
export const taskHomework: Task = { ...taskBase, id: uid(), title: 'Réviser une leçon 15 min', points: 30, category: 'devoirs', icon: '✏️', type: 'recurrente', recurrence: { frequency: 'twice-weekly' }, assignedTo: ALL_KIDS, difficulty: 'medium' }
export const taskVacuum: Task = { ...taskBase, id: uid(), title: "Passer l'aspirateur", points: 55, category: 'menage', icon: '🧹', type: 'recurrente', recurrence: { frequency: 'weekly', dayOfWeek: 5 }, assignedTo: [demoNina.id, demoSacha.id], difficulty: 'medium' }
export const taskPlants: Task = { ...taskBase, id: uid(), title: 'Arroser les plantes', points: 25, category: 'autre', icon: '🌱', type: 'recurrente', recurrence: { frequency: 'weekly', dayOfWeek: 0 }, assignedTo: [demoMilo.id], difficulty: 'easy' }
export const taskCook: Task = { ...taskBase, id: uid(), title: 'Aider à préparer le repas', points: 75, category: 'cuisine', icon: '🍳', type: 'recurrente', recurrence: { frequency: 'weekly', dayOfWeek: 4 }, assignedTo: ALL_KIDS, difficulty: 'hard' }
export const taskTeeth: Task = { ...taskBase, id: uid(), title: 'Se brosser les dents', points: 5, category: 'autre', icon: '🦷', type: 'recurrente', recurrence: { frequency: 'daily' }, assignedTo: ALL_KIDS, difficulty: 'easy', dailyLimit: 2 }
export const taskHomeworkInitiative: Task = { ...taskBase, id: uid(), title: "Faire ses devoirs sans qu'on le demande", points: 35, category: 'devoirs', icon: '📚', type: 'recurrente', recurrence: { frequency: 'twice-weekly' }, assignedTo: ALL_KIDS, difficulty: 'medium' }
export const taskNeighbor: Task = { ...taskBase, id: uid(), title: 'Aider un voisin', points: 40, category: 'autre', icon: '🤝', type: 'ponctuelle', assignedTo: [demoNina.id], difficulty: 'medium' }

export const demoTasks: Task[] = [
  taskTable, taskClear, taskRoom, taskTrash, taskLaundry, taskHomework,
  taskVacuum, taskPlants, taskCook, taskTeeth, taskHomeworkInitiative, taskNeighbor,
]

/** Construit une paire soumission approuvée + transaction de points cohérente. */
function approved(
  childId: string,
  task: Task,
  daysAgo: number,
  opts: { isInitiative?: boolean; fast?: boolean; hour?: number } = {},
): { submission: TaskSubmission; ptx: PointsTransaction } {
  const submittedAt = at(daysAgo, opts.hour ?? 17, 30)
  const reviewedAt = opts.fast ? submittedAt + 12 * 60 * 1000 : submittedAt + 3 * 60 * 60 * 1000
  const submission: TaskSubmission = {
    id: uid(),
    taskId: task.id,
    childId,
    status: 'approved',
    isInitiative: !!opts.isInitiative,
    submittedAt,
    reviewedAt,
    reviewedBy: demoParent.id,
    bonusApplied: !!opts.isInitiative,
  }
  const ptx: PointsTransaction = {
    id: uid(),
    childId,
    type: 'task_approval',
    amount: task.points + (opts.isInitiative ? 15 : 0),
    description: `${task.icon} ${task.title}${opts.isInitiative ? ' ⭐ initiative' : ''}`,
    relatedTo: submission.id,
    createdBy: demoParent.id,
    createdAt: reviewedAt,
  }
  return { submission, ptx }
}

const ninaHistory = [
  approved(demoNina.id, taskTable, 13),
  approved(demoNina.id, taskRoom, 12),
  approved(demoNina.id, taskTeeth, 11),
  approved(demoNina.id, taskHomework, 10),
  approved(demoNina.id, taskTable, 9),
  approved(demoNina.id, taskLaundry, 8),
  approved(demoNina.id, taskRoom, 7, { isInitiative: true }),
  approved(demoNina.id, taskTeeth, 6),
  approved(demoNina.id, taskCook, 5),
  approved(demoNina.id, taskTable, 2, { fast: true }),
  approved(demoNina.id, taskRoom, 1),
  approved(demoNina.id, taskTeeth, 0, { hour: 8 }),
]

const sachaHistory = [
  approved(demoSacha.id, taskTable, 9),
  approved(demoSacha.id, taskTrash, 6),
  approved(demoSacha.id, taskLaundry, 5),
  approved(demoSacha.id, taskVacuum, 4),
  approved(demoSacha.id, taskTable, 2),
]

const miloHistory = [
  approved(demoMilo.id, taskPlants, 8),
  approved(demoMilo.id, taskRoom, 4),
  approved(demoMilo.id, taskTable, 3),
]

const sachaRejected: TaskSubmission = {
  id: uid(),
  taskId: taskHomework.id,
  childId: demoSacha.id,
  status: 'rejected',
  isInitiative: false,
  submittedAt: at(3, 18, 0),
  reviewedAt: at(3, 19, 0),
  reviewedBy: demoParent.id,
  rejectionReason: 'À refaire proprement, merci !',
  bonusApplied: false,
}

const sachaPending: TaskSubmission = {
  id: uid(),
  taskId: taskVacuum.id,
  childId: demoSacha.id,
  status: 'pending',
  isInitiative: false,
  comment: "Terminé, j'ai aussi fait sous le canapé !",
  submittedAt: at(0, 16, 45),
  bonusApplied: false,
}

export const demoSubmissions: TaskSubmission[] = [
  ...ninaHistory.map((h) => h.submission),
  ...sachaHistory.map((h) => h.submission),
  ...miloHistory.map((h) => h.submission),
  sachaRejected,
  sachaPending,
]

// Récompenses déjà méritées historiquement (badges/séries) : rewardClaims + points bonus
// correspondants, exactement comme le ferait checkRewards() en conditions réelles — pour que
// les totaux affichés (points, badges débloqués) restent cohérents entre eux.
const ninaBadgeStart: RewardClaim = { id: uid(), childId: demoNina.id, key: 'badge:demarrage', createdAt: at(13) }
const ninaBadgeTen: RewardClaim = { id: uid(), childId: demoNina.id, key: 'badge:tache-10', createdAt: at(1) }
const ninaBadgeFast: RewardClaim = { id: uid(), childId: demoNina.id, key: 'badge:rapidite', createdAt: at(2) }
const ninaStreakSeven: RewardClaim = { id: uid(), childId: demoNina.id, key: 'streak:global:7', createdAt: at(20) }
const sachaBadgeStart: RewardClaim = { id: uid(), childId: demoSacha.id, key: 'badge:demarrage', createdAt: at(9) }
const sachaBadgeShop: RewardClaim = { id: uid(), childId: demoSacha.id, key: 'badge:premier-echange', createdAt: at(4) }
const miloBadgeStart: RewardClaim = { id: uid(), childId: demoMilo.id, key: 'badge:demarrage', createdAt: at(8) }

export const demoRewardClaims: RewardClaim[] = [
  ninaBadgeStart, ninaBadgeTen, ninaBadgeFast, ninaStreakSeven, sachaBadgeStart, sachaBadgeShop, miloBadgeStart,
]

const bonusPtx = (childId: string, claim: RewardClaim, points: number, title: string): PointsTransaction => ({
  id: uid(),
  childId,
  type: claim.key.startsWith('streak:') ? 'streak_bonus' : 'badge',
  amount: points,
  description: title,
  createdBy: demoParent.id,
  createdAt: claim.createdAt,
})

export const demoPointsTransactions: PointsTransaction[] = [
  ...ninaHistory.map((h) => h.ptx),
  ...sachaHistory.map((h) => h.ptx),
  ...miloHistory.map((h) => h.ptx),
  bonusPtx(demoNina.id, ninaBadgeStart, 20, 'Badge débloqué : 🚀 Démarrage'),
  bonusPtx(demoNina.id, ninaBadgeTen, 30, 'Badge débloqué : 🥉 10 tâches'),
  bonusPtx(demoNina.id, ninaBadgeFast, 25, 'Badge débloqué : ⚡ Rapidité'),
  bonusPtx(demoNina.id, ninaStreakSeven, 40, '🔥 Série quotidienne — 7 jours !'),
  bonusPtx(demoSacha.id, sachaBadgeStart, 20, 'Badge débloqué : 🚀 Démarrage'),
  bonusPtx(demoSacha.id, sachaBadgeShop, 20, 'Badge débloqué : 🛍️ Premier échange'),
  bonusPtx(demoMilo.id, miloBadgeStart, 20, 'Badge débloqué : 🚀 Démarrage'),
  // Petite conversion de points en argent pour Nina, pour montrer la fonctionnalité en action.
  { id: uid(), childId: demoNina.id, type: 'points_to_money', amount: -50, description: 'Conversion en argent (50 pts)', createdBy: demoNina.id, createdAt: at(1, 20) },
]

export const demoShopItemCinema: ShopItem = { id: uid(), title: 'Soirée cinéma', icon: '🎬', category: 'cinema', cost: 200, status: 'active', createdBy: demoParent.id, createdAt: at(50) }
export const demoShopItemResto: ShopItem = { id: uid(), title: 'Resto au choix', icon: '🍕', category: 'resto', cost: 350, status: 'active', stock: 2, createdBy: demoParent.id, createdAt: at(50) }
export const demoShopItemScreen: ShopItem = { id: uid(), title: "1h d'écran supplémentaire", icon: '🎮', category: 'ecran', cost: 80, status: 'active', createdBy: demoParent.id, createdAt: at(50) }
export const demoShopItemWish: ShopItem = { id: uid(), title: 'Sortie accrobranche', icon: '🌳', category: 'sortie', status: 'proposed', proposedBy: demoMilo.id, createdBy: demoMilo.id, createdAt: at(2) }

export const demoShopItems: ShopItem[] = [demoShopItemCinema, demoShopItemResto, demoShopItemScreen, demoShopItemWish]

export const demoTaskSuggestionCarwash: TaskSuggestion = {
  id: uid(),
  childId: demoMilo.id,
  title: 'Laver la voiture avec papa',
  description: 'Je rince pendant que quelqu’un savonne',
  icon: '🚗',
  category: 'autre',
  suggestedPoints: 30,
  status: 'pending',
  createdAt: at(1, 11),
}

export const demoTaskSuggestionRejected: TaskSuggestion = {
  id: uid(),
  childId: demoSacha.id,
  title: 'Ne rien faire et gagner des points quand même',
  icon: '😅',
  category: 'autre',
  suggestedPoints: 100,
  status: 'rejected',
  rejectionReason: "Sympa d'essayer, mais il faut vraiment faire quelque chose ! 😄",
  reviewedAt: at(6, 12),
  reviewedBy: demoParent.id,
  createdAt: at(7),
}

export const demoTaskSuggestions: TaskSuggestion[] = [demoTaskSuggestionCarwash, demoTaskSuggestionRejected]

export const demoRedemptions: Redemption[] = [
  {
    id: uid(),
    childId: demoSacha.id,
    itemId: demoShopItemScreen.id,
    title: demoShopItemScreen.title,
    icon: demoShopItemScreen.icon,
    cost: demoShopItemScreen.cost!,
    status: 'fulfilled',
    requestedAt: at(4, 12),
    fulfilledAt: at(4, 18),
    fulfilledBy: demoParent.id,
  },
]

export const demoPenaltyRules: PenaltyRule[] = [
  {
    id: uid(),
    childId: demoMilo.id,
    title: 'Chambre pas rangée le dimanche soir',
    amount: 50,
    recurrence: { frequency: 'weekly', dayOfWeek: 6 },
    active: true,
    createdBy: demoParent.id,
    createdAt: at(40),
  },
]

export const demoTransactions: Transaction[] = [
  {
    id: uid(),
    type: 'penalty',
    childId: demoMilo.id,
    amount: -50,
    description: '⚠️ Retard au coucher',
    createdBy: demoParent.id,
    createdAt: at(3, 21),
  },
  {
    id: uid(),
    type: 'points_conversion',
    childId: demoNina.id,
    amount: 50,
    description: '💱 Conversion de 50 points',
    createdBy: demoNina.id,
    createdAt: at(1, 20),
  },
]

export const demoSavingsGoals: SavingsGoal[] = [
  { id: uid(), childId: demoSacha.id, title: 'Nouveau jeu vidéo', icon: '🎮', targetAmount: 3000, createdBy: demoSacha.id, createdAt: at(20) },
]

export const demoStreakDefs = DEFAULT_STREAK_DEFS
export const demoBadgeDefs = DEFAULT_BADGE_DEFS
export const demoRankDefs = DEFAULT_RANK_DEFS

export const demoSettings: Settings = {
  familyName: 'Famille Démo',
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
    recurringPenalties: true,
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
  weeklyPointsCap: { enabled: false, amount: 500 },
  dailyReminder: { enabled: false, hour: 18 },
}

export const demoMessages: Message[] = [
  { id: uid(), fromId: demoParent.id, toChildId: demoNina.id, text: 'Bien joué pour cette semaine ! 💪', createdAt: at(1, 19) },
]

export const demoNotifications: AppNotification[] = [
  {
    id: uid(),
    userId: demoParent.id,
    userName: demoParent.name,
    type: 'task_submitted',
    title: 'Sacha a terminé une tâche',
    message: "Passer l'aspirateur · à valider",
    icon: '🧹',
    read: false,
    createdAt: at(0, 16, 45),
    link: '/parent/validations',
  },
  {
    id: uid(),
    userId: demoNina.id,
    userName: demoNina.name,
    type: 'reward_earned',
    title: '+30 points !',
    message: 'Badge débloqué : 🥉 10 tâches',
    icon: '🏅',
    read: true,
    createdAt: at(1),
    link: '/enfant/profil',
  },
  {
    id: uid(),
    userId: demoParent.id,
    userName: demoParent.name,
    type: 'task_suggestion_submitted',
    title: 'Nouvelle proposition de tâche 💡',
    message: `${demoMilo.name} propose : ${demoTaskSuggestionCarwash.title}`,
    icon: demoTaskSuggestionCarwash.icon,
    read: false,
    createdAt: demoTaskSuggestionCarwash.createdAt,
    link: '/parent/taches',
  },
]

export const demoLogs: AuditLog[] = [
  { id: uid(), action: 'seed', actorId: demoParent.id, details: 'Création de la famille et des tâches de base', timestamp: at(60) },
  { id: uid(), action: 'task_created', actorId: demoParent.id, details: `« ${taskVacuum.title} » (${taskVacuum.points} pts)`, timestamp: at(55) },
  { id: uid(), action: 'submission_approved', actorId: demoParent.id, subjectId: demoNina.id, details: `« ${taskCook.title} » (+${taskCook.points} pts)`, timestamp: at(5) },
  { id: uid(), action: 'reward_earned', actorId: demoParent.id, subjectId: demoNina.id, details: 'Badge débloqué : 🥉 10 tâches (+30 pts)', timestamp: at(1) },
  { id: uid(), action: 'redemption_fulfilled', actorId: demoParent.id, subjectId: demoSacha.id, details: `« ${demoShopItemScreen.title} »`, timestamp: at(4, 18) },
  { id: uid(), action: 'penalty_applied', actorId: demoParent.id, subjectId: demoMilo.id, amount: -50, details: 'Retard au coucher', timestamp: at(3, 21) },
  { id: uid(), action: 'submission_rejected', actorId: demoParent.id, subjectId: demoSacha.id, details: `« ${taskHomework.title} » — À refaire proprement, merci !`, timestamp: at(3, 19) },
  { id: uid(), action: 'wish_submitted', actorId: demoMilo.id, subjectId: demoMilo.id, details: `« ${demoShopItemWish.title} »`, timestamp: at(2) },
  { id: uid(), action: 'task_suggestion_submitted', actorId: demoMilo.id, subjectId: demoMilo.id, details: `« ${demoTaskSuggestionCarwash.title} » (${demoTaskSuggestionCarwash.suggestedPoints} pts suggérés)`, timestamp: demoTaskSuggestionCarwash.createdAt },
  { id: uid(), action: 'task_suggestion_rejected', actorId: demoParent.id, subjectId: demoSacha.id, details: `« ${demoTaskSuggestionRejected.title} » — ${demoTaskSuggestionRejected.rejectionReason}`, timestamp: demoTaskSuggestionRejected.reviewedAt! },
].sort((a, b) => b.timestamp - a.timestamp)
