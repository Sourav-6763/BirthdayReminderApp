import admin from "firebase-admin";

const messaging = admin.messaging();

export async function sendfcmNotification(fcmToken, body, heading) {
  if (!body || !heading) {
    console.log("❌ Skip sending empty notification");
    return false;
  }

  try {
    await messaging.send({
      token: fcmToken,
      data: {
        title: heading,
        body,
        type: "birthday",
      },
       android: {
        priority: 'high',
        // notification: {
        //   priority: 'max',
        // },
        ttl: 1000 * 60 * 60 * 24,
      },
    });

    console.log("✅ Notification  sent ");
    return true;
  } catch (err) {
    console.log("❌ Notification failed:", err.message);
    return false;
  }
}