const express = require('express');
const admin = require('firebase-admin');
const cron = require('node-cron');
const dotenv = require('dotenv');
const wishrouter = require('./router/sendmail');
const { errorResponse } = require('./controller/ErrorSuccessResponse');
const createError = require("http-errors");

dotenv.config();
const app = express();
app.use(express.json());

// ===== Firebase Admin init from ENV =====
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error('❌ FIREBASE_SERVICE_ACCOUNT env variable missing!');
  process.exit(1);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const messaging = admin.messaging();

// ===== Config =====
const TEST_MODE = process.env.TEST_MODE === 'true';
const CRON_SCHEDULE = TEST_MODE ? '* * * * *' : '0 17 * * *';
const TIMEZONE = process.env.TIMEZONE || 'Asia/Kolkata'; // set your local timezone

app.use('/sendBirthdayWish', wishrouter);
// ===== Delete birthday =====
app.delete('/delete-birthday/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const docRef = db.collection('birthdays').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ error: 'Birthday not found' });
    }

    await docRef.delete();
    console.log(`🗑️ Deleted birthday ID: ${id}`);
    res.json({ message: 'Birthday deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete birthday' });
  }
});


app.get('/check-testing', async (req, res) => {
  try {
    await checkBirthdays();
    res.send('✅ Birthday check done.');
  } catch (err) {
    console.error(err);
    res.status(500).send('❌ Error running birthday check.');
  }
});

// ===== Add birthday =====
app.post('/add-birthday', async (req, res) => {
  try {
    const { name, month, day, fcmToken } = req.body;
    if (!name || !month || !day || !fcmToken) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const ref =await db.collection('birthdays').add({
      name,
      month: parseInt(month),
      day: parseInt(day),
      fcmToken,
      lastNotified: null
    });

    console.log(`📅 Birthday for ${name} saved: ${month}-${day}`);
    res.json({ message: 'Birthday saved!', id: ref.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save birthday' });
  }
});

// ===== Helper =====
function daysUntilBirthday(month, day, now) {
  const thisYear = now.getFullYear();
  const today = new Date(thisYear, now.getMonth(), now.getDate());
  let nextBirthday = new Date(thisYear, month - 1, day);

  if (nextBirthday < today) {
    nextBirthday.setFullYear(thisYear + 1);
  }

  const diffTime = nextBirthday - today;
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

function getLocalDateString(date) {
  return date.toLocaleDateString('en-CA', { timeZone: TIMEZONE }); // YYYY-MM-DD
}

// ===== Main check =====
async function checkBirthdays() {
  const now = new Date();
  console.log(`⏳ Checking birthdays at ${now.toLocaleString('en-IN', { timeZone: TIMEZONE })}`);

  const snapshot = await db.collection('birthdays').get();

  await Promise.all(snapshot.docs.map(async doc => {
    const data = doc.data();
    const { name, month, day, fcmToken, lastNotified } = data;

    const daysLeft = daysUntilBirthday(month, day, now);

    let message = null;
    if (daysLeft === 2) message = `⏳ Only 2 days left for ${name}'s birthday!`;
    else if (daysLeft === 1) message = `🎈 Only 1 day left for ${name}'s birthday!`;
    else if (daysLeft === 0) message = `🎂 Today is ${name}'s birthday! 🎉`;

    if (message) {
      const todayStr = getLocalDateString(now);
      if (lastNotified !== todayStr) {
        const sent = await sendNotification(fcmToken, message);
        if (sent) {
          await doc.ref.update({ lastNotified: todayStr });
        } else {
          await doc.ref.delete(); // remove if token is bad
        }
      }
    }
  }));
}

// ===== Send notification =====
async function sendNotification(fcmToken, body) {
  try {
    await messaging.send({
      token: fcmToken,
      notification: {
        title: '🎉 Birthday Reminder',
        body
      }
    });
    console.log(`✅ Notification sent: ${body}`);
    return true;
  } catch (err) {
    console.error('❌ Error sending notification', err.code || err.message);
    if (err.code === 'messaging/registration-token-not-registered') {
      console.warn('⚠️ Token expired, removing from DB.');
      return false;
    }
    return false;
  }
}

// ===== Schedule job =====
cron.schedule(CRON_SCHEDULE, checkBirthdays, {
  timezone: TIMEZONE
});

// Client error handling
app.use((req, res, next) => {
  const err = createError(404, "Route not found");
  next(err);
});

// Server error handling
app.use((err, req, res, next) => {
  return errorResponse(res, {
    statusCode: err.status || 500,
    message: err.message || "Internal Server Error",
  });
});


// ===== Start server =====
app.listen(process.env.PORT || 5000, () => {
  console.log(`🚀 Server running on port ${process.env.PORT || 5000}`);
});
