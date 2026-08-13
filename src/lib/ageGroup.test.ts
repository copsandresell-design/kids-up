import { describe, expect, it } from 'vitest'
import { AGE_GROUP_LABELS, computeAgeGroup, computeAgeYears, pointsMultiplierFor } from './ageGroup'

const NOW = new Date('2026-07-22T12:00:00')

function yearsAgo(years: number, extraDays = 0): number {
  const d = new Date(NOW)
  d.setFullYear(d.getFullYear() - years)
  d.setDate(d.getDate() - extraDays)
  return d.getTime()
}

describe('computeAgeYears', () => {
  it('calcule un âge plein en années', () => {
    expect(computeAgeYears(yearsAgo(10, 2), NOW)).toBe(10)
  })

  it('n’arrondit pas au-dessus avant l’anniversaire', () => {
    // Anniversaire dans quelques jours : encore 9 ans, pas 10.
    expect(computeAgeYears(yearsAgo(10, -5), NOW)).toBe(9)
  })
})

describe('computeAgeGroup', () => {
  it('renvoie undefined si la date de naissance manque', () => {
    expect(computeAgeGroup(undefined, 8, NOW)).toBeUndefined()
  })

  it('renvoie undefined si aucun seuil n’est réglé (fonctionnalité désactivée)', () => {
    expect(computeAgeGroup(yearsAgo(12), undefined, NOW)).toBeUndefined()
  })

  it('« petit » sous le seuil, « grand » au seuil ou au-dessus', () => {
    expect(computeAgeGroup(yearsAgo(6, 2), 8, NOW)).toBe('petit')
    expect(computeAgeGroup(yearsAgo(8, 2), 8, NOW)).toBe('grand')
    expect(computeAgeGroup(yearsAgo(12), 8, NOW)).toBe('grand')
  })
})

describe('pointsMultiplierFor', () => {
  const settings = { pointsMultiplierPetit: 1.5, pointsMultiplierGrand: 0.8 }

  it('applique le multiplicateur du groupe', () => {
    expect(pointsMultiplierFor('petit', settings)).toBe(1.5)
    expect(pointsMultiplierFor('grand', settings)).toBe(0.8)
  })

  it('neutre (×1) si le groupe est indéterminé', () => {
    expect(pointsMultiplierFor(undefined, settings)).toBe(1)
  })
})

describe('AGE_GROUP_LABELS', () => {
  it('fournit un libellé pour chaque groupe', () => {
    expect(AGE_GROUP_LABELS.petit).toBe('Petit')
    expect(AGE_GROUP_LABELS.grand).toBe('Grand')
  })
})
