import Profile from "../../models/artisanProfile.js";
import User from "../../models/users.js";
import { runAccountLifecycle } from "../../services/accountLifecycle.js";
import { handleMongooseError, isDuplicateKey } from "../../utils/errors.js";

const createProfileForAccount = async (userId, body) => {
  const {
    professional_headline,
    profession,
    experience_years,
    phone_number,
    starting_price,
    residential_address,
    office_address,
  } = body;

  const user = await User.findById(userId);

  if (!user || user.isDeleted) {
    return {
      statusCode: 404,
      success: false,
      message: "User not found",
    };
  }

  if (user.role !== "artisan") {
    return {
      statusCode: 403,
      success: false,
      message:
        "You must be an artisan in order to create a professional profile",
    };
  }

  const existingProfile = await Profile.findOne({
    user_id: user._id,
  });

  if (existingProfile) {
    return {
      statusCode: 409,
      success: false,
      message: "User profile already exists.",
    };
  }

  const newProfile = await Profile.create({
    user_id: user._id,
    professional_headline,
    profession,
    experience_years,
    phone_number,
    starting_price,
    residential_address,
    office_address,
  });

  return {
    statusCode: 201,
    success: true,
    message: "Profile created successfully",
    data: {
      id: newProfile._id,
      user_id: newProfile.user_id,
      professional_headline: newProfile.professional_headline,
      profession: newProfile.profession,
      experience_years: newProfile.experience_years,
      rating: newProfile.rating,
      phone_number: newProfile.phone_number,
      starting_price: newProfile.starting_price,
      residential_address: newProfile.residential_address,
      office_address: newProfile.office_address,
      createdAt: newProfile.createdAt,
      updatedAt: newProfile.updatedAt,
      personal_profile: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
      },
    },
  };
};

export const createProfile = async (req, res) => {
  try {
    const response = await runAccountLifecycle(req.user._id, "create-profile", () =>
      createProfileForAccount(req.user._id, req.body));
    return res.status(response.statusCode).json(response);
  } catch (error) {
    if (isDuplicateKey(error)) {
      return res.status(409).json({
        statusCode: 409,
        success: false,
        message: "User profile already exists.",
      });
    }
    console.error("Profile error:", error);
    return handleMongooseError(res, error);
  }
};
