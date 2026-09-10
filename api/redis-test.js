import { Redis } from "@upstash/redis";

export default async function handler(req, res) {
  try {
    const redis = Redis.fromEnv();

    const result = await redis.ping();

    return res.status(200).json({
      ok: true,
      redis: result
    });
  } catch (error) {
    console.error("REDIS TEST ERROR:", error);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
