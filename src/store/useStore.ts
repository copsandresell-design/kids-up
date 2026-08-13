import { create } from 'zustand'
import { useDemoMode, useDemoStore } from './demoStore'
import { db, load, save } from '../db/storage'
import { defaultSettings, seedStreakDefs } from '../db/seed'
import { computeAgeGroup, pointsMultiplierFor } from '../lib/ageGroup'
import { computeBadges, DEFAULT_BADGE_DEFS } from '../lib/badges'
import { computeBalance } from '../lib/balance'
import { hashSecret, makeSalt, verifySecret } from '../lib/crypto'
import { formatEuro } from '../lib/format'
import { uid } from '../lib/id'
import { computeLoans } from '../lib/loans'
import { capWeeklyGain, computeInitiativeBonus, computePoints, computeTaskPoints } from '../lib/points'
import { DEFAULT_RANK_DEFS } from '../lib/ranks'
import { broadcastNotification } from '../lib/realtime'
import { sendPushTo } from '../lib/push'
import { approvedOccurrenceIndexToday, isTaskAvailable } from '../lib/recurrence'
import { computeStreakDefCount } from '../lib/streak'
import { deleteRecord, fetchAll, pushRecord, type SyncTable } from '../lib/sync'
import type {
  AgeGroup,
  AppNotification,
  AuditLog,
  BadgeDef,
  Category,
  Message,
  NotificationType,
  PenaltyRule,
  PointsTransaction,
  PointsTransactionType,
  RankDef,
  Recurrence,
  Redemption,
  RewardClaim,
  Role,
  SavingsGoal,
  Session,
  Settings,
  ShopCategory,
  ShopItem,
  StreakDef,
  StreakTier,
  Task,
  TaskSubmission,
  TaskSuggestion,
  Transaction,
  User,
} from '../types'

export const SESSION_DURATION = 30 * 60 * 1000
export const PENALTY_CANCEL_WINDOW = 24 * 60 * 60 * 1000
const MAX_LOGS = 2000
const MAX_NOTIFICATIONS = 200

export interface Toast {
  id: number
  message: string
  kind: 'success' | 'error'
}

export type TaskInput = Omit<Task, 'id' | 'createdAt' | 'createdBy' | 'isActive'> & { id?: string }

/** Toutes les clés d'état dont les enregistrements sont répliqués individuellement vers Supabase. */
type RemoteEntityKey =
  | 'users'
  | 'tasks'
  | 'submissions'
  | 'transactions'
  | 'savingsGoals'
  | 'logs'
  | 'pointsTransactions'
  | 'rewardClaims'
  | 'penaltyRules'
  | 'shopItems'
  | 'redemptions'
  | 'streakDefs'
  | 'badgeDefs'
  | 'rankDefs'
  | 'taskSuggestions'

type RemoteEntity =
  | User
  | Task
  | TaskSubmission
  | Transaction
  | SavingsGoal
  | AuditLog
  | PointsTransaction
  | RewardClaim
  | PenaltyRule
  | ShopItem
  | Redemption
  | StreakDef
  | BadgeDef
  | RankDef
  | TaskSuggestion

export interface Store {
  ready: boolean
  users: User[]
  tasks: Task[]
  submissions: TaskSubmission[]
  transactions: Transaction[]
  savingsGoals: SavingsGoal[]
  logs: AuditLog[]
  messages: Message[]
  notifications: AppNotification[]
  pointsTransactions: PointsTransaction[]
  rewardClaims: RewardClaim[]
  penaltyRules: PenaltyRule[]
  shopItems: ShopItem[]
  redemptions: Redemption[]
  streakDefs: StreakDef[]
  badgeDefs: BadgeDef[]
  rankDefs: RankDef[]
  taskSuggestions: TaskSuggestion[]
  settings: Settings
  session: Session | null
  toasts: Toast[]

  init: () => Promise<void>
  /** Réconcilie l'état local avec Supabase (familles, tâches, soumissions, transactions partagées). */
  syncFromRemote: () => Promise<void>
  receiveRemoteUpsert: (key: RemoteEntityKey, record: RemoteEntity) => void
  receiveRemoteDelete: (key: RemoteEntityKey, id: string) => void
  /** Reçoit les réglages (dont les fonctionnalités activées) mis à jour depuis un autre appareil. */
  receiveRemoteSettings: (settings: Settings) => void
  toast: (message: string, kind?: Toast['kind']) => void
  dismissToast: (id: number) => void

  receiveNotification: (notif: AppNotification) => void
  markNotificationRead: (id: string) => void
  markAllNotificationsRead: (userId: string) => void
  clearNotifications: (userId: string) => void

  login: (userId: string, secret: string) => Promise<boolean>
  logout: () => void
  touchSession: () => void

  saveTask: (input: TaskInput, actorId: string) => void
  deleteTask: (taskId: string, actorId: string) => void

  submitTask: (
    taskId: string,
    childId: string,
    opts: { isInitiative: boolean; photoIds?: string[]; comment?: string },
  ) => boolean
  sendMessage: (toChildId: string, text: string, fromId: string) => void
  /** Notification push libre envoyée par un parent à un ou plusieurs enfants (Réglages). */
  sendCustomNotification: (childIds: string[], text: string, actorId: string) => void
  approveSubmission: (submissionId: string, parentId: string) => void
  rejectSubmission: (submissionId: string, parentId: string, reason: string) => void

  applyPenalty: (
    input: { childId: string; title: string; motif?: string; amount: number },
    parentId: string,
  ) => boolean
  cancelPenalty: (transactionId: string, parentId: string) => void
  /** Contrôle parental étendu : modifie ou supprime une pénalité déjà appliquée, sans limite de temps. */
  editPenaltyTransaction: (
    transactionId: string,
    patch: { title: string; motif?: string; amount: number },
    parentId: string,
  ) => boolean
  deletePenaltyTransaction: (transactionId: string, parentId: string) => boolean
  /** Annule une validation faite par erreur : reverse la transaction et repasse la soumission en attente/refusée. */
  revertApproval: (
    submissionId: string,
    newStatus: 'pending' | 'rejected',
    parentId: string,
    reason?: string,
  ) => boolean
  /**
   * Supprime définitivement une validation déjà approuvée : reverse les points (même
   * mécanique que revertApproval) puis efface la soumission de l'historique de l'enfant —
   * contrairement à revertApproval, aucune trace de la soumission elle-même ne subsiste
   * (l'action de suppression, elle, reste tracée dans le journal d'audit du parent).
   */
  deleteSubmission: (submissionId: string, parentId: string) => boolean

  savePenaltyRule: (
    input: {
      id?: string
      childId: string
      title: string
      amount: number
      recurrence: Recurrence
      active: boolean
    },
    actorId: string,
  ) => void
  deletePenaltyRule: (ruleId: string, actorId: string) => void

  resetBalance: (childId: string, parentId: string) => void
  /**
   * Remise à zéro complète de la saison pour tous les enfants : soldes, points (dépensables et
   * à vie, donc rang), badges/séries (via rewardClaims), historique (transactions, soumissions,
   * pénalités appliquées), objectifs d'épargne, et stock boutique restauré à sa valeur initiale
   * (déduite des échanges non annulés). Ne touche pas aux comptes, aux catalogues (tâches,
   * badges/séries/rangs, boutique) ni aux réglages.
   */
  resetSeason: (actorId: string) => void

  updateChild: (
    childId: string,
    patch: Partial<Pick<User, 'name' | 'avatar' | 'color' | 'isActive' | 'birthdate'>>,
    actorId: string,
  ) => void
  updateAvatar: (
    userId: string,
    patch: { avatar?: string; photoId?: string | null },
    actorId: string,
  ) => void
  changeSecret: (userId: string, newSecret: string, actorId: string) => Promise<void>
  updateSettings: (patch: Partial<Settings>, actorId: string) => void

  /** Crée un nouveau profil (enfant ou parent) — utilisé par la page Enfants/Réglages. */
  createUser: (
    input: { role: Role; name: string; avatar: string; color: string; secret: string },
    actorId: string,
  ) => Promise<User>

  saveStreakDef: (
    input: {
      id?: string
      kind: StreakDef['kind']
      label: string
      emoji: string
      taskId?: string
      tiers: StreakTier[]
      isActive: boolean
    },
    actorId: string,
  ) => void
  deleteStreakDef: (defId: string, actorId: string) => void

  saveBadgeDef: (
    input: {
      id?: string
      kind: BadgeDef['kind']
      label: string
      emoji: string
      description: string
      points: number
      params: BadgeDef['params']
      isActive: boolean
    },
    actorId: string,
  ) => void
  deleteBadgeDef: (defId: string, actorId: string) => void

  saveRankDef: (
    input: { id?: string; label: string; emoji: string; color: string; threshold: number },
    actorId: string,
  ) => void
  deleteRankDef: (defId: string, actorId: string) => void

  addSavingsGoal: (childId: string, title: string, icon: string, targetAmount: number, actorId: string) => void
  deleteSavingsGoal: (goalId: string, actorId: string) => void

  createShopItem: (
    input: { title: string; icon: string; category: ShopCategory; cost: number; stock?: number; ageGroup?: AgeGroup },
    actorId: string,
  ) => void
  /** Modifie un lot existant — sert notamment à réapprovisionner (augmenter le stock). */
  updateShopItem: (
    itemId: string,
    patch: Partial<{
      title: string
      icon: string
      category: ShopCategory
      cost: number
      stock: number
      ageGroup: AgeGroup | undefined
    }>,
    actorId: string,
  ) => void
  deleteShopItem: (itemId: string, actorId: string) => void
  proposeWish: (childId: string, title: string, icon: string, category: ShopCategory) => void
  approveWish: (itemId: string, cost: number, actorId: string, stock?: number) => void
  rejectWish: (itemId: string, actorId: string) => void
  redeemShopItem: (childId: string, itemId: string, actorId: string) => boolean
  fulfillRedemption: (redemptionId: string, actorId: string) => void
  cancelRedemption: (redemptionId: string, actorId: string) => void
  convertPointsToMoney: (childId: string, points: number, actorId: string) => boolean

  /** Transfert de points entre enfants, cadeau sans suivi de remboursement. */
  giftPoints: (fromChildId: string, toChildId: string, amount: number, note: string, actorId: string) => boolean
  /** Transfert de points entre enfants avec suivi de dette — voir lib/loans.ts (reconstruit
   *  depuis pointsTransactions, aucune entité "prêt" stockée séparément). */
  lendPoints: (fromChildId: string, toChildId: string, amount: number, note: string, actorId: string) => boolean
  /** Remboursement total ou partiel d'un prêt — loanId = id de la transaction 'points_loan_sent'. */
  repayLoan: (loanId: string, amount: number, actorId: string) => boolean
  /** Attribution (ou retrait, montant négatif) libre de points par un parent, hors tâche/badge/série. */
  adjustPoints: (childId: string, amount: number, reason: string, actorId: string) => boolean
  /**
   * Annule le déblocage d'un badge pour un enfant précis (erreur de paramétrage à la création,
   * ex : seuil trop bas ayant débloqué le badge rétroactivement) : reprend les points crédités
   * et efface le claim. Si les critères du badge restent remplis par ailleurs, il pourra se
   * redéclencher tout seul au prochain checkRewards — corriger le badge d'abord si besoin.
   */
  revokeBadgeClaim: (childId: string, badgeDefId: string, actorId: string) => boolean

  /** Idée de tâche proposée par un enfant — voir approveTaskSuggestion/rejectTaskSuggestion. */
  proposeTaskSuggestion: (
    childId: string,
    input: { title: string; description?: string; icon: string; category: Category; suggestedPoints: number },
  ) => void
  /** Crée une vraie tâche active à partir de la proposition (le parent peut tout ajuster avant). */
  approveTaskSuggestion: (
    suggestionId: string,
    patch: { title: string; description?: string; icon: string; category: Category; points: number; assignedTo: string[] },
    actorId: string,
  ) => void
  rejectTaskSuggestion: (suggestionId: string, actorId: string, reason?: string) => void
}

let toastSeq = 0

// 'logs' est volontairement exclu : jusqu'à MAX_LOGS (2000) entrées, republier tout le
// tableau à chaque nouvelle ligne serait 2000 upserts pour un seul ajout. pushLog() pousse
// donc directement l'entrée unique créée (voir plus bas), en dehors de ce mécanisme générique.
const SYNCED_KEYS = [
  'users',
  'tasks',
  'submissions',
  'transactions',
  'savingsGoals',
  'pointsTransactions',
  'rewardClaims',
  'penaltyRules',
  'shopItems',
  'redemptions',
  'streakDefs',
  'badgeDefs',
  'rankDefs',
  'taskSuggestions',
] as const
type SyncedKey = (typeof SYNCED_KEYS)[number]

const SYNC_TABLE_FOR: Record<SyncedKey, SyncTable> = {
  users: 'sync_users',
  tasks: 'sync_tasks',
  submissions: 'sync_submissions',
  transactions: 'sync_transactions',
  savingsGoals: 'sync_savings_goals',
  pointsTransactions: 'sync_points_transactions',
  rewardClaims: 'sync_reward_claims',
  penaltyRules: 'sync_penalty_rules',
  shopItems: 'sync_shop_items',
  redemptions: 'sync_redemptions',
  streakDefs: 'sync_streak_defs',
  badgeDefs: 'sync_badge_defs',
  rankDefs: 'sync_rank_defs',
  taskSuggestions: 'sync_task_suggestions',
}

function syncTableFor(key: SyncedKey): SyncTable {
  return SYNC_TABLE_FOR[key]
}

/**
 * Catalogues (séries/badges/rangs) : si Supabase ne contient encore aucune ligne pour cette
 * table (première ouverture de l'app après ce changement, ou famille jamais synchronisée),
 * on démarre avec le catalogue par défaut et on le publie immédiatement — il devient ainsi
 * une donnée réelle en base, éditable depuis l'app sans redéploiement.
 */
function withDefaults<T extends { id: string }>(remote: T[], defaults: T[], table: SyncTable): T[] {
  if (remote.length > 0) return remote
  for (const d of defaults) pushRecord(table, d.id, d)
  return defaults
}

/** Fusionne les réglages chargés (potentiellement anciens, avec des champs manquants) avec les valeurs par défaut. */
function normalizeSettings(raw: Settings): Settings {
  return {
    ...defaultSettings,
    ...raw,
    features: { ...defaultSettings.features, ...raw.features },
    inactivityPenalty: { ...defaultSettings.inactivityPenalty, ...raw.inactivityPenalty },
    weeklyPointsCap: { ...defaultSettings.weeklyPointsCap, ...raw.weeklyPointsCap },
    dailyReminder: { ...defaultSettings.dailyReminder, ...raw.dailyReminder },
  }
}

const useRealStore = create<Store>((set, get) => {
  function persist(
    key:
      | 'users'
      | 'tasks'
      | 'submissions'
      | 'transactions'
      | 'savingsGoals'
      | 'logs'
      | 'messages'
      | 'notifications'
      | 'pointsTransactions'
      | 'rewardClaims'
      | 'penaltyRules'
      | 'shopItems'
      | 'redemptions'
      | 'streakDefs'
      | 'badgeDefs'
      | 'rankDefs'
      | 'taskSuggestions',
  ) {
    const value = get()[key]
    save(key, value)
    // Familles, tâches, soumissions, transactions… sont partagées entre appareils :
    // chaque écriture locale republie l'ensemble du tableau vers Supabase (petits
    // volumes, donc pas besoin de diff fin — plus simple et plus sûr). 'logs' fait
    // exception (voir pushLog) : ce tableau peut grossir jusqu'à MAX_LOGS.
    if ((SYNCED_KEYS as readonly string[]).includes(key)) {
      const table = syncTableFor(key as SyncedKey)
      for (const record of value as Array<{ id: string }>) {
        pushRecord(table, record.id, record)
      }
    }
  }

  function pushLog(
    action: string,
    actorId: string,
    details: string,
    subjectId?: string,
    amount?: number,
    relatedId?: string,
  ) {
    const entry: AuditLog = { id: uid(), action, actorId, subjectId, relatedId, amount, details, timestamp: Date.now() }
    set((s) => ({ logs: [entry, ...s.logs].slice(0, MAX_LOGS) }))
    save('logs', get().logs)
    // Un seul enregistrement poussé (pas persist() générique) : voir le commentaire sur SYNCED_KEYS.
    pushRecord('sync_logs', entry.id, entry)
  }

  function notify(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    icon: string,
    link?: string,
  ) {
    const notif: AppNotification = {
      id: uid(),
      userId,
      userName: get().users.find((u) => u.id === userId)?.name,
      type,
      title,
      message,
      icon,
      read: false,
      createdAt: Date.now(),
      link,
    }
    set((s) => ({ notifications: [notif, ...s.notifications].slice(0, MAX_NOTIFICATIONS) }))
    persist('notifications')
    broadcastNotification(notif)
    // Push OS réel (marche même app fermée) — best effort, ne bloque jamais l'app.
    sendPushTo(userId, title, message, icon, link)
  }

  function notifyParents(type: NotificationType, title: string, message: string, icon: string, link?: string) {
    for (const parent of get().users.filter((u) => u.role === 'parent' && u.isActive)) {
      notify(parent.id, type, title, message, icon, link)
    }
  }

  function awardReward(
    childId: string,
    key: string,
    points: number,
    title: string,
    type: PointsTransactionType,
    actorId: string,
  ) {
    const claim: RewardClaim = { id: uid(), childId, key, createdAt: Date.now() }
    // Le claim est créé quel que soit le montant réellement crédité (voir capWeeklyGain) :
    // le palier/badge ne doit jamais se re-déclencher juste parce que le plafond hebdo a
    // réduit ou annulé le gain la première fois.
    const amount = capWeeklyGain(points, childId, get().pointsTransactions, get().settings.weeklyPointsCap)
    const capped = amount < points
    const ptx: PointsTransaction = {
      id: uid(),
      childId,
      type,
      amount,
      description: `${title}${capped ? ' (plafond hebdo)' : ''}`,
      // Relie la transaction à son claim (voir revokeBadgeClaim) : permet de retrouver et
      // reverser précisément les points d'un badge donné, sans dépendre du texte de description.
      relatedTo: claim.id,
      createdBy: actorId,
      createdAt: Date.now(),
    }
    set((s) => ({
      rewardClaims: [claim, ...s.rewardClaims],
      pointsTransactions: [ptx, ...s.pointsTransactions],
    }))
    persist('rewardClaims')
    persist('pointsTransactions')
    pushLog('reward_earned', actorId, `${title} (+${amount} pts)`, childId)
    notify(childId, 'reward_earned', `+${amount} points !`, title, '🏅', '/enfant/profil')
  }

  /**
   * Vérifie, pour chaque enfant, si de nouveaux paliers de série ou badges méritent des
   * points — idempotent via rewardClaims. Les séries sont traitées avant les badges : certains
   * badges (streak_tier) se déverrouillent justement en observant la présence du claim de
   * série correspondant (voir computeBadges).
   */
  function checkRewards(actorId: string) {
    const { users, submissions, transactions, tasks, savingsGoals, redemptions, streakDefs, badgeDefs } = get()
    const children = users.filter((u) => u.role === 'child' && u.isActive)
    const now = new Date()

    for (const child of children) {
      for (const def of streakDefs.filter((d) => d.isActive)) {
        const count = computeStreakDefCount(def, child.id, {
          submissions,
          transactions,
          now,
          childCreatedAt: child.createdAt,
        })
        for (const tier of def.tiers) {
          if (count < tier.days) continue
          const key = `streak:${def.id}:${tier.days}`
          if (get().rewardClaims.some((r) => r.childId === child.id && r.key === key)) continue
          awardReward(
            child.id,
            key,
            tier.points,
            `${def.emoji} ${def.label} — ${tier.days} jours !`,
            'streak_bonus',
            actorId,
          )
        }
      }
    }

    for (const child of children) {
      const badges = computeBadges({
        childId: child.id,
        submissions,
        pointsTransactions: get().pointsTransactions,
        transactions,
        tasks,
        savingsGoals,
        redemptions,
        rewardClaims: get().rewardClaims,
        streakDefs,
        children,
        badgeDefs,
        now,
      })
      for (const badge of badges) {
        if (!badge.unlocked || badge.points <= 0) continue
        const key = `badge:${badge.id}`
        if (get().rewardClaims.some((r) => r.childId === child.id && r.key === key)) continue
        awardReward(child.id, key, badge.points, `Badge débloqué : ${badge.emoji} ${badge.label}`, 'badge', actorId)
      }
    }
  }

  /** Reverse une transaction de pénalité : marque l'originale annulée, ajoute une écriture d'annulation. */
  function reversePenaltyTx(tx: Transaction, parentId: string) {
    const reversal: Transaction = {
      id: uid(),
      type: 'penalty_cancel',
      childId: tx.childId,
      amount: -tx.amount,
      description: `Annulation — ${tx.description}`,
      relatedTo: tx.id,
      createdBy: parentId,
      createdAt: Date.now(),
    }
    set((s) => ({
      transactions: [
        reversal,
        ...s.transactions.map((t) => (t.id === tx.id ? { ...t, cancelled: true } : t)),
      ],
    }))
    persist('transactions')
  }

  return {
    ready: false,
    users: [],
    tasks: [],
    submissions: [],
    transactions: [],
    savingsGoals: [],
    logs: [],
    messages: [],
    notifications: [],
    pointsTransactions: [],
    rewardClaims: [],
    penaltyRules: [],
    shopItems: [],
    redemptions: [],
    streakDefs: [],
    badgeDefs: [],
    rankDefs: [],
    taskSuggestions: [],
    settings: defaultSettings,
    session: null,
    toasts: [],

    init: async () => {
      // Repartir du réel après une sortie du mode démo (voir store/demoStore.ts) déclenche cet
      // effet une seconde fois côté App — déjà initialisé, il n'y a rien à refaire.
      if (get().ready) return
      const localUsers = await load<User[]>('users', [])
      let users = localUsers
      let tasks = await load<Task[]>('tasks', [])
      let submissions = await load<TaskSubmission[]>('submissions', [])
      let transactions = await load<Transaction[]>('transactions', [])
      let savingsGoals = await load<SavingsGoal[]>('savingsGoals', [])
      const messages = await load<Message[]>('messages', [])
      const notifications = await load<AppNotification[]>('notifications', [])
      let logs = await load<AuditLog[]>('logs', [])
      let pointsTransactions = await load<PointsTransaction[]>('pointsTransactions', [])
      let rewardClaims = await load<RewardClaim[]>('rewardClaims', [])
      let penaltyRules = await load<PenaltyRule[]>('penaltyRules', [])
      let shopItems = await load<ShopItem[]>('shopItems', [])
      let redemptions = await load<Redemption[]>('redemptions', [])
      let streakDefs = await load<StreakDef[]>('streakDefs', [])
      let badgeDefs = await load<BadgeDef[]>('badgeDefs', [])
      let rankDefs = await load<RankDef[]>('rankDefs', [])
      let taskSuggestions = await load<TaskSuggestion[]>('taskSuggestions', [])
      let settings = normalizeSettings(await load<Settings>('settings', defaultSettings))
      let session = await load<Session | null>('session', null)

      // Les identifiants d'utilisateur/tâche sont générés localement à chaque appareil :
      // sans réconciliation, deux appareils ne parlent jamais de la même famille.
      // Supabase fait autorité dès qu'il contient des données ; sinon cet appareil sème.
      try {
        const remoteUsers = await fetchAll<User>('sync_users')
        if (remoteUsers.length > 0) {
          const previousLocalUser = session ? localUsers.find((u) => u.id === session!.userId) : undefined
          users = remoteUsers
          const [
            remoteTasks,
            remoteSubmissions,
            remoteTransactions,
            remoteSavingsGoals,
            remoteSettingsRows,
            remoteLogs,
            remotePointsTransactions,
            remoteRewardClaims,
            remotePenaltyRules,
            remoteShopItems,
            remoteRedemptions,
            remoteStreakDefs,
            remoteBadgeDefs,
            remoteRankDefs,
            remoteTaskSuggestions,
          ] = await Promise.all([
            fetchAll<Task>('sync_tasks'),
            fetchAll<TaskSubmission>('sync_submissions'),
            fetchAll<Transaction>('sync_transactions'),
            fetchAll<SavingsGoal>('sync_savings_goals'),
            fetchAll<Settings>('sync_settings'),
            fetchAll<AuditLog>('sync_logs'),
            fetchAll<PointsTransaction>('sync_points_transactions'),
            fetchAll<RewardClaim>('sync_reward_claims'),
            fetchAll<PenaltyRule>('sync_penalty_rules'),
            fetchAll<ShopItem>('sync_shop_items'),
            fetchAll<Redemption>('sync_redemptions'),
            fetchAll<StreakDef>('sync_streak_defs'),
            fetchAll<BadgeDef>('sync_badge_defs'),
            fetchAll<RankDef>('sync_rank_defs'),
            fetchAll<TaskSuggestion>('sync_task_suggestions'),
          ])
          if (remoteTasks.length > 0) tasks = remoteTasks
          submissions = remoteSubmissions
          transactions = remoteTransactions
          savingsGoals = remoteSavingsGoals
          logs = remoteLogs
          pointsTransactions = remotePointsTransactions
          rewardClaims = remoteRewardClaims
          penaltyRules = remotePenaltyRules
          shopItems = remoteShopItems
          redemptions = remoteRedemptions
          streakDefs = withDefaults(remoteStreakDefs, seedStreakDefs(tasks), 'sync_streak_defs')
          badgeDefs = withDefaults(remoteBadgeDefs, DEFAULT_BADGE_DEFS, 'sync_badge_defs')
          rankDefs = withDefaults(remoteRankDefs, DEFAULT_RANK_DEFS, 'sync_rank_defs')
          taskSuggestions = remoteTaskSuggestions
          if (remoteSettingsRows.length > 0) {
            settings = normalizeSettings(remoteSettingsRows[0])
          } else {
            pushRecord('sync_settings', 'main', settings)
          }
          save('users', users)
          save('tasks', tasks)
          save('submissions', submissions)
          save('transactions', transactions)
          save('savingsGoals', savingsGoals)
          save('settings', settings)
          save('logs', logs)
          save('pointsTransactions', pointsTransactions)
          save('rewardClaims', rewardClaims)
          save('penaltyRules', penaltyRules)
          save('shopItems', shopItems)
          save('redemptions', redemptions)
          save('streakDefs', streakDefs)
          save('badgeDefs', badgeDefs)
          save('rankDefs', rankDefs)
          save('taskSuggestions', taskSuggestions)

          // Cet appareil avait son propre id local pour l'utilisateur connecté :
          // on le fait correspondre au bon compte partagé via son nom.
          if (session && !users.some((u) => u.id === session!.userId)) {
            const byName = previousLocalUser ? users.find((u) => u.name === previousLocalUser.name) : undefined
            session = byName ? { ...session, userId: byName.id } : null
            save('session', session)
          }
        } else if (users.length === 0) {
          // Multi-familles (GODCLAUDE phase 1) : sync_users vide pour CETTE famille (authentifiée
          // via Supabase Auth, family_id implicite par RLS) ne veut plus dire "tout premier
          // lancement de l'app, jamais connectée à Supabase" (c'était le seul cas avant l'auth
          // multi-familles) — ça peut aussi vouloir dire "famille toute neuve". Le flux d'inscription
          // (src/pages/FamilyAuthScreen.tsx) crée déjà le premier profil parent AVANT que ce code ne
          // s'exécute ; on ne clone donc plus ici la famille de Julien (seedUsers/seedTasks) par
          // défaut pour une famille qui n'en a pas encore — juste les catalogues génériques
          // (séries/badges/rangs), qui ne contiennent aucune donnée personnelle.
          streakDefs = seedStreakDefs(tasks)
          badgeDefs = DEFAULT_BADGE_DEFS
          rankDefs = DEFAULT_RANK_DEFS
          save('settings', settings)
          save('streakDefs', streakDefs)
          save('badgeDefs', badgeDefs)
          save('rankDefs', rankDefs)
          for (const u of users) pushRecord('sync_users', u.id, u)
          for (const t of tasks) pushRecord('sync_tasks', t.id, t)
          for (const l of logs) pushRecord('sync_logs', l.id, l)
          for (const d of streakDefs) pushRecord('sync_streak_defs', d.id, d)
          for (const b of badgeDefs) pushRecord('sync_badge_defs', b.id, b)
          for (const r of rankDefs) pushRecord('sync_rank_defs', r.id, r)
          pushRecord('sync_settings', 'main', settings)
        } else {
          // Appareil déjà utilisé avant l'ajout de la synchro : publie ses données locales.
          if (streakDefs.length === 0) streakDefs = seedStreakDefs(tasks)
          if (badgeDefs.length === 0) badgeDefs = DEFAULT_BADGE_DEFS
          if (rankDefs.length === 0) rankDefs = DEFAULT_RANK_DEFS
          save('streakDefs', streakDefs)
          save('badgeDefs', badgeDefs)
          save('rankDefs', rankDefs)
          for (const u of users) pushRecord('sync_users', u.id, u)
          for (const t of tasks) pushRecord('sync_tasks', t.id, t)
          for (const s of submissions) pushRecord('sync_submissions', s.id, s)
          for (const tr of transactions) pushRecord('sync_transactions', tr.id, tr)
          for (const g of savingsGoals) pushRecord('sync_savings_goals', g.id, g)
          for (const l of logs) pushRecord('sync_logs', l.id, l)
          for (const p of pointsTransactions) pushRecord('sync_points_transactions', p.id, p)
          for (const r of rewardClaims) pushRecord('sync_reward_claims', r.id, r)
          for (const p of penaltyRules) pushRecord('sync_penalty_rules', p.id, p)
          for (const s of shopItems) pushRecord('sync_shop_items', s.id, s)
          for (const r of redemptions) pushRecord('sync_redemptions', r.id, r)
          for (const d of streakDefs) pushRecord('sync_streak_defs', d.id, d)
          for (const b of badgeDefs) pushRecord('sync_badge_defs', b.id, b)
          for (const r of rankDefs) pushRecord('sync_rank_defs', r.id, r)
          for (const s of taskSuggestions) pushRecord('sync_task_suggestions', s.id, s)
          pushRecord('sync_settings', 'main', settings)
        }
      } catch (e) {
        console.error('❌ Sync : initialisation distante échouée, poursuite en local', e)
        // Multi-familles (GODCLAUDE phase 1) : même raisonnement que le cas "vide mais sans
        // erreur" ci-dessus — plus de clonage de la famille de Julien par défaut ici non plus.
        if (streakDefs.length === 0) streakDefs = seedStreakDefs(tasks)
        if (badgeDefs.length === 0) badgeDefs = DEFAULT_BADGE_DEFS
        if (rankDefs.length === 0) rankDefs = DEFAULT_RANK_DEFS
      }

      if (session && session.expiresAt < Date.now()) {
        session = null
        save('session', null)
      }

      set({
        ready: true,
        users,
        tasks,
        submissions,
        transactions,
        savingsGoals,
        logs,
        messages,
        notifications,
        pointsTransactions,
        rewardClaims,
        penaltyRules,
        shopItems,
        redemptions,
        streakDefs,
        badgeDefs,
        rankDefs,
        taskSuggestions,
        settings,
        session,
      })
    },

    syncFromRemote: async () => {
      try {
        const [
          remoteUsers,
          remoteTasks,
          remoteSubmissions,
          remoteTransactions,
          remoteSavingsGoals,
          remoteSettingsRows,
          remoteLogs,
          remotePointsTransactions,
          remoteRewardClaims,
          remotePenaltyRules,
          remoteShopItems,
          remoteRedemptions,
          remoteStreakDefs,
          remoteBadgeDefs,
          remoteRankDefs,
          remoteTaskSuggestions,
        ] = await Promise.all([
          fetchAll<User>('sync_users'),
          fetchAll<Task>('sync_tasks'),
          fetchAll<TaskSubmission>('sync_submissions'),
          fetchAll<Transaction>('sync_transactions'),
          fetchAll<SavingsGoal>('sync_savings_goals'),
          fetchAll<Settings>('sync_settings'),
          fetchAll<AuditLog>('sync_logs'),
          fetchAll<PointsTransaction>('sync_points_transactions'),
          fetchAll<RewardClaim>('sync_reward_claims'),
          fetchAll<PenaltyRule>('sync_penalty_rules'),
          fetchAll<ShopItem>('sync_shop_items'),
          fetchAll<Redemption>('sync_redemptions'),
          fetchAll<StreakDef>('sync_streak_defs'),
          fetchAll<BadgeDef>('sync_badge_defs'),
          fetchAll<RankDef>('sync_rank_defs'),
          fetchAll<TaskSuggestion>('sync_task_suggestions'),
        ])
        if (remoteUsers.length === 0) return // rien à réconcilier (pas encore de famille distante)
        const settings = remoteSettingsRows.length > 0 ? normalizeSettings(remoteSettingsRows[0]) : get().settings
        const streakDefs = remoteStreakDefs.length > 0 ? remoteStreakDefs : get().streakDefs
        const badgeDefs = remoteBadgeDefs.length > 0 ? remoteBadgeDefs : get().badgeDefs
        const rankDefs = remoteRankDefs.length > 0 ? remoteRankDefs : get().rankDefs
        set({
          users: remoteUsers,
          tasks: remoteTasks,
          submissions: remoteSubmissions,
          transactions: remoteTransactions,
          savingsGoals: remoteSavingsGoals,
          settings,
          logs: remoteLogs,
          pointsTransactions: remotePointsTransactions,
          rewardClaims: remoteRewardClaims,
          penaltyRules: remotePenaltyRules,
          shopItems: remoteShopItems,
          redemptions: remoteRedemptions,
          streakDefs,
          badgeDefs,
          rankDefs,
          taskSuggestions: remoteTaskSuggestions,
        })
        save('users', remoteUsers)
        save('tasks', remoteTasks)
        save('submissions', remoteSubmissions)
        save('transactions', remoteTransactions)
        save('savingsGoals', remoteSavingsGoals)
        save('settings', settings)
        save('logs', remoteLogs)
        save('pointsTransactions', remotePointsTransactions)
        save('rewardClaims', remoteRewardClaims)
        save('penaltyRules', remotePenaltyRules)
        save('shopItems', remoteShopItems)
        save('redemptions', remoteRedemptions)
        save('taskSuggestions', remoteTaskSuggestions)
        save('streakDefs', streakDefs)
        save('badgeDefs', badgeDefs)
        save('rankDefs', rankDefs)
      } catch (e) {
        console.error('❌ Sync : rafraîchissement distant échoué', e)
      }
    },

    receiveRemoteUpsert: (key, record) => {
      set((s) => {
        const arr = s[key] as Array<{ id: string }>
        const idx = arr.findIndex((r) => r.id === (record as { id: string }).id)
        const next = idx === -1 ? [record, ...arr] : arr.map((r) => (r.id === (record as { id: string }).id ? record : r))
        return { [key]: next } as Partial<Store>
      })
      save(key, get()[key])
    },

    receiveRemoteDelete: (key, id) => {
      set((s) => ({ [key]: (s[key] as Array<{ id: string }>).filter((r) => r.id !== id) }) as Partial<Store>)
      save(key, get()[key])
    },

    receiveRemoteSettings: (settings) => {
      const merged = normalizeSettings(settings)
      set({ settings: merged })
      save('settings', merged)
    },

    toast: (message, kind = 'success') => {
      const id = ++toastSeq
      set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }))
      setTimeout(() => get().dismissToast(id), 3500)
    },

    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

    receiveNotification: (notif) => {
      if (get().notifications.some((n) => n.id === notif.id)) return
      set((s) => ({ notifications: [notif, ...s.notifications].slice(0, MAX_NOTIFICATIONS) }))
      persist('notifications')
    },

    markNotificationRead: (id) => {
      set((s) => ({
        notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
      }))
      persist('notifications')
    },

    markAllNotificationsRead: (userId) => {
      set((s) => ({
        notifications: s.notifications.map((n) => (n.userId === userId ? { ...n, read: true } : n)),
      }))
      persist('notifications')
    },

    clearNotifications: (userId) => {
      set((s) => ({ notifications: s.notifications.filter((n) => n.userId !== userId) }))
      persist('notifications')
    },

    login: async (userId, secret) => {
      const user = get().users.find((u) => u.id === userId && u.isActive)
      if (!user) return false
      const ok = await verifySecret(secret, user.secretSalt, user.secretHash)
      if (!ok) return false
      const session: Session = { userId, role: user.role, expiresAt: Date.now() + SESSION_DURATION }
      set({ session })
      save('session', session)
      pushLog('login', userId, `${user.name} s'est connecté(e)`)
      return true
    },

    logout: () => {
      set({ session: null })
      save('session', null)
    },

    touchSession: () => {
      const session = get().session
      if (!session) return
      if (session.expiresAt < Date.now()) {
        get().logout()
        return
      }
      const refreshed = { ...session, expiresAt: Date.now() + SESSION_DURATION }
      set({ session: refreshed })
      save('session', refreshed)
    },

    saveTask: (input, actorId) => {
      const { id, ...fields } = input
      let newlyAssigned: string[] = []
      if (id) {
        const before = get().tasks.find((t) => t.id === id)
        newlyAssigned = fields.assignedTo.filter((c) => !before?.assignedTo.includes(c))
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...fields } : t)) }))
        pushLog('task_updated', actorId, `« ${fields.title} » (${fields.points} pts)`)
      } else {
        const task: Task = { ...fields, id: uid(), createdBy: actorId, createdAt: Date.now(), isActive: true }
        newlyAssigned = task.assignedTo
        set((s) => ({ tasks: [task, ...s.tasks] }))
        pushLog('task_created', actorId, `« ${task.title} » (${task.points} pts)`)
      }
      persist('tasks')
      for (const childId of newlyAssigned) {
        notify(
          childId,
          'task_assigned',
          'Nouvelle tâche pour toi !',
          `${fields.title} · +${fields.points} points`,
          fields.icon,
          '/enfant',
        )
      }
    },

    deleteTask: (taskId, actorId) => {
      const task = get().tasks.find((t) => t.id === taskId)
      if (!task) return
      set((s) => ({ tasks: s.tasks.filter((t) => t.id !== taskId) }))
      pushLog('task_deleted', actorId, `« ${task.title} »`)
      persist('tasks')
      deleteRecord('sync_tasks', taskId)
    },

    submitTask: (taskId, childId, { isInitiative, photoIds, comment }) => {
      const { tasks, submissions } = get()
      const task = tasks.find((t) => t.id === taskId)
      if (!task || !isTaskAvailable(task, childId, submissions)) return false
      const submission: TaskSubmission = {
        id: uid(),
        taskId,
        childId,
        status: 'pending',
        isInitiative,
        photoIds: photoIds?.length ? photoIds : undefined,
        comment: comment?.trim() || undefined,
        submittedAt: Date.now(),
        bonusApplied: false,
      }
      set((s) => ({ submissions: [submission, ...s.submissions] }))
      pushLog(
        'task_submitted',
        childId,
        `« ${task.title} »${isInitiative ? ' ⭐ initiative' : ''}${photoIds?.length ? ` · ${photoIds.length} photo(s)` : ''}`,
        childId,
      )
      persist('submissions')
      const child = get().users.find((u) => u.id === childId)
      notifyParents(
        'task_submitted',
        `${child?.name ?? 'Un enfant'} a terminé une tâche`,
        `${task.title}${isInitiative ? ' ⭐ initiative' : ''} · à valider`,
        task.icon,
        '/parent/validations',
      )
      checkRewards(childId)
      return true
    },

    sendMessage: (toChildId, text, fromId) => {
      const trimmed = text.trim()
      if (!trimmed) return
      const message: Message = { id: uid(), fromId, toChildId, text: trimmed, createdAt: Date.now() }
      set((s) => ({ messages: [message, ...s.messages] }))
      pushLog('message_sent', fromId, `« ${trimmed} »`, toChildId)
      persist('messages')
      const from = get().users.find((u) => u.id === fromId)
      notify(toChildId, 'message', `Message de ${from?.name ?? 'tes parents'}`, trimmed, '💌', '/enfant/profil')
    },

    sendCustomNotification: (childIds, text, actorId) => {
      const trimmed = text.trim()
      if (!trimmed || childIds.length === 0) return
      const targets = get().users.filter((u) => u.role === 'child' && childIds.includes(u.id))
      for (const child of targets) {
        notify(child.id, 'message', 'Message de tes parents', trimmed, '💌', '/enfant/profil')
      }
      pushLog(
        'custom_notification_sent',
        actorId,
        `« ${trimmed} » → ${targets.map((c) => c.name).join(', ') || '?'}`,
      )
    },

    approveSubmission: (submissionId, parentId) => {
      const { submissions, tasks, settings, pointsTransactions, users } = get()
      const sub = submissions.find((s) => s.id === submissionId)
      const task = sub && tasks.find((t) => t.id === sub.taskId)
      if (!sub || !task || sub.status !== 'pending') return
      const child = users.find((u) => u.id === sub.childId)
      // Rendement dégressif : seules les tâches répétables (dailyLimit > 1) sont concernées,
      // -20 % par répétition déjà validée aujourd'hui, jamais sous 1 point.
      const occurrenceIndex =
        task.dailyLimit && task.dailyLimit > 1
          ? approvedOccurrenceIndexToday(task.id, sub.childId, sub, submissions)
          : 0
      const basePoints = computeTaskPoints(task.points, occurrenceIndex)
      const bonus = sub.isInitiative ? computeInitiativeBonus(basePoints, settings.initiativeBonusPercent) : 0
      // Groupe d'âge (Petit/Grand) : neutre (×1) tant que la famille n'a pas réglé de seuil ou
      // que la date de naissance de l'enfant est inconnue — voir lib/ageGroup.ts.
      const ageGroup = computeAgeGroup(child?.birthdate, settings.ageGroupThresholdYears)
      const multiplier = pointsMultiplierFor(ageGroup, settings)
      const rawPoints = Math.round((basePoints + bonus) * multiplier)
      const points = capWeeklyGain(rawPoints, sub.childId, pointsTransactions, settings.weeklyPointsCap)
      const capped = points < rawPoints
      const ptx: PointsTransaction = {
        id: uid(),
        childId: sub.childId,
        type: 'task_approval',
        amount: points,
        description: `${task.icon} ${task.title}${bonus > 0 ? ' ⭐ initiative' : ''}${capped ? ' (plafond hebdo)' : ''}`,
        relatedTo: sub.id,
        createdBy: parentId,
        createdAt: Date.now(),
      }
      set((s) => ({
        submissions: s.submissions.map((x) =>
          x.id === submissionId
            ? { ...x, status: 'approved' as const, reviewedAt: Date.now(), reviewedBy: parentId, bonusApplied: bonus > 0 }
            : x,
        ),
        pointsTransactions: [ptx, ...s.pointsTransactions],
      }))
      pushLog('submission_approved', parentId, `« ${task.title} » (+${points} pts)`, sub.childId, undefined, sub.id)
      persist('submissions')
      persist('pointsTransactions')
      notify(
        sub.childId,
        'task_approved',
        'Tâche validée ! 🎉',
        `${task.title} · +${points} points${bonus > 0 ? ' (bonus initiative inclus)' : ''}${capped ? ' · plafond hebdo atteint' : ''}`,
        task.icon,
        '/enfant',
      )
      checkRewards(parentId)
    },

    revertApproval: (submissionId, newStatus, parentId, reason) => {
      const { submissions, tasks, pointsTransactions } = get()
      const sub = submissions.find((s) => s.id === submissionId)
      if (!sub || sub.status !== 'approved') return false
      const task = tasks.find((t) => t.id === sub.taskId)
      const ptx = pointsTransactions.find((p) => p.relatedTo === sub.id && p.type === 'task_approval')
      if (ptx) {
        const reversal: PointsTransaction = {
          id: uid(),
          type: 'task_approval_reverted',
          childId: sub.childId,
          amount: -ptx.amount,
          description: `Annulation de validation — ${task?.title ?? 'tâche'}`,
          relatedTo: ptx.id,
          createdBy: parentId,
          createdAt: Date.now(),
        }
        set((s) => ({ pointsTransactions: [reversal, ...s.pointsTransactions] }))
        persist('pointsTransactions')
      }
      set((s) => ({
        submissions: s.submissions.map((x) =>
          x.id === submissionId
            ? {
                ...x,
                status: newStatus,
                reviewedAt: newStatus === 'rejected' ? Date.now() : undefined,
                reviewedBy: newStatus === 'rejected' ? parentId : undefined,
                rejectionReason: newStatus === 'rejected' ? reason : undefined,
                bonusApplied: false,
              }
            : x,
        ),
      }))
      persist('submissions')
      const statusLabel = newStatus === 'pending' ? 'en attente' : 'refusée'
      pushLog(
        'submission_approval_reverted',
        parentId,
        `« ${task?.title ?? '?'} » repassée ${statusLabel}${ptx ? ` (-${ptx.amount} pts)` : ''}`,
        sub.childId,
        undefined,
        sub.id,
      )
      notify(
        sub.childId,
        'task_rejected',
        'Validation annulée',
        `${task?.title ?? 'Une tâche'} a été repassée ${statusLabel} par un parent.`,
        '↩️',
        '/enfant',
      )
      return true
    },

    deleteSubmission: (submissionId, parentId) => {
      const { submissions, tasks, pointsTransactions } = get()
      const sub = submissions.find((s) => s.id === submissionId)
      if (!sub || sub.status !== 'approved') return false
      const task = tasks.find((t) => t.id === sub.taskId)
      const ptx = pointsTransactions.find((p) => p.relatedTo === sub.id && p.type === 'task_approval')
      if (ptx) {
        const reversal: PointsTransaction = {
          id: uid(),
          type: 'task_approval_reverted',
          childId: sub.childId,
          amount: -ptx.amount,
          description: `Suppression de validation — ${task?.title ?? 'tâche'}`,
          relatedTo: ptx.id,
          createdBy: parentId,
          createdAt: Date.now(),
        }
        set((s) => ({ pointsTransactions: [reversal, ...s.pointsTransactions] }))
        persist('pointsTransactions')
      }
      set((s) => ({ submissions: s.submissions.filter((x) => x.id !== submissionId) }))
      persist('submissions')
      deleteRecord('sync_submissions', submissionId)
      pushLog(
        'submission_deleted',
        parentId,
        `« ${task?.title ?? '?'} » supprimée définitivement${ptx ? ` (-${ptx.amount} pts)` : ''}`,
        sub.childId,
        undefined,
        sub.id,
      )
      notify(
        sub.childId,
        'task_rejected',
        'Validation supprimée',
        `${task?.title ?? 'Une tâche'} validée a été supprimée par un parent.`,
        '🗑️',
        '/enfant',
      )
      return true
    },

    rejectSubmission: (submissionId, parentId, reason) => {
      const { submissions, tasks } = get()
      const sub = submissions.find((s) => s.id === submissionId)
      const task = sub && tasks.find((t) => t.id === sub.taskId)
      if (!sub || sub.status !== 'pending') return
      set((s) => ({
        submissions: s.submissions.map((x) =>
          x.id === submissionId
            ? { ...x, status: 'rejected' as const, reviewedAt: Date.now(), reviewedBy: parentId, rejectionReason: reason }
            : x,
        ),
      }))
      pushLog('submission_rejected', parentId, `« ${task?.title ?? '?'} » — ${reason || 'sans motif'}`, sub.childId)
      persist('submissions')
      notify(
        sub.childId,
        'task_rejected',
        'Tâche refusée',
        `${task?.title ?? 'Tâche'}${reason ? ` — ${reason}` : ''}`,
        '😕',
        '/enfant',
      )
    },

    applyPenalty: ({ childId, title, motif, amount }, parentId) => {
      const { transactions, settings } = get()
      const debit = -Math.abs(amount)
      if (computeBalance(transactions, childId) + debit < settings.minBalance) {
        get().toast(
          `Impossible : le solde passerait sous le minimum toléré (${settings.minBalance / 100} €).`,
          'error',
        )
        return false
      }
      const transaction: Transaction = {
        id: uid(),
        type: 'penalty',
        childId,
        amount: debit,
        description: `⚠️ ${title}${motif ? ` — ${motif}` : ''}`,
        createdBy: parentId,
        createdAt: Date.now(),
      }
      set((s) => ({ transactions: [transaction, ...s.transactions] }))
      pushLog('penalty_applied', parentId, `« ${title} »${motif ? ` — ${motif}` : ''}`, childId, debit, transaction.id)
      persist('transactions')
      notify(
        childId,
        'penalty',
        'Pénalité appliquée',
        `${title} · ${formatEuro(debit)}`,
        '⚠️',
        '/enfant/historique',
      )
      return true
    },

    // Undo rapide dans la minute suivante (bouton "Annuler" sur la page Pénalités) : fenêtre de 24h.
    cancelPenalty: (transactionId, parentId) => {
      const tx = get().transactions.find((t) => t.id === transactionId)
      if (!tx || tx.type !== 'penalty' || tx.cancelled) return
      if (Date.now() - tx.createdAt > PENALTY_CANCEL_WINDOW) {
        get().toast('Trop tard : une pénalité ne peut être annulée que sous 24 h.', 'error')
        return
      }
      reversePenaltyTx(tx, parentId)
      pushLog('penalty_cancelled', parentId, tx.description, tx.childId, -tx.amount, tx.id)
    },

    // Contrôle parental étendu (page Journal / Pénalités) : pas de limite de temps, correction explicite.
    deletePenaltyTransaction: (transactionId, parentId) => {
      const tx = get().transactions.find((t) => t.id === transactionId)
      if (!tx || tx.type !== 'penalty' || tx.cancelled) return false
      reversePenaltyTx(tx, parentId)
      pushLog('penalty_deleted', parentId, tx.description, tx.childId, -tx.amount, tx.id)
      notify(
        tx.childId,
        'penalty',
        'Pénalité supprimée',
        `« ${tx.description.replace('⚠️ ', '')} » a été annulée par un parent.`,
        '✅',
        '/enfant/historique',
      )
      return true
    },

    editPenaltyTransaction: (transactionId, patch, parentId) => {
      const tx = get().transactions.find((t) => t.id === transactionId)
      if (!tx || tx.type !== 'penalty' || tx.cancelled) return false
      reversePenaltyTx(tx, parentId)
      pushLog('penalty_edited', parentId, `${tx.description} → « ${patch.title} »`, tx.childId, undefined, tx.id)
      return get().applyPenalty(
        { childId: tx.childId, title: patch.title, motif: patch.motif, amount: patch.amount },
        parentId,
      )
    },

    resetBalance: (childId, parentId) => {
      const balance = computeBalance(get().transactions, childId)
      if (balance === 0) return
      const transaction: Transaction = {
        id: uid(),
        type: 'manual_adjustment',
        childId,
        amount: -balance,
        description: 'Réinitialisation du solde',
        createdBy: parentId,
        createdAt: Date.now(),
      }
      set((s) => ({ transactions: [transaction, ...s.transactions] }))
      pushLog('balance_reset', parentId, 'Solde remis à zéro', childId, -balance)
      persist('transactions')
    },

    resetSeason: (actorId) => {
      const { transactions, submissions, pointsTransactions, rewardClaims, redemptions, shopItems, savingsGoals } =
        get()

      // Stock initial déduit du stock courant + tous les échanges non annulés (chaque échange
      // décrémente le stock de 1, chaque annulation le restaure — voir redeemShopItem/cancelRedemption).
      const restoredShopItems = shopItems.map((item) => {
        if (item.stock === undefined) return item
        const consumed = redemptions.filter((r) => r.itemId === item.id && r.status !== 'cancelled').length
        return { ...item, stock: item.stock + consumed }
      })

      set({
        transactions: [],
        submissions: [],
        pointsTransactions: [],
        rewardClaims: [],
        redemptions: [],
        savingsGoals: [],
        shopItems: restoredShopItems,
      })
      save('transactions', [])
      save('submissions', [])
      save('pointsTransactions', [])
      save('rewardClaims', [])
      save('redemptions', [])
      save('savingsGoals', [])
      save('shopItems', restoredShopItems)

      // persist() republie ce qui reste mais ne supprime jamais côté Supabase : ces tableaux
      // étant désormais vides, il faut explicitement effacer chaque ancien enregistrement.
      for (const t of transactions) deleteRecord('sync_transactions', t.id)
      for (const s of submissions) deleteRecord('sync_submissions', s.id)
      for (const p of pointsTransactions) deleteRecord('sync_points_transactions', p.id)
      for (const r of rewardClaims) deleteRecord('sync_reward_claims', r.id)
      for (const r of redemptions) deleteRecord('sync_redemptions', r.id)
      for (const g of savingsGoals) deleteRecord('sync_savings_goals', g.id)
      for (const item of restoredShopItems) pushRecord('sync_shop_items', item.id, item)

      pushLog(
        'season_reset',
        actorId,
        'Saison réinitialisée : soldes, points, rangs, badges, séries, historique et stock boutique remis à zéro pour tous les enfants.',
      )
    },

    updateChild: (childId, patch, actorId) => {
      set((s) => ({ users: s.users.map((u) => (u.id === childId ? { ...u, ...patch } : u)) }))
      const child = get().users.find((u) => u.id === childId)
      pushLog('child_updated', actorId, `${child?.name ?? '?'} : ${Object.keys(patch).join(', ')}`, childId)
      persist('users')
    },

    updateAvatar: (userId, patch, actorId) => {
      set((s) => ({
        users: s.users.map((u) => {
          if (u.id !== userId) return u
          const next = { ...u }
          if (patch.avatar !== undefined) next.avatar = patch.avatar
          if (patch.photoId !== undefined) next.photoId = patch.photoId ?? undefined
          return next
        }),
      }))
      const user = get().users.find((u) => u.id === userId)
      pushLog('avatar_changed', actorId, `Avatar de ${user?.name ?? '?'} modifié`, userId)
      persist('users')
    },

    changeSecret: async (userId, newSecret, actorId) => {
      const secretSalt = makeSalt()
      const secretHash = await hashSecret(newSecret, secretSalt)
      set((s) => ({
        users: s.users.map((u) =>
          u.id === userId ? { ...u, secretHash, secretSalt, usesDefaultSecret: false } : u,
        ),
      }))
      const user = get().users.find((u) => u.id === userId)
      pushLog('secret_changed', actorId, `Code d'accès de ${user?.name ?? '?'} modifié`, userId)
      persist('users')
    },

    updateSettings: (patch, actorId) => {
      const next = { ...get().settings, ...patch }
      set({ settings: next })
      pushLog('settings_updated', actorId, Object.keys(patch).join(', '))
      save('settings', next)
      // Les réglages (dont les fonctionnalités activées) sont partagés en famille,
      // pas seulement sur cet appareil.
      pushRecord('sync_settings', 'main', next)
    },

    createUser: async (input, actorId) => {
      const trimmed = input.name.trim()
      const secretSalt = makeSalt()
      const secretHash = await hashSecret(input.secret, secretSalt)
      const user: User = {
        id: uid(),
        role: input.role,
        name: trimmed,
        secretHash,
        secretSalt,
        usesDefaultSecret: true,
        avatar: input.avatar,
        color: input.color,
        createdAt: Date.now(),
        isActive: true,
      }
      set((s) => ({ users: [...s.users, user] }))
      pushLog('user_created', actorId, `${trimmed} (${input.role === 'child' ? 'enfant' : 'parent'})`, user.id)
      persist('users')
      return user
    },

    saveStreakDef: (input, actorId) => {
      const { id, ...fields } = input
      if (id) {
        set((s) => ({ streakDefs: s.streakDefs.map((d) => (d.id === id ? { ...d, ...fields } : d)) }))
        pushLog('streak_def_updated', actorId, `« ${fields.label} »`)
      } else {
        const def: StreakDef = { ...fields, id: uid(), createdBy: actorId, createdAt: Date.now() }
        set((s) => ({ streakDefs: [def, ...s.streakDefs] }))
        pushLog('streak_def_created', actorId, `« ${def.label} »`)
      }
      persist('streakDefs')
    },

    deleteStreakDef: (defId, actorId) => {
      const def = get().streakDefs.find((d) => d.id === defId)
      if (!def) return
      set((s) => ({ streakDefs: s.streakDefs.filter((d) => d.id !== defId) }))
      pushLog('streak_def_deleted', actorId, `« ${def.label} »`)
      persist('streakDefs')
      deleteRecord('sync_streak_defs', defId)
    },

    saveBadgeDef: (input, actorId) => {
      const { id, ...fields } = input
      if (id) {
        set((s) => ({ badgeDefs: s.badgeDefs.map((b) => (b.id === id ? { ...b, ...fields } : b)) }))
        pushLog('badge_def_updated', actorId, `« ${fields.label} »`)
      } else {
        const def: BadgeDef = { ...fields, id: uid(), createdBy: actorId, createdAt: Date.now() }
        set((s) => ({ badgeDefs: [def, ...s.badgeDefs] }))
        pushLog('badge_def_created', actorId, `« ${def.label} »`)
      }
      persist('badgeDefs')
    },

    deleteBadgeDef: (defId, actorId) => {
      const def = get().badgeDefs.find((b) => b.id === defId)
      if (!def) return
      set((s) => ({ badgeDefs: s.badgeDefs.filter((b) => b.id !== defId) }))
      pushLog('badge_def_deleted', actorId, `« ${def.label} »`)
      persist('badgeDefs')
      deleteRecord('sync_badge_defs', defId)
    },

    saveRankDef: (input, actorId) => {
      const { id, ...fields } = input
      if (id) {
        set((s) => ({ rankDefs: s.rankDefs.map((r) => (r.id === id ? { ...r, ...fields } : r)) }))
        pushLog('rank_def_updated', actorId, `« ${fields.label} »`)
      } else {
        const def: RankDef = { ...fields, id: uid(), createdBy: actorId, createdAt: Date.now() }
        set((s) => ({ rankDefs: [def, ...s.rankDefs] }))
        pushLog('rank_def_created', actorId, `« ${def.label} »`)
      }
      persist('rankDefs')
    },

    deleteRankDef: (defId, actorId) => {
      const def = get().rankDefs.find((r) => r.id === defId)
      if (!def) return
      set((s) => ({ rankDefs: s.rankDefs.filter((r) => r.id !== defId) }))
      pushLog('rank_def_deleted', actorId, `« ${def.label} »`)
      persist('rankDefs')
      deleteRecord('sync_rank_defs', defId)
    },

    savePenaltyRule: (input, actorId) => {
      const { id, ...fields } = input
      if (id) {
        set((s) => ({ penaltyRules: s.penaltyRules.map((r) => (r.id === id ? { ...r, ...fields } : r)) }))
        pushLog('penalty_rule_updated', actorId, `« ${fields.title} »`, fields.childId)
      } else {
        const rule: PenaltyRule = { ...fields, id: uid(), createdBy: actorId, createdAt: Date.now() }
        set((s) => ({ penaltyRules: [rule, ...s.penaltyRules] }))
        pushLog('penalty_rule_created', actorId, `« ${rule.title} »`, rule.childId)
      }
      persist('penaltyRules')
    },

    deletePenaltyRule: (ruleId, actorId) => {
      const rule = get().penaltyRules.find((r) => r.id === ruleId)
      if (!rule) return
      set((s) => ({ penaltyRules: s.penaltyRules.filter((r) => r.id !== ruleId) }))
      pushLog('penalty_rule_deleted', actorId, `« ${rule.title} »`, rule.childId)
      persist('penaltyRules')
      deleteRecord('sync_penalty_rules', ruleId)
    },

    addSavingsGoal: (childId, title, icon, targetAmount, actorId) => {
      const trimmed = title.trim()
      if (!trimmed || targetAmount <= 0) return
      const goal: SavingsGoal = {
        id: uid(),
        childId,
        title: trimmed,
        icon,
        targetAmount,
        createdBy: actorId,
        createdAt: Date.now(),
      }
      set((s) => ({ savingsGoals: [goal, ...s.savingsGoals] }))
      pushLog('savings_goal_created', actorId, `« ${trimmed} » (${formatEuro(targetAmount)})`, childId)
      persist('savingsGoals')
    },

    deleteSavingsGoal: (goalId, actorId) => {
      const goal = get().savingsGoals.find((g) => g.id === goalId)
      if (!goal) return
      set((s) => ({ savingsGoals: s.savingsGoals.filter((g) => g.id !== goalId) }))
      pushLog('savings_goal_deleted', actorId, `« ${goal.title} »`, goal.childId)
      persist('savingsGoals')
      deleteRecord('sync_savings_goals', goalId)
    },

    createShopItem: (input, actorId) => {
      const trimmed = input.title.trim()
      if (!trimmed || input.cost <= 0) return
      const item: ShopItem = {
        id: uid(),
        title: trimmed,
        icon: input.icon,
        category: input.category,
        cost: input.cost,
        stock: input.stock,
        ageGroup: input.ageGroup,
        status: 'active',
        createdBy: actorId,
        createdAt: Date.now(),
      }
      set((s) => ({ shopItems: [item, ...s.shopItems] }))
      pushLog(
        'shop_item_created',
        actorId,
        `« ${trimmed} » (${input.cost} pts${input.stock !== undefined ? `, stock ${input.stock}` : ''})`,
      )
      persist('shopItems')
    },

    updateShopItem: (itemId, patch, actorId) => {
      const item = get().shopItems.find((i) => i.id === itemId)
      if (!item) return
      set((s) => ({ shopItems: s.shopItems.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) }))
      pushLog('shop_item_updated', actorId, `« ${patch.title ?? item.title} »`)
      persist('shopItems')
    },

    deleteShopItem: (itemId, actorId) => {
      const item = get().shopItems.find((i) => i.id === itemId)
      if (!item) return
      set((s) => ({ shopItems: s.shopItems.filter((i) => i.id !== itemId) }))
      pushLog('shop_item_deleted', actorId, `« ${item.title} »`)
      persist('shopItems')
      deleteRecord('sync_shop_items', itemId)
    },

    proposeWish: (childId, title, icon, category) => {
      const trimmed = title.trim()
      if (!trimmed) return
      const item: ShopItem = {
        id: uid(),
        title: trimmed,
        icon,
        category,
        status: 'proposed',
        proposedBy: childId,
        createdBy: childId,
        createdAt: Date.now(),
      }
      set((s) => ({ shopItems: [item, ...s.shopItems] }))
      pushLog('wish_submitted', childId, `« ${trimmed} »`, childId)
      persist('shopItems')
      const child = get().users.find((u) => u.id === childId)
      notifyParents(
        'wish_submitted',
        'Nouveau vœu 🎁',
        `${child?.name ?? 'Un enfant'} aimerait : ${trimmed}`,
        icon,
        '/parent/boutique',
      )
    },

    approveWish: (itemId, cost, actorId, stock) => {
      const item = get().shopItems.find((i) => i.id === itemId)
      if (!item || item.status !== 'proposed' || cost <= 0) return
      set((s) => ({
        shopItems: s.shopItems.map((i) => (i.id === itemId ? { ...i, status: 'active' as const, cost, stock } : i)),
      }))
      pushLog('wish_approved', actorId, `« ${item.title} » ajouté à la boutique (${cost} pts)`, item.proposedBy)
      persist('shopItems')
      if (item.proposedBy) {
        notify(
          item.proposedBy,
          'wish_decided',
          'Ton vœu a été accepté ! 🎉',
          `« ${item.title} » est maintenant dans la boutique pour ${cost} points.`,
          item.icon,
          '/enfant/boutique',
        )
      }
    },

    rejectWish: (itemId, actorId) => {
      const item = get().shopItems.find((i) => i.id === itemId)
      if (!item || item.status !== 'proposed') return
      set((s) => ({ shopItems: s.shopItems.filter((i) => i.id !== itemId) }))
      pushLog('wish_rejected', actorId, `« ${item.title} »`, item.proposedBy)
      persist('shopItems')
      deleteRecord('sync_shop_items', itemId)
      if (item.proposedBy) {
        notify(
          item.proposedBy,
          'wish_decided',
          'Vœu non retenu',
          `« ${item.title} » n'a pas été ajouté à la boutique cette fois.`,
          '😕',
          '/enfant/boutique',
        )
      }
    },

    redeemShopItem: (childId, itemId, actorId) => {
      const item = get().shopItems.find((i) => i.id === itemId)
      if (!item || item.status !== 'active' || item.cost === undefined) return false
      // Un lot venu d'un vœu approuvé reste réservé à l'enfant qui l'a demandé (voir aussi le
      // filtre du catalogue dans ChildShopPage.tsx) — vérifié ici aussi pour ne pas dépendre
      // uniquement du fait que le bouton soit masqué côté UI.
      if (item.proposedBy && item.proposedBy !== childId) {
        get().toast('Ce lot vient du vœu d\'un autre enfant.', 'error')
        return false
      }
      // Lot réservé à un groupe d'âge (voir aussi le filtre du catalogue dans
      // ChildShopPage.tsx) — vérifié ici aussi pour ne pas dépendre uniquement du fait que le
      // bouton soit masqué côté UI.
      if (item.ageGroup) {
        const { users, settings } = get()
        const child = users.find((u) => u.id === childId)
        const group = computeAgeGroup(child?.birthdate, settings.ageGroupThresholdYears)
        if (item.ageGroup !== group) {
          get().toast("Ce lot n'est pas disponible pour ton groupe d'âge.", 'error')
          return false
        }
      }
      if (item.stock !== undefined && item.stock <= 0) {
        get().toast('Ce lot est épuisé.', 'error')
        return false
      }
      const balance = computePoints(get().pointsTransactions, childId)
      if (balance < item.cost) {
        get().toast('Pas assez de points pour ce lot.', 'error')
        return false
      }
      if (item.stock !== undefined) {
        set((s) => ({
          shopItems: s.shopItems.map((i) => (i.id === itemId ? { ...i, stock: (i.stock ?? 0) - 1 } : i)),
        }))
        persist('shopItems')
      }
      const redemption: Redemption = {
        id: uid(),
        childId,
        itemId,
        title: item.title,
        icon: item.icon,
        cost: item.cost,
        status: 'pending',
        requestedAt: Date.now(),
      }
      const ptx: PointsTransaction = {
        id: uid(),
        childId,
        type: 'shop_redeem',
        amount: -item.cost,
        description: `${item.icon} ${item.title}`,
        relatedTo: redemption.id,
        createdBy: actorId,
        createdAt: Date.now(),
      }
      set((s) => ({
        redemptions: [redemption, ...s.redemptions],
        pointsTransactions: [ptx, ...s.pointsTransactions],
      }))
      pushLog('redemption_requested', actorId, `« ${item.title} » (${item.cost} pts)`, childId, undefined, redemption.id)
      persist('redemptions')
      persist('pointsTransactions')
      const child = get().users.find((u) => u.id === childId)
      notifyParents(
        'redemption_requested',
        'Échange demandé 🎁',
        `${child?.name ?? 'Un enfant'} veut échanger ${item.cost} points contre « ${item.title} ».`,
        item.icon,
        '/parent/boutique',
      )
      return true
    },

    fulfillRedemption: (redemptionId, actorId) => {
      const red = get().redemptions.find((r) => r.id === redemptionId)
      if (!red || red.status !== 'pending') return
      set((s) => ({
        redemptions: s.redemptions.map((r) =>
          r.id === redemptionId ? { ...r, status: 'fulfilled' as const, fulfilledAt: Date.now(), fulfilledBy: actorId } : r,
        ),
      }))
      pushLog('redemption_fulfilled', actorId, `« ${red.title} »`, red.childId, undefined, red.id)
      persist('redemptions')
      notify(red.childId, 'redemption_fulfilled', 'Ton lot est prêt ! 🎉', `« ${red.title} » t'attend.`, red.icon, '/enfant/boutique')
    },

    cancelRedemption: (redemptionId, actorId) => {
      const red = get().redemptions.find((r) => r.id === redemptionId)
      if (!red || red.status !== 'pending') return
      set((s) => ({
        redemptions: s.redemptions.map((r) => (r.id === redemptionId ? { ...r, status: 'cancelled' as const } : r)),
      }))
      const item = get().shopItems.find((i) => i.id === red.itemId)
      if (item && item.stock !== undefined) {
        set((s) => ({
          shopItems: s.shopItems.map((i) => (i.id === red.itemId ? { ...i, stock: (i.stock ?? 0) + 1 } : i)),
        }))
        persist('shopItems')
      }
      const refund: PointsTransaction = {
        id: uid(),
        childId: red.childId,
        type: 'shop_refund',
        amount: red.cost,
        description: `Remboursement — ${red.title}`,
        relatedTo: red.id,
        createdBy: actorId,
        createdAt: Date.now(),
      }
      set((s) => ({ pointsTransactions: [refund, ...s.pointsTransactions] }))
      pushLog('redemption_cancelled', actorId, `« ${red.title} » — points remboursés`, red.childId, undefined, red.id)
      persist('redemptions')
      persist('pointsTransactions')
      notify(
        red.childId,
        'redemption_fulfilled',
        'Échange annulé',
        `« ${red.title} » a été annulé, tes points sont remboursés.`,
        '↩️',
        '/enfant/boutique',
      )
    },

    convertPointsToMoney: (childId, points, actorId) => {
      if (points <= 0 || !Number.isInteger(points)) return false
      const balance = computePoints(get().pointsTransactions, childId)
      if (points > balance) {
        get().toast('Pas assez de points.', 'error')
        return false
      }
      const cents = Math.round((points / get().settings.pointsPerEuro) * 100)
      if (cents <= 0) return false
      const ptx: PointsTransaction = {
        id: uid(),
        childId,
        type: 'points_to_money',
        amount: -points,
        description: `Conversion en argent (${points} pts)`,
        createdBy: actorId,
        createdAt: Date.now(),
      }
      const tx: Transaction = {
        id: uid(),
        type: 'points_conversion',
        childId,
        amount: cents,
        description: `💱 Conversion de ${points} points`,
        createdBy: actorId,
        createdAt: Date.now(),
      }
      set((s) => ({
        pointsTransactions: [ptx, ...s.pointsTransactions],
        transactions: [tx, ...s.transactions],
      }))
      pushLog('points_converted', actorId, `${points} points → ${formatEuro(cents)}`, childId, cents)
      persist('pointsTransactions')
      persist('transactions')
      get().toast(`${formatEuro(cents)} ajoutés à ton solde !`)
      return true
    },

    giftPoints: (fromChildId, toChildId, amount, note, actorId) => {
      if (fromChildId === toChildId || !Number.isInteger(amount) || amount <= 0) return false
      const { users, pointsTransactions } = get()
      const from = users.find((u) => u.id === fromChildId)
      const to = users.find((u) => u.id === toChildId)
      if (!from || !to) return false
      if (amount > computePoints(pointsTransactions, fromChildId)) {
        get().toast('Pas assez de points pour ce don.', 'error')
        return false
      }
      const trimmedNote = note.trim()
      const sent: PointsTransaction = {
        id: uid(),
        childId: fromChildId,
        type: 'points_gift_sent',
        amount: -amount,
        description: `🎁 Don à ${to.name}${trimmedNote ? ` — ${trimmedNote}` : ''}`,
        createdBy: actorId,
        createdAt: Date.now(),
      }
      const received: PointsTransaction = {
        id: uid(),
        childId: toChildId,
        type: 'points_gift_received',
        amount,
        description: `🎁 Don de ${from.name}${trimmedNote ? ` — ${trimmedNote}` : ''}`,
        relatedTo: sent.id,
        createdBy: actorId,
        createdAt: Date.now(),
      }
      set((s) => ({ pointsTransactions: [received, sent, ...s.pointsTransactions] }))
      persist('pointsTransactions')
      pushLog(
        'points_gift',
        actorId,
        `${from.name} → ${to.name} : ${amount} pts offerts${trimmedNote ? ` — ${trimmedNote}` : ''}`,
        fromChildId,
        -amount,
        sent.id,
      )
      notify(
        toChildId,
        'points_received',
        'Cadeau reçu ! 🎁',
        `${from.name} t'offre ${amount} points${trimmedNote ? ` — ${trimmedNote}` : ''}`,
        '🎁',
        '/enfant/profil',
      )
      notifyParents('points_received', 'Don entre enfants', `${from.name} a offert ${amount} points à ${to.name}.`, '🎁')
      return true
    },

    lendPoints: (fromChildId, toChildId, amount, note, actorId) => {
      if (fromChildId === toChildId || !Number.isInteger(amount) || amount <= 0) return false
      const { users, pointsTransactions } = get()
      const from = users.find((u) => u.id === fromChildId)
      const to = users.find((u) => u.id === toChildId)
      if (!from || !to) return false
      if (amount > computePoints(pointsTransactions, fromChildId)) {
        get().toast('Pas assez de points pour ce prêt.', 'error')
        return false
      }
      const trimmedNote = note.trim()
      const sent: PointsTransaction = {
        id: uid(),
        childId: fromChildId,
        type: 'points_loan_sent',
        amount: -amount,
        description: `🤝 Prêt à ${to.name}${trimmedNote ? ` — ${trimmedNote}` : ''}`,
        createdBy: actorId,
        createdAt: Date.now(),
      }
      const received: PointsTransaction = {
        id: uid(),
        childId: toChildId,
        type: 'points_loan_received',
        amount,
        description: `🤝 Prêt de ${from.name}${trimmedNote ? ` — ${trimmedNote}` : ''}`,
        relatedTo: sent.id,
        createdBy: actorId,
        createdAt: Date.now(),
      }
      set((s) => ({ pointsTransactions: [received, sent, ...s.pointsTransactions] }))
      persist('pointsTransactions')
      pushLog(
        'points_loan',
        actorId,
        `${from.name} → ${to.name} : ${amount} pts prêtés${trimmedNote ? ` — ${trimmedNote}` : ''}`,
        fromChildId,
        -amount,
        sent.id,
      )
      notify(
        toChildId,
        'points_received',
        'Prêt reçu 🤝',
        `${from.name} te prête ${amount} points${trimmedNote ? ` — ${trimmedNote}` : ''}`,
        '🤝',
        '/enfant/profil',
      )
      notifyParents('points_received', 'Prêt entre enfants', `${from.name} a prêté ${amount} points à ${to.name}.`, '🤝')
      return true
    },

    repayLoan: (loanId, amount, actorId) => {
      if (!Number.isInteger(amount) || amount <= 0) return false
      const { pointsTransactions, users } = get()
      const loan = computeLoans(pointsTransactions).find((l) => l.id === loanId)
      if (!loan || loan.status === 'repaid') return false
      if (amount > loan.remaining) {
        get().toast(`Ce prêt n'a plus que ${loan.remaining} points à rembourser.`, 'error')
        return false
      }
      if (amount > computePoints(pointsTransactions, loan.borrowerId)) {
        get().toast('Pas assez de points pour rembourser ce montant.', 'error')
        return false
      }
      const lender = users.find((u) => u.id === loan.lenderId)
      const borrower = users.find((u) => u.id === loan.borrowerId)
      if (!lender || !borrower) return false
      const repaySent: PointsTransaction = {
        id: uid(),
        childId: loan.borrowerId,
        type: 'points_loan_repay_sent',
        amount: -amount,
        description: `Remboursement à ${lender.name}`,
        relatedTo: loanId,
        createdBy: actorId,
        createdAt: Date.now(),
      }
      const repayReceived: PointsTransaction = {
        id: uid(),
        childId: loan.lenderId,
        type: 'points_loan_repay_received',
        amount,
        description: `Remboursement de ${borrower.name}`,
        relatedTo: loanId,
        createdBy: actorId,
        createdAt: Date.now(),
      }
      set((s) => ({ pointsTransactions: [repayReceived, repaySent, ...s.pointsTransactions] }))
      persist('pointsTransactions')
      const fullyRepaid = amount === loan.remaining
      pushLog(
        'points_loan_repaid',
        actorId,
        `${borrower.name} → ${lender.name} : ${amount} pts remboursés${
          fullyRepaid ? ' (prêt soldé)' : ` (reste ${loan.remaining - amount})`
        }`,
        loan.borrowerId,
        -amount,
        loanId,
      )
      notify(
        loan.lenderId,
        'points_received',
        'Remboursement reçu 💸',
        `${borrower.name} te rembourse ${amount} points.`,
        '💸',
        '/enfant/profil',
      )
      notifyParents('points_received', 'Prêt remboursé', `${borrower.name} a remboursé ${amount} points à ${lender.name}.`, '💸')
      return true
    },

    adjustPoints: (childId, amount, reason, actorId) => {
      if (!Number.isInteger(amount) || amount === 0) return false
      const child = get().users.find((u) => u.id === childId)
      if (!child) return false
      if (amount < 0 && computePoints(get().pointsTransactions, childId) + amount < 0) {
        get().toast('Le solde de points passerait en négatif.', 'error')
        return false
      }
      const trimmedReason = reason.trim()
      const ptx: PointsTransaction = {
        id: uid(),
        childId,
        type: 'manual_adjustment',
        amount,
        description: trimmedReason ? `Ajustement manuel — ${trimmedReason}` : 'Ajustement manuel',
        createdBy: actorId,
        createdAt: Date.now(),
      }
      set((s) => ({ pointsTransactions: [ptx, ...s.pointsTransactions] }))
      persist('pointsTransactions')
      pushLog(
        'points_adjusted',
        actorId,
        `${amount > 0 ? '+' : ''}${amount} pts pour ${child.name}${trimmedReason ? ` — ${trimmedReason}` : ''}`,
        childId,
        amount,
        ptx.id,
      )
      notify(
        childId,
        'points_received',
        amount > 0 ? 'Points offerts par un parent 🎁' : 'Ajustement de points',
        `${amount > 0 ? '+' : ''}${amount} points${trimmedReason ? ` — ${trimmedReason}` : ''}`,
        amount > 0 ? '🎁' : '✏️',
        '/enfant/profil',
      )
      return true
    },

    revokeBadgeClaim: (childId, badgeDefId, actorId) => {
      const { rewardClaims, pointsTransactions, badgeDefs, streakDefs, users } = get()
      const def = badgeDefs.find((b) => b.id === badgeDefId)
      const child = users.find((u) => u.id === childId)

      // Un badge streak_tier se débloque en observant le claim de SÉRIE sous-jacent, pas un
      // claim qui lui serait propre (voir computeBadges : unlocked = hasClaim(`streak:...`)).
      // Ne retirer que `badge:${badgeDefId}` ne sert donc à rien pour ce genre : le claim de
      // série reste présent, computeBadges continue de voir le badge comme mérité, et
      // checkRewards le re-crédite instantanément au prochain passage — le badge « revient »
      // tout seul. Il faut retirer les DEUX claims (série + badge) pour que ça tienne.
      const streakDef =
        def?.kind === 'streak_tier' && def.params.streakDefId
          ? streakDefs.find((d) => d.id === def.params.streakDefId)
          : undefined
      const keys: Array<{ key: string; streak: boolean }> = [{ key: `badge:${badgeDefId}`, streak: false }]
      if (streakDef && def?.params.days !== undefined) {
        keys.push({ key: `streak:${streakDef.id}:${def.params.days}`, streak: true })
      }

      let removed = false
      let totalReversed = 0
      const newClaims: RewardClaim[] = []
      const newReversals: PointsTransaction[] = []

      for (const { key, streak } of keys) {
        const claim = rewardClaims.find((r) => r.childId === childId && r.key === key)
        if (!claim) continue
        removed = true
        newClaims.push(claim)
        const expectedType = streak ? 'streak_bonus' : 'badge'
        const expectedDescription = streak
          ? `${streakDef?.emoji ?? ''} ${streakDef?.label ?? ''} — ${def?.params.days} jours !`.trim()
          : def
            ? `Badge débloqué : ${def.emoji} ${def.label}`
            : undefined
        // Les claims créés avant l'ajout du champ relatedTo (voir awardReward) n'ont pas de lien
        // direct : on retombe alors sur la transaction la plus récente au libellé attendu.
        const ptx =
          pointsTransactions.find((p) => p.relatedTo === claim.id && p.type === expectedType) ??
          (expectedDescription
            ? pointsTransactions
                .filter(
                  (p) => p.childId === childId && p.type === expectedType && p.description === expectedDescription,
                )
                .sort((a, b) => b.createdAt - a.createdAt)[0]
            : undefined)
        const alreadyReversed =
          ptx &&
          pointsTransactions.some(
            (p) => p.relatedTo === ptx.id && (p.type === 'badge_reverted' || p.type === 'streak_reverted'),
          )
        if (ptx && !alreadyReversed) {
          const reversal: PointsTransaction = {
            id: uid(),
            type: streak ? 'streak_reverted' : 'badge_reverted',
            childId,
            amount: -ptx.amount,
            description: streak
              ? `Série retirée : ${expectedDescription} (correction)`
              : `Badge retiré : ${def?.emoji ?? '🏅'} ${def?.label ?? 'badge'} (correction)`,
            relatedTo: ptx.id,
            createdBy: actorId,
            createdAt: Date.now(),
          }
          newReversals.push(reversal)
          totalReversed += ptx.amount
        }
      }

      if (!removed) return false

      set((s) => ({
        rewardClaims: s.rewardClaims.filter((r) => !newClaims.some((c) => c.id === r.id)),
        pointsTransactions: [...newReversals, ...s.pointsTransactions],
      }))
      persist('rewardClaims')
      if (newReversals.length > 0) persist('pointsTransactions')

      pushLog(
        'badge_claim_revoked',
        actorId,
        `${def?.emoji ?? '🏅'} ${def?.label ?? 'badge'} retiré à ${child?.name ?? '?'}${
          totalReversed ? ` (-${totalReversed} pts)` : ''
        }`,
        childId,
        totalReversed ? -totalReversed : undefined,
        badgeDefId,
      )
      return true
    },

    proposeTaskSuggestion: (childId, input) => {
      const trimmed = input.title.trim()
      if (!trimmed || !Number.isFinite(input.suggestedPoints) || input.suggestedPoints <= 0) return
      const suggestion: TaskSuggestion = {
        id: uid(),
        childId,
        title: trimmed,
        description: input.description?.trim() || undefined,
        icon: input.icon,
        category: input.category,
        suggestedPoints: input.suggestedPoints,
        status: 'pending',
        createdAt: Date.now(),
      }
      set((s) => ({ taskSuggestions: [suggestion, ...s.taskSuggestions] }))
      pushLog('task_suggestion_submitted', childId, `« ${trimmed} » (${input.suggestedPoints} pts suggérés)`, childId)
      persist('taskSuggestions')
      const child = get().users.find((u) => u.id === childId)
      notifyParents(
        'task_suggestion_submitted',
        'Nouvelle proposition de tâche 💡',
        `${child?.name ?? 'Un enfant'} propose : ${trimmed}`,
        input.icon,
        '/parent/taches',
      )
    },

    approveTaskSuggestion: (suggestionId, patch, actorId) => {
      const suggestion = get().taskSuggestions.find((s) => s.id === suggestionId)
      if (!suggestion || suggestion.status !== 'pending') return
      const trimmedTitle = patch.title.trim()
      if (!trimmedTitle || patch.points <= 0 || patch.assignedTo.length === 0) return
      const task: Task = {
        id: uid(),
        title: trimmedTitle,
        description: patch.description?.trim() || undefined,
        points: patch.points,
        category: patch.category,
        icon: patch.icon,
        type: 'ponctuelle',
        assignedTo: patch.assignedTo,
        difficulty: 'medium',
        createdBy: actorId,
        createdAt: Date.now(),
        isActive: true,
      }
      set((s) => ({
        tasks: [task, ...s.tasks],
        taskSuggestions: s.taskSuggestions.map((sug) =>
          sug.id === suggestionId
            ? { ...sug, status: 'approved' as const, reviewedAt: Date.now(), reviewedBy: actorId, createdTaskId: task.id }
            : sug,
        ),
      }))
      persist('tasks')
      persist('taskSuggestions')
      pushLog(
        'task_suggestion_approved',
        actorId,
        `« ${trimmedTitle} » devient une tâche active (${task.points} pts)`,
        suggestion.childId,
        undefined,
        task.id,
      )
      notify(
        suggestion.childId,
        'task_suggestion_decided',
        'Ta proposition est acceptée ! 🎉',
        `« ${trimmedTitle} » est maintenant une vraie tâche (+${task.points} points).`,
        task.icon,
        '/enfant',
      )
    },

    rejectTaskSuggestion: (suggestionId, actorId, reason) => {
      const suggestion = get().taskSuggestions.find((s) => s.id === suggestionId)
      if (!suggestion || suggestion.status !== 'pending') return
      set((s) => ({
        taskSuggestions: s.taskSuggestions.map((sug) =>
          sug.id === suggestionId
            ? { ...sug, status: 'rejected' as const, reviewedAt: Date.now(), reviewedBy: actorId, rejectionReason: reason }
            : sug,
        ),
      }))
      persist('taskSuggestions')
      pushLog(
        'task_suggestion_rejected',
        actorId,
        `« ${suggestion.title} »${reason ? ` — ${reason}` : ''}`,
        suggestion.childId,
      )
      notify(
        suggestion.childId,
        'task_suggestion_decided',
        'Proposition non retenue',
        `« ${suggestion.title} »${reason ? ` — ${reason}` : ''}`,
        '😕',
        '/enfant',
      )
    },
  }
})

/**
 * Point d'entrée unique utilisé par toute l'app : bascule de façon transparente entre le store
 * réel (Supabase) et le store de démo (src/store/demoStore.ts, entièrement en mémoire) selon
 * qu'une session de démo est active. Les deux stores restent toujours appelés (jamais l'un
 * conditionnellement à l'autre) pour respecter les règles des hooks React.
 */
function useStoreImpl<T>(selector: (state: Store) => T): T {
  const demoActive = useDemoMode((s) => s.active)
  const real = useRealStore(selector)
  const demo = useDemoStore(selector)
  return demoActive ? demo : real
}

function getState(): Store {
  return useDemoMode.getState().active ? useDemoStore.getState() : useRealStore.getState()
}

export const useStore = Object.assign(useStoreImpl, { getState })

export function useCurrentUser(): User | null {
  const session = useStore((s) => s.session)
  const users = useStore((s) => s.users)
  return users.find((u) => u.id === session?.userId) ?? null
}

export async function clearAllData(): Promise<void> {
  await db.clear()
  window.location.reload()
}
