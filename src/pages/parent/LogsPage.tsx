import { Download, Trash2, Undo2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Amount } from '../../components/ui/Amount'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { EmptyState } from '../../components/ui/EmptyState'
import { inputCls } from '../../components/ui/Field'
import { actionLabel, ACTION_LABELS } from '../../lib/actions'
import { downloadCsv } from '../../lib/csv'
import { formatDateShort, formatEuro, formatTime } from '../../lib/format'
import { useCurrentUser, useStore } from '../../store/useStore'
import type { AuditLog } from '../../types'

/**
 * Actions du Journal pour lesquelles un "annuler" ciblé et sûr existe. Volontairement
 * restreint à ces deux cas : les autres actions (login, réglages, avatar…) n'ont pas de
 * reversion sensée ou sûre à proposer depuis cette liste générique.
 */
function undoableTarget(
  log: AuditLog,
  submissions: ReturnType<typeof useStore.getState>['submissions'],
  transactions: ReturnType<typeof useStore.getState>['transactions'],
  pointsTransactions: ReturnType<typeof useStore.getState>['pointsTransactions'],
): 'approval' | 'penalty' | null {
  if (!log.relatedId) return null
  if (log.action === 'submission_approved') {
    const sub = submissions.find((s) => s.id === log.relatedId)
    return sub?.status === 'approved' ? 'approval' : null
  }
  if (log.action === 'penalty_applied') {
    // Une pénalité vit en € OU en points (voir applyPenalty) — chercher dans les deux registres.
    const tx = transactions.find((t) => t.id === log.relatedId)
    if (tx) return !tx.cancelled ? 'penalty' : null
    const ptx = pointsTransactions.find((p) => p.id === log.relatedId)
    return ptx && !ptx.cancelled ? 'penalty' : null
  }
  return null
}

/**
 * Certaines actions du Journal journalisent un montant (`log.amount`) qui peut être en
 * centimes (€) ou en points selon l'action — voire selon la transaction sous-jacente pour les
 * pénalités, qui existent dans les deux devises. Sans cette résolution, la colonne "Montant"
 * affichait par ex. un don de "50 pts" comme "0,50 €".
 */
const MONEY_ONLY_LOG_ACTIONS = new Set(['balance_reset', 'points_converted'])
const DUAL_CURRENCY_LOG_ACTIONS = new Set(['penalty_applied', 'penalty_cancelled', 'penalty_deleted'])

function logAmountCurrency(
  log: AuditLog,
  transactions: ReturnType<typeof useStore.getState>['transactions'],
  pointsTransactions: ReturnType<typeof useStore.getState>['pointsTransactions'],
): 'money' | 'points' | undefined {
  if (log.amount === undefined) return undefined
  if (MONEY_ONLY_LOG_ACTIONS.has(log.action)) return 'money'
  if (DUAL_CURRENCY_LOG_ACTIONS.has(log.action)) {
    if (log.relatedId && transactions.some((t) => t.id === log.relatedId)) return 'money'
    if (log.relatedId && pointsTransactions.some((p) => p.id === log.relatedId)) return 'points'
    return undefined
  }
  // Toutes les autres actions journalisant un montant (dons, prêts, ajustements, badge retiré…) sont en points.
  return 'points'
}

export function LogsPage() {
  const user = useCurrentUser()
  const logs = useStore((s) => s.logs)
  const users = useStore((s) => s.users)
  const submissions = useStore((s) => s.submissions)
  const transactions = useStore((s) => s.transactions)
  const revertApproval = useStore((s) => s.revertApproval)
  const deletePenaltyTransaction = useStore((s) => s.deletePenaltyTransaction)
  const deleteSubmission = useStore((s) => s.deleteSubmission)
  const pointsTransactions = useStore((s) => s.pointsTransactions)
  const toast = useStore((s) => s.toast)

  const [childFilter, setChildFilter] = useState('all')
  const [actionFilter, setActionFilter] = useState('all')
  const [actorFilter, setActorFilter] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [search, setSearch] = useState('')
  const [undoing, setUndoing] = useState<AuditLog | null>(null)
  const [deleting, setDeleting] = useState<AuditLog | null>(null)

  const children = users.filter((u) => u.role === 'child')
  const parents = users.filter((u) => u.role === 'parent')

  const nameOf = (id?: string) => users.find((u) => u.id === id)?.name ?? ''

  const filtered = useMemo(() => {
    const fromTs = from ? new Date(from).getTime() : 0
    const toTs = to ? new Date(to).setHours(23, 59, 59, 999) : Infinity
    const query = search.toLowerCase()
    return logs.filter((log) => {
      if (childFilter !== 'all' && log.subjectId !== childFilter) return false
      if (actionFilter !== 'all' && log.action !== actionFilter) return false
      if (actorFilter !== 'all' && log.actorId !== actorFilter) return false
      if (log.timestamp < fromTs || log.timestamp > toTs) return false
      if (
        query &&
        !`${actionLabel(log.action)} ${log.details} ${nameOf(log.actorId)} ${nameOf(log.subjectId)}`
          .toLowerCase()
          .includes(query)
      )
        return false
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, users, childFilter, actionFilter, actorFilter, from, to, search])

  function exportCsv() {
    downloadCsv(`journal-kidsup-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['Date', 'Heure', 'Acteur', 'Action', 'Enfant', 'Montant', 'Détails'],
      ...filtered.map((log) => [
        formatDateShort(log.timestamp),
        formatTime(log.timestamp),
        nameOf(log.actorId),
        actionLabel(log.action),
        nameOf(log.subjectId),
        log.amount !== undefined ? formatEuro(log.amount) : '',
        log.details,
      ]),
    ])
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black">Journal</h1>
        <Button variant="soft" onClick={exportCsv} disabled={filtered.length === 0}>
          <Download size={16} />
          Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
        <input
          className={`${inputCls} col-span-2`}
          placeholder="Rechercher…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Recherche dans le journal"
        />
        <select className={inputCls} value={childFilter} onChange={(e) => setChildFilter(e.target.value)} aria-label="Filtrer par enfant">
          <option value="all">Tous les enfants</option>
          {children.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select className={inputCls} value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} aria-label="Filtrer par action">
          <option value="all">Toutes les actions</option>
          {Object.entries(ACTION_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select className={inputCls} value={actorFilter} onChange={(e) => setActorFilter(e.target.value)} aria-label="Filtrer par auteur">
          <option value="all">Tous les auteurs</option>
          {[...parents, ...children].map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <div className="col-span-2 flex gap-2 lg:col-span-1">
          <input className={inputCls} type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Du" />
          <input className={inputCls} type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Au" />
        </div>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Acteur</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Enfant</th>
              <th className="px-4 py-3 text-right">Montant</th>
              <th className="px-4 py-3">Détails</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.slice(0, 200).map((log) => {
              const undoTarget = undoableTarget(log, submissions, transactions, pointsTransactions)
              const amountCurrency = logAmountCurrency(log, transactions, pointsTransactions)
              return (
                <tr key={log.id}>
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-slate-500 dark:text-slate-400">
                    {formatDateShort(log.timestamp)} {formatTime(log.timestamp)}
                  </td>
                  <td className="px-4 py-2.5 font-semibold">{nameOf(log.actorId)}</td>
                  <td className="px-4 py-2.5">{actionLabel(log.action)}</td>
                  <td className="px-4 py-2.5">{nameOf(log.subjectId)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {log.amount !== undefined &&
                      (amountCurrency === 'points' ? (
                        <Amount points={log.amount} className="text-sm" />
                      ) : (
                        <Amount cents={log.amount} className="text-sm" />
                      ))}
                  </td>
                  <td className="max-w-64 truncate px-4 py-2.5 text-slate-600 dark:text-slate-300">{log.details}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right">
                    {undoTarget && (
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setUndoing(log)}>
                          <Undo2 size={14} />
                          Annuler
                        </Button>
                        {undoTarget === 'approval' && (
                          <Button variant="ghost" size="sm" className="text-rose-500" onClick={() => setDeleting(log)}>
                            <Trash2 size={14} />
                            Supprimer
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <EmptyState emoji="📜" text="Aucune entrée ne correspond aux filtres." />}
        {filtered.length > 200 && (
          <p className="px-4 py-3 text-center text-xs text-slate-400">
            {filtered.length - 200} entrées plus anciennes masquées — affinez les filtres ou exportez en CSV.
          </p>
        )}
      </Card>

      <ConfirmModal
        open={undoing !== null}
        onClose={() => setUndoing(null)}
        title="Annuler cette action ?"
        message={`« ${undoing?.details ?? ''} » sera annulée. Cette action reste tracée dans le journal.`}
        confirmLabel="Oui, annuler"
        danger
        onConfirm={() => {
          if (!undoing || !user) return
          const target = undoableTarget(undoing, submissions, transactions, pointsTransactions)
          if (target === 'approval' && undoing.relatedId) {
            revertApproval(undoing.relatedId, 'pending', user.id)
            toast('Validation annulée.')
          } else if (target === 'penalty' && undoing.relatedId) {
            deletePenaltyTransaction(undoing.relatedId, user.id)
            toast('Pénalité annulée.')
          }
        }}
      />

      <ConfirmModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Supprimer définitivement cette validation ?"
        message={`Cette action est irréversible : « ${deleting?.details ?? ''} » disparaîtra complètement de l'historique de ${nameOf(
          deleting?.subjectId,
        )}, et ${
          pointsTransactions.find((p) => p.relatedTo === deleting?.relatedId && p.type === 'task_approval')?.amount ?? 0
        } points déjà crédités lui seront retirés.`}
        confirmLabel="Oui, supprimer définitivement"
        danger
        onConfirm={() => {
          if (!deleting || !user || !deleting.relatedId) return
          deleteSubmission(deleting.relatedId, user.id)
          toast('Validation supprimée définitivement.')
        }}
      />
    </div>
  )
}
