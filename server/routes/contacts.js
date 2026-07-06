const express = require("express");
const mongoose = require("mongoose");
const Contact = require("../models/Contact");
const requireAccess = require("../middleware/requireAccess");

const router = express.Router();

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function splitList(value) {
  if (Array.isArray(value)) return value;
  return String(value || "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeUrl(url) {
  const clean = String(url || "").trim();
  if (!clean) return "";
  if (/^https?:\/\//i.test(clean)) return clean;
  if (/^mailto:/i.test(clean)) return clean;
  return `https://${clean}`;
}

function sanitizeSocialLinks(input) {
  if (Array.isArray(input)) {
    return input
      .map((item) => ({
        label: String(item?.label || "").trim(),
        url: normalizeUrl(item?.url)
      }))
      .filter((item) => item.url);
  }

  return splitList(input).map((line) => {
    const hasLabel = line.includes("|");
    if (!hasLabel) return { label: "", url: normalizeUrl(line) };
    const [label, ...rest] = line.split("|");
    return { label: label.trim(), url: normalizeUrl(rest.join("|").trim()) };
  });
}

function sanitizeBody(body) {
  const tags = splitList(body.tags).map((tag) => tag.replace(/^#/, ""));
  return {
    name: String(body.name || "").trim(),
    title: String(body.title || "").trim(),
    company: String(body.company || "").trim(),
    location: String(body.location || "").trim(),
    email: String(body.email || "").trim(),
    phone: String(body.phone || "").trim(),
    website: normalizeUrl(body.website),
    socialLinks: sanitizeSocialLinks(body.socialLinks),
    notes: String(body.notes || "").trim(),
    tags,
    avatarDataUrl: String(body.avatarDataUrl || "").trim(),
    status: String(body.status || "active").trim(),
    priority: String(body.priority || "medium").trim(),
    lastContactedAt: parseDate(body.lastContactedAt),
    nextFollowUpAt: parseDate(body.nextFollowUpAt)
  };
}

function getSort(sortKey) {
  switch (sortKey) {
    case "name_desc":
      return { name: -1 };
    case "oldest":
      return { createdAt: 1 };
    case "updated":
      return { updatedAt: -1 };
    case "followup":
      return { nextFollowUpAt: 1, updatedAt: -1 };
    case "name_asc":
      return { name: 1 };
    case "priority":
      return { updatedAt: -1 };
    case "recent":
    default:
      return { createdAt: -1 };
  }
}

function postSort(rows, sortKey) {
  if (sortKey === "priority") {
    const priorityRank = { high: 0, medium: 1, low: 2 };
    rows.sort((a, b) => {
      const primary = (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9);
      if (primary !== 0) return primary;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }

  if (sortKey === "followup") {
    rows.sort((a, b) => {
      const aTime = a.nextFollowUpAt ? new Date(a.nextFollowUpAt).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.nextFollowUpAt ? new Date(b.nextFollowUpAt).getTime() : Number.MAX_SAFE_INTEGER;
      if (aTime !== bTime) return aTime - bTime;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }

  return rows;
}

router.use(requireAccess);

router.get("/", async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim().toLowerCase();
    const status = String(req.query.status || "all").trim();
    const priority = String(req.query.priority || "all").trim();
    const tag = String(req.query.tag || "").trim().replace(/^#/, "").toLowerCase();
    const sort = String(req.query.sort || "recent").trim();

    const match = {};
    if (q) match.searchText = { $regex: escapeRegex(q), $options: "i" };
    if (status !== "all") match.status = status;
    if (priority !== "all") match.priority = priority;
    if (tag) match.tags = { $elemMatch: { $regex: `^${escapeRegex(tag)}$`, $options: "i" } };

    const docs = await Contact.find(match).sort(getSort(sort)).limit(500);
    const rows = postSort(docs.map((doc) => doc.toJSON()), sort);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get("/stats", async (_req, res, next) => {
  try {
    const [total, statusRows, priorityRows, tagsAgg] = await Promise.all([
      Contact.countDocuments(),
      Contact.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Contact.aggregate([{ $group: { _id: "$priority", count: { $sum: 1 } } }]),
      Contact.aggregate([
        { $unwind: "$tags" },
        { $group: { _id: { $toLower: "$tags" }, count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $limit: 20 }
      ])
    ]);

    res.json({ total, statuses: statusRows, priorities: priorityRows, tags: tagsAgg });
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const payload = sanitizeBody(req.body || {});
    if (!payload.name) return res.status(400).json({ error: "Name is required" });
    if (payload.avatarDataUrl && payload.avatarDataUrl.length > 1_600_000) {
      return res.status(413).json({ error: "Avatar image is too large. Use an image under about 1 MB." });
    }

    const created = await Contact.create(payload);
    res.status(201).json(created.toJSON());
  } catch (err) {
    next(err);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid contact id" });

    const payload = sanitizeBody(req.body || {});
    if (!payload.name) return res.status(400).json({ error: "Name is required" });
    if (payload.avatarDataUrl && payload.avatarDataUrl.length > 1_600_000) {
      return res.status(413).json({ error: "Avatar image is too large. Use an image under about 1 MB." });
    }

    const updated = await Contact.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true
    });

    if (!updated) return res.status(404).json({ error: "Contact not found" });
    res.json(updated.toJSON());
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid contact id" });
    const deleted = await Contact.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Contact not found" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
