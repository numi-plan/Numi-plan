const SUPABASE_URL = "https://mfljrozyxyfkymzlnsmt.supabase.co";
const SUPABASE_KEY = "sb_publishable_sMb9uHOr4gpyqmZGrkY-YQ_z90TgNAB";

async function run() {
  console.log("🚀 Lancement de la synchronisation automatique GPS...");

  try {
    // 1. Authentification Supabase
    console.log("🔑 Authentification Supabase...");
    const loginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "apikey": SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@sharik.numilog.com", password: "Sharik@admin" })
    });
    if (!loginRes.ok) throw new Error("Échec d'authentification Supabase");
    const loginData = await loginRes.json();
    const token = loginData.access_token;
    
    const headers = {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    };

    // 2. Authentification IdeGPS
    console.log("🔑 Authentification IdeGPS...");
    const loginPayload = new URLSearchParams();
    loginPayload.append("username", "K.LAHOUEL");
    loginPayload.append("password", "K@LHL2024");

    const gpsLoginRes = await fetch("https://idegps.com/map/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      body: loginPayload.toString()
    });

    if (!gpsLoginRes.ok) throw new Error("Échec d'authentification IdeGPS");
    
    // Récupérer le cookie de session
    const setCookieHeaders = gpsLoginRes.headers.get("set-cookie");
    console.log("Cookies obtenus d'IdeGPS:", setCookieHeaders ? "Reçu" : "Aucun");

    // 2.5 Charger la page map pour extraire les gps_ids de mData.cars
    console.log("📄 Chargement de la page carte d'IdeGPS pour obtenir les identifiants de la flotte...");
    const mapPageHeaders = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    };
    if (setCookieHeaders) {
      mapPageHeaders["Cookie"] = setCookieHeaders;
    }
    const mapPageRes = await fetch("https://idegps.com/map", {
      method: "GET",
      headers: mapPageHeaders
    });
    if (!mapPageRes.ok) throw new Error("Échec de chargement de la page carte d'IdeGPS");
    const html = await mapPageRes.text();

    // Extraction des identifiants (gps_ids)
    let gpsIds = [];
    const carsMatch = html.match(/mData\.cars\s*=\s*({[\s\S]*?});\s*/);
    if (carsMatch) {
      const idMatches = carsMatch[1].match(/'(\d+)'|"\d+"|\b\d+\b/g);
      if (idMatches) {
        gpsIds = [...new Set(idMatches.map(id => id.replace(/['"]/g, "")))];
      }
    }
    if (gpsIds.length === 0) {
      const idMatches = html.match(/'(\d+)'\s*:\s*{\s*(?:PSN|SBN|SWV|car_group|gps_alias)/g);
      if (idMatches) {
        gpsIds = idMatches.map(m => m.match(/\d+/)[0]);
      }
    }
    console.log(`🔍 ${gpsIds.length} identifiants GPS extraits de la page.`);

    // 3. Fetch positions depuis IdeGPS (POST avec payload)
    console.log("📡 Récupération des positions en cours...");
    const gpsHeaders = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Content-Type": "application/x-www-form-urlencoded"
    };
    if (setCookieHeaders) {
      gpsHeaders["Cookie"] = setCookieHeaders;
    }

    const params = new URLSearchParams();
    params.append("driver", "1");
    params.append("user_name", "K.LAHOUEL");
    params.append("gps_ids", gpsIds.join(","));

    const gpsRes = await fetch("https://idegps.com/api/map/position", {
      method: "POST",
      headers: gpsHeaders,
      body: params.toString()
    });
    if (!gpsRes.ok) throw new Error("Échec d'accès API IdeGPS");
    const result = await gpsRes.json();
    const fleet = result.fleet || [];
    console.log(`🚚 ${fleet.length} véhicules reçus d'IdeGPS.`);

    // 3. Lire les équipes dans Supabase
    console.log("📂 Lecture des équipes de Supabase...");
    const teamsRes = await fetch(`${SUPABASE_URL}/rest/v1/numiplan_teams?select=team,payload`, { headers });
    if (!teamsRes.ok) throw new Error("Impossible de charger les équipes depuis Supabase");
    const dbTeams = await teamsRes.json();

    const today = new Date().toISOString().split("T")[0];
    const writeTs = Date.now();
    let successCount = 0;

    // 4. Mettre à jour les payloads JSON dans numiplan_teams
    for (const teamRow of dbTeams) {
      const eq = teamRow.team;
      const teamPayload = teamRow.payload;
      if (!teamPayload || !teamPayload.dispo) continue;

      let modified = false;
      teamPayload.dispo.forEach(vehicle => {
        const matchingGps = fleet.find(car => (car.gps_alias || "").trim().toUpperCase() === (vehicle.v || "").trim().toUpperCase());
        if (matchingGps) {
          const lat = matchingGps.position ? (matchingGps.position.LAT || matchingGps.position.latitude || matchingGps.position.lat) : null;
          const lng = matchingGps.position ? (matchingGps.position.LNG || matchingGps.position.longitude || matchingGps.position.lng || matchingGps.position.LON || matchingGps.position.lon) : null;
          
          const p = matchingGps.position || {};
          const rawDate = p.DATE || p.date || p.time || p.gpstime || p.dt_pos || matchingGps.date || matchingGps.time || matchingGps.last_com || today;
          const cleanDate = typeof rawDate === 'string' ? rawDate.slice(0, 10) : today;
          
          const gpsTime = new Date(rawDate).getTime();
          const isStale = isNaN(gpsTime) || (Date.now() - gpsTime > 12 * 60 * 60 * 1000); // 12 heures
          const hasGPSData = lat !== null && lng !== null && !isStale;
          
          vehicle.geoloc = hasGPSData ? "ON" : "OFF";
          vehicle.geolocDate = cleanDate;
          vehicle.lat = hasGPSData ? lat : null;
          vehicle.lng = hasGPSData ? lng : null;
          modified = true;
        } else {
          vehicle.geoloc = "OFF";
          vehicle.geolocDate = today;
          vehicle.lat = null;
          vehicle.lng = null;
          modified = true;
        }
      });

      if (modified) {
        // MAJ Critique du timestamp anti-écrasement
        teamPayload._localTs = writeTs;
        console.log(`💾 Sauvegarde de l'équipe ${eq}...`);
        const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/numiplan_teams?team=eq.${eq}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ payload: teamPayload, updated_at: new Date().toISOString() })
        });
        if (updateRes.ok) successCount++;
      }
    }

    // 5. Mettre à jour la table normalisée np_dispo (camions actifs uniquement)
    console.log("💾 Mise à jour des positions individuelles dans np_dispo...");
    const activeTrucks = {};
    for (const teamRow of dbTeams) {
      const teamPayload = teamRow.payload;
      if (teamPayload && teamPayload.dispo) {
        teamPayload.dispo.forEach(vehicle => {
          const vPlate = (vehicle.v || "").trim().toUpperCase();
          if (vPlate) activeTrucks[vPlate] = true;
        });
      }
    }

    let dispoCount = 0;
    for (const car of fleet) {
      const immat = (car.gps_alias || "").trim().toUpperCase();
      if (!immat || !activeTrucks[immat]) continue;
      const lat = car.position ? (car.position.LAT || car.position.latitude || car.position.lat) : null;
      const lng = car.position ? (car.position.LNG || car.position.longitude || car.position.lng || car.position.LON || car.position.lon) : null;
      
      const p = car.position || {};
      const rawDate = p.DATE || p.date || p.time || p.gpstime || p.dt_pos || car.date || car.time || car.last_com || today;
      const cleanDate = typeof rawDate === 'string' ? rawDate.slice(0, 10) : today;
      
      const gpsTime = new Date(rawDate).getTime();
      const isStale = isNaN(gpsTime) || (Date.now() - gpsTime > 12 * 60 * 60 * 1000); // 12 heures
      const hasGPSData = lat !== null && lng !== null && !isStale;
      
      const updateDispoRes = await fetch(`${SUPABASE_URL}/rest/v1/np_dispo?v=eq.${encodeURIComponent(immat)}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ geoloc: hasGPSData ? "ON" : "OFF", geoloc_date: cleanDate, lat: hasGPSData ? lat : null, lng: hasGPSData ? lng : null })
      });
      if (updateDispoRes.ok) dispoCount++;
    }

    console.log(`✅ SYNC REUSSITE ! ${successCount} équipes mises à jour, ${dispoCount} camions modifiés dans np_dispo.`);
  } catch (err) {
    console.error("❌ ERREUR DE SYNCHRONISATION :", err);
    process.exit(1);
  }
}

run();
