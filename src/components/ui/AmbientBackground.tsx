import { motion } from 'framer-motion'

/**
 * Petit semis d'étoiles qui scintillent (opacité + échelle) — écho animé des points dorés
 * statiques déjà posés en CSS sur .dark body (voir index.css). Positions choisies à la main
 * (pas de Math.random : on veut un rendu stable, pas un nouveau tirage à chaque re-render) et
 * dispersées façon ciel étoilé plutôt qu'une grille régulière. Sombre uniquement, comme le reste
 * du thème "nuit étoilée" — resterait trop chargé sur fond clair.
 */
const STARS = [
  { top: '9%', left: '18%', size: 2.5, duration: 3.4, delay: 0 },
  { top: '14%', left: '68%', size: 2, duration: 2.8, delay: 0.6 },
  { top: '22%', left: '42%', size: 3, duration: 4, delay: 1.1 },
  { top: '31%', left: '85%', size: 2, duration: 3.1, delay: 0.3 },
  { top: '38%', left: '8%', size: 2.5, duration: 3.6, delay: 1.8 },
  { top: '46%', left: '55%', size: 2, duration: 2.6, delay: 0.9 },
  { top: '58%', left: '25%', size: 3, duration: 4.2, delay: 0.2 },
  { top: '63%', left: '78%', size: 2, duration: 3, delay: 1.4 },
  { top: '72%', left: '15%', size: 2.5, duration: 3.8, delay: 0.7 },
  { top: '78%', left: '92%', size: 2, duration: 2.9, delay: 1.6 },
  { top: '85%', left: '48%', size: 3, duration: 3.5, delay: 0.4 },
  { top: '12%', left: '92%', size: 2, duration: 3.2, delay: 1.2 },
]

function Starfield() {
  return (
    <div className="absolute inset-0 hidden dark:block">
      {STARS.map((s, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full bg-amber-200"
          style={{ top: s.top, left: s.left, width: s.size, height: s.size }}
          animate={{ opacity: [0.15, 0.9, 0.15], scale: [0.8, 1.4, 0.8] }}
          transition={{ duration: s.duration, delay: s.delay, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  )
}

/** Fond décoratif discret (halos dégradés qui dérivent lentement + étoiles scintillantes en sombre) derrière tout le contenu. */
export function AmbientBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
      <Starfield />
      <motion.div
        className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-gradient-to-br from-brand-from to-fuchsia-600 opacity-10 blur-3xl dark:opacity-20"
        animate={{ x: [0, 30, 0], y: [0, 20, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -bottom-40 -right-28 h-[28rem] w-[28rem] rounded-full bg-gradient-to-br from-brand-to to-amber-300 opacity-10 blur-3xl dark:opacity-15"
        animate={{ x: [0, -25, 0], y: [0, -15, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute left-1/3 top-1/2 h-72 w-72 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 opacity-0 blur-3xl dark:opacity-10"
        animate={{ x: [0, 20, 0], y: [0, -30, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  )
}
