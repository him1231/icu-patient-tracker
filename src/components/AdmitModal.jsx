import { useState, useEffect } from 'react'
import { doc, setDoc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'

export default function AdmitModal({ bedNum, onClose }) {
  const [form, setForm] = useState({
    hn: '', gender: 'M', specialty: '', diagnosis: '', diagnosisOther: '',
    admissionDate: new Date().toISOString().split('T')[0]
  })
  const [specialties, setSpecialties] = useState([])
  const [diagnoses, setDiagnoses] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      getDoc(doc(db, 'config', 'specialtyOptions')),
      getDoc(doc(db, 'config', 'diagnosisOptions')),
    ]).then(([s, d]) => {
      if (s.exists()) setSpecialties(s.data().options || [])
      if (d.exists()) setDiagnoses(d.data().options || [])
    })
  }, [])

  const isOtherSelected = diagnoses.find(d => d.id === '__other__' && d.label === form.diagnosis || form.diagnosis === 'Other')
    || form.diagnosis === '__other__'

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.hn.trim()) return alert('Please enter HN Number')
    const finalDiagnosis = isOtherSelected ? (form.diagnosisOther.trim() || 'Other') : form.diagnosis
    setSaving(true)
    const id = `${form.hn.trim()}_${Date.now()}`
    await setDoc(doc(db, 'patients', id), {
      hn: form.hn.trim(),
      gender: form.gender,
      specialty: form.specialty,
      diagnosis: finalDiagnosis,
      admissionDate: form.admissionDate,
      dischargeDate: null,
      bedNumber: bedNum,
      active: true
    })
    setSaving(false)
    onClose(true)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal">
        <h2>Bed {bedNum} — Admit Patient</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>HN Number</label>
            <input value={form.hn} onChange={e=>setForm({...form,hn:e.target.value})} placeholder="HN Number" required />
          </div>
          <div className="form-group">
            <label>Gender</label>
            <select value={form.gender} onChange={e=>setForm({...form,gender:e.target.value})}>
              <option value="M">Male (M)</option>
              <option value="F">Female (F)</option>
            </select>
          </div>
          <div className="form-group">
            <label>Specialty</label>
            <select value={form.specialty} onChange={e=>setForm({...form,specialty:e.target.value})}>
              <option value="">-- Select --</option>
              {specialties.map(s=><option key={s.id} value={s.label}>{s.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Diagnosis</label>
            <select value={form.diagnosis} onChange={e=>setForm({...form,diagnosis:e.target.value,diagnosisOther:''})}>
              <option value="">-- Select --</option>
              {diagnoses.map(d=><option key={d.id} value={d.isOther ? '__other__' : d.label}>{d.label}</option>)}
            </select>
            {isOtherSelected && (
              <input style={{marginTop:'8px'}} value={form.diagnosisOther}
                onChange={e=>setForm({...form,diagnosisOther:e.target.value})}
                placeholder="Please specify diagnosis..." />
            )}
          </div>
          <div className="form-group">
            <label>Admission Date</label>
            <input type="date" value={form.admissionDate} onChange={e=>setForm({...form,admissionDate:e.target.value})} required />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Admit'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
