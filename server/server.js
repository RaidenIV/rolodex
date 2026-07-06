require("dotenv").config();

const path = require("path");
const fs = require("fs");
const express = require("express");
const mongoose = require("mongoose");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const contactsRouter = require("./routes/contacts");

const app = express();
app.set("trust proxy", 1);

app.use(
  helmet({
    frameguard: false,
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "base-uri": ["'self'"],
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
        "img-src": ["'self'", "data:", "https:"],
        "connect-src": ["'self'"],
        "frame-ancestors": ["'self'", "https://www.xodiamediagroup.com", "https://xodiamediagroup.com"]
      }
    }
  })
);

app.use(morgan("combined"));
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 160,
    standardHeaders: true,
    legacyHeaders: false
  })
);

function resolveClientDir() {
  const candidates = [
    path.join(__dirname, "..", "client"),
    path.join(__dirname, "client"),
    path.join(process.cwd(), "client")
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "index.html"))) return dir;
  }
  return candidates[0];
}

const clientDir = resolveClientDir();
const clientIndex = path.join(clientDir, "index.html");

app.use(express.static(clientDir));
app.use("/assets", express.static(path.join(clientDir, "assets")));
app.use("/css", express.static(path.join(clientDir, "css")));
app.use("/js", express.static(path.join(clientDir, "js")));
app.get("/favicon.ico", (_req, res) => res.status(204).end());

app.use("/api/contacts", contactsRouter);

app.get("/health", (_req, res) => {
  const mongoState = mongoose.connection?.readyState ?? 0;
  res.json({
    ok: true,
    mongoState,
    tokenRequired: Boolean(String(process.env.ADMIN_TOKEN || "").trim())
  });
});

app.get("*", (_req, res) => {
  res.sendFile(clientIndex);
});

app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  if (err?.name === "ValidationError") {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: "Internal Server Error" });
});

async function start() {
  const uri = String(process.env.MONGODB_URI || process.env.MONGO_URL || process.env.MONGODB_URL || "").trim();
  if (!uri) {
    console.error("Missing Mongo connection string. Set MONGODB_URI or MONGO_URL.");
    process.exit(1);
  }

  const dbName = String(process.env.DB_NAME || "").trim() || undefined;
  await mongoose.connect(uri, { dbName });

  try {
    const Contact = require("./models/Contact");
    await Contact.syncIndexes();
  } catch (err) {
    console.warn("Index sync failed; continuing:", err?.message || err);
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => {
    console.log(`Contact Tracker listening on :${port}`);
    console.log(`Serving client from: ${clientDir}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
