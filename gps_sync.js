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

    // 2. Fetch positions depuis IdeGPS
    console.log("📡 Récupération des positions depuis IdeGPS...");
    const payload = new URLSearchParams();
    payload.append("user_name", "K.LAHOUEL");
    payload.append("gps_ids", "5877,6050,6065,6156,6197,6202,6276,6345,6384,7016,7095,7097,7118,7220,7234,7243,8309,8382,8424,8631,8638,8646,8658,8675,8683,8758,8804,8821,9074,9083,10367,10369,10370,10372,10373,10376,10377,10378,10381,10382,10383,10388,10390,10396,10402,10403,10406,10413,10416,10418,10421,10422,10424,10425,10426,10427,10429,10432,10433,10437,10438,10444,10447,10449,10453,10454,10455,10459,10463,10467,10468,10473,10474,10476,10477,10480,10489,10491,10496,10506,10508,10512,10520,10525,10528,10532,10533,10537,10539,10543,10544,10545,10546,10547,10548,10559,10560,10561,10567,10568,10577,10581,10582,10585,10588,10592,10596,10597,10598,10605,10607,10610,10611,10612,10615,10616,10626,10627,10628,10629,10631,10633,10634,10636,10637,10639,10642,10651,10660,10664,10671,10680,10686,10690,10693,10695,10699,10702,10703,10704,10706,10707,10708,10709,10713,10714,10715,10717,10718,10775,10777,10781,10782,10783,10787,10789,10790,10807,10808,10809,10818,10842,10843,10844,10875,10876,10879,10880,10882,10883,10885,10890,10891,10893,10894,10895,10898,10904,10905,10906,10910,10914,10915,10917,10918,10920,10921,10923,10924,10925,10926,10927,10928,10934,10935,10943,10944,10945,10946,10950,10952,10954,10957,10958,10959,10961,10962,10967,10969,10980,10981,10982,10988,10994,10995,10997,10998,11002,11005,11009,11010,11011,11013,11015,11018,11027,11030,11031,11034,11036,11037,11038,11039,11043,11054,11077,11082,11083,11088,11092,11095,11096,11097,11100,11102,11106,11108,11111,11112,11115,11116,11117,11126,11131,11133,11138,11140,11143,11149,11154,11156,11157,11161,11163,11169,11171,11174,11177,11183,11185,11190,11196,11212,11215,11216,11243,11257,11266,11267,11270,11272,11274,11280,11283,11290,11293,11305,11312,11338,11344,11371,11373,12058,12059,12061,12065,12066,12069,12073,12074,12075,12076,12077,12080,12081,12082,12083,12084,12086,12087,12088,12091,12092,12093,12097,12100,12104,12105,12106,12107,12111,12112,12114,12117,12119,12121,12122,12124,12125,12127,12128,12129,12130,12132,12135,12136,12137,12138,12139,12141,12144,12145,12146,12147,12149,12150,12151,12152,12153,12155,12587,12690,12695,12713,12715,12716,12732,12752,12762,12768,12796,12810,12827,12833,12943,12944,13022,13055,13056,13063,13490,13718,13734,13821,14426,14625");

    const gpsRes = await fetch("https://idegps.com/api/map/position", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: payload.toString()
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
          const hasGPSData = lat !== null && lng !== null;
          
          const p = matchingGps.position || {};
          const rawDate = p.DATE || p.date || p.time || p.gpstime || p.dt_pos || matchingGps.date || matchingGps.time || matchingGps.last_com || today;
          const cleanDate = typeof rawDate === 'string' ? rawDate.slice(0, 10) : today;
          
          vehicle.geoloc = hasGPSData ? "ON" : "OFF";
          vehicle.geolocDate = cleanDate;
          vehicle.lat = lat;
          vehicle.lng = lng;
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
      const hasGPSData = lat !== null && lng !== null;
      
      const p = car.position || {};
      const rawDate = p.DATE || p.date || p.time || p.gpstime || p.dt_pos || car.date || car.time || car.last_com || today;
      const cleanDate = typeof rawDate === 'string' ? rawDate.slice(0, 10) : today;
      
      const updateDispoRes = await fetch(`${SUPABASE_URL}/rest/v1/np_dispo?v=eq.${encodeURIComponent(immat)}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ geoloc: hasGPSData ? "ON" : "OFF", geoloc_date: cleanDate, lat: lat, lng: lng })
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
