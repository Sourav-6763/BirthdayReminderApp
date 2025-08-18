const admin = require('firebase-admin');
const dotenv = require('dotenv');

dotenv.config();

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error('❌ FIREBASE_SERVICE_ACCOUNT env variable missing!');
  process.exit(1);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function migrate() {
  const snapshot = await db.collection('birthdays').get();

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const lastNotified = data.lastNotified;

    // Skip if already an object
    if (typeof lastNotified === 'object') continue;

    await doc.ref.update({
      lastNotified: {
        "2days": null,
        "1day": null,
        "birthday": lastNotified || null
      }
    });

    console.log(`Updated ${doc.id}`);
  }

  console.log('Migration completed!');
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
