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

    const apiKey = process.env.DEEPSEEK_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "DEEPSEEK_API_KEY не найден в настройках Vercel"
      });
    }

    const response = await fetch(
      "https://api.deepseek.com/chat/completions",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + apiKey
        },

        body: JSON.stringify({
          model: "deepseek-v4-flash",

          messages: [
            {
              role: "user",
              content: message
            }
          ],

          thinking: {
            type: "disabled"
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error:
          data?.error?.message ||
          "DeepSeek вернул ошибку"
      });
    }

    const answer =
      data?.choices?.[0]?.message?.content;

    if (!answer) {
      return res.status(500).json({
        error: "DeepSeek не вернул текст ответа"
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
