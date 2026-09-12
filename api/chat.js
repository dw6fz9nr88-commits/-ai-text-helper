import { Redis } from "@upstash/redis";
import crypto from "crypto";
const redis = Redis.fromEnv();
const RATE_LIMIT = 10;
const RATE_WINDOW = 600;
const AI_TIMEOUT = 15000;
const MAX_MESSAGE_LENGTH = 10000;
function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (
    typeof forwarded === "string" &&
    forwarded.trim()
  ) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = req.headers["x-real-ip"];
  if (
    typeof realIp === "string" &&
    realIp.trim()
  ) {
    return realIp.trim();
  }
  return "unknown";
}
function hashIp(ip) {
  return crypto
    .createHash("sha256")
    .update(ip)
    .digest("hex");
}
async function checkRateLimit(ip) {
  const hashedIp = hashIp(ip);
  const key = `rate:${hashedIp}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, RATE_WINDOW);
  }
  const remaining = Math.max(
    0,
    RATE_LIMIT - count
  );
  if (count > RATE_LIMIT) {
    const ttl = await redis.ttl(key);
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(1, ttl)
    };
  }
  return {
    allowed: true,
    remaining,
    retryAfter: 0
  };
}
async function fetchJson(
  url,
  options,
  timeout = AI_TIMEOUT
) {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    return {
      response,
      data
    };
  } finally {
    clearTimeout(timer);
  }
}
function isAbortError(error) {
  return (
    error?.name === "AbortError" ||
    error?.code === "ABORT_ERR"
  );
}
export default async function handler(req, res) {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate"
  );
  res.setHeader(
    "Pragma",
    "no-cache"
  );
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "Метод не поддерживается"
    });
  }
  try {
    const body = req.body || {};
    const message =
      typeof body.message === "string"
        ? body.message.trim()
        : "";
    const mode =
      typeof body.mode === "string"
        ? body.mode.trim().toLowerCase()
        : "improve";
    if (!message) {
      return res.status(400).json({
        error: "Введите текст"
      });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return res.status(413).json({
        error:
          "Текст слишком длинный. Максимум — 10 000 символов."
      });
    }
    const modeAliases = {
      improve: "improve",
      polish: "polish",
      english: "english",
      tiktok: "tiktok",
      shorten: "shorten",
      write: "write",
      reply: "reply",
      business: "business",
      summarize: "summarize",
      improve_text: "improve",
      translate_polish: "polish",
      translate_english: "english",
      create_tiktok: "tiktok",
      shorten_text: "shorten",
      write_text: "write",
      reply_message: "reply",
      business_text: "business",
      summary: "summarize"
    };
    if (
      !Object.prototype.hasOwnProperty.call(
        modeAliases,
        mode
      )
    ) {
      return res.status(400).json({
        error:
          "Неизвестный режим обработки."
      });
    }
    const normalizedMode =
      modeAliases[mode];
    const instructions = {
      improve:
        "Улучши этот текст. Исправь грамматические, орфографические и стилистические ошибки. Сделай текст естественным, грамотным и понятным. Сохрани исходный смысл. Не добавляй выдуманную информацию. Верни только готовый текст.",
      polish:
        "Переведи этот текст на польский язык. Сделай перевод естественным и грамматически правильным для носителя польского языка. Сохрани смысл и стиль исходного текста. Верни только перевод.",
      english:
        "Переведи этот текст на английский язык. Сделай перевод естественным и грамматически правильным для носителя английского языка. Сохрани смысл и стиль исходного текста. Верни только перевод.",
      tiktok:
        "Переделай этот текст в цепляющий текст для TikTok. Создай сильный первый хук, динамичную подачу и короткие фразы. Сохрани достоверность информации. Не выдумывай факты. Верни только готовый текст.",
      shorten:
        "Сократи этот текст. Сохрани главную мысль, важные детали и факты. Удали повторы, лишние слова и ненужные предложения. Верни только сокращённую версию.",
      write:
        "Напиши новый текст на основе задания пользователя. Сначала определи цель и смысл запроса, затем создай естественный, грамотный и полезный текст. Не выдумывай факты, которых нет в запросе. Если пользователь не указал стиль, используй ясный и естественный стиль. Верни только готовый текст без пояснений.",
      reply:
        "Напиши естественный ответ на сообщение пользователя. Сохрани подходящий тон исходного сообщения. Ответ должен звучать как сообщение реального человека, а не как объяснение от AI. Не добавляй информацию, которой нет в контексте. Верни только готовый ответ.",
      business:
        "Переработай текст в профессиональное деловое сообщение. Сделай его грамотным, ясным, вежливым и конкретным. Сохрани исходный смысл. Не добавляй выдуманную информацию. Верни только готовый текст.",
      summarize:
        "Сделай краткое и понятное резюме этого текста. Выдели главную мысль и наиболее важные факты. Удали второстепенные детали и повторы. Не добавляй информацию от себя. Верни только готовое резюме."
    };
    const instruction =
      instructions[normalizedMode];
    const ip = getClientIp(req);
    let limit;
    try {
      limit = await checkRateLimit(ip);
    } catch (error) {
      console.error(
        "RATE LIMIT ERROR:",
        error?.message
      );
      return res.status(503).json({
        error:
          "Сервис временно недоступен. Попробуйте снова через несколько секунд."
      });
    }
    if (!limit.allowed) {
      res.setHeader(
        "Retry-After",
        String(limit.retryAfter)
      );
      return res.status(429).json({
        error:
          "Лимит запросов временно исчерпан.",
        retryAfter:
          limit.retryAfter
      });
    }
    const geminiKey =
      process.env.GEMINI_API_KEY;
    const groqKey =
      process.env.GROQ_API_KEY;
    const openRouterKey =
      process.env.OPENROUTER_API_KEY;
    /*
     * GEMINI
     */
    if (geminiKey) {
      try {
        const {
          response: geminiResponse,
          data: geminiData
        } = await fetchJson(
          "https://generativelanguage.googleapis.com/v1beta/interactions",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              "x-goog-api-key":
                geminiKey
            },
            body: JSON.stringify({
              model:
                "gemini-3.7-flash",
              system_instruction:
                instruction,
              input:
                message,
              store:
                false
            })
          }
        );
        if (geminiResponse.ok) {
          let answer = "";
          if (
            typeof geminiData?.output_text ===
            "string"
          ) {
            answer =
              geminiData.output_text.trim();
          }
          if (
            !answer &&
            Array.isArray(
              geminiData?.steps
            )
          ) {
            for (
              const step of
                geminiData.steps
            ) {
              if (
                step?.type ===
                  "model_output" &&
                Array.isArray(
                  step.content
                )
              ) {
                for (
                  const item of
                    step.content
                ) {
                  if (
                    item?.type ===
                      "text" &&
                    typeof item.text ===
                      "string"
                  ) {
                    answer +=
                      item.text;
                  }
                }
              }
            }
          }
          answer =
            answer.trim();
          if (answer) {
            return res.status(200).json({
              answer,
              provider:
                "gemini"
            });
          }
        }
        console.error(
          "Gemini unavailable:",
          geminiResponse.status
        );
      } catch (error) {
        if (isAbortError(error)) {
          console.error(
            "Gemini timeout."
          );
        } else {
          console.error(
            "Gemini request failed:",
            error?.message
          );
        }
      }
    }
    /*
     * GROQ
     */
    if (groqKey) {
      try {
        const {
          response: groqResponse,
          data: groqData
        } = await fetchJson(
          "https://api.groq.com/openai/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              "Authorization":
                `Bearer ${groqKey}`
            },
            body: JSON.stringify({
              model:
                "openai/gpt-oss-20b",
              messages: [
                {
                  role:
                    "system",
                  content:
                    instruction
                },
                {
                  role:
                    "user",
                  content:
                    message
                }
              ],
              temperature:
                0.7,
              max_completion_tokens:
                2048,
              stream:
                false
            })
          }
        );
        if (groqResponse.ok) {
          const answer =
            groqData
              ?.choices?.[0]
              ?.message
              ?.content
              ?.trim();
          if (answer) {
            return res.status(200).json({
              answer,
              provider:
                "groq"
            });
          }
        }
        console.error(
          "Groq unavailable:",
          groqResponse.status
        );
      } catch (error) {
        if (isAbortError(error)) {
          console.error(
            "Groq timeout."
          );
        } else {
          console.error(
            "Groq request failed:",
            error?.message
          );
        }
      }
    }
    /*
     * OPENROUTER
     */
    if (openRouterKey) {
      try {
        const {
          response:
            openRouterResponse,
          data:
            openRouterData
        } = await fetchJson(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              "Authorization":
                `Bearer ${openRouterKey}`,
              "HTTP-Referer":
                "https://ai-text-helper-five.vercel.app",
              "X-Title":
                "AI Text Helper"
            },
            body: JSON.stringify({
              model:
                "openrouter/free",
              messages: [
                {
                  role:
                    "system",
                  content:
                    instruction
                },
                {
                  role:
                    "user",
                  content:
                    message
                }
              ],
              temperature:
                0.7,
              max_completion_tokens:
                2048,
              stream:
                false
            })
          }
        );
        if (openRouterResponse.ok) {
          const answer =
            openRouterData
              ?.choices?.[0]
              ?.message
              ?.content
              ?.trim();
          if (answer) {
            return res.status(200).json({
              answer,
              provider:
                "openrouter"
            });
          }
        }
        console.error(
          "OpenRouter unavailable:",
          openRouterResponse.status
        );
      } catch (error) {
        if (isAbortError(error)) {
          console.error(
            "OpenRouter timeout."
          );
        } else {
          console.error(
            "OpenRouter request failed:",
            error?.message
          );
        }
      }
    }
    return res.status(503).json({
      error:
        "Все AI-провайдеры временно недоступны."
    });
  } catch (error) {
    console.error(
      "CHAT API ERROR:",
      error?.message
    );
    return res.status(500).json({
      error:
        "Внутренняя ошибка сервера."
    });
  }
}
