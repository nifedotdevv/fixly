import mongoose from "mongoose";
import { PROFESSIONS } from "../constants/professions.js";
import { normalizeTerm } from "../utils/searchTerms.js";

const term = (max) => ({ type: String, trim: true, maxlength: max, set: normalizeTerm });

const profileSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      unique: true,
      ref: "User",
      index: true,
    },
    professional_headline: { type: String, required: true, trim: true },
    profession: {
      type: String,
      required: true,
      index: true,
      enum: PROFESSIONS,
    },
    experience_years: { type: Number, required: true, min: 0 },
    rating: { type: [Number], default: [] },
    phone_number: { type: String, required: true, trim: true, minlength: 7 },
    starting_price: { type: Number, required: true, min: 0 },
    residential_address: { type: String, required: true, trim: true },
    office_address: { type: String, required: true, trim: true },
    // Lowercased, whitespace-collapsed so public filters are exact matches (no regex).
    skills: { type: [term(40)], default: [], validate: [(v) => v.length <= 10, "skills must have at most 10 entries"] },
    city: term(60),
    serviceAreas: { type: [term(60)], default: [], validate: [(v) => v.length <= 20, "serviceAreas must have at most 20 entries"] },
    // Missing on legacy profiles, which count as available.
    isAvailable: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, versionKey: false },
    toObject: { virtuals: true, versionKey: false },
  },
);

profileSchema.index({ isDeleted: 1, profession: 1, isAvailable: 1, createdAt: -1 });
profileSchema.index({ skills: 1 });
profileSchema.index({ serviceAreas: 1 });
profileSchema.index({ city: 1 });

const Profile = mongoose.model("Profile", profileSchema);
export default Profile;
