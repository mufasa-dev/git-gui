export function formatContributorName(rawName: string) {
    if (!rawName) return "Unknown";

    const nameWithoutDomain = rawName.includes('\\') 
        ? rawName.split('\\').pop() 
        : rawName;

    if (!nameWithoutDomain) return rawName;

    if (nameWithoutDomain.includes('.')) {
        return nameWithoutDomain
        .split('.')
        .map(part => {
            return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
        })
        .join(' ');
    }

    return nameWithoutDomain;
};