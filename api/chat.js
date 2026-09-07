export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const { message } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "Сообщение отсутствует"
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;

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
          input: message,
          store: false
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error:
          data?.error?.message ||
          "Ошибка Gemini API"
      });
    }

    let answer = "";

    if (
      typeof data.output_text === "string" &&
      data.output_text.trim()
    ) {
      answer = data.output_text;
    }

    if (!answer && Array.isArray(data.steps)) {
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

    if (!answer.trim()) {
      return res.status(500).json({
        error: "Gemini не вернул текстовый ответ"
      });
    }

    return res.status(200).json({
      answer: answer.trim()
    });

  } catch (error) {

    return res.status(500).json({
      error:
        "Ошибка сервера: " +
        (error?.message || "неизвестная ошибка")
    });

  }
}
