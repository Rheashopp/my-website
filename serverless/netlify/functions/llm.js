const DEFAULT_PROVIDER = (process.env.PROVIDER || 'openai').toLowerCase();
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const allowedHeaders = {
  'Access-Control-Allow-Headers': 'Content-Type, Accept, X-Requested-With',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

exports.handler = async function handler(event) {
  const origin = event.headers.origin || '*';
  const corsHeaders = {
    ...allowedHeaders,
    'Access-Control-Allow-Origin': origin,
    Vary: 'Origin',
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (error) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Invalid JSON payload' }),
    };
  }

  const { messages, sessionId } = body;
  if (!Array.isArray(messages) || !messages.length) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Messages array is required' }),
    };
  }

  const provider = (process.env.PROVIDER || DEFAULT_PROVIDER).toLowerCase();

  try {
    const text = provider === 'gemini' ? await callGemini(messages, sessionId) : await callOpenAI(messages, sessionId);
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ text }),
    };
  } catch (error) {
    console.error('LLM proxy error', { provider, message: error.message });
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Upstream model request failed' }),
    };
  }
};

async function callOpenAI(messages, sessionId) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY missing');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages,
        max_tokens: 400,
        temperature: 0.2,
        user: sessionId || undefined,
      }),
    });
    if (!response.ok) {
      const error = await safeJson(response);
      throw new Error(error.error?.message || 'OpenAI request failed');
    }
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || '';
  } finally {
    clearTimeout(timeout);
  }
}

async function callGemini(messages, sessionId) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY missing');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const contents = messages.map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(message.content || '') }],
    }));
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        contents,
        safetySettings: [
          { category: 'HARM_CATEGORY_DANGEROUS', threshold: 'BLOCK_LOW_AND_ABOVE' },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 400,
        },
      }),
    });
    if (!response.ok) {
      const error = await safeJson(response);
      throw new Error(error.error?.message || 'Gemini request failed');
    }
    const data = await response.json();
    const candidates = data.candidates || [];
    const text = candidates[0]?.content?.parts?.map((part) => part.text).join(' ').trim();
    if (!text) {
      throw new Error('Gemini response empty');
    }
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch (error) {
    return {};
  }
}
