export interface IpLocationResult {
  lat: number | null;
  lng: number | null;
  // ISO-3166-1 alpha-2 uppercase (e.g. "US", "CA") from ip-api.com.
  // Null when the lookup failed or the provider omitted it. Public
  // locator uses this to pick USA vs Canada mode at first load so
  // we never have to ask the user.
  countryCode: string | null;
}

export async function run(): Promise<IpLocationResult> {
  try {
    // Using ip-api.com for IP-based geolocation.
    // The 'fields' parameter limits the response to only necessary data.
    const response = await fetch(
      'https://ip-api.com/json/?fields=lat,lon,status,message,countryCode',
    );
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    if (data.status === 'success' && data.lat !== undefined && data.lon !== undefined) {
      console.log("IP Geolocation API response:", data);
      return {
        lat: data.lat,
        lng: data.lon,
        countryCode:
          typeof data.countryCode === 'string' && data.countryCode.length > 0
            ? String(data.countryCode).toUpperCase()
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