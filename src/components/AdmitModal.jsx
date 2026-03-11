import { useState, useEffect } from 'react'
import { doc, setDoc, getDoc, collection } from 'firebase/firestore'
import { db } from '../firebase'

export default function AdmitModal({ bedNum, onClose }) {
  const [form, setForm] = useState({
    hn: '', gender: 'M', specialty: '', admissionDate: new Date().toISOString().split('T')[0]
  })
  const [specialties, setSpecialties] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getDoc(doc(db, 'config', 'specialtyOptions')).then(s => {
      if (s.exists()) setSpecialties(s.data().options || [])
    })
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.hn.trim()) return alert('請輸入 HN Number')
    setSaving(true)
    const id = `${form.hn.trim()}_${Date.now()}`
    await setDoc(doc(db, 'patients', id), {
      hn: form.hn.trim(),
      gender: form.gender,
      specialty: form.specialty,
      admissionDate: form.admissionDate,
      dischargeDate: null,
      bedNumber: bedNum,
      active: true
    })
    setSaving(false)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal">
        <h2>床 {bedNum} — 新收病人</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>HN Number</label>
            <input value={form.hn} onChange={e=>setForm({...form,hn:e.target.value})} placeholder="HN Number" required />
          </div>
          <div className="form-group">
            <label>性別</label>
            <select value={form.gender} onChange={e=>setForm({...form,gender:e.target.value})}>
              <option value="M">男 (M)</option>
              <option value="F">女 (F)</option>
            </select>
          </div>
          <div className="form-group">
            <label>Specialty</label>
            <select value={form.specialty} onChange={e=>setForm({...form,specialty:e.target.value})}>
              <option value="">-- 選擇 --</option>
              {specialties.map(s=><option key={s.id} value={s.label}>{s.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>入院日期</label>
            <input type="date" value={form.admissionDate} onChange={e=>setForm({...form,admissionDate:e.target.value})} required />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>取消</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving?'儲存中...':'確認收院'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
