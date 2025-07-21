export async function run() {
  try {
    // Using ip-api.com for IP-based geolocation.
    // The 'fields' parameter limits the response to only necessary data.
    const response = await fetch('https://ip-api.com/json/?fields=lat,lon,status,message'); // Changed to HTTPS
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    if (data.status === 'success' && data.lat !== undefined && data.lon !== undefined) {
      console.log("IP Geolocation API response:", data);
      return {
        lat: data.lat,
        lng: data.lon
      };
    } else {
      console.warn("IP Geolocation failed:", data.message || "Unknown error");
      return { lat: null, lng: null };
    }
  } catch (error) {
    console.error("Error fetching IP-based coordinates:", error);
    return { lat: null, lng: null };
  }
}