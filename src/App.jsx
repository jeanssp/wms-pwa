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

  // NEW: Считываем персональный ключ сотрудника из локальной памяти Chrome
  const [wmsKey, setWmsKey] = useState(localStorage.getItem('wms_access_key') || '');
  const [inputKey, setInputKey] = useState('');

  // CHANGED: Конвертируем ID складов в числа для исключения конфликтов типов
  const [enabledWarehouses, setEnabledWarehouses] = useState(
    (JSON.parse(localStorage.getItem('wms_enabled_warehouses')) || []).map(Number)
  );
  const [enabledRealizers, setEnabledRealizers] = useState(
    (JSON.parse(localStorage.getItem('wms_enabled_realizers')) || []).map(Number)
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
    } catch (err) { 
      console.error('Sync error:', err); 
    } finally {
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
    const isSearchActive = searchQuery.length >= 3;
    const query = searchQuery.toLowerCase();

    return stocks.filter(item => {
      if (isSearchActive) {
        const matchesQuery = item.articulstore?.toLowerCase().includes(query) ||
                             item.barcodes_str?.toLowerCase().includes(query) ||
                             item.aliases_str?.toLowerCase().includes(query);
                             
        const entity = entities.find(e => Number(e.id) === Number(item.objectid));
        const isValidRole = mode === 'EXPENSE' 
          ? Number(entity?.roleid) === 5 
          : Number(entity?.roleid) === 7;
          
        return matchesQuery && isValidRole;
      }
      
      const currentFilter = mode === 'EXPENSE' ? enabledWarehouses : enabledRealizers;
      return currentFilter.some(id => Number(id) === Number(item.objectid));
    });
  }, [stocks, searchQuery, enabledWarehouses, enabledRealizers, mode, entities]);

  const articulList = useMemo(() => [...new Set(filteredStocks.map(s => s.articulstore))], [filteredStocks]);

  const toggleFilter = (id) => {
    const numId = Number(id);
    if (mode === 'EXPENSE') {
      const exists = enabledWarehouses.some(item => Number(item) === numId);
      const newSelection = exists 
        ? enabledWarehouses.filter(item => Number(item) !== numId) 
        : [...enabledWarehouses, numId];
      setEnabledWarehouses(newSelection);
      localStorage.setItem('wms_enabled_warehouses', JSON.stringify(newSelection));
    } else {
      const exists = enabledRealizers.some(item => Number(item) === numId);
      const newSelection = exists 
        ? enabledRealizers.filter(item => Number(item) !== numId) 
        : [...enabledRealizers, numId];
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

  // NEW: Умный обработчик сканирования номенклатуры (Артикул_Размер_Рост)
  const handleSearchChange = (val) => {
    setSearchQuery(val);
    
    const trimmed = val.trim();
    const parts = trimmed.split('_');

    // Если сканер вставил полную номенклатуру формата Артикул_Размер_Рост (3 части)
    if (parts.length === 3) {
      const [art, size, len] = parts;

      // Проверяем, существует ли такой SKU реально на остатках
      const skuExists = stocks.some(s => 
        s.articulstore?.toLowerCase() === art.toLowerCase() &&
        s.size_name?.toLowerCase() === size.toLowerCase() &&
        String(s.length_id) === String(len)
      );

      if (skuExists) {
        // Автоматически выбираем артикул и размер и переходим к выбору склада списания
        setSelectedArticul(art.toUpperCase());
        setSelectedSku({ size, length: len });
        setView('target_list');
        setSearchQuery(''); // Очищаем поле поиска для следующего сканирования!
      }
    }
  };

  // NEW: Восстановили кнопку СБРОС (handleReset), которую случайно затерли при прошлой вставке
  const handleReset = async () => {
    localStorage.clear();
    try {
      await db.transaction('rw', db.stocks, db.entities, db.sync_queue, async () => {
        await db.stocks.clear();
        await db.entities.clear();
        await db.sync_queue.clear();
      });
    } catch (e) {
      console.error('Reset DB error:', e);
    }
    window.location.reload();
  };

  const handleTransfer = async (item, targetEntity) => {
    if (item.qty <= 0) return alert("Нет в наличии!");

    await db.stocks.update(item.id, { qty: item.qty - 1 });
    
    await db.sync_queue.add({
      type: mode === 'EXPENSE' ? 'SEND_TO_MARKET' : 'RETURN_FROM_MARKET',
      goodid: Number(item.goodid),
      from_wh: Number(item.objectid),
      to_wh: Number(targetEntity.id),
      marketplace: targetEntity.note,
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

  // NEW: Если ключа в памяти Chrome нет — показываем стильный экран авторизации
  if (!wmsKey) {
    const lockScreenStyle = { display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'center', alignItems: 'center', backgroundColor: '#f3f4f6', padding: '20px', boxSizing: 'border-box' };
    const lockCardStyle = { backgroundColor: 'white', padding: '30px', borderRadius: '16px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', width: '100%', maxWidth: '400px', boxSizing: 'border-box' };

    return (
      <div style={lockScreenStyle}>
        <div style={lockCardStyle}>
          <h2 style={{ color: '#111827', marginBottom: '10px', textAlign: 'center' }}>⛵ Sailboat WMS</h2>
          <p style={{ color: '#6B7280', fontSize: '13px', marginBottom: '20px', textAlign: 'center' }}>
            Доступ ограничен. Введите персональный ключ доступа.
          </p>
          <input 
            type="password" 
            style={{ ...searchInputStyle, marginBottom: '15px' }} 
            placeholder="Секретный ключ (например: av0000)" 
            value={inputKey}
            onChange={e => setInputKey(e.target.value)}
          />
          <button 
            onClick={() => {
              if (inputKey.trim()) {
                localStorage.setItem('wms_access_key', inputKey.trim());
                setWmsKey(inputKey.trim());
                window.location.reload();
              }
            }} 
            style={{ ...actionBtnStyle, marginTop: '10px', textAlign: 'center', width: '100%' }}
          >
            Войти в систему
          </button>
        </div>
      </div>
    );
  }

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
          <button onClick={handleReset} style={exitBtnStyle}>СБРОС</button>
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
              placeholder="🔍 Артикул, штрихкод или алиас (от 3 знаков)..."
              value={searchQuery}
              // CHANGED: Подключили умный обработчик вместо простого сохранения текста
              onChange={(e) => handleSearchChange(e.target.value)}
            />
            {searchQuery && <button onClick={() => setSearchQuery('')} style={clearSearchBtnStyle}>✕</button>}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {entities.filter(e => Number(e.roleid) === (mode === 'EXPENSE' ? 5 : 7)).map(wh => (
              <label key={wh.id} style={whBadgeStyle}>
                <input 
                  type="checkbox" 
                  checked={(mode === 'EXPENSE' ? enabledWarehouses : enabledRealizers).some(fId => Number(fId) === Number(wh.id))}
                  onChange={() => toggleFilter(wh.id)}
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
            {/* CHANGED: Ищем размеры и считаем остатки по ВСЕМ складам из stocks (игнорируя галочки фильтров) */}
            {[...new Set(stocks.filter(s => s.articulstore === selectedArticul).map(s => `${s.size_name}_${s.length_id}`))].map(skuKey => {
              const [sizeVal, lenVal] = skuKey.split('_');
              const skuItems = stocks.filter(s => s.articulstore === selectedArticul && s.size_name === sizeVal && String(s.length_id) === String(lenVal));
              const totalQty = skuItems.reduce((sum, item) => sum + Number(item.qty), 0);
              const whNames = skuItems.map(item => entities.find(e => Number(e.id) === Number(item.objectid))?.note).filter(Boolean).join(', ');

              return (
                <div key={skuKey} onClick={() => { 
                  setSelectedSku({size: sizeVal, length: lenVal}); 
                  setView('target_list'); 
                }} style={{...cardStyle, background: '#f8f9fa', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  <div>
                    <b style={{ fontSize: '16px' }}>{selectedArticul}_{skuKey}</b>
                    <div style={{ fontSize: '13px', color: '#27ae60', marginTop: '4px' }}>
                      В наличии: <b>{totalQty} шт.</b> ({whNames || 'Склад не указан'})
                    </div>
                  </div>
                  <span style={{ color: '#3498db', fontSize: '14px', fontWeight: 'bold' }}>Выбрать размер →</span>
                </div>
              );
            })}
          </div>
        )}

       {view === 'target_list' && (() => {
          // CHANGED: Ищем склады списания по ВСЕМ складам из stocks (полностью игнорируя верхние галочки)
          const skuItems = stocks.filter(
            s => s.articulstore === selectedArticul && 
                 s.size_name === selectedSku.size && 
                 String(s.length_id) === String(selectedSku.length)
          );

          const warehouseMap = new Map();
          skuItems.forEach(item => {
            const objId = Number(item.objectid);
            if (!warehouseMap.has(objId)) {
              warehouseMap.set(objId, {
                objectid: objId,
                totalQty: 0,
                items: []
              });
            }
            const group = warehouseMap.get(objId);
            group.totalQty += Number(item.qty);
            group.items.push(item);
          });

          const warehouseGroups = Array.from(warehouseMap.values()).filter(g => g.totalQty > 0);

          return (
            <div>
              <button onClick={() => setView('sku_list')} style={backBtnStyle}>← К размерам</button>
              <div style={infoBoxStyle}>Выбран SKU: {selectedArticul}_{selectedSku.size}_{selectedSku.length}</div>
              
              {warehouseGroups.length === 0 && (
                <p style={{ color: 'gray' }}>Нет доступных остатков на выбранных складах.</p>
              )}

              {warehouseGroups.map(group => {
                const warehouseEntity = entities.find(e => Number(e.id) === group.objectid);
                const activeItem = group.items.find(i => Number(i.qty) > 0) || group.items[0];

                return (
                  <div key={group.objectid} style={skuCardStyle}>
                    <div style={{ color: '#7f8c8d', fontSize: '13px' }}>
                      {mode === 'EXPENSE' ? 'Списываем со склада:' : 'Забираем у реализатора:'} <b>{warehouseEntity?.note || 'Склад'}</b>
                    </div>
                    <div style={{ fontSize: '18px', margin: '10px 0' }}>
                      Общий остаток: <b style={{ color: '#27ae60' }}>{group.totalQty} шт.</b>
                    </div>
                    
                    <div style={{ marginTop: '20px', paddingTop: '15px', borderTop: '1px dashed #ddd' }}>
                      <div style={{ fontSize: '13px', marginBottom: '10px', fontWeight: 'bold', color: '#2c3e50' }}>
                        {mode === 'EXPENSE' ? 'КУДА ОТПРАВЛЯЕМ?' : 'НА КАКОЙ СКЛАД ВОЗВРАЩАЕМ?'}
                      </div>
                      {targetEntities.map(target => (
                        <button 
                          key={target.id} 
                          onClick={() => handleTransfer(activeItem, target)} 
                          style={actionBtnStyle}
                        >
                          → {target.note}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
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
