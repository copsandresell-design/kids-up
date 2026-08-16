import { AlertTriangle, Pencil, Plus, Repeat, Trash2, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { Amount } from '../../components/ui/Amount'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ChildAvatar } from '../../components/ui/ChildAvatar'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { EmptyState } from '../../components/ui/EmptyState'
import { Field, inputCls } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { Switch } from '../../components/ui/Switch'
import { centsToEuroInput, euroToCents, formatDateTime, formatEuro } from '../../lib/format'
import { DAYS_FR } from '../../lib/recurrence'
import { PENALTY_CANCEL_WINDOW, useCurrentUser, useStore } from '../../store/useStore'
import type { Frequency, PenaltyCurrency, PenaltyRule } from '../../types'

/** Vue unifiée d'une pénalité, qu'elle vive dans `transactions` (€) ou `pointsTransactions` (points) —
 *  voir applyPenalty : les deux devises sont valides, une pénalité donnée n'est jamais que l'une des deux. */
interface PenaltyEntry {
  id: string
  childId: string
  description: string
  amount: number
  currency: PenaltyCurrency
  cancelled?: boolean
  createdAt: number
}

/** Fréquences pertinentes pour une règle sans historique de soumissions (pas de notion "2×/semaine" ici). */
const RULE_FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: 'daily', label: 'Chaque jour' },
  { value: 'weekly', label: 'Chaque semaine' },
  { value: 'monthly', label: 'Chaque mois' },
]

function describeRuleRecurrence(rule: PenaltyRule): string {
  switch (rule.recurrence.frequency) {
    case 'daily':
      return 'Chaque jour'
    case 'weekly':
      return `Chaque ${DAYS_FR[rule.recurrence.dayOfWeek ?? 0]}`
    case 'monthly':
      return `Le ${rule.recurrence.dayOfMonth ?? 1} du mois`
    default:
      return ''
  }
}

/** Bascule Points / € — mêmes deux devises que les pénalités d'inactivité (Réglages), même style
 *  de toggle à deux boutons que "Ajouter/Retirer" des points (voir ChildrenPage.AdjustPointsModal). */
function CurrencyToggle({ value, onChange }: { value: PenaltyCurrency; onChange: (c: PenaltyCurrency) => void }) {
  return (
    <div className="flex gap-2">
      <Button variant={value === 'points' ? 'primary' : 'soft'} className="flex-1" onClick={() => onChange('points')}>
        Points
      </Button>
      <Button variant={value === 'money' ? 'primary' : 'soft'} className="flex-1" onClick={() => onChange('money')}>
        €
      </Button>
    </div>
  )
}

function PenaltyRuleModal({
  rule,
  defaultChildId,
  onClose,
}: {
  rule: PenaltyRule | null
  defaultChildId: string
  onClose: () => void
}) {
  const user = useCurrentUser()
  const children = useStore((s) => s.users).filter((u) => u.role === 'child' && u.isActive)
  const savePenaltyRule = useStore((s) => s.savePenaltyRule)
  const toast = useStore((s) => s.toast)

  // Règle existante sans currency (créée avant l'ajout des points) : 'money', son seul sens historique.
  // Nouvelle règle : 'points' par défaut, la devise que la famille utilise désormais au quotidien.
  const [currency, setCurrency] = useState<PenaltyCurrency>(rule ? (rule.currency ?? 'money') : 'points')
  const [childId, setChildId] = useState(rule?.childId ?? defaultChildId)
  const [title, setTitle] = useState(rule?.title ?? '')
  const [amount, setAmount] = useState(
    rule ? (rule.currency === 'points' ? String(rule.amount) : centsToEuroInput(rule.amount)) : '10',
  )
  const [frequency, setFrequency] = useState<Frequency>(rule?.recurrence.frequency ?? 'weekly')
  const [dayOfWeek, setDayOfWeek] = useState(rule?.recurrence.dayOfWeek ?? 6)
  const [dayOfMonth, setDayOfMonth] = useState(rule?.recurrence.dayOfMonth ?? 1)

  if (!user) return null
  const resolvedAmount = currency === 'points' ? Math.round(Number(amount)) : euroToCents(amount)
  const valid = title.trim() && resolvedAmount > 0 && childId

  function submit() {
    savePenaltyRule(
      {
        id: rule?.id,
        childId,
        title: title.trim(),
        amount: resolvedAmount,
        currency,
        recurrence: {
          frequency,
          dayOfWeek: frequency === 'weekly' ? dayOfWeek : undefined,
          dayOfMonth: frequency === 'monthly' ? dayOfMonth : undefined,
        },
        active: rule?.active ?? true,
      },
      user!.id,
    )
    toast(rule ? 'Règle modifiée.' : 'Règle créée.')
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={rule ? 'Modifier la règle' : 'Nouvelle règle de pénalité'}>
      <div className="space-y-4">
        <Field label="Enfant">
          <select className={inputCls} value={childId} onChange={(e) => setChildId(e.target.value)}>
            {children.map((c) => (
              <option key={c.id} value={c.id}>
                {c.avatar} {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Titre *">
          <input
            className={inputCls}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ex : Chambre pas rangée"
            autoFocus
          />
        </Field>
        <Field label="Devise">
          <CurrencyToggle value={currency} onChange={setCurrency} />
        </Field>
        <Field label={currency === 'points' ? 'Montant retiré (points)' : 'Montant (€)'}>
          <input
            className={inputCls}
            type="number"
            min={currency === 'points' ? '1' : '0.01'}
            step={currency === 'points' ? '1' : '0.01'}
            inputMode={currency === 'points' ? 'numeric' : 'decimal'}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Fréquence">
          <select className={inputCls} value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
            {RULE_FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
        {frequency === 'weekly' && (
          <Field label="Quel jour ?">
            <select className={inputCls} value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))}>
              {DAYS_FR.map((day, i) => (
                <option key={day} value={i}>
                  {day}
                </option>
              ))}
            </select>
          </Field>
        )}
        {frequency === 'monthly' && (
          <Field label="Quel jour du mois ? (1–28)">
            <input
              className={inputCls}
              type="number"
              min={1}
              max={28}
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(Math.min(28, Math.max(1, Number(e.target.value))))}
            />
          </Field>
        )}
        <Button className="w-full" disabled={!valid} onClick={submit}>
          {rule ? 'Enregistrer' : 'Créer la règle'}
        </Button>
      </div>
    </Modal>
  )
}

function EditPenaltyModal({
  entry,
  onClose,
}: {
  entry: PenaltyEntry
  onClose: () => void
}) {
  const user = useCurrentUser()
  const editPenaltyTransaction = useStore((s) => s.editPenaltyTransaction)
  const toast = useStore((s) => s.toast)
  const parts = entry.description.replace('⚠️ ', '').split(' — ')
  const [title, setTitle] = useState(parts[0] ?? '')
  const [motif, setMotif] = useState(parts.slice(1).join(' — '))
  const [amount, setAmount] = useState(
    entry.currency === 'points' ? String(Math.abs(entry.amount)) : centsToEuroInput(Math.abs(entry.amount)),
  )

  if (!user) return null
  const resolvedAmount = entry.currency === 'points' ? Math.round(Number(amount)) : euroToCents(amount)
  const valid = title.trim() && resolvedAmount > 0

  return (
    <Modal open onClose={onClose} title="Modifier la pénalité">
      <div className="space-y-4">
        <Field label="Titre *">
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Motif (optionnel)">
          <input className={inputCls} value={motif} onChange={(e) => setMotif(e.target.value)} />
        </Field>
        <Field label={entry.currency === 'points' ? 'Montant retiré (points)' : 'Montant retiré (€)'}>
          <input
            className={inputCls}
            type="number"
            min={entry.currency === 'points' ? '1' : '0.01'}
            step={entry.currency === 'points' ? '1' : '0.01'}
            inputMode={entry.currency === 'points' ? 'numeric' : 'decimal'}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="soft" onClick={onClose}>
            Annuler
          </Button>
          <Button
            disabled={!valid}
            onClick={() => {
              const ok = editPenaltyTransaction(
                entry.id,
                { title: title.trim(), motif: motif.trim() || undefined, amount: resolvedAmount },
                user.id,
              )
              toast(ok ? 'Pénalité modifiée.' : 'Impossible de modifier cette pénalité.', ok ? 'success' : 'error')
              onClose()
            }}
          >
            Enregistrer
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export function PenaltiesPage() {
  const user = useCurrentUser()
  const children = useStore((s) => s.users).filter((u) => u.role === 'child' && u.isActive)
  const users = useStore((s) => s.users)
  const transactions = useStore((s) => s.transactions)
  const pointsTransactions = useStore((s) => s.pointsTransactions)
  const settings = useStore((s) => s.settings)
  const penaltyRules = useStore((s) => s.penaltyRules)
  const applyPenalty = useStore((s) => s.applyPenalty)
  const cancelPenalty = useStore((s) => s.cancelPenalty)
  const deletePenaltyTransaction = useStore((s) => s.deletePenaltyTransaction)
  const savePenaltyRule = useStore((s) => s.savePenaltyRule)
  const deletePenaltyRule = useStore((s) => s.deletePenaltyRule)
  const toast = useStore((s) => s.toast)

  const [currency, setCurrency] = useState<PenaltyCurrency>('points')
  const [childId, setChildId] = useState(children[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [motif, setMotif] = useState('')
  const [amount, setAmount] = useState('10')
  const [confirming, setConfirming] = useState(false)
  const [editing, setEditing] = useState<PenaltyEntry | null>(null)
  const [deleting, setDeleting] = useState<PenaltyEntry | null>(null)
  const [editingRule, setEditingRule] = useState<PenaltyRule | 'new' | null>(null)
  const [deletingRule, setDeletingRule] = useState<PenaltyRule | null>(null)

  if (!user) return null

  // Historique unifié : une pénalité vit soit dans transactions (€), soit dans pointsTransactions
  // (points), jamais les deux — voir applyPenalty. Fusionnées ici pour un seul flux chronologique.
  const penalties: PenaltyEntry[] = [
    ...transactions
      .filter((t) => t.type === 'penalty')
      .map((t) => ({ ...t, currency: 'money' as const })),
    ...pointsTransactions
      .filter((p) => p.type === 'penalty')
      .map((p) => ({ ...p, currency: 'points' as const })),
  ].sort((a, b) => b.createdAt - a.createdAt)

  const child = children.find((c) => c.id === childId)
  const resolvedAmount = currency === 'points' ? Math.round(Number(amount)) : euroToCents(amount)
  const valid = child && title.trim() && resolvedAmount > 0

  function confirmApply() {
    if (!valid || !child) return
    const ok = applyPenalty(
      { childId: child.id, title: title.trim(), motif: motif.trim() || undefined, amount: resolvedAmount, currency },
      user!.id,
    )
    if (ok) {
      toast(
        `Pénalité de ${currency === 'points' ? `${resolvedAmount} pts` : formatEuro(resolvedAmount)} appliquée à ${child.name}.`,
      )
      setTitle('')
      setMotif('')
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-black">Pénalités</h1>

      <Card className="space-y-4 p-5">
        <p className="flex items-center gap-2 font-bold">
          <AlertTriangle size={18} className="text-rose-500" />
          Appliquer une pénalité
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Enfant">
            <select className={inputCls} value={childId} onChange={(e) => setChildId(e.target.value)}>
              {children.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.avatar} {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Devise">
            <CurrencyToggle value={currency} onChange={setCurrency} />
          </Field>
        </div>
        <Field label={currency === 'points' ? 'Montant retiré (points)' : 'Montant retiré (€)'}>
          <input
            className={inputCls}
            type="number"
            min={currency === 'points' ? '1' : '0.01'}
            step={currency === 'points' ? '1' : '0.01'}
            inputMode={currency === 'points' ? 'numeric' : 'decimal'}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Titre *">
          <input
            className={inputCls}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ex : Chambre pas rangée"
          />
        </Field>
        <Field label="Motif (optionnel)">
          <input
            className={inputCls}
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            placeholder="ex : malgré deux rappels"
          />
        </Field>
        <div className="flex justify-end">
          <Button variant="danger" disabled={!valid} onClick={() => setConfirming(true)}>
            Appliquer la pénalité
          </Button>
        </div>
      </Card>

      {settings.features.recurringPenalties && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Repeat size={18} className="text-slate-400" />
              Règles récurrentes
            </h2>
            <Button variant="soft" size="sm" onClick={() => setEditingRule('new')}>
              <Plus size={16} />
              Nouvelle règle
            </Button>
          </div>
          <div className="space-y-3">
            {penaltyRules.map((rule) => {
              const ruleChild = users.find((u) => u.id === rule.childId)
              const ruleCurrency: PenaltyCurrency = rule.currency ?? 'money'
              return (
                <Card key={rule.id} className="flex items-center gap-3 p-4">
                  {ruleChild && <ChildAvatar user={ruleChild} size="sm" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{rule.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{describeRuleRecurrence(rule)}</p>
                  </div>
                  <span className="text-sm font-bold text-rose-600 dark:text-rose-400">
                    {ruleCurrency === 'points' ? `-${rule.amount} pts` : `-${formatEuro(rule.amount)}`}
                  </span>
                  <Switch
                    checked={rule.active}
                    onChange={(active) => savePenaltyRule({ ...rule, active }, user.id)}
                    label={rule.active ? 'Désactiver' : 'Activer'}
                  />
                  <button
                    onClick={() => setEditingRule(rule)}
                    aria-label="Modifier la règle"
                    className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => setDeletingRule(rule)}
                    aria-label="Supprimer la règle"
                    className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/40"
                  >
                    <Trash2 size={16} />
                  </button>
                </Card>
              )
            })}
            {penaltyRules.length === 0 && (
              <EmptyState emoji="🔁" text="Aucune règle récurrente. Ex : chambre pas rangée le dimanche soir." />
            )}
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-3 text-lg font-bold">Historique des pénalités</h2>
        <div className="space-y-3">
          {penalties.map((entry) => {
            const penalizedChild = users.find((u) => u.id === entry.childId)
            const cancellable = !entry.cancelled && Date.now() - entry.createdAt <= PENALTY_CANCEL_WINDOW
            return (
              <Card
                key={entry.id}
                className={`flex items-center gap-3 border-l-4 p-4 ${
                  entry.cancelled ? 'border-l-slate-300 opacity-60' : 'border-l-rose-500'
                }`}
              >
                {penalizedChild && <ChildAvatar user={penalizedChild} size="sm" />}
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold ${entry.cancelled ? 'line-through' : ''}`}>
                    {entry.description.replace('⚠️ ', '')}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{formatDateTime(entry.createdAt)}</p>
                </div>
                {entry.cancelled && <Badge>Annulée</Badge>}
                {entry.currency === 'points' ? (
                  <Amount points={entry.amount} className="text-sm" />
                ) : (
                  <Amount cents={entry.amount} className="text-sm" />
                )}
                {!entry.cancelled && cancellable && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      cancelPenalty(entry.id, user.id)
                      toast('Pénalité annulée.')
                    }}
                  >
                    <Undo2 size={16} />
                    Annuler
                  </Button>
                )}
                {!entry.cancelled && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(entry)} aria-label="Modifier">
                      <Pencil size={16} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleting(entry)}
                      aria-label="Supprimer"
                      className="text-rose-500"
                    >
                      <Trash2 size={16} />
                    </Button>
                  </>
                )}
              </Card>
            )
          })}
          {penalties.length === 0 && <EmptyState emoji="😇" text="Aucune pénalité. Que des sages !" />}
        </div>
      </div>

      <ConfirmModal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Confirmer la pénalité"
        message={`Retirer ${currency === 'points' ? `${resolvedAmount} pts` : formatEuro(resolvedAmount)} à ${child?.name} pour « ${title.trim()} » ?`}
        confirmLabel="Oui, appliquer"
        danger
        onConfirm={confirmApply}
      />

      {editing && <EditPenaltyModal entry={editing} onClose={() => setEditing(null)} />}

      <ConfirmModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Supprimer la pénalité"
        message={`« ${deleting?.description.replace('⚠️ ', '')} » sera annulée et le montant remboursé, sans limite de temps. Continuer ?`}
        confirmLabel="Oui, supprimer"
        danger
        onConfirm={() => {
          if (deleting && user) {
            deletePenaltyTransaction(deleting.id, user.id)
            toast('Pénalité supprimée.')
          }
        }}
      />

      {editingRule && (
        <PenaltyRuleModal
          rule={editingRule === 'new' ? null : editingRule}
          defaultChildId={childId}
          onClose={() => setEditingRule(null)}
        />
      )}

      <ConfirmModal
        open={deletingRule !== null}
        onClose={() => setDeletingRule(null)}
        title="Supprimer la règle"
        message={`« ${deletingRule?.title} » ne s'appliquera plus automatiquement.`}
        confirmLabel="Oui, supprimer"
        danger
        onConfirm={() => {
          if (deletingRule && user) {
            deletePenaltyRule(deletingRule.id, user.id)
            toast('Règle supprimée.')
          }
        }}
      />
    </div>
  )
}
