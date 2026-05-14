import admin from 'firebase-admin';
import {Worker} from 'bullmq';

import connection from './redisconfig.js';
import { sendfcmNotification } from './sendfcmNotification.js';


// export function startBirthdayWorker() {
const worker = new Worker(
  'birthdayQueue',
  async job => {
    const {token, message, heading, docPath, type, todayStr} = job.data;
    if (type === 'email') {
      await sendfcmNotification(token, message, heading);
      return;
    }
    const success = await sendfcmNotification(token, message, heading);

    if (success) {
      await admin
        .firestore()
        .doc(docPath)
        .update({
          [`lastNotified.${type}`]: todayStr,
        });

      console.log('DB updated');
    }
  },
  {connection},
);



worker.on("active", (job) => {
  console.log("🚀 Processing:", job.id);
});

worker.on("completed", (job) => {
  console.log("✅ Done:", job.id);
});

worker.on("failed", (job, err) => {
  console.log("❌ Failed:", job?.id, err.message);
});
//   return worker;
// }
console.log('✅ Birthday worker started');