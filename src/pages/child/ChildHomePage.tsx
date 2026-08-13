import { AnimatePresence, motion } from 'framer-motion'
import { Flame, Hourglass, Plus, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PhotoPicker, type PickedPhoto } from '../../components/photos/PhotoPicker'
import { Badge } from '../../components/ui/Badge'
import { PointsAmount } from '../../components/ui/PointsAmount'
import { AnimatedBalance } from '../../components/ui/AnimatedBalance'
import { AvatarEditorModal } from '../../components/ui/AvatarEditorModal'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ChildAvatar } from '../../components/ui/ChildAvatar'
import { EmptyState } from '../../components/ui/EmptyState'
import { Field, inputCls } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { db } from '../../db/storage'
import { computeBadges, type BadgeState } from '../../lib/badges'
import { computeBalance } from '../../lib/balance'
import { computeLifetimePoints, computePoints } from '../../lib/points'
import { computeLevel } from '../../lib/levels'
import { computeRank } from '../../lib/ranks'
import { CATEGORIES, CATEGORY_KEYS, DIFFICULTIES, TASK_EMOJIS } from '../../lib/categories'
import { cn } from '../../lib/cn'
import { celebrateFireworks } from '../../lib/confetti'
import { playCelebrationSound } from '../../lib/sound'
import { childGradient, gradientEnd } from '../../lib/colors'
import { formatEuro, formatRelative } from '../../lib/format'
import { isTaskAvailable, timesSubmittedToday } from '../../lib/recurrence'
import { computeStreak, computeStreakDefCount } from '../../lib/streak'
import { useCurrentUser, useStore } from '../../store/useStore'
import type { Category, RankDef, Task } from '../../types'

function DifficultyDots({ level }: { level: keyof typeof DIFFICULTIES }) {
  const { label, dots } = DIFFICULTIES[level]
  return (
    <span className="flex items-center gap-0.5" title={label} aria-label={`Difficulté : ${label}`}>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${i <= dots ? 'bg-amber-400' : 'bg-slate-200 dark:bg-slate-700'}`}
        />
      ))}
    </span>
  )
}

function BadgeUnlockModal({ badge, onClose }: { badge: BadgeState; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title="Badge débloqué !" glow="spark">
      <div className="flex flex-col items-center gap-3 pb-2 text-center">
        <motion.span
          className="text-7xl"
          aria-hidden
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', damping: 10, stiffness: 200 }}
        >
          {badge.emoji}
        </motion.span>
        <p className="font-display text-xl font-bold">{badge.label}</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">{badge.description}</p>
        <Button className="mt-2 w-full" onClick={onClose}>
          Trop fort ! 🎉
        </Button>
      </div>
    </Modal>
  )
}

function RankUpModal({ rank, onClose }: { rank: RankDef; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title="Nouveau rang !" glow="spark">
      <div className="flex flex-col items-center gap-3 pb-2 text-center">
        <motion.span
          className="text-7xl"
          aria-hidden
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', damping: 10, stiffness: 200 }}
        >
          {rank.emoji}
        </motion.span>
        <p className="font-display text-xl font-bold" style={{ color: rank.color }}>
          {rank.label}
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-400">Tu as atteint un nouveau rang !</p>
        <Button className="mt-2 w-full" onClick={onClose}>
          Trop fort ! 🎉
        </Button>
      </div>
    </Modal>
  )
}

function ProposeTaskModal({ childId, onClose }: { childId: string; onClose: () => void }) {
  const proposeTaskSuggestion = useStore((s) => s.proposeTaskSuggestion)
  const toast = useStore((s) => s.toast)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<Category>('autre')
  const [icon, setIcon] = useState(TASK_EMOJIS[0])
  const [points, setPoints] = useState('15')

  function submit() {
    const pointsValue = parseInt(points, 10)
    if (!title.trim()) {
      toast('Donne un nom à ta tâche.', 'error')
      return
    }
    if (!Number.isFinite(pointsValue) || pointsValue <= 0) {
      toast('Indique un nombre de points valide.', 'error')
      return
    }
    proposeTaskSuggestion(childId, {
      title,
      description: description.trim() || undefined,
      icon,
      category,
      suggestedPoints: pointsValue,
    })
    toast('Proposition envoyée à tes parents ! 💡')
    onClose()
  }

  return (
    <Modal open onClose={onClose} title="Proposer une tâche">
      <div className="space-y-4">
        <Field label="Le nom de la tâche">
          <input
            className={inputCls}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ex : Laver la voiture"
            maxLength={60}
            autoFocus
          />
        </Field>
        <Field label="Description (optionnel)">
          <input
            className={inputCls}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="ex : je rince pendant que papa savonne"
          />
        </Field>
        <Field label="Catégorie">
          <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {CATEGORY_KEYS.map((key) => (
              <option key={key} value={key}>
                {CATEGORIES[key].emoji} {CATEGORIES[key].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Icône">
          <div className="flex flex-wrap gap-1.5">
            {TASK_EMOJIS.map((emoji) => (
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
        <Field label="Combien de points proposes-tu ?">
          <input
            className={inputCls}
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={points}
            onChange={(e) => setPoints(e.target.value)}
          />
          <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
            Un parent pourra ajuster ce nombre avant d'accepter.
          </span>
        </Field>
        <Button className="w-full" onClick={submit}>
          Envoyer à mes parents
        </Button>
      </div>
    </Modal>
  )
}

export function ChildHomePage() {
  const user = useCurrentUser()
  const users = useStore((s) => s.users)
  const tasks = useStore((s) => s.tasks)
  const submissions = useStore((s) => s.submissions)
  const transactions = useStore((s) => s.transactions)
  const savingsGoals = useStore((s) => s.savingsGoals)
  const redemptions = useStore((s) => s.redemptions)
  const pointsTransactions = useStore((s) => s.pointsTransactions)
  const rewardClaims = useStore((s) => s.rewardClaims)
  const streakDefs = useStore((s) => s.streakDefs)
  const badgeDefs = useStore((s) => s.badgeDefs)
  const rankDefs = useStore((s) => s.rankDefs)
  const messages = useStore((s) => s.messages)
  const taskSuggestions = useStore((s) => s.taskSuggestions)
  const settings = useStore((s) => s.settings)
  const submitTask = useStore((s) => s.submitTask)
  const toast = useStore((s) => s.toast)

  const [confirming, setConfirming] = useState<Task | null>(null)
  const [isInitiative, setIsInitiative] = useState(false)
  const [photos, setPhotos] = useState<PickedPhoto[]>([])
  const [comment, setComment] = useState('')
  const [unlockedBadge, setUnlockedBadge] = useState<BadgeState | null>(null)
  const [rankedUpTo, setRankedUpTo] = useState<RankDef | null>(null)
  const [editingAvatar, setEditingAvatar] = useState(false)
  const [proposingTask, setProposingTask] = useState(false)

  const childId = user?.id

  // Confettis si des tâches ont été validées depuis la dernière visite.
  useEffect(() => {
    if (!childId) return
    const key = `lastSeenApproval:${childId}`
    void (async () => {
      const lastSeen = (await db.getItem<number>(key)) ?? 0
      const fresh = submissions.filter(
        (s) => s.childId === childId && s.status === 'approved' && (s.reviewedAt ?? 0) > lastSeen,
      )
      if (fresh.length > 0) {
        celebrateFireworks([user!.color, gradientEnd(user!.color)])
        playCelebrationSound()
        toast(`${fresh.length > 1 ? `${fresh.length} tâches validées` : 'Tâche validée'} ! 🎉`)
      }
      await db.setItem(key, Date.now())
    })()
  }, [childId, submissions, toast])

  // Toast si un parent a envoyé un message depuis la dernière visite.
  useEffect(() => {
    if (!childId) return
    const key = `lastSeenMessages:${childId}`
    void (async () => {
      const lastSeen = (await db.getItem<number>(key)) ?? Date.now()
      const fresh = messages.filter((m) => m.toChildId === childId && m.createdAt > lastSeen)
      if (fresh.length > 0) {
        const from = users.find((u) => u.id === fresh[0].fromId)
        toast(`💌 Nouveau message de ${from?.name ?? 'tes parents'} — regarde ton profil !`)
      }
      await db.setItem(key, Date.now())
    })()
  }, [childId, messages, users, toast])

  // Détection des badges fraîchement débloqués.
  useEffect(() => {
    if (!childId) return
    const key = `seenBadges:${childId}`
    const children = users.filter((u) => u.role === 'child' && u.isActive)
    const unlocked = computeBadges({
      childId,
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
    }).filter((b) => b.unlocked)
    void (async () => {
      const seen = await db.getItem<string[]>(key)
      if (seen !== null) {
        const fresh = unlocked.find((b) => !seen.includes(b.id))
        if (fresh) {
          celebrateFireworks([user!.color, gradientEnd(user!.color)])
          playCelebrationSound()
          setUnlockedBadge(fresh)
        }
      }
      await db.setItem(key, unlocked.map((b) => b.id))
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId, submissions, pointsTransactions, transactions, tasks, savingsGoals, redemptions, rewardClaims, streakDefs, badgeDefs, users])

  // Détection d'un nouveau rang (progression à vie, ne redescend jamais).
  useEffect(() => {
    if (!childId || rankDefs.length === 0) return
    const key = `seenRank:${childId}`
    const rank = computeRank(computeLifetimePoints(pointsTransactions, childId), rankDefs)
    void (async () => {
      const seen = await db.getItem<string>(key)
      if (seen !== null && seen !== rank.rank.id) {
        celebrateFireworks([user!.color, gradientEnd(user!.color)])
        playCelebrationSound()
        setRankedUpTo(rank.rank)
      }
      await db.setItem(key, rank.rank.id)
    })()
  }, [childId, pointsTransactions, rankDefs, user])

  const available = useMemo(
    () => (childId ? tasks.filter((t) => isTaskAvailable(t, childId, submissions)) : []),
    [tasks, childId, submissions],
  )

  const streak = useMemo(
    () => (childId ? computeStreak(childId, submissions) : null),
    [childId, submissions],
  )

  const level = useMemo(
    () => (childId ? computeLevel(childId, submissions) : null),
    [childId, submissions],
  )

  const badges = useMemo(() => {
    if (!childId) return []
    const children = users.filter((u) => u.role === 'child' && u.isActive)
    return computeBadges({
      childId,
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
    })
  }, [childId, submissions, pointsTransactions, transactions, tasks, savingsGoals, redemptions, rewardClaims, streakDefs, badgeDefs, users])

  const rank = useMemo(() => {
    if (!childId || rankDefs.length === 0) return null
    return computeRank(computeLifetimePoints(pointsTransactions, childId), rankDefs)
  }, [childId, pointsTransactions, rankDefs])

  const activeStreaks = useMemo(() => {
    if (!childId) return []
    const now = new Date()
    return streakDefs
      .filter((d) => d.isActive)
      .map((def) => {
        const count = computeStreakDefCount(def, childId, {
          submissions,
          transactions,
          now,
          childCreatedAt: user?.createdAt,
        })
        const nextTier = def.tiers.find((t) => t.days > count)
        return { def, count, nextTier }
      })
      .filter((s) => s.count > 0)
  }, [childId, streakDefs, submissions, transactions])

  if (!user || !childId || !streak || !level) return null

  const balance = computeBalance(transactions, childId)
  const points = computePoints(pointsTransactions, childId)
  const pending = submissions.filter((s) => s.childId === childId && s.status === 'pending')
  const mySuggestions = taskSuggestions.filter((s) => s.childId === childId)
  const recentPoints = pointsTransactions.filter((p) => p.childId === childId).slice(0, 5)
  const myGoals = savingsGoals.filter((g) => g.childId === childId)
  const topGoal = myGoals.length
    ? [...myGoals].sort((a, b) => a.targetAmount - balance - (b.targetAmount - balance))[0]
    : null

  function closeSubmitModal() {
    setConfirming(null)
    setIsInitiative(false)
    setPhotos([])
    setComment('')
  }

  function confirmSubmit() {
    if (!confirming) return
    const ok = submitTask(confirming.id, childId!, {
      isInitiative,
      photoIds: photos.map((p) => p.id),
      comment,
    })
    toast(ok ? 'Envoyé ! Un parent va vérifier. 💪' : 'Cette tâche a déjà été signalée.', ok ? 'success' : 'error')
    closeSubmitModal()
  }

  return (
    <div className="space-y-6">
      <motion.section
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-2 rounded-3xl p-7 text-center text-white shadow-lg"
        style={{ background: childGradient(user.color) }}
      >
        <ChildAvatar user={user} size="lg" decoration={rank?.rank.emoji} onClick={() => setEditingAvatar(true)} />
        <p className="font-display text-lg font-bold">{user.name}</p>
        <AnimatedBalance
          cents={points}
          format={(n) => `${n} pts`}
          className="font-display text-6xl font-bold drop-shadow-sm"
        />

        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {rank && (
            <p className="flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-sm font-bold">
              <span aria-hidden>{rank.rank.emoji}</span>
              {rank.rank.label}
            </p>
          )}
          <p className="flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-sm font-bold">
            <Sparkles size={15} aria-hidden />
            Niveau {level.level} · {level.title}
          </p>
          {settings.features.streaks && streak.count > 0 && (
            <p className="flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-sm font-bold">
              <Flame size={16} aria-hidden />
              {streak.count} jour{streak.count > 1 ? 's' : ''}
            </p>
          )}
        </div>

        <div className="mt-2 w-full max-w-60">
          <div className="h-2.5 overflow-hidden rounded-full bg-white/25">
            <motion.div
              className="h-full rounded-full bg-white"
              initial={{ width: 0 }}
              animate={{ width: `${(level.progress / level.target) * 100}%` }}
              transition={{ type: 'spring', damping: 20, delay: 0.3 }}
            />
          </div>
          <p className="mt-1 text-xs font-semibold text-white/85">
            {level.target - level.progress} tâche{level.target - level.progress > 1 ? 's' : ''} avant
            le niveau {level.level + 1} !
          </p>
        </div>
      </motion.section>

      {badges.some((b) => b.unlocked) && (
        <Link to="/enfant/profil" className="block">
          <Card className="flex items-center gap-2 overflow-x-auto p-3">
            <span className="shrink-0 text-xs font-bold text-slate-500 dark:text-slate-400">
              Mes badges
            </span>
            <span className="flex items-center gap-1.5">
              {badges
                .filter((b) => b.unlocked)
                .map((b) => (
                  <span
                    key={b.id}
                    title={b.label}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-xl dark:bg-amber-950/40"
                  >
                    {b.emoji}
                  </span>
                ))}
              {badges
                .filter((b) => !b.unlocked)
                .slice(0, 3)
                .map((b) => (
                  <span
                    key={b.id}
                    title={`À débloquer : ${b.label}`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xl opacity-40 grayscale dark:bg-slate-800"
                  >
                    {b.emoji}
                  </span>
                ))}
            </span>
          </Card>
        </Link>
      )}

      {settings.features.savingsGoals && topGoal && (
        <Link to="/enfant/profil" className="block">
          <Card className="space-y-2 p-4 transition-shadow hover:shadow-md">
            <div className="flex items-center gap-3">
              <span className="text-2xl" aria-hidden>
                {topGoal.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{topGoal.title}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {balance >= topGoal.targetAmount
                    ? 'Objectif atteint ! 🎉'
                    : `${formatEuro(Math.max(0, topGoal.targetAmount - balance))} restants`}
                </p>
              </div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-brand-from to-brand-to"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, (balance / topGoal.targetAmount) * 100)}%` }}
                transition={{ type: 'spring', damping: 20, delay: 0.2 }}
              />
            </div>
          </Card>
        </Link>
      )}

      {settings.features.streaks && streak.count > 0 && !streak.doneToday && (
        <Card className="flex items-center gap-3 border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/40">
          <Flame className="shrink-0 text-amber-500" size={20} aria-hidden />
          <p className="text-sm font-semibold">
            Ta série de {streak.count} jour{streak.count > 1 ? 's' : ''} se joue aujourd'hui — fais une
            tâche pour la garder ! 🔥
          </p>
        </Card>
      )}

      {settings.features.streaks && activeStreaks.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Mes séries en cours</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {activeStreaks.map(({ def, count, nextTier }) => (
              <Card key={def.id} className="flex flex-col items-center gap-1 p-4 text-center">
                <span className="text-2xl" aria-hidden>
                  {def.emoji}
                </span>
                <p className="text-xs font-bold leading-tight">{def.label}</p>
                <p className="font-display text-xl font-bold text-amber-600 dark:text-amber-400">
                  {count} j
                </p>
                {nextTier && (
                  <p className="text-[10px] text-slate-400">
                    {nextTier.days - count} j avant +{nextTier.points} pts
                  </p>
                )}
              </Card>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-bold">Tâches pour toi</h2>
        <div className="space-y-3">
          {available.map((task, i) => (
            <motion.div
              key={task.id}
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
            >
              <Card className="flex items-center gap-3 p-4 transition-shadow hover:shadow-md">
                <span className="text-3xl" aria-hidden>
                  {task.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{task.title}</p>
                  {task.description && (
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{task.description}</p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-violet-600 dark:text-violet-400">
                      +{task.points} pts
                    </span>
                    <DifficultyDots level={task.difficulty} />
                    {task.dailyLimit && task.dailyLimit > 1 && (
                      <span className="text-xs font-semibold text-slate-400">
                        {timesSubmittedToday(task, childId!, submissions)}/{task.dailyLimit} aujourd'hui
                      </span>
                    )}
                  </div>
                </div>
                <Button variant="success" onClick={() => setConfirming(task)}>
                  Je l'ai fait !
                </Button>
              </Card>
            </motion.div>
          ))}
          {available.length === 0 && (
            <EmptyState emoji="🏖️" text="Aucune tâche disponible pour le moment. Reviens plus tard !" />
          )}
        </div>
      </section>

      {settings.features.taskSuggestions && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">Mes propositions</h2>
            <Button variant="soft" size="sm" onClick={() => setProposingTask(true)}>
              <Plus size={16} />
              Proposer une tâche
            </Button>
          </div>
          {mySuggestions.length > 0 && (
            <Card className="divide-y divide-slate-100 dark:divide-slate-800">
              {mySuggestions.map((sug) => (
                <div key={sug.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-xl" aria-hidden>
                    {sug.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{sug.title}</p>
                    {sug.status === 'rejected' && sug.rejectionReason && (
                      <p className="mt-0.5 truncate text-xs text-rose-500">{sug.rejectionReason}</p>
                    )}
                  </div>
                  <Badge tone={sug.status === 'approved' ? 'green' : sug.status === 'rejected' ? 'red' : 'amber'}>
                    {sug.status === 'approved' ? 'Acceptée ✅' : sug.status === 'rejected' ? 'Refusée' : 'En attente'}
                  </Badge>
                </div>
              ))}
            </Card>
          )}
        </section>
      )}

      {pending.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
            <Hourglass size={18} className="text-amber-500" />
            En attente de validation
          </h2>
          <Card className="divide-y divide-slate-100 dark:divide-slate-800">
            {pending.map((sub) => {
              const task = tasks.find((t) => t.id === sub.taskId)
              return (
                <div key={sub.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-xl" aria-hidden>
                    {task?.icon ?? '❓'}
                  </span>
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold">{task?.title}</p>
                  {sub.photoIds && <span className="text-xs text-slate-400">📷 {sub.photoIds.length}</span>}
                  <span className="text-xs text-slate-400">{formatRelative(sub.submittedAt)} ⏳</span>
                </div>
              )
            })}
          </Card>
        </section>
      )}

      {recentPoints.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Derniers gains</h2>
          <Card className="divide-y divide-slate-100 dark:divide-slate-800">
            {recentPoints.map((ptx) => (
              <div key={ptx.id} className="flex items-center gap-3 px-4 py-3">
                <p className="min-w-0 flex-1 truncate text-sm">{ptx.description}</p>
                <PointsAmount points={ptx.amount} className="text-sm" />
              </div>
            ))}
          </Card>
        </section>
      )}

      <Modal
        open={confirming !== null}
        onClose={closeSubmitModal}
        title={confirming ? `${confirming.icon} ${confirming.title}` : ''}
      >
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
          Tu vas gagner <strong>+{confirming?.points ?? 0} points</strong> dès qu'un parent aura vérifié.
        </p>

        <div className="mb-4">
          <p className="mb-2 text-sm font-semibold">Ajoute des photos de preuve (optionnel)</p>
          <PhotoPicker photos={photos} onChange={setPhotos} />
        </div>

        <input
          className={`${inputCls} mb-4`}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Un commentaire ? Ex : j'ai aussi rangé les chaises"
          aria-label="Commentaire"
        />

        <label className="mb-5 flex cursor-pointer items-start gap-3 rounded-xl bg-amber-50 p-3 dark:bg-amber-950/40">
          <input
            type="checkbox"
            checked={isInitiative}
            onChange={(e) => setIsInitiative(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-amber-500"
          />
          <span className="text-sm">
            ⭐ Je l'ai fait <strong>sans qu'on me le demande</strong>
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              Bonus initiative : +{settings.initiativeBonus} points
            </span>
          </span>
        </label>
        <Button variant="success" size="lg" className="w-full" onClick={confirmSubmit}>
          C'est fait, envoyer ! 🚀
        </Button>
      </Modal>

      <AnimatePresence>
        {unlockedBadge && (
          <BadgeUnlockModal badge={unlockedBadge} onClose={() => setUnlockedBadge(null)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!unlockedBadge && rankedUpTo && (
          <RankUpModal rank={rankedUpTo} onClose={() => setRankedUpTo(null)} />
        )}
      </AnimatePresence>

      {editingAvatar && (
        <AvatarEditorModal user={user} actorId={user.id} onClose={() => setEditingAvatar(false)} />
      )}

      {proposingTask && <ProposeTaskModal childId={childId} onClose={() => setProposingTask(false)} />}
    </div>
  )
}
