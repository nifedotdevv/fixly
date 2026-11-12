import mongoose from "mongoose";

const avatarSchema = new mongoose.Schema({
    url: { type: String, required: true, match: /^https:\/\// },
    publicId: { type: String, required: true, select: false },
}, { _id: false });

const userSchema = new mongoose.Schema({
    firstName: {type: String, required: true, trim: true},
    lastName: {type: String, required: true, trim: true},
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        match: [/^\S+@\S+\.\S+$/, "Please provide a valid email"],
    },
    password: {type: String, required: true, minlength: 10, maxlength: 100 },
    // Missing on legacy accounts, whose original password length is unknown.
    passwordByteLimit: { type: Number, enum: [72], select: false },
    authVersion: { type: Number, default: 0, select: false },
    role: {
        type: String,
        required: true,
        enum: ["house_owner", "artisan", "admin"],
        default: "house_owner",
    },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    deletionReason: { type: String, enum: ["self", "admin", null], default: null, select: false },
    lifecycleAction: { type: String, enum: ["delete", "soft-delete", "restore", null], default: null, select: false, index: true },
    avatar: { type: avatarSchema, default: null },
    avatarVersion: { type: Number, default: 0, select: false },
    avatarCleanup: { type: [String], default: [], select: false },
    avatarCleanupClaim: { type: String, default: null, select: false },
    avatarCleanupClaimUntil: { type: Date, default: null, select: false },
    avatarCleanupNextAttemptAt: { type: Date, default: null, select: false, index: true },
   
},
{

    timestamps: true,
    toJSON: { virtuals: true, versionKey: false },
    toObject: { virtuals: true, versionKey: false },
},
);

const User = mongoose.model("User", userSchema);
export default User;
