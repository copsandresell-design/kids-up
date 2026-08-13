import { describe, expect, it } from 'vitest'
import {
  capWeeklyGain,
  computeInitiativeBonus,
  computeLifetimePoints,
  computePoints,
  computeTaskPoints,
  weeklyGains,
} from './points'
import type { PointsTransaction, WeeklyPointsCapSettings } from '../types'

const CHILD = 'child-1'
const NOW = new Date('2026-07-22T18:00:00')

function ptx(amount: number, childId = CHILD, createdAt = NOW.getTime()): PointsTransaction {
  return {
    id: `${childId}-${amount}-${Math.random()}`,
    childId,
    type: 'badge',
    amount,
    description: 'test',
    createdBy: 'parent-1',
    createdAt,
  }
}

function transferPtx(type: PointsTransaction['type'], amount: number, childId = CHILD): PointsTransaction {
  return { ...ptx(amount, childId), type }
}

describe('computePoints', () => {
  it('additionne les gains et dépenses d’un enfant', () => {
    const points = [ptx(20), ptx(-5), ptx(15)]
    expect(computePoints(points, CHILD)).toBe(30)
  })

  it('ignore les points des autres enfants', () => {
    const points = [ptx(20), ptx(50, 'other-child')]
    expect(computePoints(points, CHILD)).toBe(20)
  })

  it('vaut 0 sans transaction', () => {
    expect(computePoints([], CHILD)).toBe(0)
  })
})

describe('computeLifetimePoints', () => {
  it('ne compte que les gains, jamais les dépenses', () => {
    const points = [ptx(20), ptx(-15), ptx(50)]
    expect(computeLifetimePoints(points, CHILD)).toBe(70)
  })

  it('ne redescend jamais même après une grosse dépense', () => {
    const points = [ptx(100), ptx(-90)]
    expect(computeLifetimePoints(points, CHILD)).toBe(100)
    expect(computePoints(points, CHILD)).toBe(10)
  })

  it('ignore les dons/prêts/remboursements reçus (pas de vrai gain)', () => {
    const points = [
      ptx(20),
      transferPtx('points_gift_received', 50),
      transferPtx('points_loan_received', 30),
      transferPtx('points_loan_repay_received', 15),
    ]
    expect(computeLifetimePoints(points, CHILD)).toBe(20)
    // Mais ça reste bien dépensable, juste pas compté pour le rang.
    expect(computePoints(points, CHILD)).toBe(115)
  })
})

describe('computeTaskPoints', () => {
  it('renvoie le plein tarif pour la première occurrence', () => {
    expect(computeTaskPoints(10, 0)).toBe(10)
  })

  it('réduit de 20 % par répétition, jamais sous 1 point', () => {
    expect(computeTaskPoints(10, 1)).toBe(8)
    expect(computeTaskPoints(10, 2)).toBe(6)
    expect(computeTaskPoints(5, 1)).toBe(4)
    expect(computeTaskPoints(1, 5)).toBe(1)
    expect(computeTaskPoints(2, 10)).toBe(1)
  })
})

describe('computeInitiativeBonus', () => {
  it('est proportionnel au barème de la tâche, pas un montant fixe', () => {
    // Même pourcentage (20%), tâches de valeurs très différentes : le bonus suit.
    expect(computeInitiativeBonus(10, 20)).toBe(2)
    expect(computeInitiativeBonus(300, 20)).toBe(60)
  })

  it('arrondit au point le plus proche', () => {
    expect(computeInitiativeBonus(15, 20)).toBe(3)
    expect(computeInitiativeBonus(7, 15)).toBe(1) // 1.05 → 1
  })

  it('vaut 0 à 0 %', () => {
    expect(computeInitiativeBonus(300, 0)).toBe(0)
  })
})

describe('weeklyGains / capWeeklyGain', () => {
  const cap: WeeklyPointsCapSettings = { enabled: true, amount: 100 }

  it('weeklyGains ignore les dépenses et les autres semaines', () => {
    const points = [ptx(50), ptx(-20), ptx(30, CHILD, new Date('2026-06-01').getTime())]
    expect(weeklyGains(points, CHILD, NOW)).toBe(50)
  })

  it('capWeeklyGain laisse passer tant que le plafond n’est pas atteint', () => {
    expect(capWeeklyGain(30, CHILD, [ptx(50)], cap, NOW)).toBe(30)
  })

  it('capWeeklyGain réduit le gain pour respecter le plafond', () => {
    expect(capWeeklyGain(30, CHILD, [ptx(90)], cap, NOW)).toBe(10)
  })

  it('capWeeklyGain renvoie 0 une fois le plafond dépassé', () => {
    expect(capWeeklyGain(30, CHILD, [ptx(100)], cap, NOW)).toBe(0)
  })

  it('capWeeklyGain sans effet si désactivé', () => {
    expect(capWeeklyGain(30, CHILD, [ptx(500)], { enabled: false, amount: 100 }, NOW)).toBe(30)
  })

  it('capWeeklyGain laisse passer les montants négatifs (dépenses)', () => {
    expect(capWeeklyGain(-30, CHILD, [ptx(100)], cap, NOW)).toBe(-30)
  })
})
