import { AnimatePresence, motion } from 'framer-motion'
import { Outlet, useLocation } from 'react-router-dom'

/**
 * Enveloppe l'<Outlet /> d'un layout (Parent/Child) pour un léger fondu + décalage vertical à
 * chaque changement de page, plutôt qu'un cut instantané. `mode="wait"` attend la sortie de la
 * page précédente avant de monter la suivante (transition propre, pas de chevauchement visuel).
 * Respecte automatiquement prefers-reduced-motion via <MotionConfig reducedMotion="user"> posé
 * une fois pour toute l'app dans App.tsx.
 */
export function PageTransition() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
      >
        <Outlet />
      </motion.div>
    </AnimatePresence>
  )
}
