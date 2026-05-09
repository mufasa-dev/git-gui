export interface LicenseDetails {
    hasAccess: boolean,
    status: string,
    message: string,
    trialEndsAt: string,
    subscriptionEndsAt: string,
    isExpired: boolean,
}