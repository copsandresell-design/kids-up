import type { AgeGroup, Settings } from '../types'

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000

/** Âge en années pleines à partir d'une date de naissance (ms epoch). */
export function computeAgeYears(birthdate: number, now: Date | number = Date.now()): number {
  const nowMs = typeof now === 'number' ? now : now.getTime()
  return Math.floor((nowMs - birthdate) / YEAR_MS)
}

/**
 * Groupe d'âge d'un enfant, dérivé de sa date de naissance et du seuil réglé par la famille
 * (Réglages) — jamais stocké, toujours recalculé (même logique que les badges/séries : évite
 * qu'un champ figé devienne faux avec le temps ou un seuil changé après coup).
 *
 * Renvoie `undefined` si la date de naissance de l'enfant OU le seuil de la famille manque :
 * tant que les deux ne sont pas réglés, l'enfant n'est classé dans aucun groupe plutôt que
 * d'être arbitrairement rangé quelque part (voir pointsMultiplierFor et le filtre de la
 * boutique, qui traitent alors ce cas comme neutre/non concerné).
 */
export function computeAgeGroup(
  birthdate: number | undefined,
  thresholdYears: number | undefined,
  now: Date | number = Date.now(),
): AgeGroup | undefined {
  if (birthdate === undefined || thresholdYears === undefined) return undefined
  return computeAgeYears(birthdate, now) >= thresholdYears ? 'grand' : 'petit'
}

/** Multiplicateur de points appliqué au gain d'une tâche selon le groupe d'âge (1 = neutre, groupe indéterminé). */
export function pointsMultiplierFor(
  group: AgeGroup | undefined,
  settings: Pick<Settings, 'pointsMultiplierPetit' | 'pointsMultiplierGrand'>,
): number {
  if (group === 'petit') return settings.pointsMultiplierPetit
  if (group === 'grand') return settings.pointsMultiplierGrand
  return 1
}

export const AGE_GROUP_LABELS: Record<AgeGroup, string> = {
  petit: 'Petit',
  grand: 'Grand',
}
