import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Gift, KeyRound, Plus, RotateCcw, ScrollText } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatedBalance } from '../../components/ui/AnimatedBalance'
import { AvatarEditorModal } from '../../components/ui/AvatarEditorModal'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ChildAvatar } from '../../components/ui/ChildAvatar'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { Field, inputCls } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { cn } from '../../lib/cn'
import { AVATAR_EMOJIS } from '../../lib/categories'
import { AGE_GROUP_LABELS, computeAgeGroup, computeAgeYears } from '../../lib/ageGroup'
import { computeBalance } from '../../lib/balance'
import { computeLifetimePoints, computePoints } from '../../lib/points'
import { computeRank } from '../../lib/ranks'
import { MAX_FREE_CHILDREN } from '../../lib/access'
import { useDemoMode } from '../../store/demoStore'
import { useFamilyAuthStore } from '../../store/familyAuthStore'
import { usePremiumUpsellStore } from '../../store/premiumUpsellStore'
import { useActiveThemePack } from '../../store/themePacksStore'
import { useCurrentUser, useStore } from '../../store/useStore'
import type { Role, User } from '../../types'

const COLOR_PRESETS = ['#3B82F6', '#EC4899', '#8B5CF6', '#10B981', '#F97316', '#06B6D4']

function CreateProfileModal({ onClose }: { onClose: () => void }) {
  const user = useCurrentUser()
  const createUser = useStore((s) => s.createUser)
  const toast = useStore((s) => s.toast)
  const demoActive = useDemoMode((s) => s.active)
  // GODCLAUDE phase 5 : emojis/palette du pack cosmétique actif de la famille.
  const activePack = useActiveThemePack()
  const emojiChoices = demoActive || !activePack ? AVATAR_EMOJIS : activePack.emojis
  const colorChoices = demoActive || !activePack ? COLOR_PRESETS : activePack.palette

  const [role, setRole] = useState<Role>('child')
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState(AVATAR_EMOJIS[0])
  const [color, setColor] = useState(COLOR_PRESETS[0])
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)

  if (!user) return null
  const secretValid = role === 'child' ? /^\d{4}$/.test(secret) : secret.length >= 4
  const valid = name.trim() && secretValid

  async function submit() {
    setBusy(true)
    await createUser({ role, name: name.trim(), avatar, color, secret }, user!.id)
    toast(`Profil de ${name.trim()} créé.`)
    onClose()
  }

  return (
    <Modal open onClose={onClose} title="Nouveau profil">
      <div className="space-y-4">
        <Field label="Rôle">
          <div className="flex gap-2">
            <Button variant={role === 'child' ? 'primary' : 'soft'} className="flex-1" onClick={() => setRole('child')}>
              Enfant
            </Button>
            <Button variant={role === 'parent' ? 'primary' : 'soft'} className="flex-1" onClick={() => setRole('parent')}>
              Parent
            </Button>
          </div>
        </Field>
        <Field label="Prénom *">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Avatar">
          <div className="flex flex-wrap gap-1.5">
            {emojiChoices.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setAvatar(e)}
                aria-pressed={avatar === e}
                className={cn(
                  'rounded-lg p-1.5 text-2xl cursor-pointer',
                  avatar === e ? 'bg-amber-200 dark:bg-amber-400/30' : 'hover:bg-slate-100 dark:hover:bg-slate-800',
                )}
              >
                {e}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Couleur">
          <div className="flex gap-2">
            {colorChoices.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setColor(preset)}
                aria-label={`Couleur ${preset}`}
                aria-pressed={color === preset}
                className={cn(
                  'h-9 w-9 rounded-full cursor-pointer',
                  color === preset && 'ring-2 ring-offset-2 ring-slate-500 dark:ring-offset-slate-900',
                )}
                style={{ backgroundColor: preset }}
              />
            ))}
          </div>
        </Field>
        <Field label={role === 'child' ? 'PIN initial (4 chiffres) *' : 'Mot de passe initial (4 caractères min.) *'}>
          <input
            className={inputCls}
            inputMode={role === 'child' ? 'numeric' : 'text'}
            maxLength={role === 'child' ? 4 : undefined}
            value={secret}
            onChange={(e) => setSecret(role === 'child' ? e.target.value.replace(/\D/g, '') : e.target.value)}
            placeholder={role === 'child' ? '••••' : 'Au moins 4 caractères'}
          />
        </Field>
        <Button className="w-full" disabled={!valid || busy} onClick={() => void submit()}>
          {busy ? 'Création…' : 'Créer le profil'}
        </Button>
      </div>
    </Modal>
  )
}

function EditChildModal({ child, onClose }: { child: User; onClose: () => void }) {
  const user = useCurrentUser()
  const updateChild = useStore((s) => s.updateChild)
  const changeSecret = useStore((s) => s.changeSecret)
  const toast = useStore((s) => s.toast)
  const demoActive = useDemoMode((s) => s.active)
  const activePack = useActiveThemePack()
  const colorChoices = demoActive || !activePack ? COLOR_PRESETS : activePack.palette
  // Référence toujours à jour (l'avatar/photo peut changer via le modal imbriqué ci-dessous).
  const liveChild = useStore((s) => s.users.find((u) => u.id === child.id)) ?? child

  const [name, setName] = useState(child.name)
  const [color, setColor] = useState(child.color)
  const [pin, setPin] = useState('')
  const [birthdate, setBirthdate] = useState(child.birthdate ? format(child.birthdate, 'yyyy-MM-dd') : '')
  const [editingAvatar, setEditingAvatar] = useState(false)

  if (!user) return null

  async function submit() {
    if (!name.trim()) return
    updateChild(
      child.id,
      { name: name.trim(), color, birthdate: birthdate ? new Date(birthdate).getTime() : undefined },
      user!.id,
    )
    if (pin) {
      if (!/^\d{4}$/.test(pin)) {
        toast('Le PIN doit faire exactement 4 chiffres.', 'error')
        return
      }
      await changeSecret(child.id, pin, user!.id)
    }
    toast('Profil mis à jour.')
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={`Profil de ${child.name}`}>
      <div className="space-y-4">
        <Field label="Prénom">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Avatar">
          <ChildAvatar user={liveChild} size="lg" onClick={() => setEditingAvatar(true)} />
        </Field>
        <Field label="Couleur">
          <div className="flex gap-2">
            {colorChoices.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setColor(preset)}
                aria-label={`Couleur ${preset}`}
                aria-pressed={color === preset}
                className={cn(
                  'h-9 w-9 rounded-full cursor-pointer',
                  color === preset && 'ring-2 ring-offset-2 ring-slate-500 dark:ring-offset-slate-900',
                )}
                style={{ backgroundColor: preset }}
              />
            ))}
          </div>
        </Field>
        <Field label="Nouveau PIN (4 chiffres, vide = inchangé)">
          <input
            className={inputCls}
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="••••"
          />
        </Field>
        <Field label="Date de naissance (optionnel — sert au groupe Petit/Grand, voir Réglages)">
          <input
            className={inputCls}
            type="date"
            value={birthdate}
            max={format(new Date(), 'yyyy-MM-dd')}
            onChange={(e) => setBirthdate(e.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="soft" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={() => void submit()}>Sauvegarder</Button>
        </div>
      </div>

      {editingAvatar && (
        <AvatarEditorModal user={liveChild} actorId={user.id} onClose={() => setEditingAvatar(false)} />
      )}
    </Modal>
  )
}

/** Attribution ou retrait libre de points, hors création de tâche (ex : bonus ponctuel, correction). */
function AdjustPointsModal({ child, balance, onClose }: { child: User; balance: number; onClose: () => void }) {
  const user = useCurrentUser()
  const adjustPoints = useStore((s) => s.adjustPoints)
  const toast = useStore((s) => s.toast)
  const [sign, setSign] = useState<'add' | 'remove'>('add')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  if (!user) return null
  const parsed = parseInt(amount, 10)
  const valid = Number.isFinite(parsed) && parsed > 0 && (sign === 'add' || parsed <= balance)

  function submit() {
    if (!valid) return
    setBusy(true)
    const signed = sign === 'add' ? parsed : -parsed
    const ok = adjustPoints(child.id, signed, reason, user!.id)
    setBusy(false)
    if (ok) {
      toast(`${sign === 'add' ? '+' : '-'}${parsed} points pour ${child.name}.`)
      onClose()
    }
  }

  return (
    <Modal open onClose={onClose} title={`Points pour ${child.name}`}>
      <div className="space-y-4">
        <Field label="Ajouter ou retirer ?">
          <div className="flex gap-2">
            <Button variant={sign === 'add' ? 'primary' : 'soft'} className="flex-1" onClick={() => setSign('add')}>
              + Ajouter
            </Button>
            <Button variant={sign === 'remove' ? 'primary' : 'soft'} className="flex-1" onClick={() => setSign('remove')}>
              − Retirer
            </Button>
          </div>
        </Field>
        <Field label={sign === 'remove' ? `Combien de points ? (solde actuel : ${balance})` : 'Combien de points ?'}>
          <input
            className={inputCls}
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
          />
        </Field>
        <Field label="Motif (optionnel, mais utile pour le journal)">
          <input
            className={inputCls}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="ex : bonus pour l'avoir aidé sans qu'on demande"
            maxLength={80}
          />
        </Field>
        <Button className="w-full" disabled={!valid || busy} onClick={submit}>
          {sign === 'add' ? 'Ajouter les points' : 'Retirer les points'}
        </Button>
      </div>
    </Modal>
  )
}

export function ChildrenPage() {
  const user = useCurrentUser()
  const users = useStore((s) => s.users)
  const transactions = useStore((s) => s.transactions)
  const pointsTransactions = useStore((s) => s.pointsTransactions)
  const rankDefs = useStore((s) => s.rankDefs)
  const settings = useStore((s) => s.settings)
  const updateChild = useStore((s) => s.updateChild)
  const resetBalance = useStore((s) => s.resetBalance)
  const toast = useStore((s) => s.toast)
  const demoActive = useDemoMode((s) => s.active)
  const isFounder = useFamilyAuthStore((s) => s.isFounder)
  const plan = useFamilyAuthStore((s) => s.plan)
  const showUpsell = usePremiumUpsellStore((s) => s.show)

  const [editing, setEditing] = useState<User | null>(null)
  const [resetting, setResetting] = useState<User | null>(null)
  const [creating, setCreating] = useState(false)
  const [adjusting, setAdjusting] = useState<User | null>(null)

  if (!user) return null

  const children = users.filter((u) => u.role === 'child')
  // GODCLAUDE phase 3 : limite gratuite — pas un FeatureKey booléen (voir lib/access.ts),
  // vérifiée directement ici avec le nombre réel de profils enfant (actifs ou non, pour
  // qu'on ne puisse pas contourner la limite en désactivant un profil). Mode démo : jamais
  // limité (useFamilyAuthStore n'est pas démo-consciente, voir components/ui/PremiumGate.tsx).
  const atFreeLimit = !demoActive && !isFounder && plan !== 'premium' && children.length >= MAX_FREE_CHILDREN

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black">Enfants</h1>
        <Button onClick={() => (atFreeLimit ? showUpsell() : setCreating(true))}>
          <Plus size={18} />
          Nouveau profil
        </Button>
      </div>

      {atFreeLimit && (
        <Card className="flex flex-col items-center gap-2 p-5 text-center">
          <span className="text-2xl" aria-hidden>
            ✨
          </span>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            La formule gratuite est limitée à {MAX_FREE_CHILDREN} enfants. Passez à Premium pour en ajouter
            davantage.
          </p>
          <Button size="sm" onClick={showUpsell}>
            Découvrir Premium
          </Button>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {children.map((child) => {
          const rank = rankDefs.length > 0 ? computeRank(computeLifetimePoints(pointsTransactions, child.id), rankDefs) : null
          const ageGroup = computeAgeGroup(child.birthdate, settings.ageGroupThresholdYears)
          return (
          <Card key={child.id} className={cn('p-5', !child.isActive && 'opacity-60')}>
            <div className="flex items-center gap-4">
              <ChildAvatar user={child} size="lg" decoration={rank?.rank.emoji} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-bold">
                  {child.name}
                  {!child.isActive && <Badge>Inactif</Badge>}
                  {child.birthdate !== undefined && (
                    <Badge>
                      {computeAgeYears(child.birthdate)} ans{ageGroup ? ` · ${AGE_GROUP_LABELS[ageGroup]}` : ''}
                    </Badge>
                  )}
                </p>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <AnimatedBalance cents={computeBalance(transactions, child.id)} className="text-xl font-black" />
                  <span className="text-sm font-bold text-violet-600 dark:text-violet-400">
                    {computePoints(pointsTransactions, child.id)} pts
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Compte créé le {format(child.createdAt, 'd MMMM yyyy', { locale: fr })}
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="soft" size="sm" onClick={() => setEditing(child)}>
                <KeyRound size={15} />
                Modifier
              </Button>
              <Button variant="soft" size="sm" onClick={() => setResetting(child)}>
                <RotateCcw size={15} />
                Réinitialiser solde
              </Button>
              <Button variant="soft" size="sm" onClick={() => setAdjusting(child)}>
                <Gift size={15} />
                Points
              </Button>
              <Link to="/parent/journal">
                <Button variant="soft" size="sm">
                  <ScrollText size={15} />
                  Journal
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  updateChild(child.id, { isActive: !child.isActive }, user.id)
                  toast(child.isActive ? `${child.name} est désactivé(e).` : `${child.name} est réactivé(e).`)
                }}
              >
                {child.isActive ? 'Désactiver' : 'Réactiver'}
              </Button>
            </div>
          </Card>
          )
        })}
      </div>

      {creating && <CreateProfileModal onClose={() => setCreating(false)} />}
      {editing && <EditChildModal child={editing} onClose={() => setEditing(null)} />}
      {adjusting && (
        <AdjustPointsModal
          child={adjusting}
          balance={computePoints(pointsTransactions, adjusting.id)}
          onClose={() => setAdjusting(null)}
        />
      )}
      <ConfirmModal
        open={resetting !== null}
        onClose={() => setResetting(null)}
        title="Réinitialiser le solde"
        message={`Remettre le solde de ${resetting?.name} à zéro ? Un ajustement sera tracé dans le journal.`}
        confirmLabel="Remettre à zéro"
        danger
        onConfirm={() => {
          if (resetting) {
            resetBalance(resetting.id, user.id)
            toast(`Solde de ${resetting.name} remis à zéro.`)
          }
        }}
      />
    </div>
  )
}
