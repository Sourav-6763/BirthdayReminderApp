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
const CRON_SCHEDULE = TEST_MODE ? '* * * * *' : '0 9 * * *';
const TIMEZONE = process.env.TIMEZONE || 'Asia/Kolkata';

// ===== Routers =====
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
    res.json({ message: 'Birthday deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete birthday' });
  }
});

// ===== Health check =====
function getHealthStatus() {
  return {
    status: "ok",
    uptime: process.uptime()
  };
}

app.get('/check-testing', (req, res) => {
  res.status(200).json(getHealthStatus());

  setImmediate(() => {
    checkBirthdays()
      .then(() => console.log('🎉 Birthday check completed via health ping'))
      .catch(err => console.error('❌ Birthday check failed via health ping', err));
  });
});

// ===== Add birthday =====
app.post('/add-birthday', async (req, res) => {
  try {
    const { name, month, day, fcmToken } = req.body;
    if (!name || !month || !day || !fcmToken) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const ref = await db.collection('birthdays').add({
      name,
      month: parseInt(month),
      day: parseInt(day),
      fcmToken,
      lastNotified: null
    });

    res.json({ message: 'Birthday saved!', id: ref.id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save birthday' });
  }
});

// ===== Helpers =====
function daysUntilBirthday(month, day, now) {
  const thisYear = now.getFullYear();

  // Convert to local timezone date (strip time part)
  const today = new Date(
    new Date(now.toLocaleString("en-US", { timeZone: TIMEZONE })).setHours(0, 0, 0, 0)
  );

  let nextBirthday = new Date(thisYear, month - 1, day);

  // If birthday already passed this year → set to next year
  if (nextBirthday < today) {
    nextBirthday.setFullYear(thisYear + 1);
  }

  const diffTime = nextBirthday - today;
  return Math.round(diffTime / (1000 * 60 * 60 * 24)); // ✅ use round instead of floor
}

function getLocalDateString(date) {
  return date.toLocaleDateString('en-CA', { timeZone: TIMEZONE }); // YYYY-MM-DD
}

// ===== Check birthdays =====
async function checkBirthdays() {
  const now = new Date();
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
          await doc.ref.delete(); // bad token cleanup
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
        title: "🎉 Birthday Reminder",
        body
      },
      android: {
        priority: "high",
        notification: {
          channelId: "birthday_reminders", // must match RN channelId
          sound: "default",
          priority: "max"
        }
      },
      apns: {
        headers: {
          "apns-priority": "10" // 🔥 deliver immediately
        },
        payload: {
          aps: {
            alert: {
              title: "🎉 Birthday Reminder",
              body
            },
            sound: "default",
            badge: 1
          }
        }
      }
    });

    return true;
  } catch (err) {
    console.error("❌ Error sending notification", err.code || err.message);

    if (err.code === "messaging/registration-token-not-registered") {
      return false; // cleanup invalid tokens
    }
    return false;
  }
}



// ===== Schedule job =====
cron.schedule(CRON_SCHEDULE, checkBirthdays, {
  timezone: TIMEZONE
});

// ===== Error handlers =====
app.use((req, res, next) => {
  const err = createError(404, "Route not found");
  next(err);
});

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