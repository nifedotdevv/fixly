export const getMe = (req, res) => {
  const user = req.user;
  return res.status(200).json({
    statusCode: 200,
    success: true,
    message: "Personal profile retrieved successfully",
    data: {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified !== false,
      avatar: user.avatar ? { url: user.avatar.url } : null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
  });
};
