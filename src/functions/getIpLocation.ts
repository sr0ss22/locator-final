export interface IpLocationResult {
  lat: number | null;
  lng: number | null;
  // ISO-3166-1 alpha-2 uppercase (e.g. "US", "CA") from ipwho.is.
  // Null when the lookup failed or the provider omitted it. Public
  // locator uses this to pick USA vs Canada mode at first load so
  // we never have to ask the user.
  countryCode: string | null;
}

export async function run(): Promise<IpLocationResult> {
  try {
    // Using ipwho.is for IP-based geolocation. ip-api.com's free tier only
    // serves plain HTTP, which the browser blocks as mixed content on this
    // HTTPS site (surfaces as an opaque 403). ipwho.is supports HTTPS on its
    // free tier with no API key.
    const response = await fetch('https://ipwho.is/');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    if (data.success && data.latitude !== undefined && data.longitude !== undefined) {
      console.log("IP Geolocation API response:", data);
      return {
        lat: data.latitude,
        lng: data.longitude,
        countryCode:
          typeof data.country_code === 'string' && data.country_code.length > 0
            ? String(data.country_code).toUpperCase()
            : null,
      };
    } else {
      console.warn("IP Geolocation failed:", data.message || "Unknown error");
      return { lat: null, lng: null, countryCode: null };
    }
  } catch (error) {
    console.error("Error fetching IP-based coordinates:", error);
    return { lat: null, lng: null, countryCode: null };
  }
}