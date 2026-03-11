import { useState } from 'react'
import { getDocs, collection, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import * as XLSX from 'xlsx'

export default function ExportButton() {
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(false)

  const handleExport = async () => {
    setLoading(true)
    // fetch patients
    let pQuery = collection(db, 'patients')
    const pSnap = await getDocs(pQuery)
    let patients = pSnap.docs.map(d=>({id:d.id,...d.data()}))
    if (filter==='active') patients = patients.filter(p=>p.active)
    if (filter==='discharged') patients = patients.filter(p=>!p.active)

    // fetch all daily records
    const rSnap = await getDocs(collection(db, 'dailyRecords'))
    const allRecs = {}
    rSnap.forEach(d=>{
      const data = d.data()
      if (!allRecs[data.patientId]) allRecs[data.patientId] = []
      allRecs[data.patientId].push(data)
    })

    const rows = patients.map(p => {
      const recs = (allRecs[p.id]||[]).sort((a,b)=>a.date.localeCompare(b.date))
      const first = recs[0]
      const last = recs[recs.length-1]
      const admDate = p.admissionDate ? new Date(p.admissionDate) : null
      const disDate = p.dischargeDate ? new Date(p.dischargeDate) : new Date()
      const los = admDate ? Math.ceil((disDate-admDate)/(86400000)) : ''
      const daysLv4 = recs.filter(r=>r.level===4).length
      const mmrcCount = arr => Array.isArray(arr) ? arr.filter(Boolean).length : 0
      return {
        'HN Number': p.hn,
        'Gender': p.gender,
        'Specialty': p.specialty,
        'Admission Date': p.admissionDate,
        'Discharge Date': p.dischargeDate||'',
        'Length of Stay (days)': los,
        'Initial Level': first?.level||'',
        'Initial IMS': first?.ims??'',
        'Initial MMRC': first ? mmrcCount(first.mmrc) : '',
        'Final Level': last?.level||'',
        'Final IMS': last?.ims??'',
        'Final MMRC': last ? mmrcCount(last.mmrc) : '',
        'Best Exercise': last?.exercise||'',
        'Days of Level 4': daysLv4
      }
    })

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'ICU Report')
    XLSX.writeFile(wb, 'icu-report.xlsx')
    setLoading(false)
  }

  return (
    <div style={{display:'flex',alignItems:'center',gap:'10px',flexWrap:'wrap',padding:'8px 0'}}>
      <div className="filter-buttons">
        {['all','active','discharged'].map(f=>(
          <button key={f} className={`filter-btn${filter===f?' active':''}`} onClick={()=>setFilter(f)}>
            {f==='all'?'全部':f==='active'?'在院':'已出院'}
          </button>
        ))}
      </div>
      <button className="btn btn-success" onClick={handleExport} disabled={loading}>
        {loading?'產生中...':'📊 匯出 Excel'}
      </button>
    </div>
  )
}
