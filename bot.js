const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { createClient } = require('@supabase/supabase-js');

// ─── הגדרות ───────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BARBER_PHONE = process.env.BARBER_PHONE || '972559801696'; // מספר הספר

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── WhatsApp Client ───────────────────────────────────
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: true
  }
});

client.on('qr', qr => {
  console.log('\n📱 סרוק את ה-QR עם וואטסאפ:\n');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('✅ בוט וואטסאפ מחובר ופעיל!');
  startListening();
});

client.on('auth_failure', () => {
  console.error('❌ שגיאת אימות - נסה מחדש');
});

client.initialize();

// ─── פורמט מספר ───────────────────────────────────────
function formatPhone(phone) {
  // הסר תווים מיוחדים
  let p = phone.replace(/\D/g, '');
  // המר 05X → 9725X
  if (p.startsWith('0')) p = '972' + p.slice(1);
  return p + '@c.us';
}

// ─── שליחת הודעה ──────────────────────────────────────
async function sendMsg(phone, text) {
  try {
    const chatId = formatPhone(phone);
    await client.sendMessage(chatId, text);
    console.log(`✅ הודעה נשלחה ל-${phone}`);
  } catch (err) {
    console.error(`❌ שגיאה בשליחה ל-${phone}:`, err.message);
  }
}

// ─── האזנה ל-Supabase ─────────────────────────────────
function startListening() {
  console.log('👂 מאזין לשינויים בתורים...');

  // תור חדש
  sb
    .channel('appointments-insert')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'appointments'
    }, async (payload) => {
      const r = payload.new;
      console.log('📅 תור חדש:', r);

      // הודעה לספר
      const msgBarber =
        `✂️ *תור חדש!*\n` +
        `👤 שם: ${r.name}\n` +
        `📞 טלפון: ${r.phone}\n` +
        `💈 שירות: ${r.svc}\n` +
        `📅 תאריך: ${r.date}\n` +
        `🕐 שעה: ${r.time}`;
      await sendMsg(BARBER_PHONE, msgBarber);
    })
    .subscribe();

  // ביטול תור
  sb
    .channel('appointments-delete')
    .on('postgres_changes', {
      event: 'DELETE',
      schema: 'public',
      table: 'appointments'
    }, async (payload) => {
      const r = payload.old;
      console.log('❌ תור בוטל:', r);

      // בדוק מי ביטל - אם יש phone של לקוח שלח לו
      if (r.phone) {
        const msgCustomer =
          `שלום ${r.name} 👋\n` +
          `התור שלך ל*${r.svc}* בתאריך *${r.date}* בשעה *${r.time}* בוטל.\n` +
          `לקביעת תור חדש: https://creative-quokka-6decb1.netlify.app`;
        await sendMsg(r.phone, msgCustomer);
      }

      // הודעה לספר
      const msgBarber =
        `❌ *תור בוטל*\n` +
        `👤 שם: ${r.name}\n` +
        `📞 טלפון: ${r.phone}\n` +
        `💈 שירות: ${r.svc}\n` +
        `📅 תאריך: ${r.date}\n` +
        `🕐 שעה: ${r.time}`;
      await sendMsg(BARBER_PHONE, msgBarber);
    })
    .subscribe();
}
