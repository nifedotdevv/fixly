import User from "../../models/users.js";

const entry = (user, id) => user ? {
  id: user._id, firstName: user.firstName, lastName: user.lastName,
  name: `${user.firstName} ${user.lastName}`.trim(), avatar: user.avatar?.url ? { url: user.avatar.url } : null,
} : { id, firstName: null, lastName: null, name: null, avatar: null };

// Adds display-only participant details. The projection is explicit: no email, phone, role or credentials.
export const withParticipants = async (views) => {
  const ids = [...new Set(views.flatMap((view) => [view.homeowner, view.artisan]).map(String))];
  if (!ids.length) return views;
  const users = await User.find({ _id: { $in: ids } }).select("firstName lastName avatar.url");
  const byId = new Map(users.map((user) => [user._id.toString(), user]));
  return views.map((view) => ({ ...view, participants: {
    homeowner: entry(byId.get(String(view.homeowner)), view.homeowner),
    artisan: entry(byId.get(String(view.artisan)), view.artisan),
  } }));
};
