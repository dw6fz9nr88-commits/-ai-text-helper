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
          "Gemini API вернул ошибку"
      });
    }

    const answer =
      data?.output_text ||
      data?.steps
        ?.filter(step => step.type === "text")
        ?.map(step => step.text)
        ?.join("\n");

    if (!answer) {
      return res.status(500).json({
        error: "Gemini не вернул текстовый ответ"
      });
    }

    return res.status(200).json({
      answer
    });

  } catch (error) {

    return res.status(500).json({
      error:
        "Ошибка сервера: " +
        (error?.message || "неизвестная ошибка")
    });
  }
}
