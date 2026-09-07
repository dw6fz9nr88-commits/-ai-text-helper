export default async function handler(req, res) {
  return res.status(200).json({
    answer: "✅ API работает!"
  });
}
