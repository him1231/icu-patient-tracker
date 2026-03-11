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
  const [patients, setPatients] = useState({})
  const [todayRecords, setTodayRecords] = useState({})
  const [loading, setLoading] = useState(true)
  const [selectedBed, setSelectedBed] = useState(null)
  const [admitBed, setAdmitBed] = useState(null)
  const [transferMode, setTransferMode] = useState(false)
  const [transferSource, setTransferSource] = useState(null) // { bedNum, patient }

  const loadData = async () => {
    setLoading(true)
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
      alert('Failed to load data. Check network or Firebase config: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const handleBedClick = async (bedNum) => {
    const patient = patients[bedNum]

    // Transfer mode: pick destination
    if (transferMode && transferSource) {
      if (bedNum === transferSource.bedNum) {
        // clicked same bed — cancel
        setTransferMode(false)
        setTransferSource(null)
        return
      }
      if (patient) {
        alert(`Bed ${bedNum} is occupied. Please select an empty bed.`)
        return
      }
      // Do the transfer
      try {
        await setDoc(doc(db, 'patients', transferSource.patient.id), {
          ...transferSource.patient,
          bedNumber: bedNum
        })
        alert(`${transferSource.patient.hn} transferred from Bed ${transferSource.bedNum} to Bed ${bedNum}.`)
      } catch (err) {
        alert('Transfer failed: ' + err.message)
      }
      setTransferMode(false)
      setTransferSource(null)
      loadData()
      return
    }

    if (patient) setSelectedBed({ bedNum, patient })
    else setAdmitBed(bedNum)
  }

  const startTransfer = (bedNum, patient) => {
    setTransferMode(true)
    setTransferSource({ bedNum, patient })
  }

  const cancelTransfer = () => {
    setTransferMode(false)
    setTransferSource(null)
  }

  return (
    <div>
      <div className="export-section">
        <ExportButton />
      </div>
      {transferMode && (
        <div className="transfer-banner">
          🔄 Transferring <strong>{transferSource.patient.hn}</strong> from Bed {transferSource.bedNum} — select an empty bed as destination
          <button className="btn btn-secondary" style={{marginLeft:'12px',padding:'4px 12px',fontSize:'0.82rem'}} onClick={cancelTransfer}>Cancel</button>
        </div>
      )}
      {loading ? <div className="loading">Loading...</div> : (
        <div className="bed-grid">
          {Array.from({length:32},(_,i)=>i+1).map(n => (
            <BedCard
              key={n}
              bedNumber={n}
              patient={patients[n] || null}
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
          onClose={(changed) => { setSelectedBed(null); if (changed) loadData() }}
          onTransfer={() => {
            setSelectedBed(null)
            startTransfer(selectedBed.bedNum, selectedBed.patient)
          }}
        />
      )}
      {admitBed && !transferMode && (
        <AdmitModal
          bedNum={admitBed}
          onClose={(changed) => { setAdmitBed(null); if (changed) loadData() }}
        />
      )}
    </div>
  )
}
