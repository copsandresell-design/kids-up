import { format, subDays } from 'date-fns'
import type { PointsTransaction, StreakDef, StreakTier, TaskSubmission, Transaction } from '../types'

export interface Streak {
  count: number
  doneToday: boolean
  /** Les 7 derniers jours (le plus ancien en premier), true = au moins une tâche signalée. */
  last7: boolean[]
}

const dayKey = (d: Date | number) => format(d, 'yyyy-MM-dd')

/** Bonus historique du streak global (repère pour tests/rétrocompat) — voir DEFAULT_STREAK_DEFS pour le catalogue actif. */
export const STREAK_BONUS_POINTS: Record<number, number> = {
  3: 15,
  7: 40,
  14: 90,
  30: 250,
  60: 400,
  90: 600,
  180: 1200,
  365: 3000,
}

/** Paliers de STREAK_BONUS_POINTS atteints par une série de `count` jours, triés croissant. */
export function streakMilestonesReached(count: number): number[] {
  return Object.keys(STREAK_BONUS_POINTS)
    .map(Number)
    .filter((milestone) => count >= milestone)
    .sort((a, b) => a - b)
}

/**
 * Série de jours consécutifs avec au moins une tâche signalée (hors refus).
 * Si rien aujourd'hui, la série d'hier tient encore — elle se joue aujourd'hui.
 */
export function computeStreak(
  childId: string,
  submissions: TaskSubmission[],
  now: Date = new Date(),
): Streak {
  const days = new Set(
    submissions
      .filter((s) => s.childId === childId && s.status !== 'rejected')
      .map((s) => dayKey(s.submittedAt)),
  )
  const doneToday = days.has(dayKey(now))
  let count = 0
  let cursor = doneToday ? now : subDays(now, 1)
  while (days.has(dayKey(cursor))) {
    count++
    cursor = subDays(cursor, 1)
  }
  const last7 = Array.from({ length: 7 }, (_, i) => days.has(dayKey(subDays(now, 6 - i))))
  return { count, doneToday, last7 }
}

/** Jours consécutifs (jusqu'à aujourd'hui) où une tâche précise a été validée (statut approved). */
export function computeTaskStreak(
  childId: string,
  taskId: string,
  submissions: TaskSubmission[],
  now: Date = new Date(),
): number {
  const days = new Set(
    submissions
      .filter((s) => s.childId === childId && s.taskId === taskId && s.status === 'approved')
      .map((s) => dayKey(s.submittedAt)),
  )
  const doneToday = days.has(dayKey(now))
  let count = 0
  let cursor = doneToday ? now : subDays(now, 1)
  while (days.has(dayKey(cursor))) {
    count++
    cursor = subDays(cursor, 1)
  }
  return count
}

/**
 * Jours consécutifs (jusqu'à aujourd'hui, garde-fou 366 jours) sans pénalité non annulée.
 *
 * `since` (optionnel, ex : date de création du profil enfant) borne le calcul : sans lui, un
 * enfant sans aucun historique de pénalité (compte tout neuf, ou famille qui n'utilise pas les
 * pénalités) atteint instantanément le garde-fou de 366 jours dès le premier jour d'usage — la
 * "série" ne représente alors plus rien de réel et ne bouge plus jamais ensuite, puisqu'elle
 * plafonne déjà. En pratique, toujours passer `since` depuis les appelants (voir
 * computeStreakDefCount) ; l'absence de borne n'est conservée que pour la rétrocompatibilité des
 * appels existants qui ne connaissent pas la date de création de l'enfant.
 */
export function computeNoPenaltyStreak(
  childId: string,
  transactions: Transaction[],
  now: Date = new Date(),
  since?: number,
  // Une pénalité vit en € OU en points, jamais les deux (voir applyPenalty) — les deux registres
  // doivent casser la série, sans quoi une famille qui pénalise en points la verrait ne jamais casser.
  pointsTransactions: PointsTransaction[] = [],
): number {
  const penaltyDays = new Set([
    ...transactions
      .filter((t) => t.childId === childId && t.type === 'penalty' && !t.cancelled)
      .map((t) => dayKey(t.createdAt)),
    ...pointsTransactions
      .filter((p) => p.childId === childId && p.type === 'penalty' && !p.cancelled)
      .map((p) => dayKey(p.createdAt)),
  ])
  const sinceDay = since !== undefined ? dayKey(since) : undefined
  let count = 0
  let cursor = now
  for (let i = 0; i < 366; i++) {
    if (sinceDay !== undefined && dayKey(cursor) < sinceDay) break
    if (penaltyDays.has(dayKey(cursor))) break
    count++
    cursor = subDays(cursor, 1)
  }
  return count
}

/** Calcule le compteur courant d'une définition de série donnée, quel que soit son genre. */
export function computeStreakDefCount(
  def: StreakDef,
  childId: string,
  ctx: {
    submissions: TaskSubmission[]
    transactions: Transaction[]
    pointsTransactions?: PointsTransaction[]
    now?: Date
    childCreatedAt?: number
  },
): number {
  const now = ctx.now ?? new Date()
  if (def.kind === 'global') return computeStreak(childId, ctx.submissions, now).count
  if (def.kind === 'no_penalty') {
    return computeNoPenaltyStreak(childId, ctx.transactions, now, ctx.childCreatedAt, ctx.pointsTransactions)
  }
  return def.taskId ? computeTaskStreak(childId, def.taskId, ctx.submissions, now) : 0
}

/** Paliers de `def` atteints par une série de `count` jours, triés croissant. */
export function streakDefMilestonesReached(def: StreakDef, count: number): StreakTier[] {
  return def.tiers.filter((tier) => count >= tier.days).sort((a, b) => a.days - b.days)
}

/** Catalogue par défaut, agnostique de la famille (les séries liées à une tâche précise sont ajoutées dynamiquement — voir db/seed.ts). */
export const DEFAULT_STREAK_DEFS: StreakDef[] = [
  {
    id: 'global',
    kind: 'global',
    label: 'Série quotidienne',
    emoji: '🔥',
    tiers: [
      { days: 3, points: 15 },
      { days: 7, points: 40 },
      { days: 14, points: 90 },
      { days: 30, points: 250 },
      { days: 60, points: 400 },
      { days: 90, points: 600 },
      { days: 180, points: 1200 },
      { days: 365, points: 3000 },
    ],
    isActive: true,
    createdBy: 'system',
    createdAt: Date.now(),
  },
  {
    id: 'no-penalty',
    kind: 'no_penalty',
    label: 'Sans pénalité',
    emoji: '🕊️',
    tiers: [
      { days: 7, points: 30 },
      { days: 30, points: 120 },
      { days: 90, points: 400 },
    ],
    isActive: true,
    createdBy: 'system',
    createdAt: Date.now(),
  },
]
