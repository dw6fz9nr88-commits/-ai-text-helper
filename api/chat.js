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
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
      encodeURIComponent(apiKey),
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: message
                }
              ]
            }
          ]
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
      data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!answer) {
      return res.status(500).json({
        error: "Gemini не вернул ответ"
      });
    }

    return res.status(200).json({
      answer: answer
    });

  } catch (error) {

    return res.status(500).json({
      error:
        "Ошибка сервера: " +
        (error?.message || "неизвестная ошибка")
    });
  }
}
