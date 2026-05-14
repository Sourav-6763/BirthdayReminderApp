import { Queue } from "bullmq";
import connection from "./redisconfig.js";

export const birthdayQueue = new Queue("birthdayQueue", {
  connection,
});