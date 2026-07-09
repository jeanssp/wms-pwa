import { useEffect, useState, useMemo } from 'react'; // ИЗМЕНЕНО: добавлен useMemo
import { db } from './db';
import { wmsApi } from './api';

function App() {
  const [manager, setManager] = useState(localStorage.getItem('selectedManager'));
  const [market, setMarket] = useState(localStorage.getItem('selectedMarket'));
  const [view, setView] = useState('list'); 
  const [entities, setEntities] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [selectedArticul, setSelectedArticul] = useState(null);
  const [selectedSku, setSelectedSku] = useState(null);
  
  // НОВОЕ: Состояния для поиска и фильтров
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [enabledWarehouses, setEnabledWarehouses] = useState(
    JSON.parse(localStorage.getItem('wms_enabled_warehouses')) || []
  );

  const performSync = async () => {
    setIsSyncing(true);
    try {
      const queue = await db.sync_queue.toArray();
      if (queue.length > 0 && navigator.onLine) {
        await wmsApi.syncUp(queue);
        await db.sync_queue.clear();
      }
      if (navigator.onLine) {
        const data = await wmsApi.syncDown();
        if (data.success) {
          await db.transaction('rw', db.stocks, db.entities, async () => {
            await db.stocks.clear();
            await db.entities.clear();
            await db.stocks.bulkAdd(data.stocks);
            await db.entities.bulkAdd(data.entities);
          });
        }
      }
    } catch (err) { console.error('Sync error:', err); }
    finally {
      setEntities(await db.entities.toArray());
      setStocks(await db.stocks.toArray());
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => performSync(), 100);
    return () => clearTimeout(timer);
  }, []);

  // НОВОЕ: Логика фильтрации (Оптимизировано через useMemo)
  const filteredStocks = useMemo(() => {
    const isSearchActive = searchQuery.length >= 4;
    const query = searchQuery.toLowerCase();

    return stocks.filter(item => {
      if (isSearchActive) {
        return (
          item.articulstore?.toLowerCase().includes(query) ||
          item.barcodes_str?.toLowerCase().includes(query) ||
          item.aliases_str?.toLowerCase().includes(query)
        );
      }
      return enabledWarehouses.includes(Number(item.objectid));
    });
  }, [stocks, searchQuery, enabledWarehouses]);

  // НОВОЕ: Список артикулов для первого экрана
  const articulList = useMemo(() => {
    return [...new Set(filteredStocks.map(s => s.articulstore))];
  }, [filteredStocks]);

  const toggleWarehouse = (id) => {
    const newSelection = enabledWarehouses.includes(id)
      ? enabledWarehouses.filter(wId => wId !== id)
      : [...enabledWarehouses, id];
    setEnabledWarehouses(newSelection);
    localStorage.setItem('wms_enabled_warehouses', JSON.stringify(newSelection));
  };

  const saveSettings = (mng, mrk) => {
    localStorage.setItem('selectedManager', mng);
    localStorage.setItem('selectedMarket', mrk);
    setManager(mng);
    setMarket(mrk);
  };

  const handleSend = async (item) => {
    if (item.qty <= 0) return alert("Нет в наличии!");
    const selectedManagerObj = entities.find(e => e.note === manager && Number(e.roleid) === 7);
    if (!selectedManagerObj) return alert("Ошибка: не выбран реализатор");

    await db.stocks.update(item.id, { qty: item.qty - 1 });
    await db.sync_queue.add({
      type: 'SEND_TO_MARKET',
      goodid: Number(item.goodid),
      from_wh: Number(item.objectid),
      manager_id: Number(selectedManagerObj.id),
      marketplace: market,
      timestamp: new Date().toISOString()
    });
    setStocks(await db.stocks.toArray());
    performSync(); 
  };

  if (!manager || !market) {
    return (
      <div style={{ padding: '20px' }}>
        <h3>Вход в систему WMS</h3>
        {isSyncing ? <p>⏳ Загрузка данных...</p> : (
          <>
            <select onChange={(e) => setManager(e.target.value)} style={selectStyle}>
              <option value="">-- Управляющий --</option>
              {entities.filter(e => Number(e.roleid) === 7).map(m => <option key={m.id} value={m.note}>{m.note}</option>)}
            </select>
            <select onChange={(e) => setMarket(e.target.value)} style={selectStyle}>
              <option value="">-- Маркетплейс --</option>
              <option value="Wildberries">Wildberries</option>
              <option value="Ozon">Ozon</option>
            </select>
            <button onClick={() => saveSettings(manager, market)} style={mainBtnStyle}>ВОЙТИ</button>
          </>
        )}
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif' }}>
      {/* ШАПКА */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div>{manager} | {market}</div>
          <div style={{ fontSize: '12px', color: isSyncing ? '#f39c12' : '#2ecc71' }}>
            {isSyncing ? '⏳ Синхронизация...' : '✅ Обновлено'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '5px' }}>
          <button onClick={() => {setView('list'); setSearchQuery('')}} style={navBtnStyle}>СПИСОК</button>
          <button onClick={() => selectedArticul ? setView('sku_list') : alert("Сначала выберите товар")} style={{ ...navBtnStyle, background: '#e67e22' }}>РАСХОД</button>
          <button style={{ ...navBtnStyle, background: '#27ae60' }}>ПРИХОД</button>
          <button onClick={() => { localStorage.clear(); window.location.reload(); }} style={exitBtnStyle}>ВЫХОД</button>
        </div>
      </div>

      {/* ФИЛЬТРЫ И ПОИСК */}
      {view === 'list' && (
        <div style={filterPanelStyle}>
          <div style={{ position: 'relative', marginBottom: '15px' }}>
            <input 
              style={searchInputStyle}
              placeholder="🔍 Артикул, штрихкод или алиас (от 4 знаков)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && <button onClick={() => setSearchQuery('')} style={clearSearchBtnStyle}>✕</button>}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {entities.filter(e => Number(e.roleid) === 5).map(wh => (
              <label key={wh.id} style={whBadgeStyle}>
                <input 
                  type="checkbox" 
                  checked={enabledWarehouses.includes(Number(wh.id))}
                  onChange={() => toggleWarehouse(Number(wh.id))}
                /> {wh.note}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* КОНТЕНТ */}
      <div style={{ padding: '15px' }}>
        {view === 'list' && (
          <div>
            <h4>Товары ({articulList.length}):</h4>
            {articulList.map(art => (
              <div 
                key={art} 
                onClick={() => setSelectedArticul(art)} 
                title={stocks.find(s => s.articulstore === art)?.aliases_str} // Алиасы в подсказке
                style={{ ...cardStyle, backgroundColor: selectedArticul === art ? '#d1ecf1' : 'white', borderColor: selectedArticul === art ? '#0c5460' : '#eee' }}
              >
                {art} {selectedArticul === art && <span style={{ float: 'right' }}>✅</span>}
              </div>
            ))}
          </div>
        )}

        {view === 'sku_list' && (
          <div>
            <button onClick={() => setView('list')} style={backBtnStyle}>← Назад</button>
            <h4>Размеры для: {selectedArticul}</h4>
            {[...new Set(stocks.filter(s => s.articulstore === selectedArticul).map(s => `${s.size_name}_${s.length_id}`))].map(skuKey => (
                <div key={skuKey} onClick={() => { 
                  const [s, l] = skuKey.split('_');
                  setSelectedSku({size: s, length: l}); 
                  setView('warehouse_list'); 
                }} style={cardStyle}>
                  <b>{selectedArticul}_{skuKey}</b>
                  <span style={{ float: 'right', color: '#3498db' }}>Выбрать склад →</span>
                </div>
            ))}
          </div>
        )}

        {view === 'warehouse_list' && (
          <div>
            <button onClick={() => setView('sku_list')} style={backBtnStyle}>← Назад</button>
            <div style={infoBoxStyle}>SKU: {selectedArticul}_{selectedSku.size}_{selectedSku.length}</div>
            {stocks
              .filter(s => s.articulstore === selectedArticul && s.size_name === selectedSku.size && String(s.length_id) === String(selectedSku.length))
              .map(item => (
                <div key={`${item.goodid}-${item.objectid}`} style={skuCardStyle}>
                  <div style={{ color: '#7f8c8d', fontSize: '13px' }}>Склад: {entities.find(e => Number(e.id) === Number(item.objectid))?.note}</div>
                  <div style={{ fontSize: '18px', margin: '10px 0' }}>Наличие: <b>{item.qty} шт.</b></div>
                  <button onClick={() => handleSend(item)} style={actionBtnStyle}>ОТПРАВИТЬ НА {market.toUpperCase()}</button>
                </div>
              ))
            }
          </div>
        )}
      </div>
    </div>
  );
}

// СТИЛИ
const headerStyle = { background: '#2c3e50', color: 'white', padding: '15px', position: 'sticky', top: 0, zIndex: 10 };
const navBtnStyle = { padding: '10px', border: 'none', borderRadius: '4px', cursor: 'pointer', color: 'white', fontWeight: 'bold', flex: 1 };
const exitBtnStyle = { padding: '10px', background: 'none', border: '1px solid white', color: 'white', borderRadius: '4px' };
const cardStyle = { padding: '15px', border: '2px solid #eee', marginBottom: '10px', borderRadius: '8px', cursor: 'pointer', textAlign: 'left' };
const filterPanelStyle = { padding: '15px', background: '#f1f2f6', borderBottom: '1px solid #ddd' };
const searchInputStyle = { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ccc', boxSizing: 'border-box' };
const clearSearchBtnStyle = { position: 'absolute', right: '10px', top: '10px', border: 'none', background: 'none', fontSize: '20px', cursor: 'pointer', color: '#999' };
const whBadgeStyle = { fontSize: '12px', background: 'white', padding: '5px 10px', borderRadius: '5px', border: '1px solid #ddd', display: 'flex', alignItems: 'center', gap: '5px' };
const skuCardStyle = { border: '1px solid #ddd', padding: '15px', marginBottom: '15px', borderRadius: '8px', background: 'white', textAlign: 'left' };
const actionBtnStyle = { width: '100%', padding: '12px', background: '#3498db', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' };
const backBtnStyle = { marginBottom: '15px', padding: '8px 15px', border: '1px solid #ccc', borderRadius: '5px', background: 'white', color: '#2c3e50', cursor: 'pointer', fontWeight: 'bold' };
const infoBoxStyle = { padding: '10px', background: '#34495e', color: 'white', borderRadius: '5px', marginBottom: '15px', fontSize: '14px' };
const selectStyle = { width: '100%', padding: '10px', marginBottom: '10px' };
const mainBtnStyle = { width: '100%', padding: '12px', background: '#2ecc71', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold' };

export default App;