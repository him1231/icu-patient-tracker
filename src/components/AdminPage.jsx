import { useState, useEffect } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'

function ConfigSection({ title, configKey, fieldKey }) {
  const [items, setItems] = useState([])
  const [newLabel, setNewLabel] = useState('')
  const [editId, setEditId] = useState(null)
  const [editLabel, setEditLabel] = useState('')

  useEffect(() => {
    getDoc(doc(db, 'config', configKey)).then(s => {
      if (s.exists()) setItems(s.data()[fieldKey]||[])
    })
  }, [])

  const save = async (newItems) => {
    await setDoc(doc(db, 'config', configKey), { [fieldKey]: newItems })
    setItems(newItems)
  }

  const addItem = async () => {
    if (!newLabel.trim()) return
    const id = `item_${Date.now()}`
    await save([...items, { id, label: newLabel.trim() }])
    setNewLabel('')
  }

  const deleteItem = (id) => save(items.filter(i=>i.id!==id))

  const saveEdit = (id) => {
    save(items.map(i=>i.id===id?{...i,label:editLabel}:i))
    setEditId(null)
  }

  return (
    <div className="admin-section">
      <h3>{title}</h3>
      <ul className="item-list">
        {items.map(item=>(
          <li key={item.id}>
            {editId===item.id ? (
              <>
                <input value={editLabel} onChange={e=>setEditLabel(e.target.value)} style={{flex:1,padding:'4px 8px',border:'1px solid #ccc',borderRadius:'4px'}} />
                <div className="item-actions">
                  <button className="btn-edit" onClick={()=>saveEdit(item.id)}>儲存</button>
                  <button className="btn-delete" onClick={()=>setEditId(null)}>取消</button>
                </div>
              </>
            ) : (
              <>
                <span>{item.label}</span>
                <div className="item-actions">
                  <button className="btn-edit" onClick={()=>{setEditId(item.id);setEditLabel(item.label)}}>編輯</button>
                  <button className="btn-delete" onClick={()=>deleteItem(item.id)}>刪除</button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="add-item-form">
        <input value={newLabel} onChange={e=>setNewLabel(e.target.value)} placeholder="新增項目..." onKeyDown={e=>e.key==='Enter'&&addItem()} />
        <button className="btn btn-primary" onClick={addItem} style={{whiteSpace:'nowrap'}}>+ 新增</button>
      </div>
    </div>
  )
}

export default function AdminPage() {
  return (
    <div>
      <ConfigSection title="MMRC Items" configKey="mmrcItems" fieldKey="items" />
      <ConfigSection title="Exercise Options" configKey="exerciseOptions" fieldKey="options" />
      <ConfigSection title="Specialty" configKey="specialtyOptions" fieldKey="options" />
    </div>
  )
}
