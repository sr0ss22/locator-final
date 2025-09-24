export async function run({ searchText }: { searchText: string }) {
  const apiKey = '99f974472cc74da88a91fd4041672f4d'; // Your OpenCage Geocoding API key
  
  let query = searchText;
  // If the searchText is purely numeric (likely a zip code), append ", USA" for better accuracy
  if (/^\d+$/.test(searchText)) {
    query = `${searchText}, USA`;
  }

  // Added components=US to restrict results to the United States
  const url = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(query)}&key=${apiKey}&countrycode=us,ca`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    console.log("OpenCage API response for", searchText, ":", data); // Added log

    if (!data.results || data.results.length === 0) {
      console.warn("No results found for the given search text:", searchText);
      return { lat: null, lng: null, zipCode: null };
    }

    const result = data.results[0];
    const location = result.geometry;
    const zipCode = result.components.postcode || null;

    return {
      lat: location.lat,
      lng: location.lng,
      zipCode: zipCode
    };
  } catch (error) {
    console.error("Error fetching coordinates:", error);
    return { lat: null, lng: null, zipCode: null };
  }
}