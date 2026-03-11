import { useState, useEffect } from 'react'
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'

const TODAY = new Date().toISOString().split('T')[0]
const YESTERDAY = new Date(Date.now()-86400000).toISOString().split('T')[0]

const MMRC_ROWS = ['Shoulder', 'Elbow', 'Wrist', 'Hip', 'Knee', 'Ankle']

export default function PatientModal({ bedNum, patient, todayRecord, onClose, onTransfer }) {
  const [config, setConfig] = useState({ exercise: [] })
  const [form, setForm] = useState({
    level: todayRecord?.level || 0,
    ims: todayRecord?.ims ?? 5,
    mmrc: todayRecord?.mmrc || Array(12).fill(0),
    exercise: todayRecord?.exercise || ''
  })
  const [saving, setSaving] = useState(false)
  const [discharging, setDischarging] = useState(false)

  useEffect(() => {
    getDoc(doc(db, 'config', 'exerciseOptions')).then(e => {
      setConfig({ exercise: e.exists() ? e.data().options : [] })
    })
    if (!todayRecord) {
      getDoc(doc(db, 'dailyRecords', `${patient.id}_${YESTERDAY}`)).then(s => {
        if (s.exists()) {
          const d = s.data()
          setForm(f => ({
            ...f,
            level: d.level || 0,
            ims: d.ims ?? 5,
            mmrc: Array.isArray(d.mmrc) ? d.mmrc.map(v => typeof v === 'boolean' ? (v ? 1 : 0) : (v ?? 0)) : Array(12).fill(0),
            exercise: d.exercise || ''
          }))
        }
      })
    }
  }, [])

  const setMmrc = (i, val) => {
    const arr = [...form.mmrc]
    const v = parseInt(val)
    arr[i] = isNaN(v) ? 0 : Math.min(5, Math.max(0, v))
    setForm({...form, mmrc: arr})
  }

  const mmrcTotal = form.mmrc.reduce((sum, v) => sum + (Number(v) || 0), 0)

  const handleSave = async () => {
    if (!form.level) return alert('Please select a Level')
    setSaving(true)
    await setDoc(doc(db, 'dailyRecords', `${patient.id}_${TODAY}`), {
      patientId: patient.id,
      date: TODAY,
      level: form.level,
      ims: form.ims,
      mmrc: form.mmrc.map(v => Number(v) || 0),
      exercise: form.exercise,
      savedAt: new Date().toISOString()
    })
    setSaving(false)
    onClose(true)
  }

  const handleDischarge = async () => {
    if (!confirm(`Confirm discharge ${patient.hn}?`)) return
    setDischarging(true)
    await updateDoc(doc(db, 'patients', patient.id), {
      dischargeDate: TODAY,
      active: false
    })
    setDischarging(false)
    onClose(true)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal">
        <h2>Bed {bedNum} — {patient.hn}</h2>
        <div className="patient-info">
          <p><strong>HN:</strong> {patient.hn} &nbsp; <strong>Gender:</strong> {patient.gender}</p>
          <p><strong>Specialty:</strong> {patient.specialty} &nbsp; <strong>Admission:</strong> {patient.admissionDate}</p>
          {patient.diagnosis && <p><strong>Diagnosis:</strong> {patient.diagnosis}</p>}
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
          <label>MMRC &nbsp;<span style={{fontWeight:'normal',color:'#718096'}}>Total: <strong style={{color:'#2b6cb0'}}>{mmrcTotal}</strong> / 60</span></label>
          <table className="mmrc-table">
            <thead>
              <tr><th></th><th>Rt</th><th>Lt</th></tr>
            </thead>
            <tbody>
              {MMRC_ROWS.map((row, i) => (
                <tr key={row}>
                  <td className="mmrc-label">{row}</td>
                  <td><input type="number" min="0" max="5" value={form.mmrc[i*2] ?? 0} onChange={e=>setMmrc(i*2, e.target.value)} className="mmrc-score-input" /></td>
                  <td><input type="number" min="0" max="5" value={form.mmrc[i*2+1] ?? 0} onChange={e=>setMmrc(i*2+1, e.target.value)} className="mmrc-score-input" /></td>
                </tr>
              ))}
            </tbody>
          </table>
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
