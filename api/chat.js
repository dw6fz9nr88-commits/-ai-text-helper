export default async function handler(req, res) {
  // Проверяем HTTP-метод
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Метод не поддерживается"
    });
  }

  try {
    // Получаем данные
    const { message, mode } = req.body || {};

    // Проверка текста
    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "Введите текст"
      });
    }

    const text = message.trim();

    // Защита от слишком больших запросов
    if (text.length > 10000) {
      return res.status(413).json({
        error: "Текст слишком длинный. Максимум — 10 000 символов."
      });
    }

    // Проверяем режим
    const allowedModes = [
      "improve",
      "polish",
      "english",
      "tiktok",
      "shorten"
    ];

    if (!allowedModes.includes(mode)) {
      return res.status(400).json({
        error: "Неизвестный режим обработки"
      });
    }

    // API-ключ
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY не найден в Vercel"
      });
    }

    // Инструкции для AI
    const instructions = {

      improve:
        "Улучши текст. Исправь ошибки, сделай его грамотным, естественным и понятным. Сохрани исходный смысл. Не добавляй выдуманные факты. Верни только готовый текст.",

      polish:
        "Переведи текст на польский язык. Сделай перевод естественным для носителя польского языка. Сохрани смысл и стиль исходного текста. Верни только перевод.",

      english:
        "Переведи текст на английский язык. Сделай перевод естественным для носителя английского языка. Сохрани смысл и стиль исходного текста. Верни только перевод.",

      tiktok:
        "Переделай текст в цепляющий сценарий для TikTok. Сделай сильный первый хук, динамичную подачу и короткие фразы. Сохрани достоверность информации и не выдумывай факты. Верни только готовый текст.",

      shorten:
        "Сократи текст. Сохрани главную мысль, важные детали и факты. Удали повторы и лишние слова. Верни только сокращённую версию."
    };

    // Запрос к Gemini
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },

        body: JSON.stringify({
          model: "gemini-3.7-flash",

          system_instruction:
            instructions[mode],

          input: text,

          store: false,

          generation_config: {
            thinking_level: "low"
          }
        })
      }
    );

    // Получаем JSON
    const data = await response.json();

    // Обработка ошибки Gemini
    if (!response.ok) {

      const errorMessage =
        data?.error?.message ||
        "Gemini API вернул ошибку";

      // Лимит запросов
      if (response.status === 429) {

        const retryMatch =
          errorMessage.match(
            /retry in ([0-9.]+)s/i
          );

        const retrySeconds =
          retryMatch
            ? Math.ceil(Number(retryMatch[1]))
            : null;

        return res.status(429).json({
          error: "Лимит AI временно исчерпан.",
          retryAfter: retrySeconds
        });
      }

      // Ошибка авторизации
      if (
        response.status === 401 ||
        response.status === 403
      ) {
        return res.status(response.status).json({
          error: "Ошибка доступа к Gemini API. Проверь API-ключ."
        });
      }

      // Другие ошибки Gemini
      return res.status(response.status).json({
        error: errorMessage
      });
    }

    // Извлекаем ответ
    let answer = "";

    // Основной вариант
    if (
      typeof data.output_text === "string" &&
      data.output_text.trim()
    ) {
      answer = data.output_text.trim();
    }

    // REST fallback
    if (
      !answer &&
      Array.isArray(data.steps)
    ) {

      for (const step of data.steps) {

        if (
          step.type === "model_output" &&
          Array.isArray(step.content)
        ) {

          for (const item of step.content) {

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

    // Gemini не вернул текст
    if (!answer) {
      return res.status(502).json({
        error: "Gemini не вернул текстовый ответ"
      });
    }

    // Успешный ответ
    return res.status(200).json({
      answer
    });

  } catch (error) {

    console.error("CHAT API ERROR:", error);

    return res.status(500).json({
      error:
        "Внутренняя ошибка сервера. Попробуйте ещё раз."
    });
  }
}
