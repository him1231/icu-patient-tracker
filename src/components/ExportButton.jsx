import { useState } from 'react'
import { getDocs, collection } from 'firebase/firestore'
import { db } from '../firebase'
import * as XLSX from 'xlsx'

const thisMonth = new Date().toISOString().slice(0, 7) // YYYY-MM

export default function ExportButton() {
  const [filter, setFilter] = useState('all')
  const [monthlyMonth, setMonthlyMonth] = useState(thisMonth)
  const [loading, setLoading] = useState(false)
  const [monthlyLoading, setMonthlyLoading] = useState(false)

  // ── Patient Report ──────────────────────────────────────────
  const handleExport = async () => {
    setLoading(true)
    try {
      const pSnap = await getDocs(collection(db, 'patients'))
      let patients = pSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      if (filter === 'active') patients = patients.filter(p => p.active)
      if (filter === 'discharged') patients = patients.filter(p => !p.active)

      const rSnap = await getDocs(collection(db, 'dailyRecords'))
      const allRecs = {}
      rSnap.forEach(d => {
        const data = d.data()
        if (!allRecs[data.patientId]) allRecs[data.patientId] = []
        allRecs[data.patientId].push(data)
      })

      const mmrcCount = arr => Array.isArray(arr) ? arr.filter(Boolean).length : 0

      const rows = patients.map(p => {
        const recs = (allRecs[p.id] || []).sort((a, b) => a.date.localeCompare(b.date))
        const first = recs[0]
        const last = recs[recs.length - 1]
        const admDate = p.admissionDate ? new Date(p.admissionDate) : null
        const disDate = p.dischargeDate ? new Date(p.dischargeDate) : new Date()
        const los = admDate ? Math.ceil((disDate - admDate) / 86400000) : ''
        return {
          'HN Number': p.hn,
          'Gender': p.gender,
          'Specialty': p.specialty,
          'Admission Date': p.admissionDate,
          'Discharge Date': p.dischargeDate || '',
          'Length of Stay (days)': los,
          'Initial Level': first?.level || '',
          'Initial IMS': first?.ims ?? '',
          'Initial MMRC': first ? mmrcCount(first.mmrc) : '',
          'Final Level': last?.level || '',
          'Final IMS': last?.ims ?? '',
          'Final MMRC': last ? mmrcCount(last.mmrc) : '',
          'Best Exercise': last?.exercise || '',
          'Days of Level 4': recs.filter(r => r.level === 4).length
        }
      })

      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Patient Report')
      XLSX.writeFile(wb, 'icu-report.xlsx')
    } catch (err) {
      alert('匯出失敗: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Monthly Stats ───────────────────────────────────────────
  const handleMonthlyExport = async () => {
    setMonthlyLoading(true)
    try {
      // fetch all daily records for the selected month
      const rSnap = await getDocs(collection(db, 'dailyRecords'))
      const monthRecs = []
      rSnap.forEach(d => {
        const data = d.data()
        if (data.date && data.date.startsWith(monthlyMonth)) {
          monthRecs.push(data)
        }
      })

      // ── Level Stats ──
      const levelStats = {} // { level: { cases: Set<patientId>, sessions: count } }
      for (let l = 1; l <= 4; l++) levelStats[l] = { cases: new Set(), sessions: 0 }

      // ── Exercise Stats ──
      const exerciseStats = {} // { label: { cases: Set<patientId>, sessions: count } }

      for (const rec of monthRecs) {
        const lvl = rec.level
        if (lvl >= 1 && lvl <= 4) {
          levelStats[lvl].cases.add(rec.patientId)
          levelStats[lvl].sessions++
        }
        const ex = rec.exercise
        if (ex && ex.trim()) {
          if (!exerciseStats[ex]) exerciseStats[ex] = { cases: new Set(), sessions: 0 }
          exerciseStats[ex].cases.add(rec.patientId)
          exerciseStats[ex].sessions++
        }
      }

      // Build Level rows
      const levelRows = [1, 2, 3, 4].map(l => ({
        'Category': 'Level',
        'Item': `Level ${l}`,
        'Cases (unique patients)': levelStats[l].cases.size,
        'Sessions (record days)': levelStats[l].sessions
      }))

      // Build Exercise rows
      const exerciseRows = Object.entries(exerciseStats)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([ex, stat]) => ({
          'Category': 'Exercise',
          'Item': ex,
          'Cases (unique patients)': stat.cases.size,
          'Sessions (record days)': stat.sessions
        }))

      const allRows = [...levelRows, { Category: '', Item: '', 'Cases (unique patients)': '', 'Sessions (record days)': '' }, ...exerciseRows]

      const ws = XLSX.utils.json_to_sheet(allRows)
      // Set column widths
      ws['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 24 }, { wch: 22 }]

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, `${monthlyMonth} Stats`)
      XLSX.writeFile(wb, `icu-monthly-${monthlyMonth}.xlsx`)
    } catch (err) {
      alert('匯出失敗: ' + err.message)
    } finally {
      setMonthlyLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '8px 0' }}>
      {/* Patient Report row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <div className="filter-buttons">
          {['all', 'active', 'discharged'].map(f => (
            <button key={f} className={`filter-btn${filter === f ? ' active' : ''}`} onClick={() => setFilter(f)}>
              {f === 'all' ? '全部' : f === 'active' ? '在院' : '已出院'}
            </button>
          ))}
        </div>
        <button className="btn btn-success" onClick={handleExport} disabled={loading}>
          {loading ? '產生中...' : '📊 匯出病人報告'}
        </button>
      </div>

      {/* Monthly Stats row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <input
          type="month"
          value={monthlyMonth}
          onChange={e => setMonthlyMonth(e.target.value)}
          style={{ padding: '6px 10px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.88rem' }}
        />
        <button className="btn btn-success" onClick={handleMonthlyExport} disabled={monthlyLoading}
          style={{ background: '#6b46c1' }}>
          {monthlyLoading ? '產生中...' : '📅 匯出月統計'}
        </button>
      </div>
    </div>
  )
}
