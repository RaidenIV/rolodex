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


function normalizeImportedStatus(value) {
  const normalized = String(value || "active").trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (normalized === "followup") return "follow-up";
  return ["new", "active", "watchlist", "follow-up", "archived"].includes(normalized) ? normalized : "active";
}

function normalizeImportedPriority(value) {
  const normalized = String(value || "medium").trim().toLowerCase();
  return ["low", "medium", "high"].includes(normalized) ? normalized : "medium";
}

function normalizedEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizedPhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function duplicateKeys(contact) {
  const keys = [];
  const email = normalizedEmail(contact.email);
  const phone = normalizedPhone(contact.phone);
  const name = String(contact.name || "").trim().toLowerCase().replace(/\s+/g, " ");
  const company = String(contact.company || "").trim().toLowerCase().replace(/\s+/g, " ");

  if (email) keys.push(`email:${email}`);
  if (phone.length >= 7) keys.push(`phone:${phone}`);
  if (name && company) keys.push(`name-company:${name}|${company}`);

  return keys;
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


router.post("/import", async (req, res, next) => {
  try {
    const contacts = Array.isArray(req.body?.contacts) ? req.body.contacts : [];
    const skipDuplicates = req.body?.skipDuplicates !== false;

    if (!contacts.length) return res.status(400).json({ error: "No contacts were provided for import" });
    if (contacts.length > 500) return res.status(400).json({ error: "A maximum of 500 contacts can be imported at one time" });

    const seenKeys = new Set();
    if (skipDuplicates) {
      const existingContacts = await Contact.find({}, { name: 1, company: 1, email: 1, phone: 1 }).lean();
      existingContacts.forEach((contact) => duplicateKeys(contact).forEach((key) => seenKeys.add(key)));
    }

    const validDocs = [];
    const errors = [];
    let duplicates = 0;

    for (let index = 0; index < contacts.length; index += 1) {
      const source = contacts[index] || {};
      const rowNumber = Number.isInteger(Number(source._csvRow)) ? Number(source._csvRow) : index + 2;
      const payload = sanitizeBody(source);
      payload.status = normalizeImportedStatus(source.status);
      payload.priority = normalizeImportedPriority(source.priority);
      payload.avatarDataUrl = "";

      if (!payload.name) {
        errors.push({ row: rowNumber, error: "Name is required" });
        continue;
      }

      const keys = duplicateKeys(payload);
      if (skipDuplicates && keys.some((key) => seenKeys.has(key))) {
        duplicates += 1;
        continue;
      }

      try {
        const doc = new Contact(payload);
        await doc.validate();
        validDocs.push(doc);
        if (skipDuplicates) keys.forEach((key) => seenKeys.add(key));
      } catch (err) {
        errors.push({ row: rowNumber, error: err.message });
      }
    }

    let imported = 0;
    if (validDocs.length) {
      const inserted = await Contact.insertMany(validDocs.map((doc) => doc.toObject()), { ordered: false });
      imported = inserted.length;
    }

    res.status(imported ? 201 : 200).json({
      imported,
      duplicates,
      invalid: errors.length,
      errors: errors.slice(0, 25)
    });
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
