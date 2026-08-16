import { cn } from '../../lib/cn'
import { formatEuro } from '../../lib/format'

/** `cents` pour un montant en euros, `points` pour un montant en points — un seul des deux. */
export function Amount({ cents, points, className }: { cents?: number; points?: number; className?: string }) {
  const value = points !== undefined ? points : (cents ?? 0)
  return (
    <span
      className={cn(
        'font-bold tabular-nums',
        value > 0 && 'text-emerald-600 dark:text-emerald-400',
        value < 0 && 'text-rose-600 dark:text-rose-400',
        className,
      )}
    >
      {points !== undefined ? `${points > 0 ? '+' : ''}${points} pts` : formatEuro(cents ?? 0, { signed: true })}
    </span>
  )
}
