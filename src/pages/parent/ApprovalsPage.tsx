import { AnimatePresence } from 'framer-motion'
import { Check, Trash2, Undo2, X } from 'lucide-react'
import { useState } from 'react'
import { PhotoLightbox } from '../../components/photos/PhotoLightbox'
import { PhotoThumb } from '../../components/photos/PhotoThumb'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ChildAvatar } from '../../components/ui/ChildAvatar'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { EmptyState } from '../../components/ui/EmptyState'
import { inputCls } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { PointsAmount } from '../../components/ui/PointsAmount'
import { Tabs } from '../../components/ui/Tabs'
import { celebrate } from '../../lib/confetti'
import { computeAgeGroup, pointsMultiplierFor } from '../../lib/ageGroup'
import { gradientEnd } from '../../lib/colors'
import { formatRelative } from '../../lib/format'
import { computeInitiativeBonus } from '../../lib/points'
import { useCurrentUser, useStore } from '../../store/useStore'
import type { SubmissionStatus, TaskSubmission, User } from '../../types'

const QUICK_MESSAGES = ['👏 Bien joué !', '⭐ Parfait !', '😍 Superbe initiative !', '🚀 Continue comme ça !']

function MessageModal({ child, onClose }: { child: User; onClose: () => void }) {
  const user = useCurrentUser()
  const sendMessage = useStore((s) => s.sendMessage)
  const toast = useStore((s) => s.toast)
  const [text, setText] = useState('')

  if (!user) return null

  function send(message: string) {
    sendMessage(child.id, message, user!.id)
    toast(`Message envoyé à ${child.name} 💌`)
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={`Un petit mot pour ${child.name} ?`}>
      <div className="mb-4 flex flex-wrap gap-2">
        {QUICK_MESSAGES.map((msg) => (
          <button
            key={msg}
            onClick={() => send(msg)}
            className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 cursor-pointer"
          >
            {msg}
          </button>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (text.trim()) send(text)
        }}
      >
        <input
          className={inputCls}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ou un message personnalisé…"
          aria-label="Message personnalisé"
        />
        <Button type="submit" disabled={!text.trim()}>
          Envoyer
        </Button>
      </form>
      <div className="mt-4 flex justify-end">
        <Button variant="ghost" onClick={onClose}>
          Passer
        </Button>
      </div>
    </Modal>
  )
}

export function ApprovalsPage() {
  const user = useCurrentUser()
  const submissions = useStore((s) => s.submissions)
  const tasks = useStore((s) => s.tasks)
  const users = useStore((s) => s.users)
  const settings = useStore((s) => s.settings)
  const pointsTransactions = useStore((s) => s.pointsTransactions)
  const approve = useStore((s) => s.approveSubmission)
  const reject = useStore((s) => s.rejectSubmission)
  const revertApproval = useStore((s) => s.revertApproval)
  const deleteSubmission = useStore((s) => s.deleteSubmission)
  const toast = useStore((s) => s.toast)

  const [tab, setTab] = useState<SubmissionStatus>('pending')
  const [rejecting, setRejecting] = useState<TaskSubmission | null>(null)
  const [reason, setReason] = useState('')
  const [messaging, setMessaging] = useState<User | null>(null)
  const [lightbox, setLightbox] = useState<{ ids: string[]; index: number } | null>(null)
  const [reverting, setReverting] = useState<TaskSubmission | null>(null)
  const [deleting, setDeleting] = useState<TaskSubmission | null>(null)

  if (!user) return null

  const pendingCount = submissions.filter((s) => s.status === 'pending').length
  const visible = submissions.filter((s) => s.status === tab)

  function findTask(sub: TaskSubmission) {
    return tasks.find((t) => t.id === sub.taskId)
  }
  function findChild(sub: TaskSubmission) {
    return users.find((u) => u.id === sub.childId)
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-black">Validations</h1>

      <Tabs
        tabs={[
          { id: 'pending', label: 'En attente', count: pendingCount },
          { id: 'approved', label: 'Approuvées' },
          { id: 'rejected', label: 'Refusées' },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="space-y-3">
        {visible.map((sub) => {
          const task = findTask(sub)
          const child = findChild(sub)
          if (!child) return null
          const basePoints = task?.points ?? 0
          const bonus = sub.isInitiative ? computeInitiativeBonus(basePoints, settings.initiativeBonusPercent) : 0
          const ageGroup = computeAgeGroup(child.birthdate, settings.ageGroupThresholdYears)
          const total = Math.round((basePoints + bonus) * pointsMultiplierFor(ageGroup, settings))
          return (
            <Card key={sub.id} className="p-4">
              <div className="flex items-center gap-3">
                <ChildAvatar user={child} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {task ? `${task.icon} ${task.title}` : 'Tâche supprimée'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {child.name} · {formatRelative(sub.submittedAt)}
                  </p>
                  {sub.comment && (
                    <p className="mt-0.5 text-xs italic text-slate-500 dark:text-slate-400">
                      « {sub.comment} »
                    </p>
                  )}
                  {sub.isInitiative && (
                    <Badge tone="amber" className="mt-1">
                      ⭐ Initiative +{bonus} pts
                    </Badge>
                  )}
                  {sub.status === 'rejected' && sub.rejectionReason && (
                    <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                      Motif : {sub.rejectionReason}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  {sub.status === 'approved' ? (
                    <PointsAmount points={total} />
                  ) : (
                    <span className="font-bold text-slate-700 dark:text-slate-200">
                      +{total} pts
                    </span>
                  )}
                </div>
              </div>

              {sub.photoIds && sub.photoIds.length > 0 && (
                <div className="mt-3 flex gap-2">
                  {sub.photoIds.map((photoId, i) => (
                    <PhotoThumb
                      key={photoId}
                      photoId={photoId}
                      onClick={() => setLightbox({ ids: sub.photoIds!, index: i })}
                    />
                  ))}
                </div>
              )}

              {sub.status === 'pending' && (
                <div className="mt-3 flex justify-end gap-2">
                  <Button
                    variant="soft"
                    size="sm"
                    onClick={() => {
                      setRejecting(sub)
                      setReason('')
                    }}
                  >
                    <X size={16} />
                    Refuser
                  </Button>
                  <Button
                    variant="success"
                    size="sm"
                    onClick={() => {
                      approve(sub.id, user.id)
                      celebrate([child.color, gradientEnd(child.color)])
                      toast(`Validé ! ${child.name} gagne ${total} points.`)
                      setMessaging(child)
                    }}
                  >
                    <Check size={16} />
                    Approuver
                  </Button>
                </div>
              )}

              {sub.status === 'approved' && (
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setReverting(sub)}>
                    <Undo2 size={16} />
                    Annuler cette validation
                  </Button>
                  <Button variant="ghost" size="sm" className="text-rose-500" onClick={() => setDeleting(sub)}>
                    <Trash2 size={16} />
                    Supprimer définitivement
                  </Button>
                </div>
              )}
            </Card>
          )
        })}
        {visible.length === 0 && (
          <EmptyState
            emoji={tab === 'pending' ? '🎉' : '📭'}
            text={tab === 'pending' ? 'Rien à valider, tout est à jour !' : 'Rien ici pour le moment.'}
          />
        )}
      </div>

      <Modal
        open={reverting !== null}
        onClose={() => setReverting(null)}
        title="Annuler cette validation ?"
      >
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
          {reverting && findChild(reverting)?.name} perdra le gain déjà crédité. Choisis ce que devient la
          tâche :
        </p>
        <div className="flex flex-col gap-2">
          <Button
            variant="soft"
            onClick={() => {
              if (reverting) {
                revertApproval(reverting.id, 'pending', user.id)
                toast('Validation annulée, la tâche est repassée en attente.')
              }
              setReverting(null)
            }}
          >
            Repasser en attente
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (reverting) {
                revertApproval(reverting.id, 'rejected', user.id, 'Validation annulée par erreur')
                toast('Validation annulée, la tâche est marquée refusée.')
              }
              setReverting(null)
            }}
          >
            Marquer refusée
          </Button>
          <Button variant="ghost" onClick={() => setReverting(null)}>
            Ne rien faire
          </Button>
        </div>
      </Modal>

      <Modal open={rejecting !== null} onClose={() => setRejecting(null)} title="Refuser la tâche">
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
          Explique pourquoi, pour que {rejecting ? findChild(rejecting)?.name : ''} comprenne.
        </p>
        <textarea
          className={inputCls}
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="ex : il reste des couverts dans l'évier"
          autoFocus
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="soft" onClick={() => setRejecting(null)}>
            Annuler
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (rejecting) {
                reject(rejecting.id, user.id, reason.trim())
                toast('Tâche refusée.')
              }
              setRejecting(null)
            }}
          >
            Refuser
          </Button>
        </div>
      </Modal>

      <ConfirmModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Supprimer définitivement cette validation ?"
        message={`Cette action est irréversible : « ${
          deleting ? findTask(deleting)?.title ?? 'tâche' : ''
        } » disparaîtra complètement de l'historique de ${
          deleting ? findChild(deleting)?.name ?? "l'enfant" : ''
        }, et ${
          pointsTransactions.find((p) => p.relatedTo === deleting?.id && p.type === 'task_approval')?.amount ?? 0
        } points déjà crédités lui seront retirés.`}
        confirmLabel="Oui, supprimer définitivement"
        danger
        onConfirm={() => {
          if (deleting && user) {
            deleteSubmission(deleting.id, user.id)
            toast('Validation supprimée définitivement.')
          }
        }}
      />

      {messaging && <MessageModal child={messaging} onClose={() => setMessaging(null)} />}

      <AnimatePresence>
        {lightbox && (
          <PhotoLightbox
            photoIds={lightbox.ids}
            startIndex={lightbox.index}
            onClose={() => setLightbox(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
