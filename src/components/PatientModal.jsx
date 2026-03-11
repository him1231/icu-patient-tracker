import { useState, useEffect } from 'react'
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'

const TODAY = new Date().toISOString().split('T')[0]
const YESTERDAY = new Date(Date.now()-86400000).toISOString().split('T')[0]

export default function PatientModal({ bedNum, patient, todayRecord, onClose, onTransfer }) {
  const [config, setConfig] = useState({ mmrc: [], exercise: [] })
  const [form, setForm] = useState({
    level: todayRecord?.level || 0,
    ims: todayRecord?.ims ?? 5,
    mmrc: todayRecord?.mmrc || Array(12).fill(false),
    exercise: todayRecord?.exercise || ''
  })
  const [saving, setSaving] = useState(false)
  const [discharging, setDischarging] = useState(false)

  useEffect(() => {
    Promise.all([
      getDoc(doc(db, 'config', 'mmrcItems')),
      getDoc(doc(db, 'config', 'exerciseOptions'))
    ]).then(([m, e]) => {
      setConfig({
        mmrc: m.exists() ? m.data().items : [],
        exercise: e.exists() ? e.data().options : []
      })
    })
    if (!todayRecord) {
      getDoc(doc(db, 'dailyRecords', `${patient.id}_${YESTERDAY}`)).then(s => {
        if (s.exists()) {
          const d = s.data()
          setForm(f => ({ ...f, level: d.level||0, ims: d.ims??5, mmrc: d.mmrc||Array(12).fill(false), exercise: d.exercise||'' }))
        }
      })
    }
  }, [])

  const toggleMmrc = (i) => {
    const arr = [...form.mmrc]
    arr[i] = !arr[i]
    setForm({...form, mmrc: arr})
  }

  const handleSave = async () => {
    if (!form.level) return alert('Please select a Level')
    setSaving(true)
    await setDoc(doc(db, 'dailyRecords', `${patient.id}_${TODAY}`), {
      patientId: patient.id,
      date: TODAY,
      level: form.level,
      ims: form.ims,
      mmrc: form.mmrc,
      exercise: form.exercise,
      savedAt: new Date().toISOString()
    })
    setSaving(false)
    onClose()
  }

  const handleDischarge = async () => {
    if (!confirm(`Confirm discharge ${patient.hn}?`)) return
    setDischarging(true)
    await updateDoc(doc(db, 'patients', patient.id), {
      dischargeDate: TODAY,
      active: false
    })
    setDischarging(false)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal">
        <h2>Bed {bedNum} — {patient.hn}</h2>
        <div className="patient-info">
          <p><strong>HN:</strong> {patient.hn} &nbsp; <strong>Gender:</strong> {patient.gender}</p>
          <p><strong>Specialty:</strong> {patient.specialty} &nbsp; <strong>Admission:</strong> {patient.admissionDate}</p>
        </div>
        <div className="form-group">
          <label>Level</label>
          <div className="level-buttons">
            {[1,2,3,4].map(l=>(
              <button key={l} className={`level-btn${form.level===l?' active':''}`} onClick={()=>setForm({...form,level:l})}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="form-group">
          <label>IMS (0-10)</label>
          <div className="ims-control">
            <button onClick={()=>setForm({...form,ims:Math.max(0,form.ims-1)})} type="button">-</button>
            <span>{form.ims}</span>
            <button onClick={()=>setForm({...form,ims:Math.min(10,form.ims+1)})} type="button">+</button>
          </div>
        </div>
        <div className="form-group">
          <label>MMRC ({form.mmrc.filter(Boolean).length}/12)</label>
          <div className="mmrc-grid">
            {config.mmrc.map((item,i)=>(
              <label key={i} className="mmrc-item">
                <input type="checkbox" checked={form.mmrc[i]||false} onChange={()=>toggleMmrc(i)} />
                {item.label}
              </label>
            ))}
          </div>
        </div>
        <div className="form-group">
          <label>Exercise</label>
          <select value={form.exercise} onChange={e=>setForm({...form,exercise:e.target.value})}>
            <option value="">-- Select --</option>
            {config.exercise.map(o=><option key={o.id} value={o.label}>{o.label}</option>)}
          </select>
        </div>
        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onTransfer} style={{borderColor:'#805ad5',color:'#805ad5'}}>
            ⇄ Transfer Bed
          </button>
          <button className="btn btn-danger" onClick={handleDischarge} disabled={discharging}>
            {discharging ? 'Processing...' : 'Discharge'}
          </button>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Today'}
          </button>
        </div>
      </div>
    </div>
  )
}
