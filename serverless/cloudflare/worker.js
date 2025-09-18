export default {
  async fetch(request, env) {
    const allowedOrigin = 'https://rheashopp.github.io';
    const corsHeaders = {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept, X-Requested-With',
      Vary: 'Origin',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let payload;
    try {
      payload = await request.json();
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { messages, sessionId } = payload || {};
    if (!Array.isArray(messages) || !messages.length) {
      return new Response(JSON.stringify({ error: 'Messages array is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const provider = (env.PROVIDER || 'openai').toLowerCase();

    try {
      const text = provider === 'gemini'
        ? await callGemini(messages, env)
        : await callOpenAI(messages, env, sessionId);
      return new Response(JSON.stringify({ text }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('Worker llm error', error);
      return new Response(JSON.stringify({ error: 'Upstream model request failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};

async function callOpenAI(messages, env, sessionId) {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY missing');
  }
  const model = env.OPENAI_MODEL || 'gpt-4o-mini';
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 400,
      temperature: 0.2,
      user: sessionId || undefined,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const error = await safeJson(response);
    throw new Error(error.error?.message || 'OpenAI request failed');
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

async function callGemini(messages, env) {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY missing');
  }
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
  const contents = messages.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(message.content || '') }],
  }));
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
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
    signal: AbortSignal.timeout(15000),
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
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch (error) {
    return {};
  }
}
