import { useState, useEffect } from 'react'
import { collection, getDocs, doc, getDoc, setDoc, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import BedCard from './BedCard'
import PatientModal from './PatientModal'
import AdmitModal from './AdmitModal'
import ExportButton from './ExportButton'

const TODAY = new Date().toISOString().split('T')[0]

async function ensureDefaultConfig() {
  const mmrcRef = doc(db, 'config', 'mmrcItems')
  const mmrcSnap = await getDoc(mmrcRef)
  if (!mmrcSnap.exists()) {
    await setDoc(mmrcRef, { items: Array.from({length:12},(_,i)=>({id:`item${i+1}`,label:`Item ${i+1}`})) })
  }
  const exRef = doc(db, 'config', 'exerciseOptions')
  const exSnap = await getDoc(exRef)
  if (!exSnap.exists()) {
    await setDoc(exRef, { options: Array.from({length:5},(_,i)=>({id:`opt${i+1}`,label:`Option ${i+1}`})) })
  }
  const spRef = doc(db, 'config', 'specialtyOptions')
  const spSnap = await getDoc(spRef)
  if (!spSnap.exists()) {
    await setDoc(spRef, { options: [{id:'ortho',label:'Ortho'},{id:'neuro',label:'Neuro'},{id:'cardio',label:'Cardio'},{id:'resp',label:'Respiratory'},{id:'gen',label:'General'}] })
  }
}

export default function Dashboard() {
  const [patients, setPatients] = useState([])
  const [todayRecords, setTodayRecords] = useState({})
  const [loading, setLoading] = useState(true)
  const [selectedBed, setSelectedBed] = useState(null)
  const [admitBed, setAdmitBed] = useState(null)

  const loadData = async () => {
    setLoading(true)
    try {
      await ensureDefaultConfig()
      const q = query(collection(db, 'patients'), where('active', '==', true))
      const snap = await getDocs(q)
      const pts = {}
      snap.forEach(d => { pts[d.data().bedNumber] = { id: d.id, ...d.data() } })
      setPatients(pts)
      // load today's records
      const recSnap = await getDocs(collection(db, 'dailyRecords'))
      const recs = {}
      recSnap.forEach(d => {
        const data = d.data()
        if (data.date === TODAY) recs[data.patientId] = data
      })
      setTodayRecords(recs)
    } catch (err) {
      console.error('載入失敗:', err)
      alert('載入失敗，請檢查網絡或 Firebase 設定：' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const handleBedClick = (bedNum) => {
    const patient = patients[bedNum]
    if (patient) setSelectedBed({ bedNum, patient })
    else setAdmitBed(bedNum)
  }

  return (
    <div>
      <div className="export-section">
        <ExportButton />
      </div>
      {loading ? <div className="loading">載入中...</div> : (
        <div className="bed-grid">
          {Array.from({length:32},(_,i)=>i+1).map(n => (
            <BedCard
              key={n}
              bedNumber={n}
              patient={patients[n] || null}
              todayRecord={patients[n] ? todayRecords[patients[n].id] : null}
              onClick={() => handleBedClick(n)}
            />
          ))}
        </div>
      )}
      {selectedBed && (
        <PatientModal
          bedNum={selectedBed.bedNum}
          patient={selectedBed.patient}
          todayRecord={todayRecords[selectedBed.patient.id]}
          onClose={() => { setSelectedBed(null); loadData() }}
        />
      )}
      {admitBed && (
        <AdmitModal
          bedNum={admitBed}
          onClose={() => { setAdmitBed(null); loadData() }}
        />
      )}
    </div>
  )
}
