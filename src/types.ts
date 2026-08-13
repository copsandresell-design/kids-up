// Tous les montants sont stockés en centimes (entiers) pour éviter les erreurs de flottants.

export type Role = 'parent' | 'child'
export type Category = 'cuisine' | 'menage' | 'linge' | 'rangement' | 'devoirs' | 'autre'
export type Difficulty = 'easy' | 'medium' | 'hard'
export type Frequency = 'daily' | 'twice-weekly' | 'weekly' | 'monthly'
export type TaskType = 'ponctuelle' | 'recurrente'
export type SubmissionStatus = 'pending' | 'approved' | 'rejected'
export type TransactionType =
  /** Historique uniquement : avant la bascule tâches → points, valider une tâche créditait de l'argent. */
  | 'task_approval'
  | 'penalty'
  | 'penalty_cancel'
  | 'manual_adjustment'
  | 'approval_reverted'
  | 'points_conversion'
export type Theme = 'light' | 'dark' | 'auto'

export interface User {
  id: string
  role: Role
  name: string
  email?: string
  secretHash: string
  secretSalt: string
  usesDefaultSecret: boolean
  avatar: string
  photoId?: string
  color: string
  createdAt: number
  isActive: boolean
  /** Date de naissance (ms epoch), optionnelle — sert à dériver le groupe d'âge (voir lib/ageGroup.ts). */
  birthdate?: number
}

/** « Petit » vs « Grand » : dérivé de birthdate + Settings.ageGroupThresholdYears, jamais stocké (voir lib/ageGroup.ts). */
export type AgeGroup = 'petit' | 'grand'

export interface Recurrence {
  frequency: Frequency
  /** 0 = lundi … 6 = dimanche */
  dayOfWeek?: number
  /** 1–28 */
  dayOfMonth?: number
}

export interface Task {
  id: string
  title: string
  description?: string
  /** Récompense en points (monnaie de la Boutique) — valider une tâche ne donne plus d'argent directement. */
  points: number
  category: Category
  icon: string
  type: TaskType
  recurrence?: Recurrence
  assignedTo: string[]
  difficulty: Difficulty
  dueDate?: number
  /** Nombre de fois soumissible/validable par jour. undefined ou 1 = comportement historique (une fois). */
  dailyLimit?: number
  createdBy: string
  createdAt: number
  isActive: boolean
}

export interface TaskSubmission {
  id: string
  taskId: string
  childId: string
  status: SubmissionStatus
  isInitiative: boolean
  photoIds?: string[]
  comment?: string
  submittedAt: number
  reviewedAt?: number
  reviewedBy?: string
  rejectionReason?: string
  bonusApplied: boolean
}

export type TaskSuggestionStatus = 'pending' | 'approved' | 'rejected'

/**
 * Idée de tâche proposée par un enfant, à valider par un parent avant de devenir une vraie
 * tâche active (voir saveTask/approveTaskSuggestion) — même principe que les vœux de boutique
 * (ShopItem status 'proposed'), mais gardée en historique (jamais supprimée) même refusée,
 * pour que l'enfant voie l'état de ses propositions passées.
 */
export interface TaskSuggestion {
  id: string
  childId: string
  title: string
  description?: string
  icon: string
  category: Category
  suggestedPoints: number
  status: TaskSuggestionStatus
  rejectionReason?: string
  reviewedAt?: number
  reviewedBy?: string
  /** Id de la tâche réellement créée à l'approbation, pour relier l'historique à la tâche active. */
  createdTaskId?: string
  createdAt: number
}

export interface Message {
  id: string
  fromId: string
  toChildId: string
  text: string
  createdAt: number
}

export interface Transaction {
  id: string
  type: TransactionType
  childId: string
  amount: number
  description: string
  relatedTo?: string
  cancelled?: boolean
  createdBy: string
  createdAt: number
}

export interface AuditLog {
  id: string
  action: string
  actorId: string
  subjectId?: string
  /** Id de l'entité concernée (soumission, transaction…) — permet un "annuler" ciblé depuis le Journal. */
  relatedId?: string
  amount?: number
  details: string
  timestamp: number
}

/** Fonctionnalités optionnelles activables/désactivables par les parents (Réglages). */
export interface FeatureFlags {
  savingsGoals: boolean
  streaks: boolean
  leaderboard: boolean
  shop: boolean
  inactivityPenalties: boolean
  recurringPenalties: boolean
  taskSuggestions: boolean
}

/** Pénalité automatique appliquée par le cron quotidien quand un enfant est inactif. */
export interface InactivityPenaltySettings {
  /** Nombre de jours sans tâche validée avant la première pénalité. */
  thresholdDays: number
  baseAmountCents: number
  baseAmountPoints: number
  applyMoney: boolean
  applyPoints: boolean
  /** Aggravation : montant(jour n) = base × n × severityMultiplier, n = jours au-delà du seuil (1, 2, 3…). */
  severityMultiplier: number
}

/** Filet de sécurité optionnel : borne le total de points gagnables par un enfant sur une semaine. */
export interface WeeklyPointsCapSettings {
  enabled: boolean
  amount: number
}

/**
 * Rappel automatique (cron quotidien) pour les enfants n'ayant encore rien signalé dans la
 * journée. `hour` est vérifié dans le fuseau Europe/Paris — voir api/daily-reminder.ts pour
 * la limite de fréquence du cron (une seule vérification par jour sur le plan Vercel Hobby).
 */
export interface DailyReminderSettings {
  enabled: boolean
  hour: number
}

export interface Settings {
  familyName: string
  /**
   * Bonus pour une tâche faite sans qu'on le demande, en % du barème de la tâche (ex: 20 =
   * +20%) — proportionnel plutôt qu'un montant fixe, pour rester cohérent qu'une tâche vaille
   * 10 ou 300 points (voir useStore.ts approveSubmission et lib/points.ts computeInitiativeBonus).
   */
  initiativeBonusPercent: number
  minBalance: number
  theme: Theme
  features: FeatureFlags
  /** Taux de conversion points → argent (ex: 100 = 100 points valent 1 €). */
  pointsPerEuro: number
  inactivityPenalty: InactivityPenaltySettings
  weeklyPointsCap: WeeklyPointsCapSettings
  dailyReminder: DailyReminderSettings
  /**
   * Âge (en années) à partir duquel un enfant est « grand » plutôt que « petit » (voir
   * lib/ageGroup.ts). `undefined` = fonctionnalité non activée : tant qu'aucun seuil n'est
   * réglé, tous les enfants sont traités pareil (aucun changement de comportement).
   */
  ageGroupThresholdYears?: number
  /** Multiplicateurs de points appliqués au gain d'une tâche selon le groupe d'âge (1 = neutre). */
  pointsMultiplierPetit: number
  pointsMultiplierGrand: number
}

/** Objectif d'épargne fixé par un enfant (ex: un jeu vidéo à 30€). */
export interface SavingsGoal {
  id: string
  childId: string
  title: string
  icon: string
  targetAmount: number
  createdBy: string
  createdAt: number
  achievedAt?: number
}

export interface Session {
  userId: string
  role: Role
  expiresAt: number
}

export type NotificationType =
  | 'task_assigned'
  | 'task_submitted'
  | 'task_approved'
  | 'task_rejected'
  | 'message'
  | 'penalty'
  | 'reward_earned'
  | 'wish_submitted'
  | 'wish_decided'
  | 'redemption_requested'
  | 'redemption_fulfilled'
  | 'task_suggestion_submitted'
  | 'task_suggestion_decided'
  /** Don, prêt ou remboursement reçu d'un autre enfant, ou ajustement manuel d'un parent. */
  | 'points_received'

/** Monnaie séparée de l'argent : gagnée via tâches/badges/séries, dépensée dans la Boutique. */
export type PointsTransactionType =
  | 'task_approval'
  | 'task_approval_reverted'
  | 'badge'
  /** Retrait d'un badge débloqué par erreur (voir revokeBadgeClaim) — reprend les points crédités. */
  | 'badge_reverted'
  | 'streak_bonus'
  /** Retrait d'un palier de série crédité par erreur (voir revokeBadgeClaim, cas streak_tier). */
  | 'streak_reverted'
  | 'shop_redeem'
  | 'shop_refund'
  | 'points_to_money'
  | 'manual_adjustment'
  /** Transfert entre enfants (voir lib/loans.ts) : don (aucun suivi de remboursement)… */
  | 'points_gift_sent'
  | 'points_gift_received'
  /** …ou prêt (suivi de dette reconstruit depuis ces transactions, jamais stocké séparément). */
  | 'points_loan_sent'
  | 'points_loan_received'
  | 'points_loan_repay_sent'
  | 'points_loan_repay_received'

export interface PointsTransaction {
  id: string
  childId: string
  type: PointsTransactionType
  /** Positif = gain, négatif = dépense. */
  amount: number
  description: string
  relatedTo?: string
  createdBy: string
  createdAt: number
}

/** Marqueur d'idempotence : empêche de recréditer deux fois le même badge/palier de série. */
export interface RewardClaim {
  id: string
  childId: string
  /** ex: 'badge:demarrage' ou 'streak:global:7' */
  key: string
  createdAt: number
}

export type StreakKind = 'global' | 'no_penalty' | 'task'

export interface StreakTier {
  days: number
  points: number
}

/**
 * Définition administrable d'une série (Réglages → Séries) : le "genre" de série (globale,
 * sans pénalité, liée à une tâche précise) reste un ensemble fixe de mécanismes calculables
 * dans le code (voir src/lib/streak.ts), mais quelles séries existent, leurs paliers et leurs
 * bonus sont des données modifiables sans redéploiement.
 */
export interface StreakDef {
  id: string
  kind: StreakKind
  label: string
  emoji: string
  /** Requis si kind === 'task' : la tâche dont on compte les jours consécutifs de validation. */
  taskId?: string
  tiers: StreakTier[]
  isActive: boolean
  createdBy: string
  createdAt: number
}

/**
 * Genre de badge : mécanisme de calcul fixe (voir src/lib/badges.ts). Le catalogue d'instances
 * (BadgeDef) — quels badges existent, leurs seuils, libellés, points — est administrable.
 */
export type BadgeKind =
  | 'lifetime_tasks'
  | 'category_specialist'
  | 'streak_tier'
  | 'fast_approval'
  | 'initiative'
  | 'best_week'
  | 'perfectionist'
  | 'family_points'
  | 'month_mvp'
  | 'lifetime_points'
  | 'savings_goal'
  | 'shop_first_exchange'
  | 'zero_penalty'
  | 'family_complete'

export interface BadgeDefParams {
  threshold?: number
  category?: Category
  streakDefId?: string
  days?: number
  hours?: number
}

export interface BadgeDef {
  id: string
  kind: BadgeKind
  label: string
  emoji: string
  description: string
  points: number
  params: BadgeDefParams
  isActive: boolean
  createdBy: string
  createdAt: number
}

/** Palier de la progression à vie (jamais dégressive, indépendante du solde de points dépensable). */
export interface RankDef {
  id: string
  label: string
  emoji: string
  color: string
  /** Points cumulés à vie requis pour atteindre ce rang. */
  threshold: number
  createdBy: string
  createdAt: number
}

/** Règle de pénalité récurrente créée par un parent (ex : chambre pas rangée le dimanche soir). */
export interface PenaltyRule {
  id: string
  childId: string
  title: string
  amount: number
  /** Fréquences pertinentes pour une règle sans historique de soumissions : quotidienne, hebdo ou mensuelle. */
  recurrence: Recurrence
  active: boolean
  createdBy: string
  createdAt: number
}

export type ShopCategory = 'cinema' | 'resto' | 'jeu_video' | 'sortie' | 'ecran' | 'cadeau'
export type ShopItemStatus = 'proposed' | 'active' | 'archived'

/** Lot de la boutique (catalogue parent) ou vœu proposé par un enfant (status 'proposed', coût absent). */
export interface ShopItem {
  id: string
  title: string
  icon: string
  category: ShopCategory
  cost?: number
  status: ShopItemStatus
  /** Quantité disponible. undefined = illimité. 0 = épuisé (le parent réapprovisionne en augmentant ce nombre). */
  stock?: number
  proposedBy?: string
  /** Groupe d'âge auquel ce lot est réservé. undefined = commun, visible de tous (dont les lots déjà existants). */
  ageGroup?: AgeGroup
  createdBy: string
  createdAt: number
}

export type RedemptionStatus = 'pending' | 'fulfilled' | 'cancelled'

/** Échange de points contre un lot — historique conservé même si le lot du catalogue change ensuite. */
export interface Redemption {
  id: string
  childId: string
  itemId: string
  title: string
  icon: string
  cost: number
  status: RedemptionStatus
  requestedAt: number
  fulfilledAt?: number
  fulfilledBy?: string
}

export interface AppNotification {
  id: string
  /** Destinataire (id local à l'appareil émetteur) */
  userId: string
  /** Nom du destinataire — stable entre appareils, sert à router la notification reçue */
  userName?: string
  type: NotificationType
  title: string
  message: string
  icon: string
  read: boolean
  createdAt: number
  /** Route interne à ouvrir au clic */
  link?: string
}
