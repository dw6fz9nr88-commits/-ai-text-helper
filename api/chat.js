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
        error: "Текст слишком длинный. Максимум — 10 000 символов."
      });
    }

    /*
      Поддерживаем все варианты названий,
      которые может отправить интерфейс.
    */

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

    const apiKey =
      process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY не найден в Vercel"
      });
    }

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
            instructions[normalizedMode],
          input: message,
          store: false
        })
      }
    );

    const data =
      await response.json();

    if (!response.ok) {
      const errorMessage =
        data?.error?.message ||
        "Ошибка Gemini API";

      if (response.status === 429) {
        const match =
          errorMessage.match(
            /retry in ([0-9.]+)s/i
          );

        const retryAfter =
          match
            ? Math.ceil(Number(match[1]))
            : 60;

        return res.status(429).json({
          error:
            "Лимит AI временно исчерпан. Попробуйте снова позже.",
          retryAfter
        });
      }

      if (
        response.status === 401 ||
        response.status === 403
      ) {
        return res.status(response.status).json({
          error:
            "Ошибка доступа к Gemini API. Проверь API-ключ."
        });
      }

      return res.status(response.status).json({
        error: errorMessage
      });
    }

    let answer = "";

    if (
      typeof data.output_text === "string"
    ) {
      answer =
        data.output_text.trim();
    }

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

    answer =
      answer.trim();

    if (!answer) {
      return res.status(502).json({
        error:
          "Gemini не вернул текстовый ответ"
      });
    }

    return res.status(200).json({
      answer
    });

  } catch (error) {

    console.error(
      "CHAT API ERROR:",
      error
    );

    return res.status(500).json({
      error:
        "Внутренняя ошибка сервера. Попробуйте ещё раз."
    });
  }
}
