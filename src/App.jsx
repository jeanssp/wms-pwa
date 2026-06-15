import { useEffect, useState } from 'react';
import { db, initMocks } from './db';

function App() {
  const [manager, setManager] = useState(localStorage.getItem('selectedManager'));
  const [market, setMarket] = useState(localStorage.getItem('selectedMarket'));
  
  // 'list' (Артикулы) -> 'sku_list' (Размеры) -> 'warehouse_list' (Склады)
  const [view, setView] = useState('list'); 
  
  const [entities, setEntities] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [selectedArticul, setSelectedArticul] = useState(null);
  const [selectedSku, setSelectedSku] = useState(null); // Хранит выбранный {size, length}

  useEffect(() => {
    const load = async () => {
      await initMocks();
      setEntities(await db.entities.toArray());
      setStocks(await db.stocks.toArray());
    };
    load();
  }, []);

  const saveSettings = (mng, mrk) => {
    localStorage.setItem('selectedManager', mng);
    localStorage.setItem('selectedMarket', mrk);
    setManager(mng);
    setMarket(mrk);
  };

  const warehouses = entities.filter(e => e.roleid === 5);
  const articulList = [...new Set(stocks.map(s => s.articulstore))];

  // Вход
  if (!manager || !market) {
    return (
      <div style={{ padding: '20px' }}>
        <h3>Вход в систему</h3>
        <select onChange={(e) => setManager(e.target.value)} style={selectStyle}>
          <option value="">-- Управляющий --</option>
          {entities.filter(e => e.roleid === 7).map(m => <option key={m.id} value={m.note}>{m.note}</option>)}
        </select>
        <select onChange={(e) => setMarket(e.target.value)} style={selectStyle}>
          <option value="">-- Маркетплейс --</option>
          <option value="Wildberries">Wildberries</option>
          <option value="Ozon">Ozon</option>
        </select>
        <button onClick={() => saveSettings(manager, market)} style={mainBtnStyle}>ВОЙТИ</button>
      </div>
    );
  }

  // --- ЛОГИКА ---
  
  // 1. Кнопка "РАСХОД" в шапке (открывает список размеров)
  const openExpense = () => {
    if (!selectedArticul) return alert("Сначала выделите артикул из списка!");
    setView('sku_list');
  };

  // 2. Группируем уникальные размеры (SKU) для выбранного артикула
  const currentArticulStocks = stocks.filter(s => s.articulstore === selectedArticul);
  const uniqueSkus = [];
  const skuSet = new Set();
  
  currentArticulStocks.forEach(item => {
    const key = `${item.size}_${item.length}`;
    if (!skuSet.has(key)) {
      skuSet.add(key);
      uniqueSkus.push({ size: item.size, length: item.length });
    }
  });

  // 3. Отправка товара со склада
  const handleSend = async (item) => {
    if (item.qty <= 0) return alert("Нет в наличии!");
    
    await db.stocks.update(item.id, { qty: item.qty - 1 });
    await db.sync_queue.add({
      type: 'SEND_TO_MARKET',
      sku: `${item.articulstore}_${item.size}_${item.length}`,
      from_wh: item.objectid,
      timestamp: new Date().toISOString()
    });
    setStocks(await db.stocks.toArray());
    alert("Товар отправлен!");
  };

  // --- ИНТЕРФЕЙС ---
  return (
    <div style={{ fontFamily: 'Arial, sans-serif' }}>
      
      {/* ШАПКА */}
      <div style={headerStyle}>
        <div style={{ marginBottom: '10px' }}>{manager} | {market}</div>
        <div style={{ display: 'flex', gap: '5px' }}>
          <button onClick={() => setView('list')} style={navBtnStyle}>СПИСОК</button>
          <button onClick={openExpense} style={{ ...navBtnStyle, background: '#e67e22' }}>РАСХОД</button>
          <button style={{ ...navBtnStyle, background: '#27ae60' }}>ПРИХОД</button>
          <button onClick={() => { localStorage.clear(); window.location.reload(); }} style={exitBtnStyle}>ВЫХОД</button>
        </div>
      </div>

      <div style={{ padding: '15px' }}>
        
        {/* ЭКРАН 1: Список Артикулов */}
        {view === 'list' && (
          <div>
            <h4>Выберите артикул:</h4>
            {articulList.map(art => (
              <div 
                key={art} 
                onClick={() => setSelectedArticul(art)} 
                style={{ ...cardStyle, backgroundColor: selectedArticul === art ? '#d1ecf1' : 'white', borderColor: selectedArticul === art ? '#0c5460' : '#eee' }}
              >
                {art} {selectedArticul === art && <span style={{ float: 'right' }}>✅</span>}
              </div>
            ))}
          </div>
        )}

        {/* ЭКРАН 2: Список Размеров (SKU) */}
        {view === 'sku_list' && (
          <div>
            <button onClick={() => setView('list')} style={backBtnStyle}>← Назад к артикулам</button>
            <h4>Размеры для: {selectedArticul}</h4>
            
            {uniqueSkus.map(sku => {
              const skuName = `${selectedArticul}_${sku.size}_${sku.length}`;
              return (
                <div 
                  key={skuName} 
                  onClick={() => { setSelectedSku(sku); setView('warehouse_list'); }} 
                  style={{...cardStyle, background: '#f8f9fa'}}
                >
                  <b>{skuName}</b>
                  <span style={{ float: 'right', color: '#3498db' }}>Выбрать склад →</span>
                </div>
              );
            })}
          </div>
        )}

        {/* ЭКРАН 3: Список Складов для конкретного размера */}
        {view === 'warehouse_list' && (
          <div>
            <button onClick={() => setView('sku_list')} style={backBtnStyle}>← Назад к размерам</button>
            <div style={{ padding: '10px', background: '#34495e', color: 'white', borderRadius: '5px', marginBottom: '15px' }}>
              <b>SKU:</b> {selectedArticul}_{selectedSku.size}_{selectedSku.length}
            </div>
            
            {stocks
              .filter(s => s.articulstore === selectedArticul && s.size === selectedSku.size && s.length === selectedSku.length)
              .map(item => (
                <div key={item.id} style={skuCardStyle}>
                  <div style={{ color: '#7f8c8d', fontSize: '14px' }}>Склад:</div>
                  <div style={{ fontWeight: 'bold', fontSize: '18px', marginBottom: '10px' }}>
                    {warehouses.find(w => w.id === item.objectid)?.note || `Склад №${item.objectid}`}
                  </div>
                  <div style={{ fontSize: '18px', margin: '10px 0' }}>
                    Доступно: <b style={{ color: '#27ae60' }}>{item.qty} шт.</b>
                  </div>
                  <button onClick={() => handleSend(item)} style={actionBtnStyle}>
                    СПИСАТЬ НА {market.toUpperCase()}
                  </button>
                </div>
              ))
            }
          </div>
        )}
        
      </div>
    </div>
  );
}

// Стили
const headerStyle = { background: '#2c3e50', color: 'white', padding: '15px', position: 'sticky', top: 0 };
const navBtnStyle = { padding: '10px', border: 'none', borderRadius: '4px', cursor: 'pointer', color: 'white', fontWeight: 'bold', flex: 1 };
const exitBtnStyle = { padding: '10px', background: 'none', border: '1px solid white', color: 'white', borderRadius: '4px' };
const cardStyle = { padding: '15px', border: '2px solid #eee', marginBottom: '10px', borderRadius: '8px', cursor: 'pointer' };
const skuCardStyle = { border: '1px solid #ddd', padding: '15px', marginBottom: '15px', borderRadius: '8px', background: 'white', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' };
const actionBtnStyle = { width: '100%', padding: '12px', background: '#3498db', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' };
const selectStyle = { width: '100%', padding: '10px', marginBottom: '10px' };
const mainBtnStyle = { width: '100%', padding: '12px', background: '#2ecc71', color: 'white', border: 'none', borderRadius: '5px' };
const backBtnStyle = { marginBottom: '15px', padding: '8px 15px', border: '1px solid #ccc', borderRadius: '5px', background: 'white', cursor: 'pointer' };

export default App;