import { isSameWeek } from 'date-fns'
import type { PointsTransaction, PointsTransactionType, WeeklyPointsCapSettings } from '../types'

const WEEK = { weekStartsOn: 1 as const }

/**
 * Points reçus d'un don/prêt/remboursement : comptent dans le solde dépensable (computePoints)
 * mais jamais dans les points à vie (rangs) — sinon deux enfants pourraient se renvoyer des
 * points en boucle pour gonfler leur rang sans rien faire de plus.
 */
const TRANSFER_RECEIVED_TYPES = new Set<PointsTransactionType>([
  'points_gift_received',
  'points_loan_received',
  'points_loan_repay_received',
])

export function computePoints(pointsTransactions: PointsTransaction[], childId: string): number {
  return pointsTransactions.filter((p) => p.childId === childId).reduce((sum, p) => sum + p.amount, 0)
}

/**
 * Bonus « initiative » (tâche faite sans qu'on le demande), en % du barème de la tâche plutôt
 * qu'un montant fixe — un montant fixe donnait le même bonus à une tâche à 10 pts et à une
 * tâche à 300 pts, ce qui n'a pas de sens (voir Settings.initiativeBonusPercent).
 */
export function computeInitiativeBonus(basePoints: number, percent: number): number {
  return Math.round((basePoints * percent) / 100)
}

/**
 * Points effectifs d'une validation, avec rendement dégressif pour les tâches répétables
 * (dailyLimit > 1) : chaque répétition du même jour rapporte 20 % de moins que la
 * précédente, jamais moins de 1 point — évite qu'une tâche répétable devienne un moyen de
 * grinder les points sans effort supplémentaire. `occurrenceIndex` = 0 pour la première
 * validation du jour (voir approvedOccurrenceIndexToday dans lib/recurrence.ts).
 */
export function computeTaskPoints(basePoints: number, occurrenceIndex: number): number {
  if (occurrenceIndex <= 0) return basePoints
  return Math.max(1, Math.round(basePoints * Math.pow(0.8, occurrenceIndex)))
}

/** Total des points gagnés (gains uniquement) par un enfant sur la semaine en cours. */
export function weeklyGains(pointsTransactions: PointsTransaction[], childId: string, now: Date = new Date()): number {
  return pointsTransactions
    .filter((p) => p.childId === childId && p.amount > 0 && isSameWeek(p.createdAt, now, WEEK))
    .reduce((sum, p) => sum + p.amount, 0)
}

/**
 * Réduit un gain de points pour respecter le plafond hebdomadaire optionnel (Réglages) —
 * filet de sécurité si le barème de tâches s'avère trop généreux. Sans effet si désactivé,
 * si le montant est une dépense (négatif), ou tant que le plafond n'est pas atteint.
 */
export function capWeeklyGain(
  requested: number,
  childId: string,
  pointsTransactions: PointsTransaction[],
  cap: WeeklyPointsCapSettings,
  now: Date = new Date(),
): number {
  if (!cap.enabled || requested <= 0) return requested
  const headroom = Math.max(0, cap.amount - weeklyGains(pointsTransactions, childId, now))
  return Math.min(requested, headroom)
}

/**
 * Total des points gagnés à vie (somme des gains uniquement, jamais des dépenses) : sert de
 * base au système de rangs — contrairement à computePoints (solde dépensable), ne redescend
 * jamais quand l'enfant dépense ses points en boutique.
 */
export function computeLifetimePoints(pointsTransactions: PointsTransaction[], childId: string): number {
  return pointsTransactions
    .filter((p) => p.childId === childId && p.amount > 0 && !TRANSFER_RECEIVED_TYPES.has(p.type))
    .reduce((sum, p) => sum + p.amount, 0)
}
