import admin from 'firebase-admin';
const messaging = admin.messaging();

async function sendfcmNotification(fcmToken, body, heading) {
  if (!body || !heading) {
    console.log('❌ Skip sending empty notification');
    return;
  }
  // console.log("hi");
  try {
    await messaging.send({
      token: fcmToken,
      // notification: {
      //   title: heading, // ✅ MUST be title
      //   body,
      // },
      data: {
        type: 'birthday',
        title: heading, // ✅ same
        body,
        id: Date.now().toString(),
      },
      android: {
        priority: 'high',
        // notification: {
        //   priority: 'max',
        // },
        ttl: 1000 * 60 * 60 * 24,
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
  
    return false;
  }
}
export  default sendfcmNotification;