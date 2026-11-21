import User from "../models/users.js";
import Profile from "../models/artisanProfile.js";

// Single visibility rule shared by the public directory and booking-by-id.
// Legacy rows with a missing emailVerified / isAvailable count as verified / available.
export const visibleProfileFilter = () => ({ isDeleted: { $ne: true }, isAvailable: { $ne: false } });
export const visibleUserFilter = () => ({ role: "artisan", isDeleted: { $ne: true }, emailVerified: { $ne: false } });

export const isArtisanBookable = async (artisanId) => {
  const [user, profile] = await Promise.all([
    User.findOne({ _id: artisanId, ...visibleUserFilter() }).select("_id").read("primary"),
    Profile.exists({ user_id: artisanId, ...visibleProfileFilter() }).read("primary"),
  ]);
  return Boolean(user && profile);
};
