import { ChevronRight, Medal, Sparkles, Trophy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { OnboardingTour } from '../../components/OnboardingTour'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Field, inputCls } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { PushNotificationsCard } from '../../components/ui/PushNotificationsCard'
import { Switch } from '../../components/ui/Switch'
import { cn } from '../../lib/cn'
import { centsToEuroInput, euroToCents } from '../../lib/format'
import { computeAccess } from '../../lib/access'
import { openBillingPortal, startPackCheckout } from '../../lib/billing'
import { signOutFamily } from '../../lib/familyAuth'
import { isPackUnlocked, setActiveThemePack } from '../../lib/themePacks'
import { useDemoMode } from '../../store/demoStore'
import { refreshFamilyMembership, useFamilyAuthStore } from '../../store/familyAuthStore'
import { usePremiumUpsellStore } from '../../store/premiumUpsellStore'
import { refreshThemePacks, useThemePacksStore } from '../../store/themePacksStore'
import { useCurrentUser, useStore } from '../../store/useStore'
import type { FeatureFlags, Theme } from '../../types'

const SEASON_RESET_WORD = 'RÉINITIALISER'

/** Double confirmation renforcée : taper un mot plutôt qu'un simple Oui/Non, vu l'ampleur et l'irréversibilité. */
function SeasonResetModal({ onClose }: { onClose: () => void }) {
  const user = useCurrentUser()
  const resetSeason = useStore((s) => s.resetSeason)
  const toast = useStore((s) => s.toast)
  const [confirmText, setConfirmText] = useState('')

  if (!user) return null
  const valid = confirmText.trim().toUpperCase() === SEASON_RESET_WORD

  return (
    <Modal open onClose={onClose} title="Réinitialiser la saison">
      <div className="space-y-4">
        <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">
          Action irréversible, pour tous les enfants : solde argent, points (dépensables et à vie —
          les rangs retombent à Débutant), badges (tous reverrouillés), séries (remises à 0 jour),
          objectifs d'épargne, historique des tâches/transactions/pénalités et stock de la boutique
          seront remis à zéro.
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Les comptes, les tâches, les catalogues (badges, séries, rangs, boutique) et les réglages
          restent inchangés.
        </p>
        <Field label={`Tape ${SEASON_RESET_WORD} pour confirmer`}>
          <input
            className={inputCls}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={SEASON_RESET_WORD}
            autoFocus
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="soft" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="danger"
            disabled={!valid}
            onClick={() => {
              resetSeason(user!.id)
              toast('Saison réinitialisée.')
              onClose()
            }}
          >
            Oui, tout réinitialiser
          </Button>
        </div>
      </div>
    </Modal>
  )
}

const GAMIFICATION_LINKS = [
  { to: '/parent/reglages/badges', icon: Medal, label: 'Badges', description: 'Catalogue, seuils et points de chaque badge.' },
  { to: '/parent/reglages/series', icon: Sparkles, label: 'Séries', description: 'Séries globale, sans pénalité, ou liées à une tâche.' },
  { to: '/parent/reglages/rangs', icon: Trophy, label: 'Rangs', description: 'Échelle de progression à vie et ses seuils.' },
]

const QUICK_TEMPLATES = [
  'Nouvelle tâche ajoutée !',
  "Mise à jour de l'app disponible, réinstalle si besoin.",
  "Attention, une pénalité arrive si rien n'est fait aujourd'hui.",
]

/** Envoi immédiat d'une vraie notification push à un ou plusieurs enfants, avec quelques modèles rapides. */
function SendNotificationCard() {
  const user = useCurrentUser()
  const children = useStore((s) => s.users).filter((u) => u.role === 'child' && u.isActive)
  const sendCustomNotification = useStore((s) => s.sendCustomNotification)
  const toast = useStore((s) => s.toast)
  const [selected, setSelected] = useState<string[]>([])
  const [text, setText] = useState('')

  if (!user) return null

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function send() {
    if (!text.trim() || selected.length === 0) return
    sendCustomNotification(selected, text, user!.id)
    toast(`Notification envoyée à ${selected.length} enfant${selected.length > 1 ? 's' : ''}.`)
    setText('')
    setSelected([])
  }

  const allSelected = children.length > 0 && selected.length === children.length

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="font-bold">Envoyer une notification</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Notification push immédiate à un ou plusieurs enfants, même si l'app est fermée sur leur téléphone.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSelected(allSelected ? [] : children.map((c) => c.id))}
          className={cn(
            'rounded-full border px-3 py-1.5 text-sm font-semibold cursor-pointer',
            allSelected
              ? 'border-amber-500 bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300'
              : 'border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800',
          )}
        >
          Tous les enfants
        </button>
        {children.map((child) => (
          <button
            key={child.id}
            type="button"
            onClick={() => toggle(child.id)}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold cursor-pointer',
              selected.includes(child.id)
                ? 'border-amber-500 bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300'
                : 'border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800',
            )}
          >
            {child.avatar} {child.name}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {QUICK_TEMPLATES.map((tpl) => (
          <button
            key={tpl}
            type="button"
            onClick={() => setText(tpl)}
            className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 cursor-pointer"
          >
            {tpl}
          </button>
        ))}
      </div>
      <textarea
        className={inputCls}
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ton message…"
      />
      <div className="flex justify-end">
        <Button disabled={!text.trim() || selected.length === 0} onClick={send}>
          Envoyer
        </Button>
      </div>
    </Card>
  )
}

const FEATURE_LABELS: { key: keyof FeatureFlags; emoji: string; label: string; description: string }[] = [
  {
    key: 'savingsGoals',
    emoji: '🎯',
    label: "Objectifs d'épargne",
    description: 'Chaque enfant peut se fixer un objectif (ex: un jeu) avec une barre de progression.',
  },
  {
    key: 'streaks',
    emoji: '🔥',
    label: 'Séries (streaks)',
    description: 'Suivi des jours consécutifs avec au moins une tâche faite, affiché sur leur accueil.',
  },
  {
    key: 'leaderboard',
    emoji: '🏆',
    label: 'Classement',
    description: "Classement des enfants par gains du mois, visible sur ta vue d'ensemble.",
  },
  {
    key: 'shop',
    emoji: '🎁',
    label: 'Boutique à points',
    description:
      'Les enfants gagnent des points (badges, séries) et les échangent contre des lots que tu définis, ou les convertissent en argent.',
  },
  {
    key: 'taskSuggestions',
    emoji: '💡',
    label: 'Propositions de tâches',
    description: "Les enfants peuvent proposer de nouvelles tâches, à valider (et ajuster) avant qu'elles deviennent actives.",
  },
]

export function SettingsPage() {
  const user = useCurrentUser()
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const changeSecret = useStore((s) => s.changeSecret)
  const toast = useStore((s) => s.toast)
  const demoActive = useDemoMode((s) => s.active)
  const isFounder = useFamilyAuthStore((s) => s.isFounder)
  const plan = useFamilyAuthStore((s) => s.plan)
  const showUpsell = usePremiumUpsellStore((s) => s.show)
  const familyId = useFamilyAuthStore((s) => s.familyId)
  const themePacks = useThemePacksStore((s) => s.packs)
  const ownedPackIds = useThemePacksStore((s) => s.ownedPackIds)
  const activePackId = useThemePacksStore((s) => s.activePackId)
  // Mode démo : jamais limité (voir components/ui/PremiumGate.tsx).
  const canUseAutomaticPenalties = demoActive || computeAccess(isFounder, plan, 'automatic_penalties')
  const [packBusy, setPackBusy] = useState<string | null>(null)

  const [familyName, setFamilyName] = useState(settings.familyName)
  const [bonusPercent, setBonusPercent] = useState(String(settings.initiativeBonusPercent))
  const [minBalance, setMinBalance] = useState(centsToEuroInput(settings.minBalance))
  const [ageThreshold, setAgeThreshold] = useState(
    settings.ageGroupThresholdYears === undefined ? '' : String(settings.ageGroupThresholdYears),
  )
  const [multiplierPetit, setMultiplierPetit] = useState(String(settings.pointsMultiplierPetit))
  const [multiplierGrand, setMultiplierGrand] = useState(String(settings.pointsMultiplierGrand))
  const [password, setPassword] = useState('')
  const [resettingSeason, setResettingSeason] = useState(false)
  const [pointsPerEuro, setPointsPerEuro] = useState(String(settings.pointsPerEuro))
  const [thresholdDays, setThresholdDays] = useState(String(settings.inactivityPenalty.thresholdDays))
  const [baseAmount, setBaseAmount] = useState(centsToEuroInput(settings.inactivityPenalty.baseAmountCents))
  const [baseAmountPoints, setBaseAmountPoints] = useState(String(settings.inactivityPenalty.baseAmountPoints))
  const [severityMultiplier, setSeverityMultiplier] = useState(String(settings.inactivityPenalty.severityMultiplier))
  const [weeklyCapAmount, setWeeklyCapAmount] = useState(String(settings.weeklyPointsCap.amount))
  const [reminderHour, setReminderHour] = useState(String(settings.dailyReminder.hour))
  const [showTutorial, setShowTutorial] = useState(false)
  const [, setSearchParams] = useSearchParams()
  // Capturé UNE FOIS (lazy initializer) plutôt que relu à chaque effet : appeler
  // setSearchParams() plus bas modifie window.location, donc relire window.location.search
  // directement dans l'effet donnerait un résultat différent selon qu'on est à la 1ʳᵉ ou à
  // une éventuelle réinvocation (StrictMode, dev uniquement, double-invoque les effects) —
  // la 2ᵉ invocation verrait alors l'URL déjà nettoyée par la 1ʳᵉ et n'annulerait à tort
  // aucun intervalle. Un booléen stable capturé une fois n'a pas ce problème (bug réel
  // observé en testant le retour de paiement en conditions réelles, voir session).
  const [premiumJustPaid] = useState(() => new URLSearchParams(window.location.search).get('premium') === 'success')
  const [packJustPaid] = useState(() => new URLSearchParams(window.location.search).get('pack') === 'success')

  // Retour de Stripe Checkout (voir api/create-checkout-session.ts success_url) : le webhook
  // Stripe (api/stripe-webhook.ts) est ce qui fait réellement foi pour passer plan à
  // 'premium', pas ce redirect — mais il peut ne pas encore avoir traité l'événement au
  // moment où l'utilisateur revient ici. On relit quelques fois avec un court délai plutôt
  // qu'une seule fois immédiatement.
  useEffect(() => {
    if (!premiumJustPaid) return
    setSearchParams({}, { replace: true })
    let attempts = 0
    const interval = setInterval(async () => {
      attempts += 1
      await refreshFamilyMembership()
      if (useFamilyAuthStore.getState().plan === 'premium' || attempts >= 5) clearInterval(interval)
    }, 1500)
    return () => clearInterval(interval)
  }, [premiumJustPaid, setSearchParams])

  // Retour de Stripe Checkout après achat d'un pack cosmétique (voir
  // api/create-pack-checkout-session.ts success_url) — même raisonnement que ci-dessus.
  useEffect(() => {
    if (!packJustPaid || !familyId) return
    setSearchParams({}, { replace: true })
    let attempts = 0
    const before = useThemePacksStore.getState().ownedPackIds.size
    const interval = setInterval(async () => {
      attempts += 1
      await refreshThemePacks(familyId)
      if (useThemePacksStore.getState().ownedPackIds.size > before || attempts >= 5) clearInterval(interval)
    }, 1500)
    return () => clearInterval(interval)
  }, [packJustPaid, familyId, setSearchParams])

  if (!user) return null

  async function choosePack(packId: string) {
    setPackBusy(packId)
    const err = await setActiveThemePack(packId)
    if (err) toast(err, 'error')
    else if (familyId) await refreshThemePacks(familyId)
    setPackBusy(null)
  }

  async function buyPack(packId: string) {
    setPackBusy(packId)
    const err = await startPackCheckout(packId)
    if (err) {
      toast(err, 'error')
      setPackBusy(null)
    }
  }

  function saveRules() {
    updateSettings(
      {
        familyName: familyName.trim() || 'KidsUp',
        initiativeBonusPercent: Math.max(0, parseInt(bonusPercent, 10) || 0),
        minBalance: Math.min(0, euroToCents(minBalance)),
      },
      user!.id,
    )
    toast('Réglages enregistrés.')
  }

  function saveAgeGroupSettings() {
    const threshold = ageThreshold.trim() === '' ? undefined : Math.max(0, parseInt(ageThreshold, 10) || 0)
    updateSettings(
      {
        ageGroupThresholdYears: threshold,
        pointsMultiplierPetit: Math.max(0, parseFloat(multiplierPetit.replace(',', '.')) || 1),
        pointsMultiplierGrand: Math.max(0, parseFloat(multiplierGrand.replace(',', '.')) || 1),
      },
      user!.id,
    )
    toast('Groupes d\'âge enregistrés.')
  }

  function savePointsSettings() {
    updateSettings({ pointsPerEuro: Math.max(1, parseInt(pointsPerEuro, 10) || settings.pointsPerEuro) }, user!.id)
    toast('Taux de conversion enregistré.')
  }

  function saveInactivitySettings() {
    updateSettings(
      {
        inactivityPenalty: {
          ...settings.inactivityPenalty,
          thresholdDays: Math.max(1, parseInt(thresholdDays, 10) || 1),
          baseAmountCents: Math.max(0, euroToCents(baseAmount)),
          baseAmountPoints: Math.max(0, parseInt(baseAmountPoints, 10) || 0),
          severityMultiplier: Math.max(0.1, parseFloat(severityMultiplier.replace(',', '.')) || 1),
        },
      },
      user!.id,
    )
    toast('Réglages des pénalités automatiques enregistrés.')
  }

  function saveWeeklyCapSettings() {
    updateSettings(
      { weeklyPointsCap: { ...settings.weeklyPointsCap, amount: Math.max(1, parseInt(weeklyCapAmount, 10) || 1) } },
      user!.id,
    )
    toast('Plafond hebdomadaire enregistré.')
  }

  function saveDailyReminderSettings() {
    updateSettings(
      { dailyReminder: { ...settings.dailyReminder, hour: Math.min(23, Math.max(0, parseInt(reminderHour, 10) || 0)) } },
      user!.id,
    )
    toast('Heure du rappel enregistrée.')
  }

  async function savePassword() {
    if (password.length < 4) {
      toast('Le mot de passe doit faire au moins 4 caractères.', 'error')
      return
    }
    await changeSecret(user!.id, password, user!.id)
    setPassword('')
    toast('Mot de passe modifié.')
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-black">Réglages</h1>

      <Card className="space-y-4 p-5">
        <h2 className="font-bold">Famille & règles de la maison</h2>
        <Field label="Nom de la famille">
          <input className={inputCls} value={familyName} onChange={(e) => setFamilyName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Bonus initiative (% du barème de la tâche)">
            <input
              className={inputCls}
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={bonusPercent}
              onChange={(e) => setBonusPercent(e.target.value)}
            />
          </Field>
          <Field label="Solde minimum toléré (€, négatif)">
            <input
              className={inputCls}
              type="number"
              max="0"
              step="0.01"
              inputMode="decimal"
              value={minBalance}
              onChange={(e) => setMinBalance(e.target.value)}
            />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button onClick={saveRules}>Enregistrer</Button>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="font-bold">Groupes d'âge (Petit / Grand)</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Sépare les points gagnés et le catalogue de la boutique entre petits et grands.
          Renseigne aussi la date de naissance de chaque enfant (page Enfants). Tant que le
          seuil ci-dessous est vide, rien ne change pour personne.
        </p>
        <Field label="Seuil « grand » à partir de (années, vide = désactivé)">
          <input
            className={inputCls}
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            placeholder="ex : 8"
            value={ageThreshold}
            onChange={(e) => setAgeThreshold(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Multiplicateur de points — Petits">
            <input
              className={inputCls}
              type="number"
              min="0"
              step="0.1"
              inputMode="decimal"
              value={multiplierPetit}
              onChange={(e) => setMultiplierPetit(e.target.value)}
            />
          </Field>
          <Field label="Multiplicateur de points — Grands">
            <input
              className={inputCls}
              type="number"
              min="0"
              step="0.1"
              inputMode="decimal"
              value={multiplierGrand}
              onChange={(e) => setMultiplierGrand(e.target.value)}
            />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button onClick={saveAgeGroupSettings}>Enregistrer</Button>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="font-bold">Apparence</h2>
        <Field label="Thème">
          <select
            className={inputCls}
            value={settings.theme}
            onChange={(e) => updateSettings({ theme: e.target.value as Theme }, user.id)}
          >
            <option value="auto">Automatique (système)</option>
            <option value="light">Clair</option>
            <option value="dark">Sombre</option>
          </select>
        </Field>
      </Card>

      <Card className="flex items-center justify-between gap-3 p-5">
        <div>
          <h2 className="font-bold">Aide</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Le tour de présentation des points, tâches, badges et de la boutique.
          </p>
        </div>
        <Button variant="soft" size="sm" onClick={() => setShowTutorial(true)}>
          Revoir le tutoriel
        </Button>
      </Card>

      <Card className="space-y-4 p-5">
        <div>
          <h2 className="font-bold">Fonctionnalités</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Active ou désactive des fonctionnalités pour toute la famille.
          </p>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {FEATURE_LABELS.map(({ key, emoji, label, description }) => (
            <div key={key} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <span className="text-xl" aria-hidden>
                {emoji}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{label}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
              </div>
              <Switch
                checked={settings.features[key]}
                onChange={(checked) =>
                  updateSettings({ features: { ...settings.features, [key]: checked } }, user.id)
                }
                label={label}
              />
            </div>
          ))}
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <div>
          <h2 className="font-bold">Points & pénalités automatiques</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Taux de conversion de la boutique, et pénalités appliquées automatiquement.
          </p>
        </div>

        <Field label="Taux de conversion (points pour 1 €)">
          <input
            className={inputCls}
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={pointsPerEuro}
            onChange={(e) => setPointsPerEuro(e.target.value)}
          />
        </Field>
        <div className="flex justify-end">
          <Button variant="soft" onClick={savePointsSettings}>
            Enregistrer le taux
          </Button>
        </div>

        <div className="flex items-center gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
          <span className="text-xl" aria-hidden>
            🔁
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Pénalités récurrentes</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Autorise la création de règles de pénalité automatiques (page Pénalités), ex : chambre pas
              rangée le dimanche soir.
              {!canUseAutomaticPenalties && ' Fonctionnalité Premium.'}
            </p>
          </div>
          <Switch
            checked={settings.features.recurringPenalties}
            onChange={(checked) =>
              !checked || canUseAutomaticPenalties
                ? updateSettings({ features: { ...settings.features, recurringPenalties: checked } }, user.id)
                : showUpsell()
            }
            label="Pénalités récurrentes"
          />
        </div>

        <div className="flex items-center gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
          <span className="text-xl" aria-hidden>
            🛡️
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Plafond hebdomadaire de points</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Filet de sécurité optionnel : au-delà de ce total de points gagnés dans la semaine, un
              enfant n'en gagne plus jusqu'à la semaine suivante (badges et séries compris).
            </p>
          </div>
          <Switch
            checked={settings.weeklyPointsCap.enabled}
            onChange={(checked) =>
              updateSettings({ weeklyPointsCap: { ...settings.weeklyPointsCap, enabled: checked } }, user.id)
            }
            label="Plafond hebdomadaire"
          />
        </div>

        {settings.weeklyPointsCap.enabled && (
          <div className="space-y-4 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50">
            <Field label="Plafond (points par semaine et par enfant)">
              <input
                className={inputCls}
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={weeklyCapAmount}
                onChange={(e) => setWeeklyCapAmount(e.target.value)}
              />
            </Field>
            <div className="flex justify-end">
              <Button variant="soft" onClick={saveWeeklyCapSettings}>
                Enregistrer
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
          <span className="text-xl" aria-hidden>
            😴
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Pénalités d'inactivité</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pénalité automatique (une fois par jour, via une tâche planifiée) si un enfant n'a validé
              aucune tâche depuis trop longtemps. S'aggrave avec le temps.
              {!canUseAutomaticPenalties && ' Fonctionnalité Premium.'}
            </p>
          </div>
          <Switch
            checked={settings.features.inactivityPenalties}
            onChange={(checked) =>
              !checked || canUseAutomaticPenalties
                ? updateSettings({ features: { ...settings.features, inactivityPenalties: checked } }, user.id)
                : showUpsell()
            }
            label="Pénalités d'inactivité"
          />
        </div>

        {settings.features.inactivityPenalties && (
          <div className="space-y-4 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50">
            <Field label="Déclencher après (jours sans tâche validée)">
              <input
                className={inputCls}
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={thresholdDays}
                onChange={(e) => setThresholdDays(e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Montant de base (€)">
                <input
                  className={inputCls}
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={baseAmount}
                  onChange={(e) => setBaseAmount(e.target.value)}
                />
              </Field>
              <Field label="Montant de base (points)">
                <input
                  className={inputCls}
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={baseAmountPoints}
                  onChange={(e) => setBaseAmountPoints(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Multiplicateur d'aggravation (jour 1 = base × mult, jour 2 = 2 × base × mult…)">
              <input
                className={inputCls}
                type="number"
                min="0.1"
                step="0.1"
                inputMode="decimal"
                value={severityMultiplier}
                onChange={(e) => setSeverityMultiplier(e.target.value)}
              />
            </Field>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.inactivityPenalty.applyMoney}
                  onChange={(e) =>
                    updateSettings(
                      { inactivityPenalty: { ...settings.inactivityPenalty, applyMoney: e.target.checked } },
                      user.id,
                    )
                  }
                  className="h-4 w-4 accent-amber-500"
                />
                En argent
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.inactivityPenalty.applyPoints}
                  onChange={(e) =>
                    updateSettings(
                      { inactivityPenalty: { ...settings.inactivityPenalty, applyPoints: e.target.checked } },
                      user.id,
                    )
                  }
                  className="h-4 w-4 accent-amber-500"
                />
                En points
              </label>
            </div>
            <div className="flex justify-end">
              <Button variant="soft" onClick={saveInactivitySettings}>
                Enregistrer
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="space-y-2 p-5">
        <div>
          <h2 className="font-bold">Gamification</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Catalogue de badges, séries et rangs — tout est modifiable ici, sans redéploiement.
          </p>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {GAMIFICATION_LINKS.map(({ to, icon: Icon, label, description }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 hover:opacity-80"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">
                <Icon size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{label}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
              </div>
              <ChevronRight size={16} className="shrink-0 text-slate-400" />
            </Link>
          ))}
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <div className="flex items-center gap-3">
          <span className="text-xl" aria-hidden>
            ⏰
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold">Rappel quotidien</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Notifie automatiquement chaque enfant qui n'a encore rien signalé de la journée.
            </p>
          </div>
          <Switch
            checked={settings.dailyReminder.enabled}
            onChange={(checked) =>
              updateSettings({ dailyReminder: { ...settings.dailyReminder, enabled: checked } }, user.id)
            }
            label="Rappel quotidien"
          />
        </div>
        {settings.dailyReminder.enabled && (
          <div className="space-y-3 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50">
            <Field label="Heure du rappel">
              <input
                className={inputCls}
                type="number"
                min="0"
                max="23"
                step="1"
                inputMode="numeric"
                value={reminderHour}
                onChange={(e) => setReminderHour(e.target.value)}
              />
            </Field>
            <p className="text-xs text-slate-400">
              Sur l'offre gratuite de l'hébergeur, la vérification n'a lieu qu'une fois par jour, vers
              18h-19h (heure de Paris) : une heure réglée avant ce moment se déclenche le jour même : une
              heure réglée plus tard peut ne partir que le lendemain.
            </p>
            <div className="flex justify-end">
              <Button variant="soft" onClick={saveDailyReminderSettings}>
                Enregistrer
              </Button>
            </div>
          </div>
        )}
      </Card>

      <SendNotificationCard />

      <PushNotificationsCard userId={user.id} />

      <Card className="space-y-4 p-5">
        <h2 className="font-bold">Sécurité</h2>
        <Field label={`Nouveau mot de passe pour ${user.name}`}>
          <input
            className={inputCls}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Au moins 4 caractères"
          />
        </Field>
        <div className="flex justify-end">
          <Button variant="soft" onClick={() => void savePassword()} disabled={!password}>
            Changer le mot de passe
          </Button>
        </div>
        <p className="text-xs text-slate-400">
          Les PIN des enfants se changent depuis la page Enfants.
        </p>
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="font-bold">Premium</h2>
        {isFounder ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Famille fondatrice : accès complet et gratuit à vie, aucun abonnement nécessaire.
          </p>
        ) : plan === 'premium' ? (
          <>
            <p className="text-sm text-slate-600 dark:text-slate-300">Abonnement Premium actif.</p>
            <div className="flex justify-end">
              <Button
                variant="soft"
                onClick={async () => {
                  const err = await openBillingPortal()
                  if (err) toast(err, 'error')
                }}
              >
                Gérer mon abonnement
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Formule gratuite. Passez à Premium pour débloquer les enfants illimités, les photos de
              profil, les statistiques, le calendrier, et plus.
            </p>
            <div className="flex justify-end">
              <Button onClick={showUpsell}>Découvrir Premium</Button>
            </div>
          </>
        )}
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="font-bold">Apparence</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Choisit les emojis et couleurs proposés pour les avatars des profils de la famille.
          {!isFounder && plan !== 'premium' && ' Premium débloque tous les packs.'}
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {themePacks.map((pack) => {
            const unlocked = demoActive || isPackUnlocked(pack, isFounder, plan, ownedPackIds)
            const active = pack.id === activePackId
            const busy = packBusy === pack.id
            return (
              <div
                key={pack.id}
                className={cn(
                  'flex items-center gap-3 rounded-xl border p-3',
                  active ? 'border-brand-from' : 'border-slate-200 dark:border-slate-700',
                )}
              >
                <span className="text-2xl" aria-hidden>
                  {pack.emojis.slice(0, 3).join(' ')}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{pack.name}</p>
                  <div className="mt-1 flex gap-1">
                    {pack.palette.slice(0, 5).map((c) => (
                      <span key={c} className="h-3 w-3 rounded-full" style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </div>
                {active ? (
                  <Badge>Actif</Badge>
                ) : unlocked ? (
                  <Button size="sm" variant="soft" disabled={busy} onClick={() => void choosePack(pack.id)}>
                    Choisir
                  </Button>
                ) : pack.purchasable ? (
                  <Button size="sm" disabled={busy} onClick={() => void buyPack(pack.id)}>
                    Acheter
                  </Button>
                ) : (
                  <span className="text-xs text-slate-400">Bientôt</span>
                )}
              </div>
            )
          })}
        </div>
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="font-bold">Compte</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Déconnecte complètement cet appareil (tous les profils, y compris les enfants) —
          différent du bouton « Déconnexion » du menu, qui ne fait que revenir au choix de profil
          sans quitter la famille sur cet appareil.
        </p>
        <div className="flex justify-end">
          <Button variant="soft" onClick={() => void signOutFamily()}>
            Se déconnecter de cet appareil
          </Button>
        </div>
      </Card>

      <Card className="space-y-3 border-rose-200 p-5 dark:border-rose-900">
        <h2 className="font-bold text-rose-600 dark:text-rose-400">Zone sensible</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Réinitialiser la saison remet à zéro, pour tous les enfants : solde argent, points
          (dépensables et à vie), badges, séries, objectifs d'épargne, historique des
          tâches/transactions/pénalités, et le stock de la boutique. Les comptes, les tâches et les
          catalogues ne sont pas touchés. Une trace minimale reste dans le journal.
        </p>
        <div className="flex justify-end">
          <Button variant="danger" onClick={() => setResettingSeason(true)}>
            Réinitialiser la saison
          </Button>
        </div>
      </Card>

      {resettingSeason && <SeasonResetModal onClose={() => setResettingSeason(false)} />}

      {showTutorial && (
        <OnboardingTour
          storageKey={`kidsup:onboarding:${user.id}`}
          autoShow={false}
          forceOpen
          onDismiss={() => setShowTutorial(false)}
        />
      )}
    </div>
  )
}
