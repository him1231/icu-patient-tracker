export default function BedCard({ bedNumber, patient, todayRecord, onClick, transferMode, isTransferSource, onTransfer }) {
  let cls = 'bed-card '
  if (isTransferSource) cls += 'transfer-source'
  else if (transferMode && !patient) cls += 'transfer-target'
  else if (patient) cls += 'occupied'
  else cls += 'empty'

  return (
    <div className={cls} onClick={onClick}>
      <div className="bed-number">Bed {bedNumber}</div>
      {patient ? (
        <>
          <div className="bed-hn">{patient.hn}</div>
          {todayRecord && <div className="bed-level">Lv {todayRecord.level}</div>}
          {!transferMode && onTransfer && (
            <div className="bed-transfer-btn" onClick={e => { e.stopPropagation(); onTransfer() }}>⇄</div>
          )}
        </>
      ) : (
        <div className="bed-empty-text">{transferMode ? 'Move here' : 'Empty'}</div>
      )}
    </div>
  )
}
