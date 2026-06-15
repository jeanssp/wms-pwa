import Dexie from 'dexie';

export const db = new Dexie('WMS_Database');

db.version(3).stores({
  stocks: '++id, barcode, articulstore, objectid',
  sync_queue: '++id, status',
  // Таблица для всех объектов (склады и люди)
  entities: '++id, roleid, number, note', 
  marketplaces: '++id, name'
});

export const initMocks = async () => {
  const entCount = await db.entities.count();
  if (entCount === 0) {
    // 1. Загружаем Контрагентов (Управляющих маркетплейсов) - roleid 7
    await db.entities.bulkAdd([
      { id: 701, roleid: 7, number: '9001112233', note: 'ИП Иванов (Manager WB)' },
      { id: 702, roleid: 7, number: '9004445566', note: 'ООО Вектор (Manager Ozon)' }
    ]);

    // 2. Загружаем Склады - roleid 5
    await db.stocks.bulkAdd([
  { articulstore: '352420842BLUE', size: '30', length: '32', qty: 10, objectid: 501 },
  { articulstore: '352420842BLUE', size: '31', length: '32', qty: 15, objectid: 501 },
  { articulstore: '352420842BLUE', size: '32', length: '32', qty: 30, objectid: 502 },
  { articulstore: '44556677RED', size: 'L', length: '180', qty: 20, objectid: 501 }
]);

    // 3. Маркетплейсы
    await db.marketplaces.bulkAdd([
      { id: 1, name: 'Wildberries' },
      { id: 2, name: 'Ozon' }
    ]);

    // 4. Остатки (привязаны к objectid склада)
    await db.stocks.bulkAdd([
      { articulstore: '352420842BLUE', size: '32', length: '34', qty: 10, objectid: 501 },
      { articulstore: '352420842BLUE', size: '34', length: '34', qty: 5, objectid: 501 },
      { articulstore: '352420842BLUE', size: '32', length: '34', qty: 8, objectid: 502 },
      { articulstore: '44556677RED', size: 'L', length: '180', qty: 20, objectid: 501 }
    ]);
  }
};