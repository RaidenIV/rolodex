const mongoose = require("mongoose");

const SocialLinkSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, default: "" },
    url: { type: String, trim: true, default: "" }
  },
  { _id: false }
);

const ContactSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    title: { type: String, trim: true, default: "" },
    company: { type: String, trim: true, default: "" },
    location: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    website: { type: String, trim: true, default: "" },
    socialLinks: { type: [SocialLinkSchema], default: [] },
    notes: { type: String, trim: true, default: "" },
    tags: { type: [String], default: [] },
    avatarDataUrl: { type: String, default: "" },
    status: {
      type: String,
      enum: ["new", "active", "watchlist", "follow-up", "archived"],
      default: "active",
      index: true
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
      index: true
    },
    lastContactedAt: { type: Date, default: null },
    nextFollowUpAt: { type: Date, default: null },
    searchText: { type: String, index: true, default: "" }
  },
  { timestamps: true }
);

function normalizeList(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .slice(0, 30);
}

function normalizeSocialLinks(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map((item) => ({
      label: String(item?.label || "").trim().slice(0, 40),
      url: String(item?.url || "").trim().slice(0, 500)
    }))
    .filter((item) => item.url)
    .slice(0, 12);
}

ContactSchema.pre("validate", function normalizeContact(next) {
  this.tags = normalizeList(this.tags).map((tag) => tag.replace(/^#/, ""));
  this.socialLinks = normalizeSocialLinks(this.socialLinks);

  const searchParts = [
    this.name,
    this.title,
    this.company,
    this.location,
    this.email,
    this.phone,
    this.website,
    this.notes,
    this.status,
    this.priority,
    ...(this.tags || []),
    ...(this.socialLinks || []).flatMap((link) => [link.label, link.url])
  ];

  this.searchText = searchParts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  next();
});

ContactSchema.virtual("id").get(function getId() {
  return this._id.toString();
});

ContactSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: function transformContact(_doc, ret) {
    delete ret._id;
    delete ret.searchText;
    return ret;
  }
});

ContactSchema.index({ name: 1, company: 1 });
ContactSchema.index({ searchText: "text" });

module.exports = mongoose.model("Contact", ContactSchema);
