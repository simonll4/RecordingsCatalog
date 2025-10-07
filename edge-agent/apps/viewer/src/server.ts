import "dotenv/config";
import express from "express";
import cors from "cors";
import pino from "pino";
import { DatabaseClient, SessionsRepo, DetectionsRepo } from "@edge-agent/db";
import path from "path";
import { fileURLToPath } from "url";

const logger = pino({ name: "viewer", level: process.env.LOG_LEVEL || "info" });

const app = express();
app.use(cors());
app.use(express.json());

const dbClient = new DatabaseClient();
const sessionsRepo = new SessionsRepo(dbClient.client);
const detectionsRepo = new DetectionsRepo(dbClient.client);

// Storage paths - point to cli/storage where files are actually stored
const storageDir =
  process.env.STORAGE_DIR || path.join(process.cwd(), "..", "cli", "storage");
const thumbsDir = path.join(storageDir, "thumbs");
const metaDir = path.join(storageDir, "meta");
const clipsDir = path.join(storageDir, "clips");

// API endpoints
app.get("/api/sessions", async (_req, res) => {
  try {
    const sessions = await sessionsRepo.listRecent(100);
    res.json(sessions);
  } catch (e) {
    logger.error({ e }, "Error listing sessions");
    res.status(500).json({ error: "internal_error" });
  }
});

app.get("/api/sessions/:id", async (req, res) => {
  try {
    const sessionId = req.params.id;
    const session = await sessionsRepo.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: "session_not_found" });
    }
    res.json(session);
  } catch (e) {
    logger.error({ e }, "Error getting session");
    res.status(500).json({ error: "internal_error" });
  }
});

app.get("/api/sessions/:id/detections", async (req, res) => {
  try {
    const sessionId = req.params.id;
    const dets = await detectionsRepo.listBySession(sessionId);
    res.json(dets);
  } catch (e) {
    logger.error({ e }, "Error listing detections");
    res.status(500).json({ error: "internal_error" });
  }
});

// Serve static files
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use("/thumbs", express.static(thumbsDir));
app.use("/meta", express.static(metaDir));
app.use("/media", express.static(clipsDir));
app.use("/public", express.static(path.join(__dirname, "..", "public")));

// Gallery page
app.get("/", (_req, res) => {
  res.type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Edge Agent Viewer</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:system-ui,sans-serif; background:#111; color:#eee; }
    header { background:#222; padding:1rem; border-bottom:2px solid #444; }
    h1 { font-size:1.5rem; font-weight:600; }
    main { padding:1rem; max-width:1400px; margin:0 auto; }
    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:1rem; margin-top:1rem; }
    .card { background:#222; border:1px solid #333; border-radius:8px; overflow:hidden; cursor:pointer; transition:transform 0.2s; }
    .card:hover { transform:scale(1.02); border-color:#0af; }
    .thumb { width:100%; aspect-ratio:16/9; object-fit:cover; background:#333; }
    .info { padding:0.75rem; }
    .info h3 { font-size:0.9rem; font-weight:500; margin-bottom:0.25rem; }
    .info p { font-size:0.8rem; color:#999; }
  </style>
</head>
<body>
  <header>
    <h1>🎥 Edge Agent Viewer</h1>
  </header>
  <main>
    <div id="sessions" class="grid"></div>
  </main>
  <script>
    (async () => {
      try {
        const res = await fetch("/api/sessions");
        const sessions = await res.json();
        const grid = document.getElementById("sessions");
        if(!sessions.length) {
          grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:#999;">No sessions found</p>';
          return;
        }
        sessions.forEach(s => {
          const card = document.createElement("div");
          card.className = "card";
          card.innerHTML = \`
            <img class="thumb" src="\${s.thumbUrl || '/public/placeholder.jpg'}" alt="thumbnail" onerror="this.src='/public/placeholder.jpg'" />
            <div class="info">
              <h3>\${s.name || s.sessionId.slice(0,8)}</h3>
              <p>Device: \${s.devId}</p>
              <p>\${new Date(s.edgeStartTs).toLocaleString()}</p>
            </div>
          \`;
          card.onclick = () => window.location.href = \`/session/\${s.sessionId}\`;
          grid.appendChild(card);
        });
      } catch (err) {
        console.error(err);
        document.getElementById("sessions").innerHTML = '<p style="color:#f55;">Error loading sessions</p>';
      }
    })();
  </script>
</body>
</html>
  `);
});

// Player page with canvas overlay
app.get("/session/:sessionId", async (req, res) => {
  const { sessionId } = req.params;

  res.type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Session Player</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:system-ui,sans-serif; background:#111; color:#eee; }
    header { background:#222; padding:1rem; border-bottom:2px solid #444; display:flex; align-items:center; gap:1rem; }
    header a { color:#0af; text-decoration:none; font-weight:500; }
    header a:hover { text-decoration:underline; }
    h1 { font-size:1.2rem; flex:1; }
    main { padding:1.5rem; max-width:1200px; margin:0 auto; }
    .player-container { position:relative; width:100%; max-width:960px; margin:0 auto; background:#000; border-radius:8px; overflow:hidden; }
    .placeholder-video { width:100%; aspect-ratio:16/9; background:#222; display:flex; align-items:center; justify-content:center; flex-direction:column; }
    .placeholder-video img { max-width:100%; max-height:100%; object-fit:contain; }
    .placeholder-video p { color:#666; font-size:0.9rem; margin:0.5rem; text-align:center; padding:0 1rem; }
    canvas { position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; }
    .controls { margin:1rem auto; max-width:960px; display:flex; gap:1rem; align-items:center; flex-wrap:wrap; }
    button { background:#0af; color:#000; border:none; padding:0.6rem 1.2rem; border-radius:6px; cursor:pointer; font-weight:600; font-size:0.9rem; transition:background 0.2s; }
    button:hover:not(:disabled) { background:#08d; }
    button:disabled { background:#333; color:#666; cursor:not-allowed; }
    button.secondary { background:#444; color:#eee; }
    button.secondary:hover:not(:disabled) { background:#555; }
    .info-box { margin:1.5rem auto; padding:1.25rem; background:#222; border-radius:8px; max-width:960px; border:1px solid #333; }
    .info-box h3 { margin-bottom:0.75rem; font-size:1rem; color:#0af; }
    .info-grid { display:grid; grid-template-columns:auto 1fr; gap:0.5rem 1rem; font-size:0.9rem; }
    .info-grid strong { color:#aaa; }
    .tracks-list { margin-top:1rem; max-height:200px; overflow-y:auto; }
    .track-item { padding:0.5rem; font-size:0.85rem; border-left:3px solid #0af; background:#1a1a1a; margin:0.35rem 0; border-radius:0 4px 4px 0; }
    .track-item strong { color:#0af; }
    .status { padding:0.4rem 0.8rem; background:#333; border-radius:4px; font-size:0.85rem; color:#aaa; }
  </style>
</head>
<body>
  <header>
    <a href="/">← Back to Gallery</a>
    <h1>🎥 Session Player</h1>
  </header>
  <main>
    <div class="player-container">
      <div class="placeholder-video" id="videoContainer">
        <img id="thumbnailImg" />
        <p id="videoStatus">⏳ Loading session data...</p>
      </div>
      <canvas id="overlayCanvas"></canvas>
    </div>
    <div class="controls">
      <button id="toggleOverlay">Hide Overlays</button>
      <button class="secondary" id="playPauseBtn" disabled>▶ Play Animation</button>
      <span class="status" id="trackCount">Loading...</span>
      <span class="status" id="timeDisplay">--:--</span>
    </div>
    <div class="info-box">
      <h3>📊 Session Information</h3>
      <div class="info-grid" id="sessionInfo">
        <strong>Status:</strong><span>Loading...</span>
      </div>
      <div class="tracks-list" id="tracksList"></div>
    </div>
  </main>
  <script>
    const sessionId = "${sessionId}";
    const canvas = document.getElementById("overlayCanvas");
    const ctx = canvas.getContext("2d");
    const toggleBtn = document.getElementById("toggleOverlay");
    const playPauseBtn = document.getElementById("playPauseBtn");
    const trackCountSpan = document.getElementById("trackCount");
    const timeDisplay = document.getElementById("timeDisplay");
    const sessionInfoDiv = document.getElementById("sessionInfo");
    const tracksListDiv = document.getElementById("tracksList");
    const videoContainer = document.getElementById("videoContainer");
    const thumbnailImg = document.getElementById("thumbnailImg");
    const videoStatus = document.getElementById("videoStatus");

    let tracksData = null;
    let showOverlay = true;
    let isPlaying = false;
    let currentTime = 0;
    let duration = 0;
    let animInterval = null;
    
    // Helper to setup thumbnail view with animation
    function setupThumbnailView() {
      videoStatus.textContent = "ℹ️ Video not available - showing thumbnail with animated overlays";
      playPauseBtn.disabled = false;
      
      // Setup canvas to match thumbnail
      thumbnailImg.onload = () => {
        canvas.width = thumbnailImg.naturalWidth || 640;
        canvas.height = thumbnailImg.naturalHeight || 480;
        drawOverlays();
      };
      if(thumbnailImg.complete && thumbnailImg.naturalWidth) {
        canvas.width = thumbnailImg.naturalWidth;
        canvas.height = thumbnailImg.naturalHeight;
        drawOverlays();
      }
    }

    // Fetch session and tracks metadata
    async function loadSession() {
      try {
        // Load session data
        const sessionRes = await fetch(\`/api/sessions/\${sessionId}\`);
        if (!sessionRes.ok) {
          throw new Error("Session not found");
        }
        const session = await sessionRes.json();
        
        // Load thumbnail if available
        if(session.thumbUrl) {
          thumbnailImg.src = session.thumbUrl;
          thumbnailImg.onerror = () => { thumbnailImg.style.display = 'none'; };
        }
        
        // Try to load tracks.json from session metaUrl
        if (session.metaUrl) {
          const metaRes = await fetch(session.metaUrl);
          if (!metaRes.ok) {
            throw new Error("Metadata not found");
          }
          tracksData = await metaRes.json();
          
          const trackIds = Object.keys(tracksData.tracks || {});
          duration = tracksData.duration_s || 0;
          
          trackCountSpan.textContent = \`\${trackIds.length} track\${trackIds.length !== 1 ? 's' : ''}\`;
          
          sessionInfoDiv.innerHTML = \`
            <strong>Session ID:</strong><span>\${tracksData.session_id.slice(0,13)}...</span>
            <strong>Device:</strong><span>\${tracksData.dev_id}</span>
            <strong>Started:</strong><span>\${new Date(tracksData.start_ts).toLocaleString()}</span>
            <strong>Duration:</strong><span>\${duration.toFixed(2)}s</span>
            <strong>Tracks:</strong><span>\${trackIds.length}</span>
          \`;
          
          // List tracks
          tracksListDiv.innerHTML = '<h4 style="margin-bottom:0.5rem;color:#0af;font-size:0.95rem;">Detected Tracks:</h4>' + 
            trackIds.map(tid => {
              const track = tracksData.tracks[tid];
              return \`<div class="track-item"><strong>\${tid}</strong>: \${track.label} (\${track.kf?.length || 0} keyframes)</div>\`;
            }).join("");
          
          // Try to load video if available (check if playlistUrl/streamPath exists)
          if (session.playlistUrl) {
            // Try to load the video
            const videoUrl = session.playlistUrl;
            const videoCheckRes = await fetch(videoUrl, { method: 'HEAD' });
            
            if (videoCheckRes.ok) {
              // Video exists! Replace thumbnail with video element
              videoContainer.innerHTML = \`
                <video id="videoPlayer" style="width:100%;height:100%;object-fit:contain;" controls>
                  <source src="\${videoUrl}" type="video/mp4">
                  Your browser does not support video playback.
                </video>
              \`;
              
              const video = document.getElementById('videoPlayer');
              video.addEventListener('loadedmetadata', () => {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                duration = video.duration;
              });
              
              video.addEventListener('timeupdate', () => {
                currentTime = video.currentTime;
                timeDisplay.textContent = \`\${currentTime.toFixed(1)}s / \${duration.toFixed(1)}s\`;
                drawOverlays();
              });
              
              videoStatus.textContent = "✅ Video ready - playing with live overlays";
              playPauseBtn.disabled = true; // Disable animation button, use video controls
            } else {
              // Video not found, use thumbnail
              setupThumbnailView();
            }
          } else {
            // No video URL, use thumbnail
            setupThumbnailView();
          }
          
        } else {
          trackCountSpan.textContent = "No metadata";
          videoStatus.textContent = "⚠️ No tracks metadata available";
          sessionInfoDiv.innerHTML = '<strong>Error:</strong><span>No metadata found</span>';
        }
      } catch (err) {
        console.error("Error loading session:", err);
        trackCountSpan.textContent = "Error";
        videoStatus.textContent = "❌ Error loading session data";
        sessionInfoDiv.innerHTML = '<strong>Error:</strong><span>Failed to load session</span>';
      }
    }

    // Linear interpolation between two keyframes
    function interpolateBbox(kf1, kf2, t) {
      const alpha = (t - kf1.t) / (kf2.t - kf1.t);
      return [
        kf1.bbox[0] + alpha * (kf2.bbox[0] - kf1.bbox[0]),
        kf1.bbox[1] + alpha * (kf2.bbox[1] - kf1.bbox[1]),
        kf1.bbox[2] + alpha * (kf2.bbox[2] - kf1.bbox[2]),
        kf1.bbox[3] + alpha * (kf2.bbox[3] - kf1.bbox[3])
      ];
    }

    // Get bbox for a track at time t
    function getBboxAtTime(track, t) {
      if (!track.kf || track.kf.length === 0) return null;
      
      // Find surrounding keyframes
      let before = null, after = null;
      for (let i = 0; i < track.kf.length; i++) {
        if (track.kf[i].t <= t) before = track.kf[i];
        if (track.kf[i].t >= t && !after) after = track.kf[i];
      }
      
      if (!before) return after ? after.bbox : null;
      if (!after) return before.bbox;
      if (before === after) return before.bbox;
      
      // Interpolate
      return interpolateBbox(before, after, t);
    }

    // Draw overlays
    function drawOverlays() {
      if (!showOverlay || !tracksData) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const tracks = tracksData.tracks || {};
      const colors = ["#0af", "#f0a", "#0fa", "#fa0", "#a0f", "#ff0", "#f66"];
      
      Object.keys(tracks).forEach((tid, idx) => {
        const track = tracks[tid];
        const bbox = getBboxAtTime(track, currentTime);
        
        if (bbox) {
          const [x, y, bw, bh] = bbox;
          const px = x * w;
          const py = y * h;
          const pw = bw * w;
          const ph = bh * h;
          
          const color = colors[idx % colors.length];
          
          // Draw box
          ctx.strokeStyle = color;
          ctx.lineWidth = 3;
          ctx.strokeRect(px, py, pw, ph);
          
          // Draw label background
          const label = \`\${tid}: \${track.label}\`;
          ctx.font = "bold 14px system-ui";
          const textWidth = ctx.measureText(label).width;
          ctx.fillStyle = color;
          ctx.fillRect(px, py > 22 ? py - 22 : py + ph, textWidth + 8, 20);
          
          // Draw label text
          ctx.fillStyle = "#000";
          ctx.fillText(label, px + 4, py > 22 ? py - 7 : py + ph + 15);
        }
      });
    }

    // Update time display
    function updateTimeDisplay() {
      const mins = Math.floor(currentTime / 60);
      const secs = Math.floor(currentTime % 60);
      const ms = Math.floor((currentTime % 1) * 100);
      timeDisplay.textContent = \`\${mins.toString().padStart(2,'0')}:\${secs.toString().padStart(2,'0')}.\${ms.toString().padStart(2,'0')}\`;
    }

    // Animation loop
    function animate() {
      if(!isPlaying) return;
      
      currentTime += 0.033; // ~30fps
      if(currentTime > duration) {
        currentTime = 0; // Loop
      }
      
      updateTimeDisplay();
      drawOverlays();
    }

    // Toggle overlay
    toggleBtn.onclick = () => {
      showOverlay = !showOverlay;
      toggleBtn.textContent = showOverlay ? "Hide Overlays" : "Show Overlays";
      if (!showOverlay) ctx.clearRect(0, 0, canvas.width, canvas.height);
      else drawOverlays();
    };

    // Play/Pause animation
    playPauseBtn.onclick = () => {
      isPlaying = !isPlaying;
      playPauseBtn.textContent = isPlaying ? "⏸ Pause" : "▶ Play Animation";
      if(isPlaying) {
        if(animInterval) clearInterval(animInterval);
        animInterval = setInterval(animate, 33);
      } else {
        if(animInterval) {
          clearInterval(animInterval);
          animInterval = null;
        }
      }
    };

    // Load session data
    loadSession();
    updateTimeDisplay();
  </script>
</body>
</html>
  `);
});

async function start() {
  await dbClient.connect();
  const port = process.env.PORT || 4000;
  app.listen(port, () => {
    logger.info({ port }, "Viewer server listening");
  });
}

start().catch((e) => {
  logger.error({ e }, "Failed to start viewer");
  process.exit(1);
});
