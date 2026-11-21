import mongoose from "mongoose";

const avatarSchema = new mongoose.Schema({
    url: { type: String, required: true, match: /^https:\/\// },
    publicId: { type: String, required: true, select: false },
}, { _id: false });

const credentialTokenSchema = new mongoose.Schema({
    hash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    authVersion: { type: Number, required: true },
    email: { type: String, required: true },
}, { _id: false });
const hideCredentials = (_document, value) => {
    delete value.passwordReset;
    delete value.emailChange;
    delete value.emailVerification;
    return value;
};

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
    passwordReset: { type: credentialTokenSchema, select: false },
    emailChange: { type: credentialTokenSchema, select: false },
    emailVerification: { type: credentialTokenSchema, select: false },
    // No default on purpose: a missing value (legacy accounts) means verified. Only an explicit false is unverified.
    emailVerified: { type: Boolean },
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
    toJSON: { virtuals: true, versionKey: false, transform: hideCredentials },
    toObject: { virtuals: true, versionKey: false, transform: hideCredentials },
},
);

// Token lookups need indexes, never TTL: expiry must not delete the owning account.
userSchema.index({ "passwordReset.hash": 1 }, { sparse: true });
userSchema.index({ "emailChange.hash": 1 }, { sparse: true });
userSchema.index({ "emailVerification.hash": 1 }, { sparse: true });

const User = mongoose.model("User", userSchema);
export default User;
