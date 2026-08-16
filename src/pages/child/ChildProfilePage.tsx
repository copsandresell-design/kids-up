import { isSameMonth, isSameWeek, startOfWeek, subWeeks } from 'date-fns'
import { Gift, LogOut, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { PhotoLightbox } from '../../components/photos/PhotoLightbox'
import { PhotoThumb } from '../../components/photos/PhotoThumb'
import { AnimatedBalance } from '../../components/ui/AnimatedBalance'
import { AvatarEditorModal } from '../../components/ui/AvatarEditorModal'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ChildAvatar } from '../../components/ui/ChildAvatar'
import { Field, inputCls } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { PushNotificationsCard } from '../../components/ui/PushNotificationsCard'
import { SavingsGoalsSection } from '../../components/ui/SavingsGoalsSection'
import { cn } from '../../lib/cn'
import { computeBadges } from '../../lib/badges'
import { computeBalance } from '../../lib/balance'
import { formatEuro, formatRelative } from '../../lib/format'
import { loansForChild, type PointsLoan } from '../../lib/loans'
import { computeLifetimePoints, computePoints } from '../../lib/points'
import { computeRank } from '../../lib/ranks'
import { useCurrentUser, useStore } from '../../store/useStore'
import type { User } from '../../types'

const WEEK = { weekStartsOn: 1 as const }

/** "Don" (aucun suivi) ou "prêt" (suivi de dette — voir lib/loans.ts) entre enfants d'une même famille. */
function SendPointsModal({ user, siblings, balance, onClose }: { user: User; siblings: User[]; balance: number; onClose: () => void }) {
  const giftPoints = useStore((s) => s.giftPoints)
  const lendPoints = useStore((s) => s.lendPoints)
  const toast = useStore((s) => s.toast)
  const [toChildId, setToChildId] = useState(siblings[0]?.id ?? '')
  const [kind, setKind] = useState<'gift' | 'loan'>('gift')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const parsed = parseInt(amount, 10)
  const valid = toChildId && Number.isFinite(parsed) && parsed > 0 && parsed <= balance

  function submit() {
    if (!valid) return
    setBusy(true)
    const ok =
      kind === 'gift'
        ? giftPoints(user.id, toChildId, parsed, note, user.id)
        : lendPoints(user.id, toChildId, parsed, note, user.id)
    setBusy(false)
    if (ok) {
      const to = siblings.find((s) => s.id === toChildId)
      toast(kind === 'gift' ? `${parsed} points offerts à ${to?.name} !` : `${parsed} points prêtés à ${to?.name} !`)
      onClose()
    }
  }

  return (
    <Modal open onClose={onClose} title="Envoyer des points">
      <div className="space-y-4">
        <Field label="À qui ?">
          <select className={inputCls} value={toChildId} onChange={(e) => setToChildId(e.target.value)}>
            {siblings.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Don ou prêt ?">
          <div className="flex gap-2">
            <Button variant={kind === 'gift' ? 'primary' : 'soft'} className="flex-1" onClick={() => setKind('gift')}>
              🎁 Don
            </Button>
            <Button variant={kind === 'loan' ? 'primary' : 'soft'} className="flex-1" onClick={() => setKind('loan')}>
              🤝 Prêt
            </Button>
          </div>
          <p className="mt-1.5 text-xs text-slate-400">
            {kind === 'gift'
              ? 'Un cadeau : personne ne doit rien à personne.'
              : "Un prêt : ça reste dû jusqu'à ce que ce soit remboursé (visible dans « Prêts entre vous »)."}
          </p>
        </Field>
        <Field label={`Combien de points ? (tu as ${balance} pts)`}>
          <input
            className={inputCls}
            type="number"
            min="1"
            max={balance}
            step="1"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
          />
        </Field>
        <Field label="Un petit mot (optionnel)">
          <input
            className={inputCls}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="ex : pour le jeu que tu voulais"
            maxLength={80}
          />
        </Field>
        <Button className="w-full" disabled={!valid || busy} onClick={submit}>
          {kind === 'gift' ? 'Offrir les points' : 'Prêter les points'}
        </Button>
      </div>
    </Modal>
  )
}

function RepayLoanModal({ loan, lenderName, maxRepay, onClose }: { loan: PointsLoan; lenderName: string; maxRepay: number; onClose: () => void }) {
  const user = useCurrentUser()
  const repayLoan = useStore((s) => s.repayLoan)
  const toast = useStore((s) => s.toast)
  const [amount, setAmount] = useState(String(Math.min(loan.remaining, maxRepay)))
  const [busy, setBusy] = useState(false)

  if (!user) return null
  const parsed = parseInt(amount, 10)
  const valid = Number.isFinite(parsed) && parsed > 0 && parsed <= loan.remaining && parsed <= maxRepay

  function submit() {
    if (!valid) return
    setBusy(true)
    const ok = repayLoan(loan.id, parsed, user!.id)
    setBusy(false)
    if (ok) {
      toast(`${parsed} points remboursés à ${lenderName}.`)
      onClose()
    }
  }

  return (
    <Modal open onClose={onClose} title={`Rembourser ${lenderName}`}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Tu dois {loan.remaining} pts à {lenderName}. Combien veux-tu rembourser maintenant ?
        </p>
        <Field label={`Points à rembourser (tu peux jusqu'à ${Math.min(loan.remaining, maxRepay)})`}>
          <input
            className={inputCls}
            type="number"
            min="1"
            max={Math.min(loan.remaining, maxRepay)}
            step="1"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
          />
        </Field>
        <Button className="w-full" disabled={!valid || busy} onClick={submit}>
          Rembourser
        </Button>
      </div>
    </Modal>
  )
}

export function ChildProfilePage() {
  const user = useCurrentUser()
  const users = useStore((s) => s.users)
  const settings = useStore((s) => s.settings)
  const transactions = useStore((s) => s.transactions)
  const submissions = useStore((s) => s.submissions)
  const savingsGoals = useStore((s) => s.savingsGoals)
  const redemptions = useStore((s) => s.redemptions)
  const pointsTransactions = useStore((s) => s.pointsTransactions)
  const rewardClaims = useStore((s) => s.rewardClaims)
  const streakDefs = useStore((s) => s.streakDefs)
  const badgeDefs = useStore((s) => s.badgeDefs)
  const rankDefs = useStore((s) => s.rankDefs)
  const tasks = useStore((s) => s.tasks)
  const messages = useStore((s) => s.messages)
  const logout = useStore((s) => s.logout)
  const [editingAvatar, setEditingAvatar] = useState(false)
  const [lightbox, setLightbox] = useState<{ ids: string[]; index: number } | null>(null)
  const [sendingPoints, setSendingPoints] = useState(false)
  const [repaying, setRepaying] = useState<{ loan: PointsLoan; lenderName: string } | null>(null)

  const children = users.filter((u) => u.role === 'child' && u.isActive)

  const stats = useMemo(() => {
    if (!user) return null
    const mine = submissions.filter((s) => s.childId === user.id)
    const approved = mine.filter((s) => s.status === 'approved').length
    const rejected = mine.filter((s) => s.status === 'rejected').length
    const reviewed = approved + rejected
    const thisMonth = mine.filter(
      (s) => s.status === 'approved' && s.reviewedAt && isSameMonth(s.reviewedAt, Date.now()),
    ).length
    const gains = pointsTransactions.filter((p) => p.childId === user.id && p.type === 'task_approval')
    let bestWeek = 0
    for (let i = 0; i < 12; i++) {
      const weekStart = startOfWeek(subWeeks(Date.now(), i), WEEK)
      const total = gains
        .filter((p) => isSameWeek(p.createdAt, weekStart, WEEK))
        .reduce((sum, p) => sum + p.amount, 0)
      bestWeek = Math.max(bestWeek, total)
    }
    return {
      approved,
      thisMonth,
      approvalRate: reviewed > 0 ? Math.round((approved / reviewed) * 100) : null,
      bestWeek,
    }
  }, [user, submissions, pointsTransactions])

  const badges = useMemo(
    () =>
      user
        ? computeBadges({
            childId: user.id,
            submissions,
            pointsTransactions,
            transactions,
            tasks,
            savingsGoals,
            redemptions,
            rewardClaims,
            streakDefs,
            badgeDefs,
            children,
            seasonResetAt: settings.seasonResetAt,
          })
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, submissions, pointsTransactions, transactions, tasks, savingsGoals, redemptions, rewardClaims, streakDefs, badgeDefs, users, settings.seasonResetAt],
  )

  const lifetimeRank = useMemo(() => {
    if (!user || rankDefs.length === 0) return null
    return computeRank(computeLifetimePoints(pointsTransactions, user.id), rankDefs)
  }, [user, pointsTransactions, rankDefs])

  const monthlyPosition = useMemo(() => {
    if (!user) return null
    const monthGains = (id: string) =>
      pointsTransactions
        .filter((p) => p.childId === id && p.type === 'task_approval' && isSameMonth(p.createdAt, Date.now()))
        .reduce((sum, p) => sum + p.amount, 0)
    if (monthGains(user.id) === 0) return null
    const sorted = [...children].sort((a, b) => monthGains(b.id) - monthGains(a.id))
    return sorted.findIndex((c) => c.id === user.id) + 1
  }, [user, children, pointsTransactions])

  const galleryPhotos = useMemo(() => {
    if (!user) return []
    return submissions
      .filter((s) => s.childId === user.id && s.status === 'approved' && s.photoIds?.length)
      .flatMap((s) => s.photoIds!)
  }, [user, submissions])

  const myMessages = useMemo(
    () => (user ? messages.filter((m) => m.toChildId === user.id).slice(0, 20) : []),
    [user, messages],
  )

  const siblings = useMemo(() => (user ? children.filter((c) => c.id !== user.id) : []), [user, children])

  const myLoans = useMemo(
    () => (user ? loansForChild(pointsTransactions, user.id) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, pointsTransactions],
  )

  if (!user || !stats) return null

  const medals = ['🥇', '🥈', '🥉']
  const myBalance = computePoints(pointsTransactions, user.id)
  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? '?'

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-black">Mon profil</h1>

      <Card className="flex flex-col items-center gap-3 p-6">
        <ChildAvatar user={user} size="xl" decoration={lifetimeRank?.rank.emoji} onClick={() => setEditingAvatar(true)} />
        <p className="font-display text-xl font-bold">{user.name}</p>
        <AnimatedBalance
          cents={computePoints(pointsTransactions, user.id)}
          format={(n) => `${n} pts`}
          className="font-display text-3xl font-bold"
        />
        {computeBalance(transactions, user.id) !== 0 && (
          <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 dark:text-slate-400">
            <Wallet size={14} aria-hidden />
            {formatEuro(computeBalance(transactions, user.id))}
          </p>
        )}
        {settings.features.leaderboard && monthlyPosition !== null && (
          <p className="rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">
            {medals[monthlyPosition - 1] ?? '🏅'}{' '}
            {monthlyPosition === 1 ? 'MVP du mois !' : `${monthlyPosition}ᵉ ce mois-ci`}
          </p>
        )}
        {siblings.length > 0 && (
          <Button variant="soft" size="sm" onClick={() => setSendingPoints(true)}>
            <Gift size={16} />
            Envoyer des points
          </Button>
        )}
      </Card>

      {lifetimeRank && (
        <Card className="space-y-2 p-5">
          <div className="flex items-center gap-3">
            <span className="text-3xl" aria-hidden>
              {lifetimeRank.rank.emoji}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display font-bold" style={{ color: lifetimeRank.rank.color }}>
                {lifetimeRank.rank.label}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {lifetimeRank.next
                  ? `${lifetimeRank.target - lifetimeRank.progress} pts avant ${lifetimeRank.next.emoji} ${lifetimeRank.next.label}`
                  : 'Rang maximum atteint !'}
              </p>
            </div>
          </div>
          {lifetimeRank.next && (
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, (lifetimeRank.progress / lifetimeRank.target) * 100)}%`,
                  backgroundColor: lifetimeRank.rank.color,
                }}
              />
            </div>
          )}
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Card className="p-4 text-center">
          <p className="font-display text-2xl font-bold text-violet-600 dark:text-violet-400">
            {computePoints(pointsTransactions, user.id)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Points</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="font-display text-2xl font-bold">🎯 {stats.thisMonth}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Tâches ce mois-ci</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="font-display text-2xl font-bold">{stats.approved}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Tâches validées</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="font-display text-2xl font-bold">
            {stats.approvalRate !== null ? `${stats.approvalRate} %` : '—'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Taux de réussite</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="font-display text-2xl font-bold">{stats.bestWeek} pts</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Meilleure semaine</p>
        </Card>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-bold">Mes badges ({badges.filter((b) => b.unlocked).length}/{badges.length})</h2>
        <div className="grid max-h-[28rem] grid-cols-3 gap-3 overflow-y-auto pr-1">
          {badges.map((badge) => (
            <Card
              key={badge.id}
              className={cn('flex flex-col items-center gap-1 p-4 text-center', !badge.unlocked && 'opacity-45')}
              title={badge.description}
            >
              <span className={cn('text-3xl', !badge.unlocked && 'grayscale')} aria-hidden>
                {badge.emoji}
              </span>
              <p className="text-xs font-bold leading-tight">{badge.label}</p>
              {!badge.unlocked && badge.progress && (
                <>
                  <div
                    className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
                    role="progressbar"
                    aria-valuenow={badge.progress.current}
                    aria-valuemax={badge.progress.target}
                    aria-label={`Progression ${badge.label}`}
                  >
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-from to-brand-to"
                      style={{ width: `${(badge.progress.current / badge.progress.target) * 100}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400">
                    {badge.progress.current}/{badge.progress.target}
                    {badge.progress.unit ? ` ${badge.progress.unit}` : ''} · +{badge.points} pts
                  </p>
                </>
              )}
              {!badge.unlocked && !badge.progress && (
                <p className="text-[10px] text-slate-400">+{badge.points} pts</p>
              )}
              {badge.unlocked && (
                <p className="text-[10px] text-emerald-500">Débloqué ✓ (+{badge.points} pts)</p>
              )}
            </Card>
          ))}
        </div>
      </section>

      {myLoans.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Prêts entre vous 🤝</h2>
          <Card className="divide-y divide-slate-100 dark:divide-slate-800">
            {myLoans.map((loan) => {
              const iAmLender = loan.lenderId === user.id
              const otherName = nameOf(iAmLender ? loan.borrowerId : loan.lenderId)
              return (
                <div key={loan.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-xl" aria-hidden>
                    {iAmLender ? '📤' : '📥'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {iAmLender ? `${otherName} te doit ${loan.remaining} pts` : `Tu dois ${loan.remaining} pts à ${otherName}`}
                    </p>
                    <p className="text-xs text-slate-400">
                      Prêt de {loan.amount} pts · {formatRelative(loan.createdAt)}
                    </p>
                  </div>
                  {loan.status === 'repaid' ? (
                    <Badge tone="green">Remboursé</Badge>
                  ) : !iAmLender ? (
                    <Button size="sm" variant="soft" onClick={() => setRepaying({ loan, lenderName: otherName })}>
                      Rembourser
                    </Button>
                  ) : (
                    <Badge tone="amber">En cours</Badge>
                  )}
                </div>
              )
            })}
          </Card>
        </section>
      )}

      {settings.features.savingsGoals && (
        <SavingsGoalsSection
          childId={user.id}
          balance={computeBalance(transactions, user.id)}
          actorId={user.id}
        />
      )}

      {myMessages.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Messages de mes parents 💌</h2>
          <Card className="divide-y divide-slate-100 dark:divide-slate-800">
            {myMessages.map((message) => {
              const from = users.find((u) => u.id === message.fromId)
              return (
                <div key={message.id} className="flex items-start gap-3 px-4 py-3">
                  {from ? (
                    <ChildAvatar user={from} size="sm" />
                  ) : (
                    <span className="text-xl" aria-hidden>
                      💬
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{message.text}</p>
                    <p className="text-xs text-slate-400">
                      {from?.name} · {formatRelative(message.createdAt)}
                    </p>
                  </div>
                </div>
              )
            })}
          </Card>
        </section>
      )}

      {galleryPhotos.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Ma galerie 📸</h2>
          <div className="grid grid-cols-4 gap-2">
            {galleryPhotos.map((photoId, i) => (
              <PhotoThumb
                key={photoId}
                photoId={photoId}
                className="h-full w-full aspect-square"
                onClick={() => setLightbox({ ids: galleryPhotos, index: i })}
              />
            ))}
          </div>
        </section>
      )}

      <PushNotificationsCard userId={user.id} />

      <Button variant="soft" className="w-full" onClick={logout}>
        <LogOut size={18} />
        Déconnexion
      </Button>

      <AnimatePresence>
        {lightbox && (
          <PhotoLightbox
            photoIds={lightbox.ids}
            startIndex={lightbox.index}
            onClose={() => setLightbox(null)}
          />
        )}
      </AnimatePresence>

      {editingAvatar && (
        <AvatarEditorModal user={user} actorId={user.id} onClose={() => setEditingAvatar(false)} />
      )}

      {sendingPoints && (
        <SendPointsModal user={user} siblings={siblings} balance={myBalance} onClose={() => setSendingPoints(false)} />
      )}

      {repaying && (
        <RepayLoanModal
          loan={repaying.loan}
          lenderName={repaying.lenderName}
          maxRepay={myBalance}
          onClose={() => setRepaying(null)}
        />
      )}
    </div>
  )
}
