import { useState, useEffect, useMemo } from 'react'
import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'

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

async function bumpLastEdit() {
  await setDoc(doc(db, 'meta', 'lastEdit'), { updatedAt: Date.now() })
}

function ConfigSection({ title, configKey, fieldKey, protectedId }) {
  const [items, setItems] = useState([])
  const [newLabel, setNewLabel] = useState('')
  const [editId, setEditId] = useState(null)
  const [editLabel, setEditLabel] = useState('')

  useEffect(() => {
    getDoc(doc(db, 'config', configKey)).then(s => {
      if (s.exists()) setItems(s.data()[fieldKey] || [])
    })
  }, [configKey, fieldKey])

  const save = async (newItems) => {
    await setDoc(doc(db, 'config', configKey), { [fieldKey]: newItems })
    await bumpLastEdit()
    setItems(newItems)
  }

  const addItem = async () => {
    if (!newLabel.trim()) return
    const id = `item_${Date.now()}`
    await save([...items, { id, label: newLabel.trim() }])
    setNewLabel('')
  }

  const deleteItem = (id) => {
    if (id === protectedId) return alert('This item cannot be deleted.')
    if (confirm('Delete this item?')) save(items.filter(i => i.id !== id))
  }

  const saveEdit = (id) => {
    save(items.map(i => i.id === id ? { ...i, label: editLabel } : i))
    setEditId(null)
  }

  return (
    <div className="admin-section">
      <h3>{title}</h3>
      <ul className="item-list">
        {items.map(item => (
          <li key={item.id}>
            {editId === item.id ? (
              <>
                <input
                  value={editLabel}
                  onChange={e => setEditLabel(e.target.value)}
                  style={{ flex: 1, padding: '4px 8px', border: '1px solid #ccc', borderRadius: '4px' }}
                />
                <div className="item-actions">
                  <button className="btn-edit" onClick={() => saveEdit(item.id)}>Save</button>
                  <button className="btn-delete" onClick={() => setEditId(null)}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <span>{item.label}</span>
                <div className="item-actions">
                  <button className="btn-edit" onClick={() => { setEditId(item.id); setEditLabel(item.label) }}>Edit</button>
                  <button
                    className="btn-delete"
                    onClick={() => deleteItem(item.id)}
                    style={item.id === protectedId ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="add-item-form">
        <input
          value={newLabel}
          onChange={e => setNewLabel(e.target.value)}
          placeholder="Add new item..."
          onKeyDown={e => e.key === 'Enter' && addItem()}
        />
        <button className="btn btn-primary" onClick={addItem} style={{ whiteSpace: 'nowrap' }}>+ Add</button>
      </div>
    </div>
  )
}

function statusOf(patient) {
  if (!patient.active) return 'discharged'
  if (patient.offProgram) return 'off-program'
  return 'active'
}

function EditAdmissionModal({ patient, patients, onClose, onSaved }) {
  const [specialties, setSpecialties] = useState([])
  const [diagnoses, setDiagnoses] = useState([])
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    hn: patient?.hn || '',
    gender: patient?.gender || 'M',
    specialty: patient?.specialty || '',
    diagnosis: '',
    diagnosisOther: '',
    cfs: patient?.cfs ?? '',
    admissionDate: patient?.admissionDate || new Date().toISOString().split('T')[0],
    bedNumber: patient?.bedNumber != null ? String(patient.bedNumber) : '',
  })

  useEffect(() => {
    Promise.all([
      getDoc(doc(db, 'config', 'specialtyOptions')),
      getDoc(doc(db, 'config', 'diagnosisOptions')),
    ]).then(([s, d]) => {
      const nextSpecialties = s.exists() ? (s.data().options || []) : []
      const nextDiagnoses = d.exists() ? (d.data().options || []) : []
      setSpecialties(nextSpecialties)
      setDiagnoses(nextDiagnoses)

      const hasKnownDiagnosis = nextDiagnoses.some(item => !item.isOther && item.label === (patient?.diagnosis || ''))
      setForm((current) => ({
        ...current,
        specialty: patient?.specialty || '',
        diagnosis: hasKnownDiagnosis ? (patient?.diagnosis || '') : ((patient?.diagnosis || '') ? '__other__' : ''),
        diagnosisOther: hasKnownDiagnosis ? '' : (patient?.diagnosis || ''),
      }))
    })
  }, [patient])

  const isOtherSelected = form.diagnosis === '__other__'

  const handleSubmit = async (e) => {
    e.preventDefault()

    const hn = form.hn.trim()
    if (!hn) return alert('Please enter HN Number')

    const bedNumber = parseInt(form.bedNumber, 10)
    if (!Number.isInteger(bedNumber) || bedNumber < 1 || bedNumber > 32) {
      return alert('Please enter a valid bed number between 1 and 32.')
    }

    const occupied = patients.find(p => p.active && p.id !== patient.id && Number(p.bedNumber) === bedNumber)
    if (occupied) {
      return alert(`Bed ${bedNumber} is occupied by ${occupied.hn}.`)
    }

    const finalDiagnosis = isOtherSelected
      ? (form.diagnosisOther.trim() || 'Other')
      : form.diagnosis

    setSaving(true)
    try {
      await updateDoc(doc(db, 'patients', patient.id), {
        hn,
        gender: form.gender,
        specialty: form.specialty,
        diagnosis: finalDiagnosis,
        cfs: form.cfs === '' ? null : Number(form.cfs),
        admissionDate: form.admissionDate,
        bedNumber,
      })
      await bumpLastEdit()
      onSaved()
    } catch (err) {
      alert('Update failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>Edit Admission Information — {patient.hn}</h2>
        <div className="patient-info">
          <p><strong>Status:</strong> {statusOf(patient) === 'active' ? 'On Program' : statusOf(patient) === 'off-program' ? 'Off Program' : 'Discharged'}</p>
          <p><strong>Document ID:</strong> {patient.id}</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>HN Number</label>
            <input value={form.hn} onChange={e => setForm({ ...form, hn: e.target.value })} placeholder="HN Number" required />
          </div>

          <div className="form-group">
            <label>Gender</label>
            <select value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })}>
              <option value="M">Male (M)</option>
              <option value="F">Female (F)</option>
            </select>
          </div>

          <div className="form-group">
            <label>Bed Number</label>
            <input
              type="number"
              min="1"
              max="32"
              value={form.bedNumber}
              onChange={e => setForm({ ...form, bedNumber: e.target.value })}
              placeholder="1 - 32"
              required
            />
          </div>

          <div className="form-group">
            <label>Specialty</label>
            <select value={form.specialty} onChange={e => setForm({ ...form, specialty: e.target.value })}>
              <option value="">-- Select --</option>
              {specialties.map(s => <option key={s.id} value={s.label}>{s.label}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Diagnosis</label>
            <select value={form.diagnosis} onChange={e => setForm({ ...form, diagnosis: e.target.value, diagnosisOther: '' })}>
              <option value="">-- Select --</option>
              {diagnoses.map(d => <option key={d.id} value={d.isOther ? '__other__' : d.label}>{d.label}</option>)}
            </select>
            {isOtherSelected && (
              <input
                style={{ marginTop: '8px' }}
                value={form.diagnosisOther}
                onChange={e => setForm({ ...form, diagnosisOther: e.target.value })}
                placeholder="Please specify diagnosis..."
              />
            )}
          </div>

          <div className="form-group">
            <label>CFS — Clinical Frailty Scale</label>
            <select value={form.cfs} onChange={e => setForm({ ...form, cfs: e.target.value === '' ? '' : parseInt(e.target.value) })}>
              <option value="">-- Select --</option>
              {CFS_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Admission Date</label>
            <input type="date" value={form.admissionDate} onChange={e => setForm({ ...form, admissionDate: e.target.value })} required />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function PatientAdminSection() {
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [editingPatient, setEditingPatient] = useState(null)

  const loadPatients = async () => {
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, 'patients'))
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      rows.sort((a, b) => {
        const aStatus = statusOf(a)
        const bStatus = statusOf(b)
        const order = { active: 0, 'off-program': 1, discharged: 2 }
        if (order[aStatus] !== order[bStatus]) return order[aStatus] - order[bStatus]
        return String(b.admissionDate || '').localeCompare(String(a.admissionDate || ''))
      })
      setPatients(rows)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPatients()
  }, [])

  const filteredPatients = useMemo(() => {
    const query = search.trim().toLowerCase()
    return patients.filter(patient => {
      const status = statusOf(patient)
      if (filter !== 'all' && status !== filter) return false
      if (!query) return true
      return [patient.hn, patient.diagnosis, patient.specialty, String(patient.bedNumber)]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(query))
    })
  }, [patients, filter, search])

  const markOffProgram = async (patient) => {
    if (!confirm(`Set ${patient.hn} as off program?`)) return
    setBusyId(patient.id)
    try {
      await updateDoc(doc(db, 'patients', patient.id), {
        offProgram: true,
        offProgramDate: new Date().toISOString().split('T')[0],
      })
      await bumpLastEdit()
      await loadPatients()
    } finally {
      setBusyId(null)
    }
  }

  const resumeProgram = async (patient) => {
    if (!confirm(`Resume program for ${patient.hn}?`)) return
    setBusyId(patient.id)
    try {
      await updateDoc(doc(db, 'patients', patient.id), {
        offProgram: false,
        offProgramDate: null,
      })
      await bumpLastEdit()
      await loadPatients()
    } finally {
      setBusyId(null)
    }
  }

  const undoDischarge = async (patient) => {
    const suggestedBed = patient.bedNumber ? String(patient.bedNumber) : ''
    const input = prompt(`Restore ${patient.hn} to bed number (1-32):`, suggestedBed)
    if (input === null) return

    const bedNumber = parseInt(input, 10)
    if (!Number.isInteger(bedNumber) || bedNumber < 1 || bedNumber > 32) {
      alert('Please enter a valid bed number between 1 and 32.')
      return
    }

    const occupied = patients.find(p => p.active && p.id !== patient.id && Number(p.bedNumber) === bedNumber)
    if (occupied) {
      alert(`Bed ${bedNumber} is occupied by ${occupied.hn}.`)
      return
    }

    setBusyId(patient.id)
    try {
      await updateDoc(doc(db, 'patients', patient.id), {
        active: true,
        dischargeDate: null,
        bedNumber,
        offProgram: false,
        offProgramDate: null,
      })
      await bumpLastEdit()
      await loadPatients()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="admin-section">
      <h3>Patient Status Manager</h3>
      <div className="patient-admin-toolbar">
        <div className="filter-buttons">
          {[
            ['all', 'All'],
            ['active', 'On Program'],
            ['off-program', 'Off Program'],
            ['discharged', 'Discharged'],
          ].map(([value, label]) => (
            <button key={value} className={`filter-btn${filter === value ? ' active' : ''}`} onClick={() => setFilter(value)}>
              {label}
            </button>
          ))}
        </div>
        <input
          className="patient-search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search HN / diagnosis / specialty / bed"
        />
      </div>

      {loading ? (
        <div className="loading">Loading patients...</div>
      ) : (
        <div className="patient-admin-list">
          {filteredPatients.map(patient => {
            const status = statusOf(patient)
            const isBusy = busyId === patient.id
            return (
              <div key={patient.id} className="patient-admin-item">
                <div className="patient-admin-main">
                  <div className="patient-admin-title-row">
                    <strong>{patient.hn}</strong>
                    <span className={`status-chip ${status}`}>
                      {status === 'active' ? 'On Program' : status === 'off-program' ? 'Off Program' : 'Discharged'}
                    </span>
                  </div>
                  <div className="patient-admin-meta">
                    Bed {patient.bedNumber || '-'} · {patient.specialty || 'No specialty'} · Admission {patient.admissionDate || '-'}
                  </div>
                  <div className="patient-admin-meta">
                    {patient.diagnosis || 'No diagnosis'}
                    {patient.cfs ? ` · CFS ${patient.cfs}` : ''}
                    {patient.offProgramDate ? ` · Off program ${patient.offProgramDate}` : ''}
                    {patient.dischargeDate ? ` · Discharge ${patient.dischargeDate}` : ''}
                  </div>
                </div>
                <div className="patient-admin-actions">
                  <button className="btn btn-outline" onClick={() => setEditingPatient(patient)} disabled={isBusy}>Edit Admission</button>
                  {status === 'active' && (
                    <button className="btn btn-warning" onClick={() => markOffProgram(patient)} disabled={isBusy}>Off Program</button>
                  )}
                  {status === 'off-program' && (
                    <button className="btn btn-warning" onClick={() => resumeProgram(patient)} disabled={isBusy}>Resume</button>
                  )}
                  {status === 'discharged' && (
                    <button className="btn btn-primary" onClick={() => undoDischarge(patient)} disabled={isBusy}>Undo Discharge</button>
                  )}
                </div>
              </div>
            )
          })}
          {!filteredPatients.length && <div className="loading" style={{ padding: '16px 0' }}>No patients found.</div>}
        </div>
      )}

      {editingPatient && (
        <EditAdmissionModal
          patient={editingPatient}
          patients={patients}
          onClose={() => setEditingPatient(null)}
          onSaved={async () => {
            setEditingPatient(null)
            await loadPatients()
          }}
        />
      )}
    </div>
  )
}

export default function AdminPage() {
  return (
    <div>
      <PatientAdminSection />
      <ConfigSection title="Exercise Options" configKey="exerciseOptions" fieldKey="options" />
      <ConfigSection title="Specialty" configKey="specialtyOptions" fieldKey="options" />
      <ConfigSection title="Diagnosis" configKey="diagnosisOptions" fieldKey="options" protectedId="__other__" />
    </div>
  )
}
