const express = require('express');
const admin = require('firebase-admin');
const cron = require('node-cron');
const dotenv = require('dotenv');
const wishrouter = require('./router/sendmail');
const { errorResponse } = require('./controller/ErrorSuccessResponse');
const createError = require("http-errors");
const eventRoute = require('./router/eventRoute');

const axios = require('axios');

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
app.use("/allEvent", eventRoute);

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
      lastNotified: {
        "2days": null,
        "1day": null,
        "birthday": null
      }
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


// ===== Check birthdays with separate lastNotified for each type =====
async function checkBirthdays() {
  const now = new Date();
  const snapshot = await db.collection('birthdays').get();

  const todayStr = getLocalDateString(now);

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const { name, month, day, fcmToken } = data;

    // Ensure lastNotified object exists
    const lastNotified = data.lastNotified || {};

    const daysLeft = daysUntilBirthday(month, day, now);

    // 2 days left
    if (daysLeft === 2 && lastNotified["2days"] !== todayStr) {
      const message = `⏳ Only 2 days left for ${name}'s birthday!`;
      const sent = await sendNotification(fcmToken, message, "Birthday Reminder");
      if (sent) {
        await doc.ref.update({
          [`lastNotified.2days`]: todayStr
        });
      }
    }

    // 1 day left
    if (daysLeft === 1 && lastNotified["1day"] !== todayStr) {
      const message = `🎈 Only 1 day left for ${name}'s birthday!`;
      const sent = await sendNotification(fcmToken, message, "Birthday Reminder");
      if (sent) {
        await doc.ref.update({
          [`lastNotified.1day`]: todayStr
        });
      }
    }

    // Birthday
    if (daysLeft === 0 && lastNotified["birthday"] !== todayStr) {
      const message = `🎂 Today is ${name}'s birthday! 🎉`;
      const sent = await sendNotification(fcmToken, message, "Birthday Reminder");
      if (sent) {
        await doc.ref.update({
          [`lastNotified.birthday`]: todayStr
        });
      }
    }
  }
}


// ===== Check holidays =====
async function checkHolidays() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const day = today.getDate();
  const todayStr = getLocalDateString(today);

  try {
    // Fetch holidays for today
    const response = await axios.get('https://calendarific.com/api/v2/holidays', {
      params: {
        api_key: process.env.ALL_EVENT,
        country: 'IN',
        year,
        month,
        day
      }
    });

    const holidays = response.data.response.holidays;
    if (!holidays || holidays.length === 0) {
      // console.log('No holidays today.');
      return;
    }

    // Fetch all users
    const snapshot = await db.collection('birthdays').get();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const token = data.fcmToken;
      const lastHolidayNotified = data.lastHolidayNotified || '';

      // Avoid sending duplicate notifications for the same day
      if (lastHolidayNotified === todayStr) continue;

      for (const holiday of holidays) {
        const message = `🎉 Today is ${holiday.name}! 📅 ${holiday.date.iso}`;
        // console.log(`Sending holiday notification to token: ${token}`);

        const sent = await sendNotification(token, message, "Today is holiday");
        if (sent) {
          await doc.ref.update({ lastHolidayNotified: todayStr });
        }
      }
    }

  } catch (err) {
    console.error("❌ Failed to fetch or send holiday notifications:", err.message);
  }
}




cron.schedule(CRON_SCHEDULE, checkHolidays, { timezone: TIMEZONE });





// ===== Send notification =====
async function sendNotification(fcmToken, body,heading) {
  try {
    await messaging.send({
      token: fcmToken,
      notification: {
        title:heading,
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