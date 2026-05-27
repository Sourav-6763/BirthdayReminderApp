import IORedis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

// ডাইনামিক কানেকশন ইউআরএল
const redisUrl = process.env.REDIS_TCP_URL;

if (!redisUrl) {
  console.error("❌ Error: REDIS_TCP_URL is not defined in .env file");
}

const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null, // BullMQ এর জন্য বাধ্যতামূলক
  tls: {
    rejectUnauthorized: false // Upstash ক্লাউড কানেকশন সিকিউর করার জন্য
  }
});

export default connection;