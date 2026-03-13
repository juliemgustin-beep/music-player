const API_BASE = "https://api.spotify.com/v1";
const HOME_EPISODE_LIMIT = 3;
const KIDS_EPISODE_LIMIT = 100;
const DATA_CACHE_VERSION = "spotify-lite-data-v3";
const TOKEN_CACHE_KEY = "spotify-lite-token-cache";

const pageType = document.body.dataset.page || "home";
const podcastsRoot = document.getElementById("podcasts");
const playlistsRoot = document.getElementById("playlists");
let expandedPodcastCard = null;

bootstrap();

async function bootstrap() {
  registerServiceWorker();

  if (!Array.isArray(PODCASTS) || !Array.isArray(PLAYLISTS)) {
    if (podcastsRoot) {
      renderStateCard(
        podcastsRoot,
        "Config is missing. Make sure config.js defines PODCASTS and PLAYLISTS."
      );
    }
    if (playlistsRoot) {
      renderStateCard(
        playlistsRoot,
        "Config is missing. Make sure config.js defines PODCASTS and PLAYLISTS."
      );
    }
    return;
  }

  if (!hasSpotifyAuthConfig()) {
    if (podcastsRoot) {
      renderStateCard(
        podcastsRoot,
        "Add a Cloudflare Worker token endpoint in config.js to load this page automatically."
      );
    }
    if (playlistsRoot) {
      renderStateCard(
        playlistsRoot,
        "Add a Cloudflare Worker token endpoint in config.js to load your playlists."
      );
    }
    return;
  }

  if (podcastsRoot) {
    renderStateCard(podcastsRoot, "Loading podcasts...");
  }
  if (playlistsRoot) {
    renderStateCard(playlistsRoot, "Loading playlists...");
  }

  if (pageType === "kids") {
    await loadKidsPage();
    return;
  }

  await loadHomePage();
}

async function loadHomePage() {
  await Promise.all([loadPodcasts("Julie’s Daily Pods", HOME_EPISODE_LIMIT), loadPlaylists()]);
}

async function loadKidsPage() {
  await loadPodcasts("Kids", KIDS_EPISODE_LIMIT);
}

async function loadPodcasts(groupName, episodeLimit) {
  const curated = PODCASTS.filter((podcast) => podcast.id && podcast.group === groupName);

  if (!podcastsRoot) {
    return;
  }

  if (!curated.length) {
    renderStateCard(podcastsRoot, "Add podcast IDs in config.js to populate this section.");
    return;
  }

  try {
    const cards = await Promise.all(
      curated.map((podcast) => fetchPodcastEpisodes(podcast, episodeLimit))
    );
    podcastsRoot.replaceChildren(...cards);
  } catch (error) {
    console.error(error);
    renderStateCard(
      podcastsRoot,
      "Spotify couldn't load podcasts. Check your IDs and token endpoint, then try again."
    );
  }
}

async function loadPlaylists() {
  const curated = PLAYLISTS.filter((playlist) => playlist.id);

  if (!playlistsRoot) {
    return;
  }

  if (!curated.length) {
    renderStateCard(playlistsRoot, "Add playlist IDs in config.js to populate this section.");
    return;
  }

  try {
    const cards = await Promise.all(curated.map(fetchPlaylist));
    playlistsRoot.replaceChildren(...cards);
  } catch (error) {
    console.error(error);
    renderStateCard(
      playlistsRoot,
      "Spotify couldn't load playlists. Check your IDs and token endpoint, then try again."
    );
  }
}

async function fetchPodcastEpisodes(podcast, episodeLimit) {
  const items = await fetchShowEpisodes(podcast.id, episodeLimit);

  const panel = document.createElement("article");
  panel.className = pageType === "kids" ? "panel panel-kids panel-collapsible" : "panel panel-collapsible";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "panel-toggle";
  button.setAttribute("aria-expanded", "false");

  button.append(
    buildPanelHead({
      title: podcast.name,
      subtitle: `${episodeLimit} recent episodes`,
      imageUrl: items[0]?.images?.[0]?.url || "",
      fallbackText: podcast.name,
      collapsible: true
    })
  );

  const body = document.createElement("div");
  body.className = "panel-body";
  body.hidden = true;

  const episodeList = document.createElement("div");
  episodeList.className = pageType === "kids" ? "episode-list episode-list-kids" : "episode-list";

  if (!items.length) {
    episodeList.appendChild(makeStateCard("No episodes were returned for this podcast."));
  } else {
    items.forEach((episode) => episodeList.appendChild(buildEpisodeLink(episode)));
  }

  body.appendChild(episodeList);
  panel.append(button, body);
  setupCollapsibleCard(panel, button, body);

  return panel;
}

async function fetchShowEpisodes(showId, desiredCount) {
  const pageSize = Math.min(desiredCount, 50);
  let offset = 0;
  let items = [];

  while (items.length < desiredCount) {
    const endpoint = `${API_BASE}/shows/${encodeURIComponent(
      showId
    )}/episodes?market=US&limit=${pageSize}&offset=${offset}`;
    const data = await fetchSpotify(endpoint);
    const batch = Array.isArray(data.items) ? data.items : [];

    items = items.concat(batch);

    if (!batch.length || !data.next) {
      break;
    }

    offset += batch.length;
  }

  return items.slice(0, desiredCount);
}

async function fetchPlaylist(playlist) {
  const endpoint = `${API_BASE}/playlists/${encodeURIComponent(
    playlist.id
  )}?market=US&fields=id,name,description,external_urls,images,tracks(total)`;
  const data = await fetchSpotify(endpoint);

  const panel = document.createElement("article");
  panel.className = "panel";
  panel.append(
    buildPanelHead({
      title: data.name || playlist.name,
      subtitle: `${data.tracks?.total || 0} tracks`,
      imageUrl: data.images?.[0]?.url || "",
      fallbackText: playlist.name,
      collapsible: false
    })
  );

  const wrap = document.createElement("div");
  wrap.className = "playlist-wrap";

  const link = document.createElement("a");
  link.className = "playlist-link";
  link.href = `https://open.spotify.com/playlist/${playlist.id}`;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.innerHTML = `
    <span class="playlist-copy">
      <strong>${escapeHtml(data.name || playlist.name)}</strong>
      <span>${escapeHtml(stripHtml(data.description) || "Open playlist in Spotify")}</span>
    </span>
    <span class="arrow" aria-hidden="true">↗</span>
  `;

  wrap.appendChild(link);
  panel.appendChild(wrap);
  return panel;
}

function setupCollapsibleCard(panel, button, body) {
  button.addEventListener("click", () => {
    const isExpanded = panel.classList.contains("is-expanded");

    if (isExpanded) {
      collapsePodcastCard(panel, button, body);
      if (expandedPodcastCard === panel) {
        expandedPodcastCard = null;
      }
      return;
    }

    if (expandedPodcastCard && expandedPodcastCard !== panel) {
      const activeButton = expandedPodcastCard.querySelector(".panel-toggle");
      const activeBody = expandedPodcastCard.querySelector(".panel-body");
      collapsePodcastCard(expandedPodcastCard, activeButton, activeBody);
    }

    expandPodcastCard(panel, button, body);
    expandedPodcastCard = panel;
  });
}

function expandPodcastCard(panel, button, body) {
  panel.classList.add("is-expanded");
  button.setAttribute("aria-expanded", "true");
  body.hidden = false;
  body.style.height = `${body.scrollHeight}px`;

  const onExpandEnd = (event) => {
    if (event.propertyName === "height") {
      body.style.height = "auto";
      body.removeEventListener("transitionend", onExpandEnd);
    }
  };

  body.addEventListener("transitionend", onExpandEnd);
}

function collapsePodcastCard(panel, button, body) {
  panel.classList.remove("is-expanded");
  button.setAttribute("aria-expanded", "false");

  const startHeight = body.scrollHeight;
  body.style.height = `${startHeight}px`;
  void body.offsetHeight;
  body.style.height = "0px";

  const onCollapseEnd = (event) => {
    if (event.propertyName === "height") {
      body.hidden = true;
      body.removeEventListener("transitionend", onCollapseEnd);
    }
  };

  body.addEventListener("transitionend", onCollapseEnd);
}

async function fetchSpotify(url) {
  const cached = readCachedResponse(url);
  if (cached) {
    return cached;
  }

  const data = await fetchSpotifyWithToken(url, await getAccessToken());
  writeCachedResponse(url, data);
  return data;
}

async function fetchSpotifyWithToken(url, accessToken) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (response.status === 401 && !SPOTIFY_ACCESS_TOKEN) {
    clearTokenCache();
    const refreshedToken = await getAccessToken();

    if (refreshedToken !== accessToken) {
      return fetchSpotifyWithToken(url, refreshedToken);
    }
  }

  if (!response.ok) {
    throw new Error(`Spotify API error ${response.status}`);
  }

  return response.json();
}

async function getAccessToken() {
  if (SPOTIFY_ACCESS_TOKEN) {
    return SPOTIFY_ACCESS_TOKEN;
  }

  const cached = readTokenCache();
  if (cached) {
    return cached;
  }

  if (!SPOTIFY_TOKEN_ENDPOINT) {
    throw new Error("Missing SPOTIFY_TOKEN_ENDPOINT in config.js");
  }

  const response = await fetch(SPOTIFY_TOKEN_ENDPOINT, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Token endpoint error ${response.status}`);
  }

  const data = await response.json();
  if (!data.access_token) {
    throw new Error("Token endpoint did not return access_token");
  }

  writeTokenCache(data.access_token, data.expires_at);
  return data.access_token;
}

function hasSpotifyAuthConfig() {
  return Boolean(SPOTIFY_ACCESS_TOKEN || SPOTIFY_TOKEN_ENDPOINT);
}

function buildPanelHead({ title, subtitle, imageUrl, fallbackText, collapsible }) {
  const head = document.createElement("div");
  head.className = collapsible ? "panel-head panel-head-collapsible" : "panel-head";

  if (imageUrl) {
    const image = document.createElement("img");
    image.className = "artwork";
    image.src = imageUrl;
    image.alt = `${title} artwork`;
    image.loading = "lazy";
    head.appendChild(image);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "artwork placeholder";
    placeholder.setAttribute("aria-hidden", "true");
    placeholder.textContent = initials(fallbackText);
    head.appendChild(placeholder);
  }

  const text = document.createElement("div");
  text.className = "panel-head-copy";
  text.innerHTML = `
    <h3 class="panel-title">${escapeHtml(title)}</h3>
    <p class="panel-copy">${escapeHtml(subtitle)}</p>
  `;
  head.appendChild(text);

  if (collapsible) {
    const chevron = document.createElement("span");
    chevron.className = "chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "+";
    head.appendChild(chevron);
  }

  return head;
}

function buildEpisodeLink(episode) {
  const link = document.createElement("a");
  link.className = pageType === "kids" ? "tap-card tap-card-kids" : "tap-card";
  link.href = episode.external_urls?.spotify || `https://open.spotify.com/episode/${episode.id}`;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.innerHTML = `
    <span class="tap-copy">
      <strong>${escapeHtml(episode.name || "Untitled episode")}</strong>
      <span>${escapeHtml(formatDate(episode.release_date))}</span>
    </span>
    <span class="arrow" aria-hidden="true">↗</span>
  `;
  return link;
}

function renderStateCard(root, message) {
  root.replaceChildren(makeStateCard(message));
}

function makeStateCard(message) {
  const card = document.createElement("div");
  card.className = "state-card";
  card.textContent = message;
  return card;
}

function formatDate(value) {
  if (!value) {
    return "Spotify";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function stripHtml(value) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = value || "";
  return wrapper.textContent?.trim() || "";
}

function initials(value) {
  return (value || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function readCachedResponse(key) {
  try {
    const raw = localStorage.getItem(`${DATA_CACHE_VERSION}:${key}`);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (Date.now() > parsed.expiresAt) {
      localStorage.removeItem(`${DATA_CACHE_VERSION}:${key}`);
      return null;
    }

    return parsed.data;
  } catch (error) {
    console.warn("Response cache read failed", error);
    return null;
  }
}

function writeCachedResponse(key, data) {
  try {
    localStorage.setItem(
      `${DATA_CACHE_VERSION}:${key}`,
      JSON.stringify({
        expiresAt: Date.now() + 15 * 60 * 1000,
        data
      })
    );
  } catch (error) {
    console.warn("Response cache write failed", error);
  }
}

function readTokenCache() {
  try {
    const raw = localStorage.getItem(TOKEN_CACHE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!parsed.accessToken || Date.now() > parsed.expiresAt) {
      localStorage.removeItem(TOKEN_CACHE_KEY);
      return null;
    }

    return parsed.accessToken;
  } catch (error) {
    console.warn("Token cache read failed", error);
    return null;
  }
}

function writeTokenCache(accessToken, expiresAt) {
  try {
    localStorage.setItem(
      TOKEN_CACHE_KEY,
      JSON.stringify({
        accessToken,
        expiresAt: expiresAt || Date.now() + 55 * 60 * 1000
      })
    );
  } catch (error) {
    console.warn("Token cache write failed", error);
  }
}

function clearTokenCache() {
  try {
    localStorage.removeItem(TOKEN_CACHE_KEY);
  } catch (error) {
    console.warn("Token cache clear failed", error);
  }
}


function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js").catch((error) => {
        console.warn("Service worker registration failed", error);
      });
    });
  }
}
