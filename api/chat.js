export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        {
          status: 405,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    try {
      const body = await request.json();
      const message = body.message;

      if (!message || typeof message !== "string") {
        return new Response(
          JSON.stringify({ error: "Message is required" }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json"
            }
          }
        );
      }

      const apiKey = process.env.DEEPSEEK_API_KEY;

      if (!apiKey) {
        return new Response(
          JSON.stringify({
            error: "DEEPSEEK_API_KEY не найден в Vercel"
          }),
          {
            status: 500,
            headers: {
              "Content-Type": "application/json"
            }
          }
        );
      }

      const deepseekResponse = await fetch(
        "https://api.deepseek.com/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
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

      const data = await deepseekResponse.json();

      if (!deepseekResponse.ok) {
        return new Response(
          JSON.stringify({
            error:
              data?.error?.message ||
              "Ошибка DeepSeek API"
          }),
          {
            status: deepseekResponse.status,
            headers: {
              "Content-Type": "application/json"
            }
          }
        );
      }

      const answer =
        data?.choices?.[0]?.message?.content;

      if (!answer) {
        return new Response(
          JSON.stringify({
            error: "DeepSeek не вернул ответ"
          }),
          {
            status: 500,
            headers: {
              "Content-Type": "application/json"
            }
          }
        );
      }

      return new Response(
        JSON.stringify({
          answer: answer
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );

    } catch (error) {

      return new Response(
        JSON.stringify({
          error: error.message || "Server error"
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }
  }
};
