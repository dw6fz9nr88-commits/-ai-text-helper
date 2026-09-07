export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "GEMINI_API_KEY не найден в Vercel"
    });
  }
  try {
    const { message } = req.body || {};
    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "Сообщение отсутствует"
      });
    }
    if (message.length > 20000) {
      return res.status(400).json({
        error: "Текст слишком большой"
      });
    }
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
          "Accept": "text/event-stream"
        },
        body: JSON.stringify({
          model: "gemini-3.7-flash",
          input: message,
          stream: true,
          store: false
        })
      }
    );
    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        error: "Gemini API error",
        details: errorText
      });
    }
    if (!response.body) {
      return res.status(500).json({
        error: "Gemini не вернул поток данных"
      });
    }
    res.statusCode = 200;
    res.setHeader(
      "Content-Type",
      "text/event-stream; charset=utf-8"
    );
    res.setHeader(
      "Cache-Control",
      "no-cache, no-transform"
    );
    res.setHeader(
      "Connection",
      "keep-alive"
    );
    res.setHeader(
      "X-Accel-Buffering",
      "no"
    );
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, {
        stream: true
      });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";
      for (const event of events) {
        const lines = event.split("\n");
        let dataLine = "";
        for (const line of lines) {
          if (line.startsWith("data:")) {
            dataLine += line.slice(5).trim();
          }
        }
        if (!dataLine || dataLine === "[DONE]") {
          continue;
        }
        try {
          const data = JSON.parse(dataLine);
          if (
            data.event_type === "step.delta" &&
            data.delta &&
            data.delta.type === "text" &&
            data.delta.text
          ) {
            res.write(
              "data: " +
              JSON.stringify({
                type: "text",
                text: data.delta.text
              }) +
              "\n\n"
            );
          }
          if (
            data.event_type === "interaction.completed"
          ) {
            res.write(
              "data: " +
              JSON.stringify({
                type: "done"
              }) +
              "\n\n"
            );
          }
        } catch {
          // Игнорируем отдельное некорректное SSE-событие
        }
      }
    }
    res.end();
  } catch (error) {
    if (!res.headersSent) {
      return res.status(500).json({
        error:
          "Ошибка сервера: " +
          (error?.message || "неизвестная ошибка")
      });
    }
    res.end();
  }
}
