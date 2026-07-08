// ИЗМЕНЕНО: Адрес теперь смотрит в интернет на твой домен
const API_BASE = 'https://api.40par.ru/api/wms';
// ВАЖНО: Пароль должен быть в точности как в .env на сервере!
const WMS_TOKEN = '40par_secure_sklad_2026_xyz'; 

export const wmsApi = {
  async syncDown() {
    const res = await fetch(`${API_BASE}/sync-down`, {
      method: 'GET',
      headers: { 
        'x-wms-auth': WMS_TOKEN,
        'Content-Type': 'application/json'
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
        'x-wms-auth': WMS_TOKEN
      },
      body: JSON.stringify({ operations })
    });
    if (!res.ok) throw new Error('Ошибка отправки: ' + res.status);
    return res.json();
  }
};