import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRightLeft, Plus, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Field, inputCls } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { db } from '../../db/storage'
import { computeAgeGroup } from '../../lib/ageGroup'
import { celebrate, celebrateFireworks } from '../../lib/confetti'
import { cn } from '../../lib/cn'
import { formatEuro, formatRelative } from '../../lib/format'
import { computePoints } from '../../lib/points'
import { SHOP_CATEGORIES, SHOP_CATEGORY_KEYS, SHOP_ICON_LIBRARY } from '../../lib/shopCatalog'
import { playCelebrationSound } from '../../lib/sound'
import { useCurrentUser, useStore } from '../../store/useStore'
import type { Redemption, ShopCategory } from '../../types'

/** Petite animation de "déballage" à l'ouverture, une seule fois par échange remis. */
function UnboxModal({ redemption, onClose }: { redemption: Redemption; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title="Ton lot est arrivé !">
      <div className="flex flex-col items-center gap-3 pb-2 text-center">
        <motion.span
          className="text-7xl"
          aria-hidden
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: [0, 1.3, 1], rotate: 0 }}
          transition={{ type: 'spring', damping: 8, stiffness: 200 }}
        >
          {redemption.icon}
        </motion.span>
        <p className="font-display text-xl font-bold">{redemption.title}</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">Profite bien de ta récompense ! 🎉</p>
        <Button className="mt-2 w-full" onClick={onClose}>
          Trop cool ! 🎉
        </Button>
      </div>
    </Modal>
  )
}

function ProposeWishModal({ childId, onClose }: { childId: string; onClose: () => void }) {
  const proposeWish = useStore((s) => s.proposeWish)
  const toast = useStore((s) => s.toast)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<ShopCategory>('cadeau')
  const [icon, setIcon] = useState(SHOP_ICON_LIBRARY.cadeau[0])

  function submit() {
    if (!title.trim()) {
      toast('Donne un nom à ton vœu.', 'error')
      return
    }
    proposeWish(childId, title, icon, category)
    toast('Vœu envoyé à tes parents ! 🎁')
    onClose()
  }

  return (
    <Modal open onClose={onClose} title="Proposer un vœu">
      <div className="space-y-4">
        <Field label="Ce que tu aimerais">
          <input
            className={inputCls}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ex : Aller à la patinoire"
            maxLength={40}
            autoFocus
          />
        </Field>
        <Field label="Catégorie">
          <select
            className={inputCls}
            value={category}
            onChange={(e) => {
              const cat = e.target.value as ShopCategory
              setCategory(cat)
              setIcon(SHOP_ICON_LIBRARY[cat][0])
            }}
          >
            {SHOP_CATEGORY_KEYS.map((key) => (
              <option key={key} value={key}>
                {SHOP_CATEGORIES[key].emoji} {SHOP_CATEGORIES[key].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Icône">
          <div className="flex flex-wrap gap-1.5">
            {SHOP_ICON_LIBRARY[category].map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setIcon(emoji)}
                aria-pressed={icon === emoji}
                className={cn(
                  'rounded-lg p-1.5 text-xl cursor-pointer',
                  icon === emoji ? 'bg-amber-200 dark:bg-amber-400/30' : 'hover:bg-slate-100 dark:hover:bg-slate-800',
                )}
              >
                {emoji}
              </button>
            ))}
          </div>
        </Field>
        <Button className="w-full" onClick={submit}>
          Envoyer à mes parents
        </Button>
      </div>
    </Modal>
  )
}

function ConvertPointsModal({
  childId,
  points,
  pointsPerEuro,
  onClose,
}: {
  childId: string
  points: number
  pointsPerEuro: number
  onClose: () => void
}) {
  const convertPointsToMoney = useStore((s) => s.convertPointsToMoney)
  const [amount, setAmount] = useState(String(points))

  const requested = parseInt(amount, 10) || 0
  const euros = Math.round((requested / pointsPerEuro) * 100)

  return (
    <Modal open onClose={onClose} title="Convertir des points en argent">
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Taux actuel : {pointsPerEuro} points = 1 €. Tu as {points} points.
        </p>
        <Field label="Points à convertir">
          <input
            className={inputCls}
            type="number"
            min="1"
            max={points}
            step="1"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <p className="text-sm font-bold">Tu recevras {formatEuro(euros)}</p>
        <Button
          className="w-full"
          disabled={requested <= 0 || requested > points}
          onClick={() => {
            const ok = convertPointsToMoney(childId, requested, childId)
            if (ok) onClose()
          }}
        >
          Convertir
        </Button>
      </div>
    </Modal>
  )
}

export function ChildShopPage() {
  const user = useCurrentUser()
  const shopItems = useStore((s) => s.shopItems)
  const redemptions = useStore((s) => s.redemptions)
  const pointsTransactions = useStore((s) => s.pointsTransactions)
  const settings = useStore((s) => s.settings)
  const redeemShopItem = useStore((s) => s.redeemShopItem)
  const toast = useStore((s) => s.toast)

  const [proposing, setProposing] = useState(false)
  const [converting, setConverting] = useState(false)
  const [unboxing, setUnboxing] = useState<Redemption | null>(null)

  // Détection des échanges fraîchement remis par un parent : petite animation de "déballage".
  useEffect(() => {
    const childId = user?.id
    if (!childId) return
    const key = `seenFulfilled:${childId}`
    const fulfilled = redemptions.filter((r) => r.childId === childId && r.status === 'fulfilled')
    void (async () => {
      const seen = await db.getItem<string[]>(key)
      if (seen !== null) {
        const fresh = fulfilled.find((r) => !seen.includes(r.id))
        if (fresh) {
          celebrateFireworks(['#911DE6', '#FF9A00', '#FFE066'])
          playCelebrationSound()
          setUnboxing(fresh)
        }
      }
      await db.setItem(key, fulfilled.map((r) => r.id))
    })()
  }, [user, redemptions])

  if (!user) return null

  const points = computePoints(pointsTransactions, user.id)
  const myAgeGroup = computeAgeGroup(user.birthdate, settings.ageGroupThresholdYears)
  // Un lot venu d'un vœu approuvé (proposedBy défini) reste réservé à l'enfant qui l'a demandé —
  // seuls les lots créés directement par un parent (proposedBy absent) sont partagés entre tous
  // les enfants. Idem pour ageGroup : un lot réservé à un groupe (Petit/Grand, voir Réglages)
  // n'apparaît que dans le catalogue de ce groupe, les lots communs (ageGroup absent) restent
  // visibles de tous. Voir aussi redeemShopItem dans useStore.ts (mêmes règles côté store).
  const catalogue = shopItems.filter(
    (i) =>
      i.status === 'active' &&
      (!i.proposedBy || i.proposedBy === user.id) &&
      (!i.ageGroup || i.ageGroup === myAgeGroup),
  )
  const myWishes = shopItems.filter((i) => i.status === 'proposed' && i.proposedBy === user.id)
  const myRedemptions = redemptions.filter((r) => r.childId === user.id).slice(0, 10)

  return (
    <div className="space-y-6">
      <Card className="flex flex-col items-center gap-2 bg-gradient-to-br from-violet-500 to-fuchsia-500 p-6 text-center text-white shadow-lg">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-white/85">
          <Sparkles size={16} aria-hidden />
          Mes points
        </p>
        <p className="font-display text-5xl font-bold">{points}</p>
        <Button variant="soft" size="sm" className="mt-1 bg-white/20 text-white hover:bg-white/30" onClick={() => setConverting(true)}>
          <ArrowRightLeft size={16} />
          Convertir en argent
        </Button>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Catalogue</h2>
        <Button variant="soft" size="sm" onClick={() => setProposing(true)}>
          <Plus size={16} />
          Proposer un vœu
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {catalogue.map((item) => {
          const outOfStock = item.stock === 0
          const canAfford = item.cost !== undefined && points >= item.cost && !outOfStock
          return (
            <Card key={item.id} className={cn('p-4', outOfStock && 'opacity-60')}>
              <div className="flex items-center gap-3">
                <span className="text-3xl" aria-hidden>
                  {item.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{item.title}</p>
                  <p className="text-xs font-semibold text-violet-600 dark:text-violet-400">
                    {outOfStock ? 'Épuisé' : `${item.cost} pts`}
                  </p>
                </div>
              </div>
              {/* Bouton sur sa propre ligne, pleine largeur : icône + titre + prix + bouton sur
                  une seule ligne dépassait la largeur de l'écran sur mobile (voir aussi le
                  catalogue côté parent, ShopPage.tsx). */}
              <Button
                size="sm"
                variant={canAfford ? 'success' : 'soft'}
                disabled={!canAfford}
                className="mt-3 w-full"
                onClick={() => {
                  const ok = redeemShopItem(user.id, item.id, user.id)
                  if (ok) {
                    celebrate(['#911DE6', '#FF9A00', '#FFE066'])
                    toast('Demandé ! Un parent va te le remettre. 🎁')
                  }
                }}
              >
                {outOfStock ? 'Épuisé' : 'Échanger'}
              </Button>
            </Card>
          )
        })}
        {catalogue.length === 0 && <EmptyState emoji="🎁" text="La boutique est vide pour l'instant." />}
      </div>

      {myWishes.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Mes vœux en attente</h2>
          <Card className="divide-y divide-slate-100 dark:divide-slate-800">
            {myWishes.map((item) => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                <span className="text-xl" aria-hidden>
                  {item.icon}
                </span>
                <p className="min-w-0 flex-1 truncate text-sm font-semibold">{item.title}</p>
                <Badge tone="amber">En attente</Badge>
              </div>
            ))}
          </Card>
        </section>
      )}

      {myRedemptions.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Mes échanges</h2>
          <Card className="divide-y divide-slate-100 dark:divide-slate-800">
            {myRedemptions.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                <span className="text-xl" aria-hidden>
                  {r.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{r.title}</p>
                  <p className="text-xs text-slate-400">{formatRelative(r.requestedAt)}</p>
                </div>
                <Badge tone={r.status === 'fulfilled' ? 'green' : r.status === 'cancelled' ? 'neutral' : 'amber'}>
                  {r.status === 'fulfilled' ? 'Remis ✅' : r.status === 'cancelled' ? 'Annulé' : 'En attente'}
                </Badge>
              </div>
            ))}
          </Card>
        </section>
      )}

      {proposing && <ProposeWishModal childId={user.id} onClose={() => setProposing(false)} />}
      {converting && (
        <ConvertPointsModal
          childId={user.id}
          points={points}
          pointsPerEuro={settings.pointsPerEuro}
          onClose={() => setConverting(false)}
        />
      )}

      <AnimatePresence>
        {unboxing && <UnboxModal redemption={unboxing} onClose={() => setUnboxing(null)} />}
      </AnimatePresence>
    </div>
  )
}
