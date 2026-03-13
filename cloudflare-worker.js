let tokenCache = {
  accessToken: null,
  expiresAt: 0
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    const url = new URL(request.url);
    if (url.pathname !== "/token") {
      return json({ error: "Not found" }, 404);
    }

    if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) {
      return json({ error: "Worker secrets are not configured" }, 500);
    }

    try {
      const token = await getSpotifyToken(env);
      return json(token, 200);
    } catch (error) {
      return json(
        { error: "Failed to fetch Spotify token", detail: String(error.message || error) },
        502
      );
    }
  }
};

async function getSpotifyToken(env) {
  const now = Date.now();
  if (tokenCache.accessToken && now < tokenCache.expiresAt) {
    return {
      access_token: tokenCache.accessToken,
      expires_at: tokenCache.expiresAt
    };
  }

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env.SPOTIFY_CLIENT_ID,
      client_secret: env.SPOTIFY_CLIENT_SECRET
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Spotify auth failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: now + Math.max((data.expires_in - 60) * 1000, 60 * 1000)
  };

  return {
    access_token: tokenCache.accessToken,
    expires_at: tokenCache.expiresAt
  };
}

function json(payload, status) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders
    }
  });
}
