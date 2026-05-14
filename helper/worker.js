import admin from 'firebase-admin';
import {Worker} from 'bullmq';

import connection from './redisconfig.js';
import {sendNotification} from './sendNotification.js';

// export function startBirthdayWorker() {
const worker = new Worker(
  'birthdayQueue',
  async job => {
    const {token, message, heading, docPath, type, todayStr} = job.data;
    if (type === 'email') {
      await sendNotification(token, message, heading);
      return;
    }
    const success = await sendNotification(token, message, heading);

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

console.log('✅ Birthday worker started');

//   return worker;
// }
