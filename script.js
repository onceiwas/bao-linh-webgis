// Define Base Maps
const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
});

// Add another base map option (Esri Satellite)
const esriSat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Tiles © Esri — Source: Esri, Earthstar Geographics, CNES/Airbus DS, GeoEye, USDA FSA, USGS, AeroGRID, IGN, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), cribis ltd, MapmyIndia, © OpenStreetMap contributors, and the GIS User Community'
});

// Initialize the Map
// Start centered roughly on Vietnam, adjust zoom as needed initially
const map = L.map('map', {
    center: [16.0, 107.0], // Centered roughly in Vietnam
    zoom: 6,
    layers: [osm] // Default base layer is OSM
});

// Add Geocoder Control (Search Bar)
L.Control.geocoder({
    defaultMarkGeocode: false, // Don't add a default marker
    placeholder: '🔍 Search address or coordinates...', // Custom placeholder text
    position: 'topright' // Position on the map
})
.on('markgeocode', function(e) {
    // When a place is found and clicked in the results
    const latlng = e.geocode.center;
    map.setView(latlng, 16); // Pan and zoom to the location
    // Optionally add a marker and popup
    L.marker(latlng).addTo(map)
      .bindPopup("📍 " + e.geocode.name)
      .openPopup();
})
.addTo(map); // Add the geocoder control to the map

// Define Objects for Layer Control
const baseMaps = {
    "🗺️ OpenStreetMap": osm, // Label for OSM in the control
    "🛰️ Satellite": esriSat // Label for Satellite in the control
};

// This object will hold all overlay layers (Bao Linh Lake, uploaded files)
const overlayMaps = {};

// Variable to keep track of the last uploaded layer (if we want to replace it)
let uploadedLayer = null;

// --- Function to add a GeoJSON layer to the map and potentially fit bounds ---
// This function is used for both the default lake layer and uploaded layers
function addGeoJSONLayer(data, name = "GeoJSON Layer", fitBounds = true) {
    // Basic check if data is valid GeoJSON structure
    if (!data || !data.type) {
        console.error("Invalid GeoJSON data provided:", data);
        alert("❌ Invalid GeoJSON data.");
        return null; // Indicate failure
    }

    // Create the Leaflet GeoJSON layer
    const geojsonLayer = L.geoJSON(data, {
        // Define a default style for the GeoJSON features
        style: {
            color: "#0000FF",    // Blue border color
            weight: 2,           // Border thickness
            fillColor: "#ADD8E6", // Light blue fill color
            fillOpacity: 0.7     // Opacity of the fill
        },
        // Function to run for each feature (e.g., add popups)
        onEachFeature: function (feature, layer) {
            let popupContent = '';
            if (feature.properties) {
                // Build popup content from feature properties
                for (const key in feature.properties) {
                    // Only add if the property exists and is not null
                    if (feature.properties.hasOwnProperty(key) && feature.properties[key] != null) {
                         popupContent += `<b>${key}:</b> ${feature.properties[key]}<br/>`;
                    }
                }
            }
             // Bind popup to the layer (polygon, line, marker)
             layer.bindPopup(popupContent || "No properties"); // Show default text if no properties
        }
    }); // Layer is created but not yet added to the map

    // Add the layer to the map
    geojsonLayer.addTo(map);

    // Attempt to fit the map view to the bounds of the added layer if requested
    if (fitBounds) {
        try {
            const bounds = geojsonLayer.getBounds();
            // Check if the calculated bounds are valid (e.g., not from an empty layer)
            if (bounds && bounds.isValid()) {
                map.fitBounds(bounds); // Fit map to the layer's extent
            } else {
                console.warn(`Layer "${name}" has no valid bounds or is empty.`);
                 // Fallback: If the default lake layer has no valid bounds (e.g., still null geometry),
                 // set a specific view near Bao Linh Lake instead of failing.
                 if (name === "💧 Bao Linh Lake") {
                      map.setView([21.06, 105.95], 13); // Approximate center and zoom for Bao Linh Lake
                 }
            }
        } catch (e) {
            console.error(`Error fitting bounds for layer "${name}":`, e);
             // Fallback view in case of unexpected errors getting bounds
             if (name === "💧 Bao Linh Lake") {
                 map.setView([21.06, 105.95], 13);
             }
        }
    }

    return geojsonLayer; // Return the created layer object
}

// --- LOAD DEFAULT BAO LINH LAKE GEOJSON ---
// This code runs automatically when the script loads
const defaultLakeUrl = "bao_linh_lake.geojson"; // The path to your GeoJSON file

fetch(defaultLakeUrl) // Fetch the GeoJSON file
    .then(response => {
        // Check if the network response was successful
        if (!response.ok) {
            console.error(`Failed to fetch default GeoJSON: ${response.status} ${response.statusText}`);
            throw new Error(`HTTP error fetching ${defaultLakeUrl}! status: ${response.status}`);
        }
        return response.json(); // Parse the response as JSON
    })
    .then(data => {
        // Once data is loaded, add it to the map using our function
        const defaultLakeLayer = addGeoJSONLayer(data, "💧 Bao Linh Lake", true); // Add with name and fit bounds

        // If the layer was successfully created, add it to the overlay control object
        if (defaultLakeLayer) {
            overlayMaps["💧 Bao Linh Lake"] = defaultLakeLayer;

            // Important: Add the Layer Control *after* defining the default layer
            // so the default layer appears in the control list on load.
            // If the control was added before the fetch completes, it wouldn't list the async layer.
            // We will add the control just after this fetch block concludes (see below).
        }
    })
    .catch(error => {
        // Log any errors during the fetch or processing
        console.error('Error loading default Bao Linh Lake GeoJSON:', error);
        // Optionally, inform the user (be careful with alerts, they can be annoying)
        // alert('Could not load the default lake data.');
    });


// --- Handle Uploaded GeoJSON Files ---
// Get the file input element
document.getElementById("file-input").addEventListener("change", function(event) {
    const file = event.target.files[0]; // Get the selected file
    if (!file) return; // Do nothing if no file was selected

    const reader = new FileReader(); // Create a file reader
    reader.onload = function(e) {
        try {
            // Parse the file content as JSON
            const geojson = JSON.parse(e.target.result);

            // Remove the previously uploaded layer from the map if it exists
             if (uploadedLayer) {
                 map.removeLayer(uploadedLayer);
                 // Note: Removing from overlayMaps and the control requires more complex code
                 // For this basic example, uploaded layers replace each other on the map,
                 // but are not dynamically added/removed from the layer control once it's created.
             }

            // Add the newly uploaded layer using our function
            uploadedLayer = addGeoJSONLayer(geojson, `📂 ${file.name}`, true); // Add with file name and fit bounds

            // Note: Adding uploadedLayer to overlayMaps dynamically
            // would require recreating the layer control or using a Leaflet plugin
            // that supports dynamic updates. For simplicity, this code just adds
            // it to the map.

        } catch (err) {
            // Handle any errors during file reading or JSON parsing
            alert("❌ Could not read or parse the file as GeoJSON.");
            console.error("Error processing uploaded file:", err);
        }
    };

    // Read the file content as text
    reader.readAsText(file);
});


// --- Add Layer Control ---
// This control allows switching base layers and toggling overlay layers.
// It's added *after* the default fetch block is defined, ensuring the
// `overlayMaps` object can potentially be populated before the control is created.
L.control.layers(baseMaps, overlayMaps).addTo(map);