export default async function handler(req, res) {
  if (req.method !== "POST") {
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
    if (message.length > 10000) {
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
      improve_text: "improve",
      translate_polish: "polish",
      translate_english: "english",
      create_tiktok: "tiktok",
      shorten_text: "shorten"
    };
    const normalizedMode =
      modeAliases[mode] || "improve";
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
        "Сократи этот текст. Сохрани главную мысль, важные детали и факты. Удали повторы, лишние слова и ненужные предложения. Верни только сокращённую версию."
    };
    const instruction =
      instructions[normalizedMode];
    const geminiKey =
      process.env.GEMINI_API_KEY;
    const groqKey =
      process.env.GROQ_API_KEY;
    const openRouterKey =
      process.env.OPENROUTER_API_KEY;
    // ==================================================
    // 1. GEMINI
    // ==================================================
    if (geminiKey) {
      try {
        const geminiResponse =
          await fetch(
            "https://generativelanguage.googleapis.com/v1beta/interactions",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": geminiKey
              },
              body: JSON.stringify({
                model: "gemini-3.7-flash",
                system_instruction: instruction,
                input: message,
                store: false
              })
            }
          );
        const geminiData =
          await geminiResponse.json();
        if (geminiResponse.ok) {
          let answer = "";
          if (
            typeof geminiData.output_text ===
            "string"
          ) {
            answer =
              geminiData.output_text.trim();
          }
          if (
            !answer &&
            Array.isArray(geminiData.steps)
          ) {
            for (
              const step of geminiData.steps
            ) {
              if (
                step.type === "model_output" &&
                Array.isArray(step.content)
              ) {
                for (
                  const item of step.content
                ) {
                  if (
                    item.type === "text" &&
                    typeof item.text === "string"
                  ) {
                    answer += item.text;
                  }
                }
              }
            }
          }
          answer = answer.trim();
          if (answer) {
            return res.status(200).json({
              answer,
              provider: "gemini"
            });
          }
        }
        console.log(
          "Gemini unavailable:",
          geminiResponse.status,
          geminiData
        );
      } catch (error) {
        console.log(
          "Gemini request failed:",
          error?.message
        );
      }
    }
    // ==================================================
    // 2. GROQ
    // ==================================================
    if (groqKey) {
      try {
        const groqResponse =
          await fetch(
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
                    role: "system",
                    content:
                      instruction
                  },
                  {
                    role: "user",
                    content:
                      message
                  }
                ],
                temperature: 0.7,
                max_completion_tokens: 2048,
                stream: false
              })
            }
          );
        const groqData =
          await groqResponse.json();
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
              provider: "groq"
            });
          }
        }
        console.log(
          "Groq unavailable:",
          groqResponse.status,
          groqData
        );
      } catch (error) {
        console.log(
          "Groq request failed:",
          error?.message
        );
      }
    }
    // ==================================================
    // 3. OPENROUTER
    // ==================================================
    if (openRouterKey) {
      try {
        const openRouterResponse =
          await fetch(
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
                    role: "system",
                    content:
                      instruction
                  },
                  {
                    role: "user",
                    content:
                      message
                  }
                ],
                temperature: 0.7,
                max_completion_tokens: 2048,
                stream: false
              })
            }
          );
        const openRouterData =
          await openRouterResponse.json();
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
              provider: "openrouter"
            });
          }
        }
        console.log(
          "OpenRouter unavailable:",
          openRouterResponse.status,
          openRouterData
        );
        return res.status(503).json({
          error:
            "Все AI-провайдеры временно недоступны."
        });
      } catch (error) {
        console.error(
          "OpenRouter request failed:",
          error?.message
        );
        return res.status(503).json({
          error:
            "Все AI-провайдеры временно недоступны."
        });
      }
    }
    // ==================================================
    // НЕТ ДОСТУПНЫХ API КЛЮЧЕЙ
    // ==================================================
    return res.status(500).json({
      error:
        "AI-провайдеры не настроены в Vercel."
    });
  } catch (error) {
    console.error(
      "CHAT API ERROR:",
      error
    );
    return res.status(500).json({
      error:
        "Внутренняя ошибка сервера."
    });
  }
}
