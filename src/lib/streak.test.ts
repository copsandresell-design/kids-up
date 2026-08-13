import { describe, expect, it } from 'vitest'
import {
  computeNoPenaltyStreak,
  computeStreak,
  computeStreakDefCount,
  computeTaskStreak,
  streakDefMilestonesReached,
  streakMilestonesReached,
} from './streak'
import type { StreakDef, TaskSubmission, Transaction } from '../types'

const CHILD = 'child-1'

function sub(dateIso: string, status: TaskSubmission['status'] = 'approved'): TaskSubmission {
  return {
    id: dateIso,
    taskId: 'task-1',
    childId: CHILD,
    status,
    isInitiative: false,
    submittedAt: new Date(dateIso).getTime(),
    bonusApplied: false,
  }
}

const NOW = new Date('2026-07-22T18:00:00')

describe('computeStreak', () => {
  it('compte les jours consécutifs incluant aujourd’hui', () => {
    const subs = [sub('2026-07-22T10:00:00'), sub('2026-07-21T10:00:00'), sub('2026-07-20T10:00:00')]
    const streak = computeStreak(CHILD, subs, NOW)
    expect(streak.count).toBe(3)
    expect(streak.doneToday).toBe(true)
  })

  it('la série d’hier tient encore si rien aujourd’hui', () => {
    const subs = [sub('2026-07-21T10:00:00'), sub('2026-07-20T10:00:00')]
    const streak = computeStreak(CHILD, subs, NOW)
    expect(streak.count).toBe(2)
    expect(streak.doneToday).toBe(false)
  })

  it('un trou casse la série', () => {
    const subs = [sub('2026-07-22T10:00:00'), sub('2026-07-20T10:00:00')]
    expect(computeStreak(CHILD, subs, NOW).count).toBe(1)
  })

  it('les refus ne comptent pas', () => {
    const subs = [sub('2026-07-22T10:00:00', 'rejected')]
    const streak = computeStreak(CHILD, subs, NOW)
    expect(streak.count).toBe(0)
    expect(streak.doneToday).toBe(false)
  })
})

describe('streakMilestonesReached', () => {
  it("ne renvoie aucun palier avant le premier (3 jours)", () => {
    expect(streakMilestonesReached(2)).toEqual([])
  })

  it('renvoie tous les paliers atteints, triés croissant', () => {
    expect(streakMilestonesReached(10)).toEqual([3, 7])
    expect(streakMilestonesReached(30)).toEqual([3, 7, 14, 30])
  })
})

function tx(dateIso: string, opts?: Partial<Transaction>): Transaction {
  return {
    id: dateIso + Math.random(),
    type: 'penalty',
    childId: CHILD,
    amount: -100,
    description: 'test',
    createdBy: 'parent-1',
    createdAt: new Date(dateIso).getTime(),
    ...opts,
  }
}

describe('computeTaskStreak', () => {
  it('ne compte que les validations approuvées de la tâche donnée', () => {
    const subs = [
      sub('2026-07-22T10:00:00'),
      sub('2026-07-21T10:00:00'),
      sub('2026-07-20T10:00:00', 'pending'),
    ]
    expect(computeTaskStreak(CHILD, 'task-1', subs, NOW)).toBe(2)
  })

  it('ignore les validations d’une autre tâche', () => {
    const other: TaskSubmission = { ...sub('2026-07-22T10:00:00'), taskId: 'task-2' }
    expect(computeTaskStreak(CHILD, 'task-1', [other], NOW)).toBe(0)
  })
})

describe('computeNoPenaltyStreak', () => {
  it('compte les jours consécutifs sans pénalité', () => {
    expect(computeNoPenaltyStreak(CHILD, [], NOW)).toBeGreaterThan(300)
  })

  it('s’arrête à la pénalité la plus récente', () => {
    const transactions = [tx('2026-07-20T10:00:00')]
    // 2026-07-22 - 2026-07-21 = 2 jours sans pénalité (20 est la coupure)
    expect(computeNoPenaltyStreak(CHILD, transactions, NOW)).toBe(2)
  })

  it('une pénalité annulée ne compte pas', () => {
    const transactions = [tx('2026-07-20T10:00:00', { cancelled: true })]
    expect(computeNoPenaltyStreak(CHILD, transactions, NOW)).toBeGreaterThan(300)
  })

  it('borné par `since`, un enfant sans historique ne dépasse pas son ancienneté réelle', () => {
    // Compte créé il y a 5 jours : sans `since`, on plafonnerait à 366 (garde-fou) alors que
    // l'enfant n'existe que depuis 5 jours — c'est le bug du badge "366 jours" auto-validé.
    const createdAt = new Date('2026-07-17T09:00:00').getTime()
    expect(computeNoPenaltyStreak(CHILD, [], NOW, createdAt)).toBe(6)
  })

  it('`since` n’écourte pas une série qui s’arrête déjà avant sur une pénalité', () => {
    const createdAt = new Date('2026-01-01T00:00:00').getTime()
    const transactions = [tx('2026-07-20T10:00:00')]
    expect(computeNoPenaltyStreak(CHILD, transactions, NOW, createdAt)).toBe(2)
  })
})

describe('computeStreakDefCount / streakDefMilestonesReached', () => {
  it('délègue au bon calcul selon le genre de la définition', () => {
    const globalDef: StreakDef = {
      id: 'global',
      kind: 'global',
      label: 'Série',
      emoji: '🔥',
      tiers: [{ days: 3, points: 15 }],
      isActive: true,
      createdBy: 'system',
      createdAt: 0,
    }
    const subs = [sub('2026-07-22T10:00:00'), sub('2026-07-21T10:00:00'), sub('2026-07-20T10:00:00')]
    expect(computeStreakDefCount(globalDef, CHILD, { submissions: subs, transactions: [], now: NOW })).toBe(3)
    expect(streakDefMilestonesReached(globalDef, 3)).toEqual([{ days: 3, points: 15 }])
    expect(streakDefMilestonesReached(globalDef, 2)).toEqual([])
  })

  it('genre "task" nécessite un taskId, sinon 0', () => {
    const def: StreakDef = {
      id: 'x',
      kind: 'task',
      label: 'X',
      emoji: '🦷',
      tiers: [],
      isActive: true,
      createdBy: 'system',
      createdAt: 0,
    }
    expect(computeStreakDefCount(def, CHILD, { submissions: [], transactions: [], now: NOW })).toBe(0)
  })
})
