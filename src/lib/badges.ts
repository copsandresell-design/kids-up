import { isSameMonth, isSameWeek, startOfWeek, subWeeks } from 'date-fns'
import { computeStreakDefCount } from './streak'
import type {
  BadgeDef,
  PointsTransaction,
  Redemption,
  RewardClaim,
  SavingsGoal,
  StreakDef,
  Task,
  TaskSubmission,
  Transaction,
  User,
} from '../types'

const WEEK = { weekStartsOn: 1 as const }
const HOUR = 60 * 60 * 1000
const DAY = 24 * 60 * 60 * 1000

export interface BadgeState {
  id: string
  emoji: string
  label: string
  description: string
  unlocked: boolean
  /** Points gagnés (monnaie séparée de l'argent) au déblocage. */
  points: number
  /** Progression vers le déblocage (absente pour les badges tout-ou-rien ou déjà débloqués). */
  progress?: { current: number; target: number; unit?: string }
}

interface BadgeContext {
  childId: string
  submissions: TaskSubmission[]
  pointsTransactions: PointsTransaction[]
  transactions?: Transaction[]
  tasks?: Task[]
  savingsGoals?: SavingsGoal[]
  redemptions?: Redemption[]
  rewardClaims?: RewardClaim[]
  streakDefs?: StreakDef[]
  children: User[]
  badgeDefs?: BadgeDef[]
  now?: Date
}

/**
 * Calcule l'état de chaque badge du catalogue (badgeDefs, administrable — voir Réglages).
 * Le "genre" (BadgeKind) fixe le mécanisme de calcul ; badgeDefs ne fournit que les données
 * (seuils, libellés, points). Les badges liés à une série (streak_tier) se débloquent de façon
 * permanente via rewardClaims plutôt que par recalcul en direct, pour ne jamais "re-verrouiller"
 * un badge déjà mérité quand la série en cours se casse ensuite.
 */
export function computeBadges({
  childId,
  submissions,
  pointsTransactions,
  transactions = [],
  tasks = [],
  savingsGoals = [],
  redemptions = [],
  rewardClaims = [],
  streakDefs = [],
  children,
  badgeDefs = DEFAULT_BADGE_DEFS,
  now = new Date(),
}: BadgeContext): BadgeState[] {
  const mine = submissions.filter((s) => s.childId === childId)
  const approved = mine.filter((s) => s.status === 'approved')
  const gains = pointsTransactions.filter((p) => p.type === 'task_approval')
  const earnedOf = (id: string, filter?: (p: PointsTransaction) => boolean) =>
    gains.filter((p) => p.childId === id && (!filter || filter(p))).reduce((sum, p) => sum + p.amount, 0)

  const lifetimePoints = pointsTransactions
    .filter((p) => p.childId === childId && p.amount > 0)
    .reduce((sum, p) => sum + p.amount, 0)
  const monthEarned = earnedOf(childId, (t) => isSameMonth(t.createdAt, now))
  const initiativeCount = approved.filter((s) => s.isInitiative).length
  const monthApproved = approved.filter((s) => s.reviewedAt && isSameMonth(s.reviewedAt, now)).length
  const monthRejected = mine.filter(
    (s) => s.status === 'rejected' && s.reviewedAt && isSameMonth(s.reviewedAt, now),
  ).length
  const bestWeek = Math.max(
    0,
    ...Array.from({ length: 12 }, (_, i) => {
      const weekStart = startOfWeek(subWeeks(now, i), WEEK)
      return earnedOf(childId, (t) => isSameWeek(t.createdAt, weekStart, WEEK))
    }),
  )
  const familyMonth = children.reduce(
    (sum, c) => sum + earnedOf(c.id, (t) => isSameMonth(t.createdAt, now)),
    0,
  )
  const isMvp =
    monthEarned > 0 &&
    children.every((c) => c.id === childId || earnedOf(c.id, (t) => isSameMonth(t.createdAt, now)) <= monthEarned)

  const categoryApproved = (category: string) =>
    approved.filter((s) => tasks.find((t) => t.id === s.taskId)?.category === category).length

  const hasClaim = (key: string) => rewardClaims.some((r) => r.childId === childId && r.key === key)

  const achievedGoalsCount = savingsGoals.filter((g) => g.childId === childId && g.achievedAt).length
  const hasRedeemed = redemptions.some((r) => r.childId === childId)

  const noPenaltyInLastDays = (days: number) => {
    const cutoff = now.getTime() - days * DAY
    return !transactions.some(
      (t) => t.childId === childId && t.type === 'penalty' && !t.cancelled && t.createdAt >= cutoff,
    )
  }

  // Badge collectif : un jour où tous les enfants actifs ont chacun validé au moins une tâche.
  const familyCompleteAchieved = (() => {
    const activeChildren = children.filter((c) => c.isActive !== false)
    if (activeChildren.length < 2) return false
    const dayKey = (d: number) => new Date(d).toISOString().slice(0, 10)
    const [first, ...rest] = activeChildren.map(
      (c) =>
        new Set(
          submissions.filter((s) => s.childId === c.id && s.status !== 'rejected').map((s) => dayKey(s.submittedAt)),
        ),
    )
    for (const day of first) {
      if (rest.every((set) => set.has(day))) return true
    }
    return false
  })()

  const entries: BadgeState[] = []

  for (const def of badgeDefs) {
    if (!def.isActive) continue
    const base = { id: def.id, emoji: def.emoji, label: def.label, description: def.description, points: def.points }

    switch (def.kind) {
      case 'lifetime_tasks': {
        const threshold = def.params.threshold ?? 1
        entries.push({
          ...base,
          unlocked: approved.length >= threshold,
          progress: { current: Math.min(approved.length, threshold), target: threshold },
        })
        break
      }
      case 'category_specialist': {
        const threshold = def.params.threshold ?? 20
        const count = def.params.category ? categoryApproved(def.params.category) : 0
        entries.push({
          ...base,
          unlocked: count >= threshold,
          progress: { current: Math.min(count, threshold), target: threshold },
        })
        break
      }
      case 'streak_tier': {
        const days = def.params.days ?? 0
        const key = `streak:${def.params.streakDefId}:${days}`
        const unlocked = hasClaim(key)
        const streakDef = streakDefs.find((d) => d.id === def.params.streakDefId)
        const current = streakDef
          ? computeStreakDefCount(streakDef, childId, {
              submissions,
              transactions,
              now,
              childCreatedAt: children.find((c) => c.id === childId)?.createdAt,
            })
          : 0
        entries.push({
          ...base,
          unlocked,
          progress: unlocked ? undefined : { current: Math.min(current, days), target: days, unit: 'jours' },
        })
        break
      }
      case 'fast_approval': {
        const hours = def.params.hours ?? 1
        entries.push({
          ...base,
          unlocked: approved.some((s) => s.reviewedAt !== undefined && s.reviewedAt - s.submittedAt <= hours * HOUR),
        })
        break
      }
      case 'initiative': {
        const threshold = def.params.threshold ?? 10
        entries.push({
          ...base,
          unlocked: initiativeCount >= threshold,
          progress: { current: Math.min(initiativeCount, threshold), target: threshold },
        })
        break
      }
      case 'best_week': {
        const threshold = def.params.threshold ?? 150
        entries.push({
          ...base,
          unlocked: bestWeek >= threshold,
          progress: { current: Math.min(bestWeek, threshold), target: threshold, unit: 'pts' },
        })
        break
      }
      case 'perfectionist': {
        const threshold = def.params.threshold ?? 5
        entries.push({
          ...base,
          unlocked: monthApproved >= threshold && monthRejected === 0,
          progress: { current: Math.min(monthApproved, threshold), target: threshold },
        })
        break
      }
      case 'family_points': {
        const threshold = def.params.threshold ?? 400
        entries.push({
          ...base,
          unlocked: familyMonth >= threshold,
          progress: { current: Math.min(familyMonth, threshold), target: threshold, unit: 'pts' },
        })
        break
      }
      case 'month_mvp': {
        entries.push({ ...base, unlocked: isMvp })
        break
      }
      case 'lifetime_points': {
        const threshold = def.params.threshold ?? 1000
        entries.push({
          ...base,
          unlocked: lifetimePoints >= threshold,
          progress: { current: Math.min(lifetimePoints, threshold), target: threshold, unit: 'pts' },
        })
        break
      }
      case 'savings_goal': {
        const threshold = def.params.threshold ?? 1
        entries.push({
          ...base,
          unlocked: achievedGoalsCount >= threshold,
          progress: { current: Math.min(achievedGoalsCount, threshold), target: threshold },
        })
        break
      }
      case 'shop_first_exchange': {
        entries.push({ ...base, unlocked: hasRedeemed })
        break
      }
      case 'zero_penalty': {
        entries.push({ ...base, unlocked: noPenaltyInLastDays(def.params.days ?? 30) })
        break
      }
      case 'family_complete': {
        entries.push({ ...base, unlocked: familyCompleteAchieved })
        break
      }
    }
  }

  return entries
}

const CATEGORY_SPECIALIST_THRESHOLD = 20
const now = Date.now()

/** Catalogue par défaut — administrable ensuite depuis Réglages → Badges (sans redéploiement). */
export const DEFAULT_BADGE_DEFS: BadgeDef[] = [
  { id: 'demarrage', kind: 'lifetime_tasks', label: 'Démarrage', emoji: '🚀', description: 'Première tâche validée', points: 20, params: { threshold: 1 }, isActive: true, createdBy: 'system', createdAt: now },
  { id: 'tache-10', kind: 'lifetime_tasks', label: '10 tâches', emoji: '🥉', description: '10 tâches validées à vie', points: 30, params: { threshold: 10 }, isActive: true, createdBy: 'system', createdAt: now },
  { id: 'tache-50', kind: 'lifetime_tasks', label: '50 tâches', emoji: '🥈', description: '50 tâches validées à vie', points: 80, params: { threshold: 50 }, isActive: true, createdBy: 'system', createdAt: now },
  { id: 'tache-100', kind: 'lifetime_tasks', label: '100 tâches', emoji: '🥇', description: '100 tâches validées à vie', points: 150, params: { threshold: 100 }, isActive: true, createdBy: 'system', createdAt: now },
  { id: 'tache-250', kind: 'lifetime_tasks', label: '250 tâches', emoji: '🎯', description: '250 tâches validées à vie', points: 300, params: { threshold: 250 }, isActive: true, createdBy: 'system', createdAt: now },

  { id: 'specialiste-cuisine', kind: 'category_specialist', label: 'Chef cuistot', emoji: '👨‍🍳', description: `${CATEGORY_SPECIALIST_THRESHOLD} tâches de cuisine validées`, points: 60, params: { category: 'cuisine', threshold: CATEGORY_SPECIALIST_THRESHOLD }, isActive: true, createdBy: 'system', createdAt: now },
  { id: 'specialiste-menage', kind: 'category_specialist', label: 'Pro du ménage', emoji: '🧹', description: `${CATEGORY_SPECIALIST_THRESHOLD} tâches de ménage validées`, points: 60, params: { category: 'menage', threshold: CATEGORY_SPECIALIST_THRESHOLD }, isActive: true, createdBy: 'system', createdAt: now },
  { id: 'specialiste-linge', kind: 'category_specialist', label: 'Maître du linge', emoji: '🧺', description: `${CATEGORY_SPECIALIST_THRESHOLD} tâches de linge validées`, points: 60, params: { category: 'linge', threshold: CATEGORY_SPECIALIST_THRESHOLD }, isActive: true, createdBy: 'system', createdAt: now },
  { id: 'specialiste-rangement', kind: 'category_specialist', label: 'Roi du rangement', emoji: '🗄️', description: `${CATEGORY_SPECIALIST_THRESHOLD} tâches de rangement validées`, points: 60, params: { category: 'rangement', threshold: CATEGORY_SPECIALIST_THRESHOLD }, isActive: true, createdBy: 'system', createdAt: now },
  { id: 'specialiste-devoirs', kind: 'category_specialist', label: 'Studieux', emoji: '📚', description: `${CATEGORY_SPECIALIST_THRESHOLD} tâches de devoirs validées`, points: 60, params: { category: 'devoirs', threshold: CATEGORY_SPECIALIST_THRESHOLD }, isActive: true, createdBy: 'system', createdAt: now },
  { id: 'specialiste-autre', kind: 'category_specialist', label: 'Touche-à-tout', emoji: '🌟', description: `${CATEGORY_SPECIALIST_THRESHOLD} autres tâches validées`, points: 60, params: { category: 'autre', threshold: CATEGORY_SPECIALIST_THRESHOLD }, isActive: true, createdBy: 'system', createdAt: now },

  { id: 'streaker', kind: 'streak_tier', label: 'Streaker', emoji: '🔥', description: 'Série quotidienne de 7 jours', points: 30, params: { streakDefId: 'global', days: 7 }, isActive: true, createdBy: 'system', createdAt: now },
  { id: 'serie-mensuelle', kind: 'streak_tier', label: 'Régularité', emoji: '🔥🔥', description: 'Série quotidienne de 30 jours', points: 80, params: { streakDefId: 'global', days: 30 }, isActive: true, createdBy: 'system', createdAt: now },
  { id: 'serie-trimestre', kind: 'streak_tier', label: 'Increvable', emoji: '🔥🔥🔥', description: 'Série quotidienne de 90 jours', points: 150, params: { streakDefId: 'global', days: 90 }, isActive: true, createdBy: 'system', createdAt: now },
  { id: 'serie-annee', kind: 'streak_tier', label: 'Année légendaire', emoji: '🎆', description: 'Série quotidienne de 365 jours', points: 500, params: { streakDefId: 'global', days: 365 }, isActive: true, createdBy: 'system', createdAt: now },
  { id: 'sans-accroc-mois', kind: 'streak_tier', label: 'Sans accroc', emoji: '🕊️', description: '30 jours sans pénalité', points: 60, params: { streakDefId: 'no-penalty', days: 30 }, isActive: true, createdBy: 'system', createdAt: now },
  { id: 'sans-accroc-trimestre', kind: 'streak_tier', label: 'Exemplaire', emoji: '🕊️✨', description: '90 jours sans pénalité', points: 150, params: { streakDefId: 'no-penalty', days: 90 }, isActive: true, createdBy: 'system', createdAt: now },
  { id: 'dents-nickel', kind: 'streak_tier', label: 'Sourire impeccable', emoji: '🦷', description: '20 jours de brossage de dents d’affilée', points: 80, params: { streakDefId: 'brossage-dents', days: 20 }, isActive: true, createdBy: 'system', createdAt: now },
  { id: 'chambre-nickel', kind: 'streak_tier', label: 'Chambre nickel', emoji: '🧼', description: '20 jours de chambre rangée d’affilée', points: 80, params: { streakDefId: 'rangement-chambre', days: 20 }, isActive: true, createdBy: 'system', createdAt: now },

  { id: 'rapidite', kind: 'fast_approval', label: 'Rapidité', emoji: '⚡', description: 'Tâche validée moins d’une heure après l’envoi', points: 25, params: { hours: 1 }, isActive: true, createdBy: 'system', createdAt: now },
  { id: 'initiative-master', kind: 'initiative', label: 'Initiative Master', emoji: '⭐', description: '10 tâches faites sans qu’on te le demande', points: 100, params: { threshold: 10 }, isActive: true, createdBy: 'system', createdAt: now },
  { id: 'golden-week', kind: 'best_week', label: 'Golden Week', emoji: '🏆', description: '150 points ou plus gagnés en une semaine', points: 80, params: { threshold: 150 }, isActive: true, createdBy: 'system', createdAt: now },
  { id: 'perfectionist', kind: 'perfectionist', label: 'Perfectionist', emoji: '💎', description: '5 validations et zéro refus ce mois-ci', points: 60, params: { threshold: 5 }, isActive: true, createdBy: 'system', createdAt: now },
  { id: 'teamplayer', kind: 'family_points', label: 'Teamplayer', emoji: '🤝', description: '400 points cumulés par toute la fratrie ce mois-ci', points: 50, params: { threshold: 400 }, isActive: true, createdBy: 'system', createdAt: now },
  { id: 'month-mvp', kind: 'month_mvp', label: 'MVP du mois', emoji: '👑', description: 'Meilleur gain de la famille ce mois-ci', points: 150, params: {}, isActive: true, createdBy: 'system', createdAt: now },

  { id: 'millionaire', kind: 'lifetime_points', label: 'Centenaire', emoji: '🌠', description: '1000 points gagnés en tout', points: 200, params: { threshold: 1000 }, isActive: true, createdBy: 'system', createdAt: now },
  { id: 'points-500', kind: 'lifetime_points', label: 'Premiers 500', emoji: '💵', description: '500 points gagnés en tout', points: 80, params: { threshold: 500 }, isActive: true, createdBy: 'system', createdAt: now },
  { id: 'points-2500', kind: 'lifetime_points', label: '2500 points', emoji: '🪙', description: '2500 points gagnés en tout', points: 350, params: { threshold: 2500 }, isActive: true, createdBy: 'system', createdAt: now },
  { id: 'points-5000', kind: 'lifetime_points', label: '5000 points', emoji: '🏦', description: '5000 points gagnés en tout', points: 600, params: { threshold: 5000 }, isActive: true, createdBy: 'system', createdAt: now },

  { id: 'epargne', kind: 'savings_goal', label: 'Petit épargnant', emoji: '🐷', description: 'Un objectif d’épargne atteint', points: 50, params: { threshold: 1 }, isActive: true, createdBy: 'system', createdAt: now },
  { id: 'premier-echange', kind: 'shop_first_exchange', label: 'Premier échange', emoji: '🛍️', description: 'Premier lot échangé à la boutique', points: 20, params: {}, isActive: true, createdBy: 'system', createdAt: now },
  { id: 'zero-penalite-30', kind: 'zero_penalty', label: 'Zéro pénalité', emoji: '🛡️', description: '30 jours sans aucune pénalité', points: 70, params: { days: 30 }, isActive: true, createdBy: 'system', createdAt: now },
  { id: 'famille-complete', kind: 'family_complete', label: 'Famille complète', emoji: '👨‍👩‍👧‍👦', description: 'Un jour où tous les enfants ont validé une tâche', points: 40, params: {}, isActive: true, createdBy: 'system', createdAt: now },
]
