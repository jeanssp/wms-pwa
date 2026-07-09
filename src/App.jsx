import { useEffect, useState, useMemo } from 'react';
import { db } from './db';
import { wmsApi } from './api';

function App() {
  const [mode, setMode] = useState('EXPENSE'); 
  const [view, setView] = useState('list'); 
  
  const [entities, setEntities] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [selectedArticul, setSelectedArticul] = useState(null);
  const [selectedSku, setSelectedSku] = useState(null);
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [enabledWarehouses, setEnabledWarehouses] = useState(JSON.parse(localStorage.getItem('wms_enabled_warehouses')) || []);
  const [enabledRealizers, setEnabledRealizers] = useState(JSON.parse(localStorage.getItem('wms_enabled_realizers')) || []);

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

  const filteredStocks = useMemo(() => {
    const isSearchActive = searchQuery.length >= 4;
    const query = searchQuery.toLowerCase();

    return stocks.filter(item => {
      if (isSearchActive) {
        const matchesQuery = item.articulstore?.toLowerCase().includes(query) ||
                             item.barcodes_str?.toLowerCase().includes(query) ||
                             item.aliases_str?.toLowerCase().includes(query);
                             
        const isValidRole = mode === 'EXPENSE' 
          ? entities.find(e => Number(e.id) === Number(item.objectid))?.roleid === 5 
          : entities.find(e => Number(e.id) === Number(item.objectid))?.roleid === 7;
          
        return matchesQuery && isValidRole;
      }
      
      const currentFilter = mode === 'EXPENSE' ? enabledWarehouses : enabledRealizers;
      return currentFilter.includes(Number(item.objectid));
    });
  }, [stocks, searchQuery, enabledWarehouses, enabledRealizers, mode, entities]);

  const articulList = useMemo(() => [...new Set(filteredStocks.map(s => s.articulstore))], [filteredStocks]);

  const toggleFilter = (id) => {
    if (mode === 'EXPENSE') {
      const newSelection = enabledWarehouses.includes(id) ? enabledWarehouses.filter(wId => wId !== id) : [...enabledWarehouses, id];
      setEnabledWarehouses(newSelection);
      localStorage.setItem('wms_enabled_warehouses', JSON.stringify(newSelection));
    } else {
      const newSelection = enabledRealizers.includes(id) ? enabledRealizers.filter(rId => rId !== id) : [...enabledRealizers, id];
      setEnabledRealizers(newSelection);
      localStorage.setItem('wms_enabled_realizers', JSON.stringify(newSelection));
    }
  };

  const switchMode = (newMode) => {
    setMode(newMode);
    setView('list');
    setSearchQuery('');
    setSelectedArticul(null);
  };

  const handleTransfer = async (item, targetEntity) => {
    if (item.qty <= 0) return alert("Нет в наличии!");

    await db.stocks.update(item.id, { qty: item.qty - 1 });
    
    await db.sync_queue.add({
      type: mode === 'EXPENSE' ? 'SEND_TO_MARKET' : 'RETURN_FROM_MARKET',
      goodid: Number(item.goodid),
      from_wh: Number(item.objectid),
      to_wh: Number(targetEntity.id),
      marketplace: targetEntity.note, // Передаем имя цели как комментарий
      timestamp: new Date().toISOString()
    });
    
    setStocks(await db.stocks.toArray());
    setView('list');
    setSelectedArticul(null);
    performSync(); 
    alert("Операция выполнена!");
  };

  const targetEntities = mode === 'EXPENSE' 
    ? entities.filter(e => Number(e.roleid) === 7) 
    : entities.filter(e => Number(e.roleid) === 5);

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', maxWidth: '800px', margin: '0 auto' }}>
      <div style={headerStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ fontWeight: 'bold' }}>WMS Склад</div>
          <div style={{ fontSize: '12px', color: isSyncing ? '#f39c12' : '#2ecc71' }}>
            {isSyncing ? '⏳ Синхр...' : '✅ Обновлено'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '5px' }}>
          <button onClick={() => switchMode('EXPENSE')} style={{ ...navBtnStyle, background: mode === 'EXPENSE' ? '#e67e22' : '#95a5a6' }}>РАСХОД</button>
          <button onClick={() => switchMode('RETURN')} style={{ ...navBtnStyle, background: mode === 'RETURN' ? '#27ae60' : '#95a5a6' }}>ПРИХОД</button>
          <button onClick={() => { localStorage.clear(); window.location.reload(); }} style={exitBtnStyle}>СБРОС</button>
        </div>
      </div>

      {view === 'list' && (
        <div style={filterPanelStyle}>
          <div style={{ fontWeight: 'bold', marginBottom: '10px', color: mode === 'EXPENSE' ? '#e67e22' : '#27ae60' }}>
            {mode === 'EXPENSE' ? 'ОТКУДА БЕРЕМ: Склады (поиск и галочки)' : 'ОТКУДА ВОЗВРАЩАЕМ: Реализаторы'}
          </div>
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
            {entities.filter(e => Number(e.roleid) === (mode === 'EXPENSE' ? 5 : 7)).map(wh => (
              <label key={wh.id} style={whBadgeStyle}>
                <input 
                  type="checkbox" 
                  checked={(mode === 'EXPENSE' ? enabledWarehouses : enabledRealizers).includes(Number(wh.id))}
                  onChange={() => toggleFilter(Number(wh.id))}
                /> {wh.note}
              </label>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding: '15px' }}>
        {view === 'list' && (
          <div>
            <h4>Найдено артикулов ({articulList.length}):</h4>
            {articulList.length === 0 && <p style={{color:'gray'}}>Ничего не найдено или не выбраны галочки сверху.</p>}
            {articulList.map(art => (
              <div 
                key={art} 
                onClick={() => { setSelectedArticul(art); setView('sku_list'); }} 
                title={stocks.find(s => s.articulstore === art)?.aliases_str} 
                style={cardStyle}
              >
                {art} <span style={{ float: 'right', color: '#ccc' }}>→</span>
              </div>
            ))}
          </div>
        )}

        {view === 'sku_list' && (
          <div>
            <button onClick={() => setView('list')} style={backBtnStyle}>← К списку артикулов</button>
            <h4>Выбор размера (SKU): {selectedArticul}</h4>
            {[...new Set(filteredStocks.filter(s => s.articulstore === selectedArticul).map(s => `${s.size_name}_${s.length_id}`))].map(skuKey => (
                <div key={skuKey} onClick={() => { 
                  const [s, l] = skuKey.split('_');
                  setSelectedSku({size: s, length: l}); 
                  setView('target_list'); 
                }} style={{...cardStyle, background: '#f8f9fa'}}>
                  <b>{selectedArticul}_{skuKey}</b>
                  <span style={{ float: 'right', color: '#3498db', fontSize: '14px' }}>Указать склад →</span>
                </div>
            ))}
          </div>
        )}

        {view === 'target_list' && (
          <div>
            <button onClick={() => setView('sku_list')} style={backBtnStyle}>← К размерам</button>
            <div style={infoBoxStyle}>Выбран SKU: {selectedArticul}_{selectedSku.size}_{selectedSku.length}</div>
            
            {filteredStocks
              .filter(s => s.articulstore === selectedArticul && s.size_name === selectedSku.size && String(s.length_id) === String(selectedSku.length))
              .map(item => (
                <div key={`${item.goodid}-${item.objectid}`} style={skuCardStyle}>
                  <div style={{ color: '#7f8c8d', fontSize: '13px' }}>
                    {mode === 'EXPENSE' ? 'Списываем со склада:' : 'Забираем у реализатора:'} <b>{entities.find(e => Number(e.id) === Number(item.objectid))?.note}</b>
                  </div>
                  <div style={{ fontSize: '18px', margin: '10px 0' }}>Остаток: <b style={{color: '#27ae60'}}>{item.qty} шт.</b></div>
                  
                  <div style={{ marginTop: '20px', paddingTop: '15px', borderTop: '1px dashed #ddd' }}>
                    <div style={{ fontSize: '13px', marginBottom: '10px', fontWeight: 'bold', color: '#2c3e50' }}>
                      {mode === 'EXPENSE' ? 'КУДА ОТПРАВЛЯЕМ?' : 'НА КАКОЙ СКЛАД ВОЗВРАЩАЕМ?'}
                    </div>
                    {targetEntities.map(target => (
                      <button 
                        key={target.id} 
                        onClick={() => handleTransfer(item, target)} 
                        style={actionBtnStyle}
                      >
                        → {target.note}
                      </button>
                    ))}
                  </div>
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
const cardStyle = { padding: '18px', border: '1px solid #e1e8ed', marginBottom: '10px', borderRadius: '8px', cursor: 'pointer', textAlign: 'left', background: 'white', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' };
const filterPanelStyle = { padding: '15px', background: '#f8f9fa', borderBottom: '1px solid #ddd' };
const searchInputStyle = { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ced6e0', boxSizing: 'border-box', fontSize: '16px' };
const clearSearchBtnStyle = { position: 'absolute', right: '10px', top: '10px', border: 'none', background: 'none', fontSize: '20px', cursor: 'pointer', color: '#95a5a6' };
const whBadgeStyle = { fontSize: '13px', background: 'white', padding: '8px 12px', borderRadius: '6px', border: '1px solid #dcdde1', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' };
const skuCardStyle = { border: '2px solid #3498db', padding: '15px', marginBottom: '15px', borderRadius: '8px', background: '#f0f8ff', textAlign: 'left' };
const actionBtnStyle = { width: '100%', padding: '14px', background: '#3498db', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', marginBottom: '8px', fontSize: '14px', textAlign: 'left' };
const backBtnStyle = { marginBottom: '15px', padding: '8px 15px', border: '1px solid #bdc3c7', borderRadius: '5px', background: 'white', color: '#2c3e50', cursor: 'pointer', fontWeight: 'bold' };
const infoBoxStyle = { padding: '12px', background: '#34495e', color: 'white', borderRadius: '5px', marginBottom: '15px', fontSize: '15px', fontWeight: 'bold' };

export default App;