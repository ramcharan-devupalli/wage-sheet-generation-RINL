const https = require('https');
const router = require('express').Router();

const GEMINI_API_HOST = 'generativelanguage.googleapis.com';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

function postJson(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request(
      {
        hostname: GEMINI_API_HOST,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 20000
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const json = data ? JSON.parse(data) : {};
            if (res.statusCode < 200 || res.statusCode >= 300) {
              const message = json.error?.message || 'Gemini request failed.';
              const err = new Error(message);
              err.statusCode = res.statusCode;
              reject(err);
              return;
            }
            resolve(json);
          } catch (err) {
            reject(err);
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('Gemini request timed out.'));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

router.post('/', async (req, res, next) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const message = String(req.body?.message || '').trim();
    const history = Array.isArray(req.body?.history) ? req.body.history : [];

    if (!apiKey) {
      return res.status(500).json({ success: false, message: 'Gemini API key is not configured.' });
    }

    if (!message) {
      return res.status(400).json({ success: false, message: 'Message is required.' });
    }

    if (message.length > 1000) {
      return res.status(400).json({ success: false, message: 'Message is too long.' });
    }

    const recentHistory = history.slice(-8).map((item) => ({
      role: item.role === 'model' ? 'model' : 'user',
      parts: [{ text: String(item.text || '').slice(0, 1000) }]
    }));

    const data = await postJson(`/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      systemInstruction: {
        parts: [{
          text: 'You are RINL Wage Portal Assistant. Help users with the contractor wage management portal, login, OTP, roles, worker attendance, wages, and general RINL portal navigation. Keep answers short and practical.'
        }]
      },
      contents: [
        ...recentHistory,
        { role: 'user', parts: [{ text: message }] }
      ],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 500
      }
    });

    const reply = data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('')
      .trim();

    res.json({
      success: true,
      reply: reply || 'I could not generate a response right now. Please try again.'
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Gemini request failed.'
    });
  }
});

module.exports = router;
