import { useEffect, useState } from 'react';
import { db, initMocks } from './db';

function App() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    // Эта функция запускается ОДИН раз при открытии приложения
    const loadData = async () => {
      await initMocks(); // Загружаем моки в базу
      const allStocks = await db.stocks.toArray(); // Берем всё из базы
      setItems(allStocks); // Сохраняем в память приложения
    };
    loadData();
  }, []);

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial' }}>
      <h1 style={{ color: '#2c3e50' }}>WMS Склад (Offline First)</h1>
      <p style={{ background: '#ecf0f1', padding: '10px' }}>
        <strong>Статус:</strong> Эти данные живут в твоем браузере (IndexedDB).
      </p>
      
      <div style={{ display: 'grid', gap: '15px' }}>
        {items.map(item => (
          <div key={item.id} style={{ 
            border: '2px solid #3498db', 
            padding: '15px', 
            borderRadius: '10px',
            boxShadow: '2px 2px 5px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ margin: '0 0 10px 0' }}>{item.articulstore}</h3>
            <div style={{ fontSize: '14px' }}>
              <span>Штрихкод: <b>{item.barcode}</b></span> | 
              <span> Склад: <b>№{item.objectid}</b></span>
            </div>
            <div style={{ marginTop: '10px', fontSize: '18px' }}>
              Остаток: <span style={{ color: '#e74c3c', fontWeight: 'bold' }}>{item.qty} шт.</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;