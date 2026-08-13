import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ChildAvatar } from '../../components/ui/ChildAvatar'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { EmptyState } from '../../components/ui/EmptyState'
import { Field, inputCls } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { Tabs } from '../../components/ui/Tabs'
import { cn } from '../../lib/cn'
import { canCreateCustom, MAX_FREE_CUSTOM } from '../../lib/access'
import { AGE_GROUP_LABELS } from '../../lib/ageGroup'
import { formatRelative } from '../../lib/format'
import { SHOP_CATEGORIES, SHOP_CATEGORY_KEYS, SHOP_EXAMPLES, SHOP_ICON_LIBRARY } from '../../lib/shopCatalog'
import { useDemoMode } from '../../store/demoStore'
import { useFamilyAuthStore } from '../../store/familyAuthStore'
import { usePremiumUpsellStore } from '../../store/premiumUpsellStore'
import { useCurrentUser, useStore } from '../../store/useStore'
import type { AgeGroup, ShopCategory, ShopItem } from '../../types'

/** Sélecteur Commun / Petits / Grands, réutilisé à la création et à l'édition d'un lot. */
function AgeGroupField({
  value,
  onChange,
}: {
  value: AgeGroup | undefined
  onChange: (value: AgeGroup | undefined) => void
}) {
  return (
    <Field label="Groupe d'âge">
      <div className="flex gap-2">
        <Button variant={value === undefined ? 'primary' : 'soft'} className="flex-1" onClick={() => onChange(undefined)}>
          Commun
        </Button>
        <Button variant={value === 'petit' ? 'primary' : 'soft'} className="flex-1" onClick={() => onChange('petit')}>
          {AGE_GROUP_LABELS.petit}s
        </Button>
        <Button variant={value === 'grand' ? 'primary' : 'soft'} className="flex-1" onClick={() => onChange('grand')}>
          {AGE_GROUP_LABELS.grand}s
        </Button>
      </div>
    </Field>
  )
}

/** true = illimité (case cochée), false = quantité précise saisie à côté. */
function StockField({
  stock,
  onChange,
}: {
  stock: string
  onChange: (value: string) => void
}) {
  const unlimited = stock === ''
  return (
    <Field label="Stock disponible">
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={unlimited}
            onChange={(e) => onChange(e.target.checked ? '' : '5')}
            className="h-4 w-4 accent-amber-500"
          />
          Illimité
        </label>
        {!unlimited && (
          <input
            className={inputCls}
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={stock}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </div>
    </Field>
  )
}

function CreateItemModal({ onClose }: { onClose: () => void }) {
  const user = useCurrentUser()
  const createShopItem = useStore((s) => s.createShopItem)
  const toast = useStore((s) => s.toast)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<ShopCategory>('cinema')
  const [icon, setIcon] = useState(SHOP_ICON_LIBRARY.cinema[0])
  const [cost, setCost] = useState('50')
  const [stock, setStock] = useState('')
  const [ageGroup, setAgeGroup] = useState<AgeGroup | undefined>(undefined)

  if (!user) return null

  function pickExample(ex: (typeof SHOP_EXAMPLES)[number]) {
    setTitle(ex.title)
    setCategory(ex.category)
    setIcon(ex.icon)
  }

  function submit() {
    const points = parseInt(cost, 10)
    if (!title.trim() || !Number.isFinite(points) || points <= 0) {
      toast('Titre et coût en points valides requis.', 'error')
      return
    }
    const stockValue = stock === '' ? undefined : Math.max(0, parseInt(stock, 10) || 0)
    createShopItem({ title: title.trim(), icon, category, cost: points, stock: stockValue, ageGroup }, user!.id)
    toast('Lot ajouté à la boutique !')
    onClose()
  }

  return (
    <Modal open onClose={onClose} title="Nouveau lot" wide>
      <div className="space-y-4">
        <Field label="Exemples rapides">
          <div className="flex flex-wrap gap-2">
            {SHOP_EXAMPLES.map((ex) => (
              <button
                key={ex.title}
                type="button"
                onClick={() => pickExample(ex)}
                className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 cursor-pointer"
              >
                {ex.icon} {ex.title}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Titre *">
          <input
            className={inputCls}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ex : Soirée ciné"
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
        <Field label="Coût en points *">
          <input
            className={inputCls}
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
        </Field>
        <StockField stock={stock} onChange={setStock} />
        <AgeGroupField value={ageGroup} onChange={setAgeGroup} />
        <Button className="w-full" onClick={submit}>
          Ajouter à la boutique
        </Button>
      </div>
    </Modal>
  )
}

function EditItemModal({ item, onClose }: { item: ShopItem; onClose: () => void }) {
  const user = useCurrentUser()
  const updateShopItem = useStore((s) => s.updateShopItem)
  const toast = useStore((s) => s.toast)
  const [cost, setCost] = useState(String(item.cost ?? 0))
  const [stock, setStock] = useState(item.stock === undefined ? '' : String(item.stock))
  const [ageGroup, setAgeGroup] = useState<AgeGroup | undefined>(item.ageGroup)

  if (!user) return null

  function submit() {
    const points = parseInt(cost, 10)
    if (!Number.isFinite(points) || points <= 0) {
      toast('Coût en points invalide.', 'error')
      return
    }
    const stockValue = stock === '' ? undefined : Math.max(0, parseInt(stock, 10) || 0)
    updateShopItem(item.id, { cost: points, stock: stockValue, ageGroup }, user!.id)
    toast('Lot mis à jour.')
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={`Modifier « ${item.title} »`}>
      <div className="space-y-4">
        <Field label="Coût en points *">
          <input
            className={inputCls}
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            autoFocus
          />
        </Field>
        <StockField stock={stock} onChange={setStock} />
        <AgeGroupField value={ageGroup} onChange={setAgeGroup} />
        {item.stock === 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Ce lot est actuellement épuisé — augmente le stock pour le remettre en vente.
          </p>
        )}
        <Button className="w-full" onClick={submit}>
          Enregistrer
        </Button>
      </div>
    </Modal>
  )
}

function ApproveWishModal({ item, onClose }: { item: ShopItem; onClose: () => void }) {
  const user = useCurrentUser()
  const approveWish = useStore((s) => s.approveWish)
  const toast = useStore((s) => s.toast)
  const [cost, setCost] = useState('50')
  const [stock, setStock] = useState('')

  if (!user) return null

  function submit() {
    const points = parseInt(cost, 10)
    if (!Number.isFinite(points) || points <= 0) {
      toast('Coût en points invalide.', 'error')
      return
    }
    const stockValue = stock === '' ? undefined : Math.max(0, parseInt(stock, 10) || 0)
    approveWish(item.id, points, user!.id, stockValue)
    toast('Vœu accepté et ajouté à la boutique !')
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={`Accepter « ${item.title} »`}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">Fixe le coût en points pour ce lot.</p>
        <Field label="Coût en points *">
          <input
            className={inputCls}
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            autoFocus
          />
        </Field>
        <StockField stock={stock} onChange={setStock} />
        <Button className="w-full" onClick={submit}>
          Ajouter à la boutique
        </Button>
      </div>
    </Modal>
  )
}

export function ShopPage() {
  const user = useCurrentUser()
  const users = useStore((s) => s.users)
  const shopItems = useStore((s) => s.shopItems)
  const redemptions = useStore((s) => s.redemptions)
  const deleteShopItem = useStore((s) => s.deleteShopItem)
  const rejectWish = useStore((s) => s.rejectWish)
  const fulfillRedemption = useStore((s) => s.fulfillRedemption)
  const cancelRedemption = useStore((s) => s.cancelRedemption)
  const toast = useStore((s) => s.toast)
  const demoActive = useDemoMode((s) => s.active)
  const isFounder = useFamilyAuthStore((s) => s.isFounder)
  const plan = useFamilyAuthStore((s) => s.plan)
  const showUpsell = usePremiumUpsellStore((s) => s.show)

  const [tab, setTab] = useState<'catalogue' | 'voeux' | 'echanges'>('catalogue')
  const [creating, setCreating] = useState(false)
  const [editingItem, setEditingItem] = useState<ShopItem | null>(null)
  const [approvingWish, setApprovingWish] = useState<ShopItem | null>(null)
  const [deletingItem, setDeletingItem] = useState<ShopItem | null>(null)

  if (!user) return null

  const catalogue = shopItems.filter((i) => i.status === 'active')
  const wishes = shopItems.filter((i) => i.status === 'proposed')
  const pendingRedemptions = redemptions.filter((r) => r.status === 'pending')
  const historyRedemptions = redemptions.filter((r) => r.status !== 'pending').slice(0, 20)

  // Ajustement du 31/07 (voir lib/access.ts) : catalogue de départ toujours utilisable/
  // assignable gratuitement, jusqu'à MAX_FREE_CUSTOM lot(s) personnalisé(s) (createdBy !==
  // 'system' — inclut un vœu d'enfant approuvé, qui devient lui aussi un lot personnalisé)
  // avant l'upsell. Mode démo : jamais limité.
  const customCount = catalogue.filter((i) => i.createdBy !== 'system').length
  const canCreateOrEditCustom = demoActive || canCreateCustom(isFounder, plan, customCount)

  const nameOf = (id?: string) => users.find((u) => u.id === id)?.name ?? '?'

  function requestNew() {
    if (canCreateOrEditCustom) setCreating(true)
    else showUpsell()
  }

  function requestEdit(item: ShopItem) {
    if (item.createdBy !== 'system' || canCreateOrEditCustom) setEditingItem(item)
    else showUpsell()
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black">Boutique</h1>
        <Button onClick={requestNew}>
          <Plus size={18} />
          Nouveau lot
        </Button>
      </div>

      {!canCreateOrEditCustom && (
        <Card className="flex flex-col items-center gap-2 p-5 text-center">
          <span className="text-2xl" aria-hidden>
            ✨
          </span>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            La formule gratuite inclut {MAX_FREE_CUSTOM} lot personnalisé. Passez à Premium pour créer ou modifier
            les lots du catalogue.
          </p>
          <Button size="sm" onClick={showUpsell}>
            Découvrir Premium
          </Button>
        </Card>
      )}

      <Tabs
        tabs={[
          { id: 'catalogue', label: 'Catalogue' },
          { id: 'voeux', label: 'Vœux', count: wishes.length },
          { id: 'echanges', label: 'Échanges', count: pendingRedemptions.length },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'catalogue' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {catalogue.map((item) => {
            const outOfStock = item.stock === 0
            return (
              <Card key={item.id} className={cn('p-4', outOfStock && 'opacity-60')}>
                <div className="flex items-center gap-3">
                  <span className="text-3xl" aria-hidden>
                    {item.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{item.title}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <Badge>{SHOP_CATEGORIES[item.category].label}</Badge>
                      {outOfStock ? (
                        <Badge tone="red">Épuisé</Badge>
                      ) : (
                        item.stock !== undefined && <Badge tone="amber">Stock : {item.stock}</Badge>
                      )}
                      {/* Lot venu d'un vœu approuvé : réservé à l'enfant qui l'a demandé, les
                          autres ne le voient pas dans leur catalogue (voir ChildShopPage.tsx). */}
                      {item.proposedBy && <Badge>Réservé à {nameOf(item.proposedBy)}</Badge>}
                      {item.ageGroup && <Badge tone="green">{AGE_GROUP_LABELS[item.ageGroup]}s</Badge>}
                    </div>
                  </div>
                </div>
                {/* Prix + actions sur leur propre ligne (même correctif que Vœux/Échanges
                    ci-dessous) : icône + titre + badges + prix + 2 boutons sur une seule ligne
                    dépassait la largeur de l'écran sur mobile. */}
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="font-bold text-violet-600 dark:text-violet-400">{item.cost} pts</span>
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => requestEdit(item)}
                      aria-label="Modifier ce lot"
                      className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => setDeletingItem(item)}
                      aria-label="Retirer ce lot"
                      className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/40"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </Card>
            )
          })}
          {catalogue.length === 0 && <EmptyState emoji="🎁" text="Aucun lot pour l'instant. Ajoutes-en un !" />}
        </div>
      )}

      {tab === 'voeux' && (
        <div className="space-y-3">
          {wishes.map((item) => (
            <Card key={item.id} className="p-4">
              <div className="flex items-center gap-3">
                <span className="text-3xl" aria-hidden>
                  {item.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{item.title}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Proposé par {nameOf(item.proposedBy)} · {formatRelative(item.createdAt)}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <Button
                  size="sm"
                  variant="soft"
                  onClick={() => {
                    rejectWish(item.id, user.id)
                    toast('Vœu refusé.')
                  }}
                >
                  <X size={16} />
                  Refuser
                </Button>
                <Button size="sm" variant="success" onClick={() => setApprovingWish(item)}>
                  <Check size={16} />
                  Accepter
                </Button>
              </div>
            </Card>
          ))}
          {wishes.length === 0 && <EmptyState emoji="💭" text="Aucun vœu en attente." />}
        </div>
      )}

      {tab === 'echanges' && (
        <div className="space-y-5">
          <div>
            <h2 className="mb-3 text-lg font-bold">En attente de remise</h2>
            <div className="space-y-3">
              {pendingRedemptions.map((r) => {
                const child = users.find((u) => u.id === r.childId)
                return (
                  <Card key={r.id} className="p-4">
                    <div className="flex items-center gap-3">
                      {child && <ChildAvatar user={child} size="sm" />}
                      <span className="text-2xl" aria-hidden>
                        {r.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{r.title}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {r.cost} pts · {formatRelative(r.requestedAt)}
                        </p>
                      </div>
                    </div>
                    {/* Actions sur leur propre ligne (flex-wrap) : sur petit écran, avatar + emoji +
                        texte + 2 boutons sur une seule ligne débordait et forçait un défilement
                        horizontal pour atteindre « Remis ! ». */}
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      <Button
                        size="sm"
                        variant="soft"
                        onClick={() => {
                          cancelRedemption(r.id, user.id)
                          toast('Échange annulé, points remboursés.')
                        }}
                      >
                        Annuler
                      </Button>
                      <Button
                        size="sm"
                        variant="success"
                        onClick={() => {
                          fulfillRedemption(r.id, user.id)
                          toast('Lot marqué comme remis.')
                        }}
                      >
                        Remis !
                      </Button>
                    </div>
                  </Card>
                )
              })}
              {pendingRedemptions.length === 0 && <EmptyState emoji="✅" text="Rien à remettre pour l'instant." />}
            </div>
          </div>

          {historyRedemptions.length > 0 && (
            <div>
              <h2 className="mb-3 text-lg font-bold">Historique</h2>
              <Card className="divide-y divide-slate-100 dark:divide-slate-800">
                {historyRedemptions.map((r) => {
                  const child = users.find((u) => u.id === r.childId)
                  return (
                    <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                      {child && <ChildAvatar user={child} size="sm" />}
                      <p className="min-w-0 flex-1 truncate text-sm">
                        {r.icon} {r.title}
                      </p>
                      <Badge tone={r.status === 'fulfilled' ? 'green' : 'neutral'}>
                        {r.status === 'fulfilled' ? 'Remis' : 'Annulé'}
                      </Badge>
                    </div>
                  )
                })}
              </Card>
            </div>
          )}
        </div>
      )}

      {creating && <CreateItemModal onClose={() => setCreating(false)} />}
      {editingItem && <EditItemModal item={editingItem} onClose={() => setEditingItem(null)} />}
      {approvingWish && <ApproveWishModal item={approvingWish} onClose={() => setApprovingWish(null)} />}

      <ConfirmModal
        open={deletingItem !== null}
        onClose={() => setDeletingItem(null)}
        title="Retirer ce lot"
        message={`« ${deletingItem?.title} » sera retiré de la boutique.`}
        confirmLabel="Retirer"
        danger
        onConfirm={() => {
          if (deletingItem) deleteShopItem(deletingItem.id, user.id)
        }}
      />
    </div>
  )
}
