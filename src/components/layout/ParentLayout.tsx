import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  BarChart3,
  BellRing,
  CalendarDays,
  Gift,
  Home,
  ListTodo,
  LogOut,
  Menu,
  ScrollText,
  Settings,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '../../lib/cn'
import { useCurrentUser, useStore } from '../../store/useStore'
import { DemoBanner } from '../DemoBanner'
import { NotificationCenter } from '../NotificationCenter'
import { OnboardingTour } from '../OnboardingTour'
import { AvatarEditorModal } from '../ui/AvatarEditorModal'
import { ChildAvatar } from '../ui/ChildAvatar'
import { PageTransition } from '../ui/PageTransition'

const BASE_LINKS = [
  { to: '/parent', label: 'Accueil', icon: Home, end: true },
  { to: '/parent/taches', label: 'Tâches', icon: ListTodo },
  { to: '/parent/validations', label: 'Validations', icon: BellRing, badge: true },
  { to: '/parent/penalites', label: 'Pénalités', icon: AlertTriangle },
  { to: '/parent/stats', label: 'Stats', icon: BarChart3 },
  { to: '/parent/calendrier', label: 'Calendrier', icon: CalendarDays },
  { to: '/parent/enfants', label: 'Enfants', icon: Users },
  { to: '/parent/journal', label: 'Journal', icon: ScrollText },
  { to: '/parent/reglages', label: 'Réglages', icon: Settings },
]

const SHOP_LINK = { to: '/parent/boutique', label: 'Boutique', icon: Gift, end: false, badge: false }

function PendingBadge() {
  const count = useStore((s) => s.submissions.filter((x) => x.status === 'pending').length)
  if (count === 0) return null
  return (
    <span className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
      {count}
    </span>
  )
}

export function ParentLayout() {
  const user = useCurrentUser()
  const settings = useStore((s) => s.settings)
  const logout = useStore((s) => s.logout)
  const touchSession = useStore((s) => s.touchSession)
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingAvatar, setEditingAvatar] = useState(false)

  const links = settings.features.shop
    ? [...BASE_LINKS.slice(0, 4), SHOP_LINK, ...BASE_LINKS.slice(4)]
    : BASE_LINKS
  const mobileLinks = links.slice(0, 4)

  useEffect(() => {
    touchSession()
    setDrawerOpen(false)
  }, [location.pathname, touchSession])

  const navItem = (link: (typeof links)[number], mobile = false) => (
    <NavLink
      key={link.to}
      to={link.to}
      end={link.end}
      className={({ isActive }) =>
        cn(
          'relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-all',
          mobile && 'flex-col gap-0.5 px-2 py-1.5 text-[11px]',
          isActive
            ? mobile
              ? 'text-amber-600 dark:text-amber-400'
              : 'glow-brand bg-gradient-to-r from-amber-400/15 to-orange-500/10 text-amber-900 dark:text-amber-300'
            : 'text-slate-600 hover:bg-brand-from/10 dark:text-slate-300 dark:hover:bg-brand-from/15',
        )
      }
    >
      <span className="relative">
        <link.icon size={mobile ? 22 : 18} />
        {link.badge && <PendingBadge />}
      </span>
      {link.label}
    </NavLink>
  )

  return (
    <div className="min-h-dvh lg:flex">
      <aside className="hidden lg:flex lg:w-60 lg:flex-col lg:gap-1 lg:border-r lg:border-slate-200 lg:bg-white lg:p-4 dark:lg:border-slate-800 dark:lg:bg-slate-900">
        <div className="mb-2 flex items-center justify-between gap-2 px-2">
          <img src="/images/kidsup-logo.png" alt="KidsUp" className="h-14 w-auto shrink-0" />
          <NotificationCenter align="left" />
        </div>
        {user && (
          <button
            onClick={() => setEditingAvatar(true)}
            className="mb-3 flex items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <ChildAvatar user={user} size="sm" />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{user.name}</span>
          </button>
        )}
        {links.map((l) => navItem(l))}
        <div className="mt-auto border-t border-slate-200 pt-3 dark:border-slate-800">
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-200/70 dark:hover:bg-slate-800 cursor-pointer"
          >
            <LogOut size={18} />
            Déconnexion ({user?.name})
          </button>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center justify-between gap-2 border-b border-slate-200 bg-white/90 px-3 pb-4 pt-[max(env(safe-area-inset-top),0.5rem)] backdrop-blur lg:hidden dark:border-slate-800 dark:bg-slate-900/90">
          <img src="/images/kidsup-logo.png" alt="KidsUp" className="h-14 w-auto shrink-0" />
          <div className="flex items-center gap-1">
            <NotificationCenter />
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="Ouvrir le menu"
              className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Menu size={22} />
            </button>
          </div>
        </header>

        <DemoBanner />

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-24 lg:pb-8">
          <PageTransition />
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 gap-1 border-t border-slate-200 bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),0.375rem)] pt-1.5 backdrop-blur lg:hidden dark:border-slate-800 dark:bg-slate-900/95">
          {mobileLinks.map((l) => navItem(l, true))}
        </nav>
      </div>

      <AnimatePresence>
        {drawerOpen && (
          <motion.div
            className="fixed inset-0 z-50 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-slate-950/50" onClick={() => setDrawerOpen(false)} aria-hidden />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 350 }}
              className="absolute inset-y-0 right-0 flex w-72 flex-col gap-1 bg-white px-4 pb-4 pt-[max(env(safe-area-inset-top),1rem)] shadow-xl dark:bg-slate-900"
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="font-black">Menu</p>
                <button
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Fermer le menu"
                  className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>
              {user && (
                <button
                  onClick={() => setEditingAvatar(true)}
                  className="mb-2 flex items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <ChildAvatar user={user} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{user.name}</span>
                </button>
              )}
              {links.map((l) => navItem(l))}
              <button
                onClick={logout}
                className="mt-auto flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-200/70 dark:hover:bg-slate-800 cursor-pointer"
              >
                <LogOut size={18} />
                Déconnexion ({user?.name})
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {editingAvatar && user && (
        <AvatarEditorModal user={user} actorId={user.id} onClose={() => setEditingAvatar(false)} />
      )}

      {user && location.pathname === '/parent' && (
        <OnboardingTour storageKey={`kidsup:onboarding:${user.id}`} />
      )}
    </div>
  )
}
