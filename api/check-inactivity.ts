// Fonction serverless Vercel (cron quotidien, voir vercel.json) : applique les pénalités
// d'inactivité et les règles de pénalité récurrentes, puis notifie (push) parents et enfant
// concerné. Auto-contenue (pas d'import depuis src/) — même logique que api/send-push.ts.
//
// Idempotence : une pénalité automatique n'est appliquée qu'une fois par jour et par
// enfant/règle, via la table sync_automation_log (clé unique 'inactivity:<childId>:<date>'
// ou 'penaltyRule:<ruleId>:<date>').
//
// Multi-familles (GODCLAUDE phase 1) : ce script utilise la clé service_role, qui
// contourne totalement la RLS scopée par famille (aucune session utilisateur, donc
// auth.uid() = NULL côté Postgres). Il doit donc lui-même itérer famille par famille et
// tamponner explicitement family_id sur chaque ligne insérée — sans ça, avec plusieurs
// familles, les réglages/utilisateurs/règles de familles différentes se retrouveraient
// mélangés dans une seule passe (mauvaise famille appliquée aux mauvais enfants).
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''
const CRON_SECRET = process.env.CRON_SECRET || ''

interface User {
  id: string
  role: 'parent' | 'child'
  name: string
  isActive: boolean
  createdAt: number
}

interface TaskSubmission {
  id: string
  childId: string
  status: 'pending' | 'approved' | 'rejected'
  submittedAt: number
  reviewedAt?: number
}

interface Recurrence {
  frequency: 'daily' | 'twice-weekly' | 'weekly' | 'monthly'
  dayOfWeek?: number
  dayOfMonth?: number
}

interface PenaltyRule {
  id: string
  childId: string
  title: string
  amount: number
  /** Absent = 'money' (règles créées avant l'ajout des pénalités en points). */
  currency?: 'points' | 'money'
  recurrence: Recurrence
  active: boolean
}

interface InactivityPenaltySettings {
  thresholdDays: number
  baseAmountCents: number
  baseAmountPoints: number
  applyMoney: boolean
  applyPoints: boolean
  severityMultiplier: number
}

interface Settings {
  features: { inactivityPenalties: boolean; recurringPenalties: boolean }
  inactivityPenalty: InactivityPenaltySettings
  /** Horodatage du dernier resetSeason — voir src/types.ts pour l'explication complète. Plancher
   *  pour lastActivity ci-dessous : sans lui, un reset (qui vide sync_submissions) fait retomber
   *  lastActivity sur child.createdAt, potentiellement très ancien, et déclenche une pénalité
   *  d'inactivité massive et absurde dès le lendemain d'une remise à zéro. */
  seasonResetAt?: number
}

const DAY_MS = 24 * 60 * 60 * 1000
const uid = () => crypto.randomUUID()
const todayKey = () => new Date().toISOString().slice(0, 10)

/** Index du jour avec 0 = lundi … 6 = dimanche (même convention que src/lib/recurrence.ts). */
function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7
}

export default async function handler(req: any, res: any) {
  if (CRON_SECRET) {
    const auth = req.headers?.authorization || req.headers?.Authorization
    if (auth !== `Bearer ${CRON_SECRET}`) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('check-inactivity: configuration Supabase manquante')
    res.status(500).json({ error: 'Configuration Supabase manquante côté serveur' })
    return
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const now = new Date()
  const today = todayKey()

  async function readTable<T>(table: string, familyId: string): Promise<T[]> {
    const { data, error } = await supabase.from(table).select('id, data').eq('family_id', familyId)
    if (error) {
      console.error(`check-inactivity: lecture ${table} échouée`, error.message)
      return []
    }
    return (data ?? []).map((row: any) => row.data as T)
  }

  async function alreadyRan(familyId: string, key: string): Promise<boolean> {
    const { data } = await supabase
      .from('sync_automation_log')
      .select('id')
      .eq('family_id', familyId)
      .eq('data->>key', key)
      .limit(1)
    return !!data && data.length > 0
  }

  async function markRan(familyId: string, key: string): Promise<void> {
    const id = uid()
    await supabase.from('sync_automation_log').insert({ id, family_id: familyId, data: { id, key, createdAt: Date.now() } })
  }

  async function pushLog(
    familyId: string,
    entry: {
      action: string
      actorId: string
      subjectId?: string
      relatedId?: string
      amount?: number
      details: string
    },
  ) {
    const row = { id: uid(), ...entry, timestamp: Date.now() }
    await supabase
      .from('sync_logs')
      .upsert({ id: row.id, family_id: familyId, data: row, updated_at: new Date().toISOString() })
  }

  async function insertTransaction(familyId: string, childId: string, amount: number, description: string) {
    const tx = {
      id: uid(),
      type: 'penalty',
      childId,
      amount: -Math.abs(amount),
      description,
      createdBy: 'system',
      createdAt: Date.now(),
    }
    await supabase
      .from('sync_transactions')
      .upsert({ id: tx.id, family_id: familyId, data: tx, updated_at: new Date().toISOString() })
    return tx
  }

  async function insertPointsTransaction(familyId: string, childId: string, amount: number, description: string) {
    const ptx = {
      id: uid(),
      childId,
      type: 'penalty',
      amount: -Math.abs(amount),
      description,
      createdBy: 'system',
      createdAt: Date.now(),
    }
    await supabase
      .from('sync_points_transactions')
      .upsert({ id: ptx.id, family_id: familyId, data: ptx, updated_at: new Date().toISOString() })
    return ptx
  }

  async function sendPush(userId: string, title: string, body: string, icon: string, link: string) {
    try {
      const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : ''
      if (!base) return
      await fetch(`${base}/api/send-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, title, body, icon, link }),
      })
    } catch (err) {
      console.error('check-inactivity: push échoué', err)
    }
  }

  const { data: families, error: familiesError } = await supabase.from('families').select('id')
  if (familiesError) {
    console.error('check-inactivity: lecture families échouée', familiesError.message)
    res.status(500).json({ error: familiesError.message })
    return
  }

  const results = { inactivityApplied: 0, ruleApplied: 0 }

  for (const family of families ?? []) {
    const familyId = family.id as string
    const settingsRows = await readTable<Settings>('sync_settings', familyId)
    const settings = settingsRows[0]
    if (!settings) continue

    if (!settings.features.inactivityPenalties && !settings.features.recurringPenalties) continue

    // GODCLAUDE phase 3 : les pénalités automatiques sont une fonctionnalité premium — même
    // si un réglage local est resté à `true` (donnée pré-existante, changement de plan, bug
    // frontend...), le cron ne doit jamais les appliquer pour une famille qui n'y a pas
    // droit. Défense en profondeur : le frontend bloque déjà l'activation du réglage (voir
    // SettingsPage.tsx), ceci est la vraie garantie côté serveur.
    const { data: automaticPenaltiesAllowed } = await supabase.rpc('has_family_access', {
      p_family_id: familyId,
      p_feature: 'automatic_penalties',
    })
    if (!automaticPenaltiesAllowed) continue

    const users = await readTable<User>('sync_users', familyId)
    const parents = users.filter((u) => u.role === 'parent' && u.isActive)
    const children = users.filter((u) => u.role === 'child' && u.isActive)

    // --- Pénalités d'inactivité ---
    if (settings.features.inactivityPenalties) {
      const submissions = await readTable<TaskSubmission>('sync_submissions', familyId)
      const cfg = settings.inactivityPenalty

      for (const child of children) {
        const approvedDates = submissions
          .filter((s) => s.childId === child.id && s.status === 'approved' && s.reviewedAt)
          .map((s) => s.reviewedAt!)
        const lastActivity = Math.max(child.createdAt, settings.seasonResetAt ?? 0, ...approvedDates)
        const daysSince = Math.floor((now.getTime() - lastActivity) / DAY_MS)

        if (daysSince >= cfg.thresholdDays) {
          const extraDays = daysSince - cfg.thresholdDays + 1
          const key = `inactivity:${child.id}:${today}`
          if (await alreadyRan(familyId, key)) continue

          const amountMoney = cfg.applyMoney ? Math.round(cfg.baseAmountCents * extraDays * cfg.severityMultiplier) : 0
          const amountPoints = cfg.applyPoints
            ? Math.round(cfg.baseAmountPoints * extraDays * cfg.severityMultiplier)
            : 0
          if (amountMoney <= 0 && amountPoints <= 0) continue

          const description = `⚠️ ${extraDays} jour${extraDays > 1 ? 's' : ''} d'inactivité — pénalité automatique`
          let tx: { id: string; amount: number } | null = null
          if (amountMoney > 0) tx = await insertTransaction(familyId, child.id, amountMoney, description)
          if (amountPoints > 0) await insertPointsTransaction(familyId, child.id, amountPoints, description)

          await pushLog(familyId, {
            action: 'inactivity_penalty_applied',
            actorId: 'system',
            subjectId: child.id,
            relatedId: tx?.id,
            amount: tx ? tx.amount : undefined,
            details: description,
          })
          await markRan(familyId, key)
          results.inactivityApplied++

          const body = `${child.name} : ${description}${amountMoney > 0 ? ` (${(amountMoney / 100).toFixed(2)} €)` : ''}`
          await sendPush(child.id, 'Pénalité d’inactivité', description, '⚠️', '/enfant/historique')
          for (const parent of parents) {
            await sendPush(parent.id, 'Pénalité d’inactivité appliquée', body, '⚠️', '/parent/penalites')
          }
        }
      }
    }

    // --- Règles de pénalité récurrentes ---
    if (settings.features.recurringPenalties) {
      const rules = (await readTable<PenaltyRule>('sync_penalty_rules', familyId)).filter((r) => r.active)

      for (const rule of rules) {
        const due =
          rule.recurrence.frequency === 'daily' ||
          (rule.recurrence.frequency === 'weekly' && mondayIndex(now) === (rule.recurrence.dayOfWeek ?? 0)) ||
          (rule.recurrence.frequency === 'monthly' && now.getDate() === (rule.recurrence.dayOfMonth ?? 1))
        if (!due) continue

        const key = `penaltyRule:${rule.id}:${today}`
        if (await alreadyRan(familyId, key)) continue

        const description = `⚠️ ${rule.title} (règle automatique)`
        // GODCLAUDE fix cohérence : une règle peut désormais retirer des € ou des points (voir
        // PenaltyRule.currency côté src/types.ts) — même logique que la pénalité manuelle
        // (applyPenalty) et que les pénalités d'inactivité juste au-dessus.
        const applied =
          rule.currency === 'points'
            ? await insertPointsTransaction(familyId, rule.childId, rule.amount, description)
            : await insertTransaction(familyId, rule.childId, rule.amount, description)
        await pushLog(familyId, {
          action: 'penalty_rule_auto_applied',
          actorId: 'system',
          subjectId: rule.childId,
          relatedId: applied.id,
          amount: applied.amount,
          details: description,
        })
        await markRan(familyId, key)
        results.ruleApplied++

        const child = children.find((c) => c.id === rule.childId)
        await sendPush(rule.childId, 'Pénalité appliquée', description, '⚠️', '/enfant/historique')
        for (const parent of parents) {
          await sendPush(
            parent.id,
            'Règle de pénalité appliquée',
            `${child?.name ?? 'Un enfant'} : ${rule.title}`,
            '⚠️',
            '/parent/penalites',
          )
        }
      }
    }
  }

  res.status(200).json({ ok: true, ...results })
}
