import { useState, useEffect, useRef } from 'react'
import { collection, getDocs, doc, getDoc, setDoc, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import BedCard from './BedCard'
import PatientModal from './PatientModal'
import AdmitModal from './AdmitModal'
import ExportButton from './ExportButton'

const TODAY = new Date().toISOString().split('T')[0]
const POLL_INTERVAL = 30000 // 30 seconds

async function ensureDefaultConfig() {
  const defaults = [
    { key: 'mmrcItems',       field: 'items',   data: Array.from({length:12},(_,i)=>({id:`item${i+1}`,label:`Item ${i+1}`})) },
    { key: 'exerciseOptions', field: 'options', data: Array.from({length:5},(_,i)=>({id:`opt${i+1}`,label:`Option ${i+1}`})) },
    { key: 'specialtyOptions',field: 'options', data: [{id:'ortho',label:'Ortho'},{id:'neuro',label:'Neuro'},{id:'cardio',label:'Cardio'},{id:'resp',label:'Respiratory'},{id:'gen',label:'General'}] },
    { key: 'diagnosisOptions', field: 'options', data: [{id:'dx1',label:'Fracture'},{id:'dx2',label:'Stroke'},{id:'dx3',label:'Post-op'},{id:'dx4',label:'Pneumonia'},{id:'__other__',label:'Other',isOther:true}] },
  ]
  await Promise.all(defaults.map(async ({ key, field, data }) => {
    const ref = doc(db, 'config', key)
    const snap = await getDoc(ref)
    if (!snap.exists()) await setDoc(ref, { [field]: data })
  }))
}

async function bumpLastEdit() {
  await setDoc(doc(db, 'meta', 'lastEdit'), { updatedAt: Date.now() })
}

export default function Dashboard() {
  const [patients, setPatients] = useState({})
  const [todayRecords, setTodayRecords] = useState({})
  const [loading, setLoading] = useState(true)
  const [selectedBed, setSelectedBed] = useState(null)
  const [admitBed, setAdmitBed] = useState(null)
  const [transferMode, setTransferMode] = useState(false)
  const [transferSource, setTransferSource] = useState(null)
  const lastEditRef = useRef(null)

  const loadData = async (showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      await ensureDefaultConfig()
      const q = query(collection(db, 'patients'), where('active', '==', true))
      const snap = await getDocs(q)
      const pts = {}
      snap.forEach(d => { pts[d.data().bedNumber] = { id: d.id, ...d.data() } })
      setPatients(pts)
      const recSnap = await getDocs(collection(db, 'dailyRecords'))
      const recs = {}
      recSnap.forEach(d => {
        const data = d.data()
        if (data.date === TODAY) recs[data.patientId] = data
      })
      setTodayRecords(recs)
    } catch (err) {
      console.error('Load failed:', err)
      if (showLoading) alert('Failed to load data: ' + err.message)
    } finally {
      if (showLoading) setLoading(false)
    }
  }

  // Poll for remote changes every 30s
  useEffect(() => {
    loadData(true)
    const interval = setInterval(async () => {
      try {
        const snap = await getDoc(doc(db, 'meta', 'lastEdit'))
        if (snap.exists()) {
          const remote = snap.data().updatedAt
          if (lastEditRef.current !== null && remote > lastEditRef.current) {
            loadData(false) // silent reload — no loading spinner
          }
          lastEditRef.current = remote
        }
      } catch { /* silent */ }
    }, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [])

  const handleBedClick = async (bedNum) => {
    const patient = patients[bedNum]
    if (transferMode && transferSource) {
      if (bedNum === transferSource.bedNum) { setTransferMode(false); setTransferSource(null); return }
      if (patient) { alert(`Bed ${bedNum} is occupied. Please select an empty bed.`); return }
      try {
        await setDoc(doc(db, 'patients', transferSource.patient.id), { ...transferSource.patient, bedNumber: bedNum })
        await bumpLastEdit()
        alert(`${transferSource.patient.hn} transferred from Bed ${transferSource.bedNum} to Bed ${bedNum}.`)
      } catch (err) { alert('Transfer failed: ' + err.message) }
      setTransferMode(false); setTransferSource(null)
      loadData(true)
      return
    }
    if (patient) setSelectedBed({ bedNum, patient })
    else setAdmitBed(bedNum)
  }

  const startTransfer = (bedNum, patient) => { setTransferMode(true); setTransferSource({ bedNum, patient }) }
  const cancelTransfer = () => { setTransferMode(false); setTransferSource(null) }

  return (
    <div>
      <div className="export-section"><ExportButton /></div>
      {transferMode && (
        <div className="transfer-banner">
          🔄 Transferring <strong>{transferSource.patient.hn}</strong> from Bed {transferSource.bedNum} — select an empty bed
          <button className="btn btn-secondary" style={{marginLeft:'12px',padding:'4px 12px',fontSize:'0.82rem'}} onClick={cancelTransfer}>Cancel</button>
        </div>
      )}
      {loading ? <div className="loading">Loading...</div> : (
        <div className="bed-grid">
          {Array.from({length:32},(_,i)=>i+1).map(n => (
            <BedCard key={n} bedNumber={n} patient={patients[n]||null}
              todayRecord={patients[n] ? todayRecords[patients[n].id] : null}
              onClick={() => handleBedClick(n)}
              transferMode={transferMode}
              isTransferSource={transferSource?.bedNum === n}
              onTransfer={patients[n] ? () => startTransfer(n, patients[n]) : null}
            />
          ))}
        </div>
      )}
      {selectedBed && !transferMode && (
        <PatientModal
          bedNum={selectedBed.bedNum}
          patient={selectedBed.patient}
          todayRecord={todayRecords[selectedBed.patient.id]}
          onClose={(changed) => { setSelectedBed(null); if (changed) { bumpLastEdit(); loadData(true) } }}
          onTransfer={() => { setSelectedBed(null); startTransfer(selectedBed.bedNum, selectedBed.patient) }}
        />
      )}
      {admitBed && !transferMode && (
        <AdmitModal
          bedNum={admitBed}
          onClose={(changed) => { setAdmitBed(null); if (changed) { bumpLastEdit(); loadData(true) } }}
        />
      )}
    </div>
  )
}
