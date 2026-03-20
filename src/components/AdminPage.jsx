import { useState, useEffect, useMemo } from 'react'
import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'

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

function PatientAdminSection() {
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState(null)

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
