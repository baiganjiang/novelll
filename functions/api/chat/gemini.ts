export const onRequestPost = async (context) => {
  const { request, env } = context;
  
  try {
    const body = await request.json();
    const { model, contents, config } = body;
    
    // Use env variable if available, otherwise use from body
    const apiKey = env.GEMINI_API_KEY || body.key;
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: contents }] }],
        generationConfig: {
          temperature: config.temperature,
          // System instruction can be passed here if needed
        }
      })
    });

    const data = await response.json();
    
    // Extract text from Gemini response
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "AI 没有返回内容。";
    
    return new Response(JSON.stringify({ text }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
