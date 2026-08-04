const API_BASE = 'https://api.40par.ru/api/wms';
const WMS_TOKEN = '40par_secure_sklad_2026_xyz'; 

export const wmsApi = {
  async syncDown() {
    const res = await fetch(`${API_BASE}/sync-down`, {
      method: 'GET',
      headers: { 
        'x-wms-auth': WMS_TOKEN,
        'Content-Type': 'application/json',
        // NEW: Передаем личный ключ сотрудника из памяти браузера при скачивании
        'x-employee-key': localStorage.getItem('wms_access_key') || ''
      }
    });
    if (res.status === 401) throw new Error('Неверный токен доступа на сервере');
    if (!res.ok) throw new Error('Ошибка сервера: ' + res.status);
    return res.json();
  },

  async syncUp(operations) {
    const res = await fetch(`${API_BASE}/sync-up`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-wms-auth': WMS_TOKEN,
        // NEW: Передаем личный ключ сотрудника из памяти браузера при отправке операций
        'x-employee-key': localStorage.getItem('wms_access_key') || ''
      },
      body: JSON.stringify({ operations })
    });
    if (!res.ok) throw new Error('Ошибка отправки: ' + res.status);
    return res.json();
  }
};