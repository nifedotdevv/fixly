// Our Paystack references, and the PaymentEvent id each one settles under.
export const REFERENCE = /^fx-(ins|dep|bal)-[a-f\d]{24}-[a-f\d]{12}$/;
export const PROVIDER_PREFIX = "paystack:";
export const providerReference = (reference) => `${PROVIDER_PREFIX}${reference}`;
export const isOurReference = (reference) => typeof reference === "string" && REFERENCE.test(reference);
