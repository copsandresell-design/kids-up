import { format, isSameDay, isSameMonth, isSameWeek, isToday, subDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import { motion } from 'framer-motion'
import { BellRing, CheckCircle2, Plus, ShieldAlert, Sparkles, Trophy, Wallet } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Amount } from '../../components/ui/Amount'
import { AnimatedBalance } from '../../components/ui/AnimatedBalance'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ChildAvatar } from '../../components/ui/ChildAvatar'
import { PointsAmount } from '../../components/ui/PointsAmount'
import { computeBalance } from '../../lib/balance'
import { formatEuro, formatRelative } from '../../lib/format'
import { computeLifetimePoints, computePoints } from '../../lib/points'
import { computeRank } from '../../lib/ranks'
import { computeStreakDefCount } from '../../lib/streak'
import { useStore } from '../../store/useStore'
import type { PointsTransaction, RankDef, StreakDef, TaskSubmission, Transaction, User } from '../../types'

const WEEK = { weekStartsOn: 1 as const }
const MEDALS = ['🥇', '🥈', '🥉']

/** Classement des enfants par points gagnés (tâches) ce mois — visible seulement si activé dans Réglages. */
function LeaderboardCard({
  children: kids,
  pointsTransactions,
  rankDefs,
}: {
  children: User[]
  pointsTransactions: PointsTransaction[]
  rankDefs: RankDef[]
}) {
  const ranked = useMemo(() => {
    return kids
      .map((child) => {
        const monthGains = pointsTransactions
          .filter((p) => p.childId === child.id && p.type === 'task_approval' && isSameMonth(p.createdAt, Date.now()))
          .reduce((sum, p) => sum + p.amount, 0)
        const rank = rankDefs.length > 0 ? computeRank(computeLifetimePoints(pointsTransactions, child.id), rankDefs) : null
        return { child, monthGains, rank }
      })
      .sort((a, b) => b.monthGains - a.monthGains)
  }, [kids, pointsTransactions, rankDefs])

  if (ranked.length === 0) return null

  return (
    <Card className="p-5">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
        <Trophy size={18} className="text-amber-500" />
        Classement du mois
      </h2>
      <div className="space-y-2">
        {ranked.map(({ child, monthGains, rank }, i) => (
          <div
            key={child.id}
            className="flex items-center gap-3 rounded-xl px-2 py-2 first:bg-amber-50 first:dark:bg-amber-950/30"
          >
            <span className="w-6 shrink-0 text-center text-lg" aria-hidden>
              {MEDALS[i] ?? `${i + 1}.`}
            </span>
            <ChildAvatar user={child} size="sm" decoration={rank?.rank.emoji} />
            <p className="min-w-0 flex-1 truncate text-sm font-semibold">{child.name}</p>
            {rank && (
              <span
                className="hidden shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold text-white sm:inline-block"
                style={{ backgroundColor: rank.rank.color }}
                title={rank.rank.label}
              >
                {rank.rank.label}
              </span>
            )}
            <span className="text-sm font-bold text-violet-600 dark:text-violet-400">
              {monthGains > 0 ? `${monthGains} pts` : '—'}
            </span>
          </div>
        ))}
      </div>
    </Card>
  )
}

/** Fiche récap hebdomadaire par enfant : points gagnés, tâches faites, séries en cours (voir demande point 5). */
function WeeklyRecapCard({
  children: kids,
  pointsTransactions,
  submissions,
  transactions,
  streakDefs,
}: {
  children: User[]
  pointsTransactions: PointsTransaction[]
  submissions: TaskSubmission[]
  transactions: Transaction[]
  streakDefs: StreakDef[]
}) {
  const recaps = useMemo(() => {
    const now = new Date()
    return kids.map((child) => {
      const weekPoints = pointsTransactions
        .filter((p) => p.childId === child.id && p.amount > 0 && isSameWeek(p.createdAt, Date.now(), WEEK))
        .reduce((sum, p) => sum + p.amount, 0)
      const weekTasks = submissions.filter(
        (s) => s.childId === child.id && s.status === 'approved' && s.reviewedAt && isSameWeek(s.reviewedAt, Date.now(), WEEK),
      ).length
      const streaks = streakDefs
        .filter((d) => d.isActive)
        .map((d) =>
          computeStreakDefCount(d, child.id, { submissions, transactions, now, childCreatedAt: child.createdAt }),
        )
        .filter((count) => count > 0)
      const bestStreak = Math.max(0, ...streaks)
      return { child, weekPoints, weekTasks, activeStreaks: streaks.length, bestStreak }
    })
  }, [kids, pointsTransactions, submissions, transactions, streakDefs])

  if (recaps.length === 0) return null

  return (
    <Card className="p-5">
      <h2 className="mb-4 text-lg font-bold">Récap de la semaine</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {recaps.map(({ child, weekPoints, weekTasks, activeStreaks, bestStreak }) => (
          <div key={child.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 dark:border-slate-800">
            <ChildAvatar user={child} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{child.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {weekPoints} pts · {weekTasks} tâche{weekTasks > 1 ? 's' : ''}
                {activeStreaks > 0 && ` · 🔥 ${bestStreak}j (${activeStreaks} série${activeStreaks > 1 ? 's' : ''})`}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function Sparkline({ childId, color }: { childId: string; color: string }) {
  const pointsTransactions = useStore((s) => s.pointsTransactions)
  const now = Date.now()
  const values = Array.from({ length: 7 }, (_, i) => {
    const cutoff = subDays(now, 6 - i).setHours(23, 59, 59, 999)
    return pointsTransactions
      .filter((p) => p.childId === childId && p.createdAt <= cutoff)
      .reduce((sum, p) => sum + p.amount, 0)
  })
  const min = Math.min(...values)
  const range = Math.max(...values) - min || 1
  const points = values
    .map((v, i) => `${(i / 6) * 96},${36 - ((v - min) / range) * 32 + 2}`)
    .join(' ')
  return (
    <svg viewBox="0 0 96 40" className="h-10 w-24" aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Barres empilées des points gagnés (tâches) des 7 derniers jours, une couleur par enfant. */
function WeeklyActivityChart({
  children: kids,
  pointsTransactions,
}: {
  children: User[]
  pointsTransactions: PointsTransaction[]
}) {
  const days = useMemo(() => {
    const now = Date.now()
    return Array.from({ length: 7 }, (_, i) => {
      const date = subDays(now, 6 - i)
      const gains = kids.map((child) => ({
        child,
        amount: pointsTransactions
          .filter(
            (p) =>
              p.childId === child.id &&
              p.type === 'task_approval' &&
              p.amount > 0 &&
              isSameDay(p.createdAt, date),
          )
          .reduce((sum, p) => sum + p.amount, 0),
      }))
      return { date, gains, total: gains.reduce((s, g) => s + g.amount, 0) }
    })
  }, [kids, pointsTransactions])

  const max = Math.max(...days.map((d) => d.total), 1)

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Activité de la semaine</h2>
        <div className="flex items-center gap-3">
          {kids.map((child) => (
            <span key={child.id} className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: child.color }} />
              {child.name}
            </span>
          ))}
        </div>
      </div>
      <div className="flex items-end gap-2" style={{ height: 120 }} role="img" aria-label="Points gagnés par jour sur 7 jours">
        {days.map(({ date, gains, total }, i) => (
          <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            {total > 0 && (
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">{total}</span>
            )}
            <div className="flex w-full max-w-9 flex-col-reverse overflow-hidden rounded-md" style={{ height: `${(total / max) * 72}%` }}>
              {gains
                .filter((g) => g.amount > 0)
                .map((g) => (
                  <motion.div
                    key={g.child.id}
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ delay: i * 0.05, type: 'spring', damping: 20 }}
                    style={{
                      backgroundColor: g.child.color,
                      height: `${(g.amount / total) * 100}%`,
                      transformOrigin: 'bottom',
                    }}
                  />
                ))}
            </div>
            {total === 0 && <div className="h-1 w-full max-w-9 rounded-full bg-slate-100 dark:bg-slate-800" />}
            <span className={`text-[11px] font-semibold ${isToday(date) ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'}`}>
              {format(date, 'EEE', { locale: fr })}
            </span>
          </div>
        ))}
      </div>
    </Card>
  )
}

function KpiCard({
  icon,
  iconCls,
  label,
  value,
  to,
}: {
  icon: React.ReactNode
  iconCls: string
  label: string
  value: React.ReactNode
  to?: string
}) {
  const body = (
    <Card className={`flex h-full items-center gap-3 p-4 ${to ? 'transition-all hover:-translate-y-0.5 hover:shadow-md' : ''}`}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconCls}`}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</span>
        <span className="block text-xl font-black">{value}</span>
      </span>
    </Card>
  )
  return to ? <Link to={to}>{body}</Link> : body
}

export function OverviewPage() {
  const users = useStore((s) => s.users)
  const transactions = useStore((s) => s.transactions)
  const pointsTransactions = useStore((s) => s.pointsTransactions)
  const submissions = useStore((s) => s.submissions)
  const streakDefs = useStore((s) => s.streakDefs)
  const rankDefs = useStore((s) => s.rankDefs)
  const settings = useStore((s) => s.settings)
  const navigate = useNavigate()

  const children = users.filter((u) => u.role === 'child' && u.isActive)
  const familyTotal = children.reduce((sum, c) => sum + computeBalance(transactions, c.id), 0)
  const pending = submissions.filter((s) => s.status === 'pending')
  const approvedToday = submissions.filter((s) => s.status === 'approved' && s.reviewedAt && isToday(s.reviewedAt))
  const weekPoints = pointsTransactions
    .filter((p) => p.amount > 0 && p.type === 'task_approval' && isSameWeek(p.createdAt, Date.now(), WEEK))
    .reduce((sum, p) => sum + p.amount, 0)
  const hasDefaultSecrets = users.some((u) => u.usesDefaultSecret)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Vue d'ensemble</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {format(Date.now(), 'EEEE d MMMM', { locale: fr })}
          </p>
        </div>
        <Button onClick={() => navigate('/parent/taches?nouveau=1')}>
          <Plus size={18} />
          Ajouter une tâche
        </Button>
      </div>

      {hasDefaultSecrets && (
        <Card className="flex items-center gap-3 border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/40">
          <ShieldAlert className="shrink-0 text-amber-600" size={20} />
          <p className="text-sm">
            Des codes d'accès par défaut sont encore actifs.{' '}
            <Link to="/parent/reglages" className="font-semibold underline">
              Changez-les dans Réglages.
            </Link>
          </p>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="glow-brand border-0 bg-gradient-to-br from-brand-from to-brand-to p-4 text-white">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-white/85">
            <Sparkles size={14} aria-hidden />
            Points cette semaine
          </p>
          <AnimatedBalance cents={weekPoints} format={(n) => `${n} pts`} className="font-display text-2xl font-bold" />
        </Card>
        <KpiCard
          icon={<CheckCircle2 size={20} />}
          iconCls="bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400"
          label="Validées aujourd'hui"
          value={approvedToday.length}
        />
        <KpiCard
          icon={<BellRing size={20} />}
          iconCls="bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400"
          label="En attente"
          value={<span className="text-amber-600 dark:text-amber-400">{pending.length}</span>}
          to="/parent/validations"
        />
        <KpiCard
          icon={<Wallet size={20} />}
          iconCls="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
          label="Solde famille"
          value={<span className="text-base">{formatEuro(familyTotal)}</span>}
        />
      </div>

      {children.length > 0 && (
        <WeeklyActivityChart children={children} pointsTransactions={pointsTransactions} />
      )}

      {settings.features.leaderboard && children.length > 0 && (
        <LeaderboardCard children={children} pointsTransactions={pointsTransactions} rankDefs={rankDefs} />
      )}

      {children.length > 0 && (
        <WeeklyRecapCard
          children={children}
          pointsTransactions={pointsTransactions}
          submissions={submissions}
          transactions={transactions}
          streakDefs={streakDefs}
        />
      )}

      <div>
        <h2 className="mb-3 text-lg font-bold">Les enfants</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {children.map((child) => {
            const balance = computeBalance(transactions, child.id)
            const points = computePoints(pointsTransactions, child.id)
            const childPending = pending.filter((s) => s.childId === child.id).length
            const weekApproved = submissions.filter(
              (s) =>
                s.childId === child.id &&
                s.status === 'approved' &&
                s.reviewedAt &&
                isSameWeek(s.reviewedAt, Date.now(), WEEK),
            ).length
            return (
              <Card
                key={child.id}
                className="p-5 transition-all hover:-translate-y-0.5 hover:shadow-md"
                style={{ borderTopColor: child.color, borderTopWidth: 3 }}
              >
                <div className="flex items-center gap-4">
                  <ChildAvatar user={child} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{child.name}</p>
                    <AnimatedBalance
                      cents={points}
                      format={(n) => `${n} pts`}
                      className="text-xl font-black text-violet-600 dark:text-violet-400"
                    />
                    {balance !== 0 && (
                      <p className="text-xs font-semibold text-slate-400">{formatEuro(balance)}</p>
                    )}
                  </div>
                  <Sparkline childId={child.id} color={child.color} />
                </div>
                <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3 text-xs font-semibold dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400">
                    ✅ {weekApproved} cette semaine
                  </span>
                  {childPending > 0 && (
                    <Link
                      to="/parent/validations"
                      className="ml-auto rounded-full bg-amber-100 px-2.5 py-1 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300"
                    >
                      {childPending} à valider
                    </Link>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-bold">Derniers points</h2>
        <Card className="divide-y divide-slate-100 dark:divide-slate-800">
          {pointsTransactions.slice(0, 6).map((ptx) => {
            const child = users.find((u) => u.id === ptx.childId)
            return (
              <div key={ptx.id} className="flex items-center gap-3 px-4 py-3">
                {child && <ChildAvatar user={child} size="sm" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{ptx.description}</p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">{formatRelative(ptx.createdAt)}</p>
                </div>
                <PointsAmount points={ptx.amount} className="text-sm" />
              </div>
            )
          })}
          {pointsTransactions.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-slate-500">Aucun point gagné pour l'instant.</p>
          )}
        </Card>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-bold">Dernières transactions</h2>
        <Card className="divide-y divide-slate-100 dark:divide-slate-800">
          {transactions.slice(0, 6).map((tx) => {
            const child = users.find((u) => u.id === tx.childId)
            return (
              <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
                {child && <ChildAvatar user={child} size="sm" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{tx.description}</p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">{formatRelative(tx.createdAt)}</p>
                </div>
                <Amount cents={tx.amount} className="text-sm" />
              </div>
            )
          })}
          {transactions.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-slate-500">Aucune transaction pour l'instant.</p>
          )}
        </Card>
      </div>
    </div>
  )
}
