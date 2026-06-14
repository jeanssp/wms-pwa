import Dexie from 'dexie';

// Создаем базу данных "WMS_Database" в браузере
export const db = new Dexie('WMS_Database');

// Описываем таблицы:
// stocks: ++id (авто-номер), barcode (для поиска), goodid (ID товара), objectid (ID склада)
db.version(1).stores({
  stocks: '++id, barcode, goodid, objectid',
  sync_queue: '++id, status'
});

// Функция для начального заполнения (чтобы было что упаковывать)
export const initMocks = async () => {
  const count = await db.stocks.count();
  if (count === 0) {
    await db.stocks.bulkAdd([
      { goodid: 101, barcode: '111', articulstore: 'Кроссовки Nike', qty: 10, objectid: 1, type: 'Обувь' },
      { goodid: 102, barcode: '222', articulstore: 'Футболка Adidas', qty: 5, objectid: 1, type: 'Одежда' },
      { goodid: 101, barcode: '111', articulstore: 'Кроссовки Nike', qty: 2, objectid: 2, type: 'Обувь' },
    ]);
    console.log("Данные загружены!");
  }
};