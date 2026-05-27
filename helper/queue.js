import connection from "./redisconfig.js";
import { Queue } from "bullmq";

export const birthdayQueue = new Queue("birthdayQueue", {
  connection,
});
