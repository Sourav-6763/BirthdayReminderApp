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
    });

    console.log("✅ Notification  sent ");
    return true;
  } catch (err) {
    console.log("❌ Notification failed:", err.message);
    return false;
  }
}