export default function BedCard({ bedNumber, patient, todayRecord, onClick }) {
  const cls = patient ? 'bed-card occupied' : 'bed-card empty'
  return (
    <div className={cls} onClick={onClick}>
      <div className="bed-number">床 {bedNumber}</div>
      {patient ? (
        <>
          <div className="bed-hn">{patient.hn}</div>
          {todayRecord && <div className="bed-level">Lv {todayRecord.level}</div>}
        </>
      ) : (
        <div className="bed-empty-text">空床</div>
      )}
    </div>
  )
}
