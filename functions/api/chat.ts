export const onRequestPost = async (context) => {
  const { request, env } = context;
  
  try {
    const body = await request.json();
    const { url, key, model, messages, temperature } = body;

    let fetchUrl = url.trim();
    if (!fetchUrl.endsWith('/chat/completions') && !fetchUrl.endsWith('/completions')) {
      fetchUrl = fetchUrl.replace(/\/+$/, '') + '/chat/completions';
    }

    const response = await fetch(fetchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
      })
    });

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
