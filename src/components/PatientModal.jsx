import { useState, useEffect } from 'react'
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore'
import { db } from '../firebase'

const TODAY = new Date().toISOString().split('T')[0]

const IMS_OPTIONS = [
  [0, '0 - Nothing (lying in bed)'],
  [1, '1 - Sitting in bed, exercises in bed'],
  [2, '2 - Passively moved to chair (no standing)'],
  [3, '3 - Sitting over edge of bed'],
  [4, '4 - Standing'],
  [5, '5 - Transferring bed to chair'],
  [6, '6 - Marching on spot'],
  [7, '7 - Walking with 2+ assist'],
  [8, '8 - Walking with 1 assist'],
  [9, '9 - Walking independently with aid'],
  [10, '10 - Walking independently without aid'],
]

const CFS_OPTIONS = [
  [1, '1. Very fit'],
  [2, '2. Fit'],
  [3, '3. Managing well'],
  [4, '4. Living with very mild frailty'],
  [5, '5. Living with mild frailty'],
  [6, '6. Living with moderate frailty'],
  [7, '7. Living with severe frailty'],
  [8, '8. Living with very severe frailty'],
  [9, '9. Terminally ill'],
]

const MMRC_ROWS = ['Shoulder', 'Elbow', 'Wrist', 'Hip', 'Knee', 'Ankle']

const defaultForm = () => ({
  level: 0,
  ims: 1,
  mmrc: Array(12).fill(0),
  exercise: '',
  intubated: false,
})

function normalizeMmrc(mmrc) {
  if (!Array.isArray(mmrc)) return Array(12).fill(0)
  return Array.from({ length: 12 }, (_, i) => {
    const value = mmrc[i]
    if (typeof value === 'boolean') return value ? 1 : 0
    return Number(value) || 0
  })
}

function recordToForm(record) {
  return {
    level: record?.level || 0,
    ims: record?.ims ?? 1,
    mmrc: normalizeMmrc(record?.mmrc),
    exercise: record?.exercise || '',
    intubated: Boolean(record?.intubated),
  }
}

async function findLatestPreviousRecord(patientId, beforeDate) {
  const snap = await getDocs(query(collection(db, 'dailyRecords'), where('patientId', '==', patientId)))
  const records = snap.docs
    .map(d => d.data())
    .filter(record => record.date && record.date < beforeDate)
    .sort((a, b) => b.date.localeCompare(a.date))

  return records[0] || null
}

export default function PatientModal({ bedNum, patient, todayRecord, onClose, onTransfer }) {
  const [config, setConfig] = useState({ exercise: [] })
  const [recordDate, setRecordDate] = useState(TODAY)
  const [form, setForm] = useState(recordToForm(todayRecord))
  const [cfs, setCfs] = useState(patient?.cfs ?? '')
  const [recordLoading, setRecordLoading] = useState(false)
  const [prefillSourceDate, setPrefillSourceDate] = useState(null)
  const [saving, setSaving] = useState(false)
  const [discharging, setDischarging] = useState(false)
  const [offProgramming, setOffProgramming] = useState(false)
  const [resuming, setResuming] = useState(false)

  useEffect(() => {
    getDoc(doc(db, 'config', 'exerciseOptions')).then(e => {
      setConfig({ exercise: e.exists() ? e.data().options : [] })
    })
  }, [])

  useEffect(() => {
    setCfs(patient?.cfs ?? '')
  }, [patient?.cfs])

  useEffect(() => {
    let cancelled = false

    async function loadRecord(date) {
      setRecordLoading(true)
      try {
        const currentRef = doc(db, 'dailyRecords', `${patient.id}_${date}`)
        const currentSnap = await getDoc(currentRef)

        if (cancelled) return

        if (currentSnap.exists()) {
          setForm(recordToForm(currentSnap.data()))
          setPrefillSourceDate(null)
          return
        }

        const previousRecord = await findLatestPreviousRecord(patient.id, date)
        if (cancelled) return

        if (previousRecord) {
          setForm(recordToForm(previousRecord))
          setPrefillSourceDate(previousRecord.date)
          return
        }

        setForm(defaultForm())
        setPrefillSourceDate(null)
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load record:', err)
          setForm(defaultForm())
          setPrefillSourceDate(null)
        }
      } finally {
        if (!cancelled) setRecordLoading(false)
      }
    }

    loadRecord(recordDate)
    return () => { cancelled = true }
  }, [patient.id, patient.admissionDate, recordDate])

  const setMmrc = (i, val) => {
    const arr = [...form.mmrc]
    const v = parseInt(val)
    arr[i] = isNaN(v) ? 0 : Math.min(5, Math.max(0, v))
    setForm({ ...form, mmrc: arr })
  }

  const mmrcTotal = form.mmrc.reduce((sum, v) => sum + (Number(v) || 0), 0)
  const isBackfill = recordDate !== TODAY
  const offProgramLocked = Boolean(patient.offProgram && patient.offProgramDate && recordDate >= patient.offProgramDate)

  async function savePatientBackground(extraUpdates = {}) {
    const updates = { ...extraUpdates }
    const normalizedCfs = cfs === '' ? null : Number(cfs)
    const existingCfs = patient?.cfs ?? null
    if (normalizedCfs !== existingCfs) updates.cfs = normalizedCfs
    if (Object.keys(updates).length) {
      await updateDoc(doc(db, 'patients', patient.id), updates)
    }
  }

  const handleSave = async () => {
    if (!form.level) return alert('Please select a Level')
    if (offProgramLocked) return alert(`This patient is off program since ${patient.offProgramDate}. Please choose an earlier date or resume program first.`)

    setSaving(true)
    try {
      await savePatientBackground()
      await setDoc(doc(db, 'dailyRecords', `${patient.id}_${recordDate}`), {
        patientId: patient.id,
        date: recordDate,
        level: form.level,
        ims: form.ims,
        mmrc: form.mmrc.map(v => Number(v) || 0),
        exercise: form.exercise,
        intubated: Boolean(form.intubated),
        savedAt: new Date().toISOString(),
      })
      onClose(true)
    } catch (err) {
      alert('Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDischarge = async () => {
    if (!confirm(`Confirm discharge ${patient.hn}?`)) return
    setDischarging(true)
    try {
      await savePatientBackground({
        dischargeDate: TODAY,
        active: false,
      })
      onClose(true)
    } catch (err) {
      alert('Discharge failed: ' + err.message)
    } finally {
      setDischarging(false)
    }
  }

  const handleOffProgram = async () => {
    if (!confirm(`Set ${patient.hn} as off program from today?`)) return
    setOffProgramming(true)
    try {
      await savePatientBackground({
        offProgram: true,
        offProgramDate: TODAY,
      })
      onClose(true)
    } catch (err) {
      alert('Off program failed: ' + err.message)
    } finally {
      setOffProgramming(false)
    }
  }

  const handleResumeProgram = async () => {
    if (!confirm(`Resume program for ${patient.hn}?`)) return
    setResuming(true)
    try {
      await savePatientBackground({
        offProgram: false,
        offProgramDate: null,
      })
      onClose(true)
    } catch (err) {
      alert('Resume failed: ' + err.message)
    } finally {
      setResuming(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>Bed {bedNum} — {patient.hn}</h2>
        <div className="patient-info">
          <p><strong>HN:</strong> {patient.hn} &nbsp; <strong>Gender:</strong> {patient.gender}</p>
          <p><strong>Specialty:</strong> {patient.specialty} &nbsp; <strong>Admission:</strong> {patient.admissionDate}</p>
          {patient.diagnosis && <p><strong>Diagnosis:</strong> {patient.diagnosis}</p>}
          <p>
            <strong>Status:</strong>{' '}
            {!patient.active ? 'Discharged' : patient.offProgram ? `Off Program${patient.offProgramDate ? ` (${patient.offProgramDate})` : ''}` : 'On Program'}
          </p>
        </div>

        <div className="form-group">
          <label>Record Date</label>
          <input
            type="date"
            value={recordDate}
            min={patient.admissionDate}
            max={TODAY}
            onChange={e => setRecordDate(e.target.value)}
          />
          <div className="form-help">
            {isBackfill ? `補錄 ${recordDate} data` : 'Today record'}
            {prefillSourceDate && ` · cloned from ${prefillSourceDate}`}
          </div>
        </div>

        <div className="form-group">
          <label>CFS — Clinical Frailty Scale</label>
          <select value={cfs} onChange={e => setCfs(e.target.value === '' ? '' : parseInt(e.target.value))}>
            <option value="">-- Select --</option>
            {CFS_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        {recordLoading ? (
          <div className="loading" style={{ padding: '20px 0' }}>Loading record...</div>
        ) : (
          <>
            {offProgramLocked && (
              <div className="info-banner warning">
                This patient is off program since <strong>{patient.offProgramDate}</strong>. You can still backfill earlier dates, or resume program first.
              </div>
            )}

            <div className="form-group">
              <label>Level</label>
              <div className="level-buttons">
                {[1, 2, 3, 4].map(l => (
                  <button
                    key={l}
                    className={`level-btn${form.level === l ? ' active' : ''}`}
                    onClick={() => setForm({ ...form, level: l })}
                    type="button"
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>IMS — ICU Mobility Scale</label>
              <select value={form.ims} onChange={e => setForm({ ...form, ims: parseInt(e.target.value) })}>
                {IMS_OPTIONS.map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Mechanical Ventilation</label>
              <div className="toggle-row">
                <button
                  type="button"
                  className={`toggle-btn${form.intubated ? ' active danger' : ''}`}
                  onClick={() => setForm({ ...form, intubated: true })}
                >
                  Intubated
                </button>
                <button
                  type="button"
                  className={`toggle-btn${!form.intubated ? ' active' : ''}`}
                  onClick={() => setForm({ ...form, intubated: false })}
                >
                  Not Intubated
                </button>
              </div>
            </div>

            <div className="form-group">
              <label>MRCSS &nbsp;<span style={{ fontWeight: 'normal', color: '#718096' }}>Total: <strong style={{ color: '#2b6cb0' }}>{mmrcTotal}</strong> / 60</span></label>
              <table className="mmrc-table">
                <thead>
                  <tr><th></th><th>Rt</th><th>Lt</th></tr>
                </thead>
                <tbody>
                  {MMRC_ROWS.map((row, i) => (
                    <tr key={row}>
                      <td className="mmrc-label">{row}</td>
                      {[0, 1].map(side => (
                        <td key={side}>
                          <div className="mmrc-btn-group">
                            {[0, 1, 2, 3, 4, 5].map(score => (
                              <button
                                key={score}
                                type="button"
                                className={`mmrc-btn${form.mmrc[i * 2 + side] === score ? ' active' : ''}`}
                                onClick={() => setMmrc(i * 2 + side, score)}
                              >
                                {score}
                              </button>
                            ))}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="form-group">
              <label>Exercise</label>
              <select value={form.exercise} onChange={e => setForm({ ...form, exercise: e.target.value })}>
                <option value="">-- Select --</option>
                {config.exercise.map(o => <option key={o.id} value={o.label}>{o.label}</option>)}
              </select>
            </div>
          </>
        )}

        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onTransfer} style={{ borderColor: '#805ad5', color: '#805ad5' }}>
            ⇄ Transfer Bed
          </button>

          {patient.offProgram ? (
            <button className="btn btn-warning" onClick={handleResumeProgram} disabled={resuming}>
              {resuming ? 'Resuming...' : 'Resume Program'}
            </button>
          ) : (
            <button className="btn btn-warning" onClick={handleOffProgram} disabled={offProgramming}>
              {offProgramming ? 'Updating...' : 'Off Program'}
            </button>
          )}

          <button className="btn btn-danger" onClick={handleDischarge} disabled={discharging}>
            {discharging ? 'Processing...' : 'Discharge'}
          </button>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || recordLoading || offProgramLocked}>
            {saving ? 'Saving...' : isBackfill ? `Save ${recordDate}` : 'Save Today'}
          </button>
        </div>
      </div>
    </div>
  )
}
