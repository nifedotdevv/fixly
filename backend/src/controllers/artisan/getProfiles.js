import mongoose from "mongoose";
import Profile from "../../models/artisanProfile.js";
import User from "../../models/users.js";
import { ratingSummaries, emptyRatingSummary } from "../../services/requests/reviews.js";
import { visibleProfileFilter, visibleUserFilter } from "../../services/artisanVisibility.js";
import { normalizeTerm } from "../../utils/searchTerms.js";
import { PROFESSIONS } from "../../constants/professions.js";
import { handleMongooseError, QueryValidationError } from "../../utils/errors.js";
import {
  parsePagination,
  paginationMeta,
} from "../../utils/pagination.js";

const canSeeUnlisted = (viewer, ownerId) => viewer && (viewer.role === "admin" || viewer._id.equals(ownerId));
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const getMyProfile = async (req, res) => {
  try {
    const profile = await Profile.findOne({ user_id: req.user._id, isDeleted: { $ne: true } });
    if (!profile) {
      return res.status(404).json({ statusCode: 404, success: false, message: "Artisan profile not found" });
    }
    return res.status(200).json({
      statusCode: 200,
      success: true,
      message: "Your artisan profile retrieved successfully",
      data: { ...profile.toObject(), ratingSummary: (await ratingSummaries([profile.user_id])).get(profile.user_id.toString()) || emptyRatingSummary() },
    });
  } catch (error) {
    return handleMongooseError(res, error);
  }
};

export const getProfiles = async (req, res) => {
  try {
    const { limit, page, skip } = parsePagination(req.query);

    for (const key of ["search", "profession", "sortBy", "order", "skill", "area", "available"]) {
      if (req.query[key] !== undefined && typeof req.query[key] !== "string") {
        throw new QueryValidationError(`${key} must be a single string`);
      }
    }
    if (req.query.search?.length > 200) {
      throw new QueryValidationError("search must not exceed 200 characters");
    }

    // Bracketed keys (skill[$ne]=x) are never operators here; reject them rather than silently ignoring a filter.
    if (Object.keys(req.query).some((key) => /^(skill|area|available|profession)\[/.test(key))) {
      throw new QueryValidationError("Filters must be single plain values");
    }
    for (const key of ["skill", "area"]) {
      if (req.query[key]?.length > 60) throw new QueryValidationError(`${key} must not exceed 60 characters`);
    }
    if (req.query.available !== undefined && !["true", "false"].includes(req.query.available)) {
      throw new QueryValidationError("available must be true or false");
    }

    // Same visibility rule as booking-by-id. available=false only narrows within the visible set.
    const filter = { isDeleted: { $ne: true } };
    if (req.query.available === "true") Object.assign(filter, visibleProfileFilter());
    else if (req.query.available === "false") filter.isAvailable = false;
    // Exact, normalized value matches only: no regex or operators built from user input.
    const skill = req.query.skill && normalizeTerm(req.query.skill);
    const area = req.query.area && normalizeTerm(req.query.area);
    if (skill) filter.skills = { $eq: skill };
    const and = [];
    if (area) and.push({ $or: [{ city: { $eq: area } }, { serviceAreas: { $eq: area } }] });

    if (req.query.profession) {
      if (!PROFESSIONS.includes(req.query.profession)) {
        return res.status(400).json({
          statusCode: 400,
          success: false,
          message: `Profession must be one of: ${PROFESSIONS.join(", ")}`,
        });
      }
      filter.profession = req.query.profession;
    }

    if (req.query.search) {
      const searchRegex = new RegExp(escapeRegExp(req.query.search.trim()), "i");
      and.push({ $or: [
        { professional_headline: searchRegex },
        { profession: searchRegex },
        { skills: searchRegex },
      ] });
    }

    if (and.length) filter.$and = and;

    const sortField = ["createdAt", "experience_years", "starting_price"].includes(
      req.query.sortBy,
    )
      ? req.query.sortBy
      : "createdAt";
    const sortOrder = req.query.order === "asc" ? 1 : -1;

    const [result] = await Profile.aggregate([
      { $match: filter },
      {
        $lookup: {
          from: User.collection.name,
          localField: "user_id",
          foreignField: "_id",
          pipeline: [
            { $match: visibleUserFilter() },
            { $project: { firstName: 1, lastName: 1, role: 1, "avatar.url": 1 } },
          ],
          as: "user_id",
        },
      },
      { $unwind: "$user_id" },
      {
        $facet: {
          profiles: [
            { $sort: { [sortField]: sortOrder, _id: sortOrder } },
            { $skip: skip },
            { $limit: limit },
            { $project: { phone_number: 0, residential_address: 0, office_address: 0, __v: 0 } },
            {
              $set: {
                id: { $toString: "$_id" },
                "user_id.id": { $toString: "$user_id._id" },
                "user_id.avatar": { $ifNull: ["$user_id.avatar", null] },
              },
            },
          ],
          total: [{ $count: "count" }],
        },
      },
    ]);
    const profiles = result.profiles;
    const summaries = await ratingSummaries(profiles.map((profile) => profile.user_id._id));
    for (const profile of profiles) profile.ratingSummary = summaries.get(profile.user_id._id.toString()) || emptyRatingSummary();
    const total = result.total[0]?.count || 0;

    return res.status(200).json({
      statusCode: 200,
      success: true,
      message: "Artisan profiles retrieved successfully",
      data: profiles,
      meta: paginationMeta(total, page, limit),
    });
  } catch (error) {
    return handleMongooseError(res, error);
  }
};

export const getProfileById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        message: "You must provide a valid id parameter",
      });
    }

    const profile = await Profile.findById(id)
      .select("-phone_number -residential_address -office_address -__v")
      .populate({
        path: "user_id",
        select: "firstName lastName role avatar.url emailVerified",
        match: { role: "artisan", isDeleted: { $ne: true } },
      });

    // Unverified artisans are hidden from everyone except themselves and admins.
    const hidden = profile?.user_id?.emailVerified === false && !canSeeUnlisted(req.user, profile.user_id._id);
    if (!profile || profile.isDeleted || !profile.user_id || hidden) {
      return res.status(404).json({
        statusCode: 404,
        success: false,
        message: "Artisan profile not found",
      });
    }

    const data = profile.toObject();
    delete data.user_id.emailVerified;
    return res.status(200).json({
      statusCode: 200,
      success: true,
      message: "Artisan profile retrieved successfully",
      data: { ...data, ratingSummary: (await ratingSummaries([profile.user_id._id])).get(profile.user_id._id.toString()) || emptyRatingSummary() },
    });
  } catch (error) {
    return handleMongooseError(res, error);
  }
};
