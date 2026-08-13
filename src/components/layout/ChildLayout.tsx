import { Gift, History, Home, UserRound } from 'lucide-react'
import { useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '../../lib/cn'
import { useCurrentUser, useStore } from '../../store/useStore'
import { DemoBanner } from '../DemoBanner'
import { NotificationCenter } from '../NotificationCenter'
import { OnboardingTour } from '../OnboardingTour'
import { ChildAvatar } from '../ui/ChildAvatar'
import { PageTransition } from '../ui/PageTransition'

const BASE_LINKS = [
  { to: '/enfant', label: 'Accueil', icon: Home, end: true },
  { to: '/enfant/historique', label: 'Historique', icon: History },
  { to: '/enfant/profil', label: 'Profil', icon: UserRound },
]

const SHOP_LINK = { to: '/enfant/boutique', label: 'Boutique', icon: Gift, end: false }

export function ChildLayout() {
  const user = useCurrentUser()
  const touchSession = useStore((s) => s.touchSession)
  const shopEnabled = useStore((s) => s.settings.features.shop)
  const location = useLocation()

  useEffect(() => {
    touchSession()
  }, [location.pathname, touchSession])

  if (!user) return null

  const links = shopEnabled ? [...BASE_LINKS, SHOP_LINK] : BASE_LINKS

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-3 pb-4 pt-[max(env(safe-area-inset-top),0.5rem)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        {/* Barre d'accent couleur de l'enfant : un border-top se dessine avant le padding, donc
            avant la zone de sécurité (pt-[...] ci-dessus) — sur iPhone (barre de statut
            "black-translucent", voir index.html), elle apparaissait comme un bandeau coloré
            détaché derrière l'heure, au lieu d'être collée au reste de l'en-tête. En la
            positionnant explicitement à env(safe-area-inset-top), elle reste au même endroit
            visuel qu'avant sur desktop/Android (où cet inset vaut 0) mais descend correctement
            sous l'encoche/la barre de statut sur iPhone. */}
        <span
          className="absolute inset-x-0 h-1"
          style={{ top: 'env(safe-area-inset-top, 0px)', backgroundColor: user.color }}
          aria-hidden
        />
        <img src="/images/kidsup-logo.png" alt="KidsUp" className="h-14 w-auto shrink-0" />
        <ChildAvatar user={user} size="sm" />
        <p className="min-w-0 flex-1 truncate text-base font-black">{user.name}</p>
        <NotificationCenter />
      </header>

      <DemoBanner />

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 pb-24">
        <PageTransition />
      </main>

      <nav
        className={cn(
          'fixed inset-x-0 bottom-0 z-40 grid gap-1 border-t border-slate-200 bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),0.375rem)] pt-1.5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95',
          shopEnabled ? 'grid-cols-4' : 'grid-cols-3',
        )}
      >
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[11px] font-semibold transition-colors',
                isActive ? 'text-slate-900 dark:text-white' : 'text-slate-400',
              )
            }
            style={({ isActive }) => (isActive ? { color: user.color } : undefined)}
          >
            <link.icon size={22} />
            {link.label}
          </NavLink>
        ))}
      </nav>

      {location.pathname === '/enfant' && <OnboardingTour storageKey={`kidsup:onboarding:${user.id}`} />}
    </div>
  )
}
