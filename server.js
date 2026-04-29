import express from 'express';
import admin from 'firebase-admin';
import cron from 'node-cron';
import dotenv from 'dotenv';
import wishrouter from './router/sendmail.js';
import {errorResponse} from './controller/ErrorSuccessResponse.js';
import createError from 'http-errors';
import eventRoute from './router/eventRoute.js';
import axios from 'axios';
import cors from 'cors';
import AiChatRoute from './router/aiChatRoute.js';

dotenv.config();

const app = express();

app.use(express.json());
app.use(cors());

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');

// ===== Firebase Admin init from ENV =====
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}
const db = admin.firestore();
const messaging = admin.messaging();

// ===== Config =====
const TEST_MODE = process.env.TEST_MODE === 'true';
const CRON_SCHEDULE = TEST_MODE ? '* * * * *' : '0 9 * * *';
const TIMEZONE = process.env.TIMEZONE || 'Asia/Kolkata';

// ===== Routers =====
app.use('/sendBirthdayWish', wishrouter);
app.use('/allEvent', eventRoute);
app.use('/AiChat', AiChatRoute);

// ===== Delete birthday =====
app.delete('/delete-birthday', async (req, res) => {
  // console.log(req.body);
  const fullDate = req.body.date;
  const day = Number(fullDate.split('-')[2]);
  const month = Number(fullDate.split('-')[1]);
  const id = req.body.id;
  // console.log(id);
  try {
    const docRef = db
      .collection('birthdays2')
      .doc(`${day}-${month}`)
      .collection('allBirthdays')
      .doc(id);
    const snapshort = await docRef.get();
    if (!snapshort.exists) {
      return res.status(404).json({message: 'Document not found'});
    }
    // const res = await getDocs(q);
    await docRef.delete();
    return res.json({success: true, deleteId: id});
  } catch (err) {
    res.status(500).json({error: 'Failed to delete birthday'});
  }
});

// ===== Health check =====

function getHealthStatus() {
  return {
    status: 'ok',
    uptime: process.uptime(),
  };
}

app.get('/check-testing', (req, res) => {
  res.status(200).json(getHealthStatus());
});

// function getHealthStatus() {
//   return {
//     status: 'ok',
//     uptime: process.uptime(),
//   };
// }

app.get('/check-testing-birthday', (req, res) => {
  res.status(200).json(getHealthStatus());
  setImmediate(() => {
    checkBirthdays()
      .then(() => console.log('🎉 Birthday check completed via health ping'))
      .catch(err =>
        console.error('❌ Birthday check failed via health ping', err),
      );
  });
});
app.post('/save-user', async (req, res) => {
  try {
    const {fcmToken, userId, country, timezone} = req.body;
    // console.log(req.body);
    if (!fcmToken || !userId || !country || !timezone) {
      return res.status(400).json({error: 'Missing required fields'});
    }

    await db
      .collection('users')
      .doc(userId)
      .set({fcmToken, country, timezone}, {merge: true});

    // ✅ IMPORTANT: send response
    return res.json({message: 'User saved successfully'});
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: 'Server error',
    });
  }
});

// ===== Add birthday =====
app.post('/add-birthday', async (req, res) => {
  try {
    const {name, month, day, fcmToken, timezone, country} = req.body;
    // console.log(req.body);
    if (!name || !month || !day || !fcmToken) {
      return res.status(400).json({error: 'Missing fields'});
    }

    const ref = await db
      .collection('birthdays2')
      .doc(`${day}-${month}`)
      .collection('allBirthdays')
      .add({
        name,
        month: parseInt(month),
        day: parseInt(day),
        fcmToken,
        timezone,
        country,
        lastNotified: {
          onedays: null,
          twoday: null,
          birthday: null,
        },
      });
    res.json({message: 'Birthday saved!', id: ref.id});
  } catch (err) {
    res.status(500).json({error: 'Failed to save birthday'});
  }
});

// ===== Helpers =====
function daysUntilBirthday(month, day, now, timezone) {
  const thisYear = now.getFullYear();

  // Convert to local timezone date (strip time part)
  const today = new Date(
    new Date(now.toLocaleString('en-US', {timeZone: timezone})).setHours(
      0,
      0,
      0,
      0,
    ),
  );

  let nextBirthday = new Date(thisYear, month - 1, day);

  // If birthday already passed this year → set to next year
  if (nextBirthday < today) {
    nextBirthday.setFullYear(thisYear + 1);
  }

  const diffTime = nextBirthday - today;
  return Math.round(diffTime / (1000 * 60 * 60 * 24)); // ✅ use round instead of floor
}

// function getLocalDateString(date, timezone) {
//   return date.toLocaleDateString('en-CA', {timeZone: timezone}); // YYYY-MM-DD
// }
function check1day2day0day(value) {
  const now = new Date();
  now.setDate(now.getDate() + value);
  return {
    day: now.getDate(),
    month: now.getMonth() + 1,
  };
}
checkBirthdays();
// ===== Check birthdays with separate lastNotified for each type =====
async function checkBirthdays() {
  // const now = new Date();
  // const day = now.getDate();
  // const month = now.getMonth() + 1;
  const today = check1day2day0day(0);
  const oneDay = check1day2day0day(1);
  const twoDays = check1day2day0day(2);
  // console.log(today);
  const [todaySnap, oneDaySnap, twoDaySnap] = await Promise.all([
    db
      .collection('birthdays2')
      .doc(`${today.day}-${today.month}`)
      .collection('allBirthdays')
      .get(),
    db
      .collection('birthdays2')
      .doc(`${oneDay.day}-${oneDay.month}`)
      .collection('allBirthdays')
      .get(),
    db
      .collection('birthdays2')
      .doc(`${twoDays.day}-${twoDays.month}`)
      .collection('allBirthdays')
      .get(),
  ]);

  for (const doc of todaySnap.docs) {
    const date = new Date();
    const Currentyear = date.getFullYear();
    const prevSaveYear = Number(
      doc.data().lastNotified?.birthday?.split('-')[0],
    );
    if (
      doc.data().lastNotified.birthday != null &&
      prevSaveYear >= Currentyear
    ) {
      continue;
    }
    const message = `🎂 Today is ${doc.data().name}'s birthday! 🎉`;
    const todayStr = new Date().toISOString().split('T')[0];
    const data = await sendNotification(
      doc.data().fcmToken,
      message,
      'Birthday Reminder',
    );
    if (data) {
      await doc.ref.update({'lastNotified.birthday': todayStr});
    }
  }

  for (const doc of oneDaySnap.docs) {
    const date = new Date();
    const Currentyear = date.getFullYear();
    const prevSaveYear = Number(
      doc.data().lastNotified?.onedays?.split('-')[0],
    );
    if (
      doc.data().lastNotified.onedays != null &&
      prevSaveYear >= Currentyear
    ) {
      continue;
    }
    const message = `🎈 Only 1 day left for ${doc.data().name}'s birthday!`;
    const todayStr = new Date().toISOString().split('T')[0];
    const data = await sendNotification(
      doc.data().fcmToken,
      message,
      'Birthday Reminder',
    );
    if (data) {
      await doc.ref.update({'lastNotified.onedays': todayStr});
    }
  }

  for (const doc of twoDaySnap.docs) {
    const date = new Date();
    const Currentyear = date.getFullYear();
    const prevSaveYear = Number(doc.data().lastNotified?.twoday?.split('-')[0]);
    if (doc.data().lastNotified.twoday != null && prevSaveYear >= Currentyear) {
      continue;
    }
    const message = `🎈 Only 2 day left for ${doc.data().name}'s birthday!`;
    const todayStr = new Date().toISOString().split('T')[0];
    const data = await sendNotification(
      doc.data().fcmToken,
      message,
      'Birthday Reminder',
    );
    if (data) {
      await doc.ref.update({'lastNotified.twoday': todayStr});
    }
  }
}

// ===== Check holidays =====
// async function checkHolidays() {
//   const today = new Date();
//   const year = today.getFullYear();
//   const month = today.getMonth() + 1;
//   const day = today.getDate();
//   const todayStr = getLocalDateString(today);

//   const snapshot = await db.collection('birthdays').get();

//   for (const doc of snapshot.docs) {
//     const data = doc.data();
//     const token = data.fcmToken;
//     const userCountry = data.country || 'IN';
//     const lastHolidayNotified = data.lastHolidayNotified || '';

//     if (lastHolidayNotified === todayStr) continue;

//     try {
//       const response = await axios.get(
//         'https://calendarific.com/api/v2/holidays',
//         {
//           params: {
//             api_key: process.env.ALL_EVENT,
//             country: userCountry,
//             year,
//             month,
//             day,
//           },
//         },
//       );

//       const holidays = response.data.response.holidays;
//       if (!holidays || holidays.length === 0) continue;

//       for (const holiday of holidays) {
//         const message = `🎉 Today is ${holiday.name}! 📅 ${holiday.date.iso}`;
//         const sent = await sendNotification(token, message, 'Today is holiday');
//         if (sent) {
//           await doc.ref.update({ lastHolidayNotified: todayStr });
//         }
//       }
//     } catch (err) {
//       console.error(
//         `❌ Failed to fetch/send holidays for ${userCountry}:`,
//         err.message,
//       );
//     }
//   }
// }

// async function checkHolidays() {
//   const today = new Date().toISOString().split('T')[0];
//   const snapshort = await db.collection('Holidays').doc('2026-01-01').get();
//   const holidays = snapshort.data().events;
//   //  if (!holidays || holidays.length === 0) continue;
//   for (const data of holidays){
//     // const message = `🎉 Today is ${data.name}! 📅 ${today}`;
//     // const sent = await sendNotification(token, message, 'Today is holiday');
//     console.log(data);
//   }
// }
// checkHolidays();

cron.schedule(CRON_SCHEDULE, checkHolidays, {timezone: TIMEZONE});

// ===== Send notification =====
// async function sendNotification(fcmToken, body,heading) {
//   try {
//     await messaging.send({
//       token: fcmToken,
//       notification: {
//         title:heading,
//         body
//       },
//       android: {
//         priority: "high",
//         notification: {
//           channelId: "birthday_reminders", // must match RN channelId
//           sound: "default",
//           priority: "max"
//         }
//       },
//       apns: {
//         headers: {
//           "apns-priority": "10" // 🔥 deliver immediately
//         },
//         payload: {
//           aps: {
//             alert: {
//               title: "🎉 Birthday Reminder",
//               body
//             },
//             sound: "default",
//             badge: 1
//           }
//         }
//       }
//     });

//     return true;
//   } catch (err) {
//     console.error("❌ Error sending notification", err.code || err.message);

//     if (err.code === "messaging/registration-token-not-registered") {
//       return false; // cleanup invalid tokens
//     }
//     return false;
//   }
// }
async function sendNotification(fcmToken, body, heading) {
  // console.log("hi");
  try {
    await messaging.send({
      token: fcmToken,
      notification: {title: heading, body}, // for OS
      data: {type: 'birthday', body, heading}, // for RN app
      android: {
        priority: 'high',
        notification: {
          channelId: 'birthday_reminders',
          sound: 'default',
          priority: 'max',
        },
      },
      apns: {
        headers: {'apns-priority': '10'},
        payload: {
          aps: {alert: {title: heading, body}, sound: 'default', badge: 1},
        },
      },
    });
    console.log('✅ Notification sent');
    return true;
  } catch (err) {
    console.error('❌ Error sending notification', err.code || err.message);
    // 2. If the error is "token not registered" → app was uninstalled
    // if (err.code === 'messaging/registration-token-not-registered') {
    //   if (fcmToken) {
    //     // 3. Find ALL docs that have this same invalid token
    //     const snap = await db
    //       .collection('birthdays')
    //       .where('fcmToken', '==', fcmToken) // e.g. "token123"
    //       .get();

    //     if (!snap.empty) {
    //       // 4. Start a batch operation
    //       const batch = db.batch();

    //       // 5. Queue up deletes for each doc
    //       snap.forEach(doc => {
    //         console.log(`🗑️ Queued delete for ${doc.id} (${doc.data().name})`);
    //         batch.delete(doc.ref);
    //       });

    //       // 6. Commit batch delete
    //       await batch.commit();
    //       console.log(`🗑️ Deleted ${snap.size} docs for invalid token`);
    //     }
    //   }
    // }
    return false;
  }
}

async function checkHolidays() {
  try {
    const today = new Date().toISOString().split('T')[0]; // "2026-01-01"

    console.log('🔍 Checking holiday for:', today);

    // 🔥 Get holiday doc
    const snapshot = await db.collection('Holidays').doc(today).get();

    if (!snapshot.exists) {
      console.log('❌ No holiday today');
      return;
    }

    const data = snapshot.data();
    const events = data.events || [];

    if (events.length === 0) {
      console.log('❌ No events found');
      return;
    }

    // 🔥 Loop all events
    for (const event of events) {
      const title = `🎉 ${event.name}`;
      const body = event.description;

      // 🚀 SEND TO TOPIC
      await admin.messaging().send({
        topic: 'holiday',
        notification: {
          title,
          body,
        },
        data: {
          title,
          body,
          type: 'holiday',
        },
      });

      console.log(`✅ Sent: ${event.name}`);
    }
  } catch (error) {
    console.error('❌ Error in holiday check:', error);
  }
}
checkHolidays();

// async function sendNotification(fcmToken, body, heading) {
//   try {
//     await messaging.send({
//       token: fcmToken,

//       // ✅ DATA ONLY (VERY IMPORTANT)
//       data: {
//         title: heading,
//         body: body,
//         type: 'birthday',
//       },
//       android: {
//         priority: 'high',
//         notification: {
//           channelId: 'birthday_reminders',
//           sound: 'default',
//           priority: 'max',
//         },
//       },
//       apns: {
//         headers: {'apns-priority': '10'},
//         payload: {
//           aps: {alert: {title: heading, body}, sound: 'default', badge: 1},
//         },
//       },
//     });

//     console.log('✅ Notification sent');
//     return true;
//   } catch (err) {
//     console.error('❌ Error sending notification', err.code || err.message);
//     return false;
//   }
// }

// ===== Schedule job =====
cron.schedule(CRON_SCHEDULE, checkBirthdays, {
  timezone: TIMEZONE,
});

// ===== Error handlers =====
app.use((req, res, next) => {
  const err = createError(404, 'Route not found');
  next(err);
});

app.use((err, req, res, next) => {
  return errorResponse(res, {
    statusCode: err.status || 500,
    message: err.message || 'Internal Server Error',
  });
});

// ===== Start server =====
app.listen(process.env.PORT || 5000, () => {
  console.log(`🚀 Server running on port ${process.env.PORT || 5000}`);
});
