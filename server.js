// server.js

import express from "express";
import cors from "cors";
import pool from "./db.js"; // Import the database pool

const app = express();
app.use(cors());
app.use(express.json());

// let db = pool;

const parseIfNeeded = (value) => {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch (e) {
      console.warn("Kon JSON niet parsen:", value);
      return [];
    }
  }
  return value || [];
};

const start = async () => {

  app.get('/ping', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });


  app.put("/toernooien/:id", async (req, res) => {
    const { id } = req.params;
    const { teams, matches, groups, groupMatches, finalMatches, groepsToernooi, repeatRounds } = req.body;
    // console.log('Update toernooi ontvangen:', req.body);
    // console.log('Update toernooi data:', {teams, matches, groups, groupMatches, finalMatches, groepsToernooi, repeatRounds });
    try {
      const sqlStr = 'UPDATE kraaktoernooien SET teams = ?, matches = ?, groups = ?, groupMatches = ?, finalMatches = ?, groepsToernooi = ?, repeatRounds = ? WHERE id = ?';
      await pool.execute(sqlStr, [
        JSON.stringify(parseIfNeeded(teams)),
        JSON.stringify(parseIfNeeded(matches)),
        JSON.stringify(parseIfNeeded(groups)),
        JSON.stringify(parseIfNeeded(groupMatches)),
        JSON.stringify(parseIfNeeded(finalMatches)),
        groepsToernooi ?? false,
        repeatRounds ?? 1,
        id
      ]);
      res.sendStatus(204);
    } catch (error) {
      console.error("Fout bij updaten toernooi:", error);
      return res.status(500).json({ error: "Interne serverfout" });
    }
  });

  app.post("/toernooien", async (req, res) => {
    // console.log('Nieuwe toernooi ontvangen:', req.body);
    const { datum, teams, matches, groups, groupMatches, finalMatches, groepsToernooi, repeatRounds } = req.body;
    // console.log('Nieuwe toernooi data:', { datum, teams, matches, groups, groupMatches, finalMatches, groepsToernooi, repeatRounds });

    let sqlStr = "INSERT INTO kraaktoernooien (datum, teams, groups, matches, groupMatches, finalMatches, groepsToernooi, repeatRounds) ";
    sqlStr += "VALUES(?, ?, ?, ?, ?, ?, ?, ?)";
    await pool.execute(sqlStr, [
      datum ?? null,
      JSON.stringify(parseIfNeeded(teams)),
      JSON.stringify(parseIfNeeded(groups)),
      JSON.stringify(parseIfNeeded(matches)),
      JSON.stringify(parseIfNeeded(groupMatches)),
      JSON.stringify(parseIfNeeded(finalMatches)),
      groepsToernooi ?? false,
      repeatRounds ?? 1,
    ]);
    res.sendStatus(201);
  });

  app.get("/toernooien", async (req, res) => {
    const [rows] = await pool.execute(
      "SELECT * FROM kraaktoernooien ORDER BY datum DESC"
    );
    res.json(rows);
  });

  app.get("/toernooien/:id", async (req, res) => {
    const { id } = req.params;
    const [rows] = await pool.execute(
      "SELECT * FROM kraaktoernooien WHERE id = ?",
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Toernooi niet gevonden" });
    }
    res.json(rows[0]);
  });

  app.get("/tournamentID", async (req, res) => {
    const { datum } = req.query;
    if (!datum) {
      return res.status(400).json({ error: "Datum is verplicht" });
    }
    try {
      const [rows] = await pool.execute(
        "SELECT * FROM kraaktoernooien WHERE datum = ?", [datum]
      );
      if (rows.length === 0) {
        return res.status(204).json({ error: "Geen toernooi gevonden voor deze datum" });
      }
      res.json(rows[0]);
    } catch (error) {
      console.error("Fout bij ophalen toernooi:", error);
      res.status(500).json({ error: "Interne serverfout" });
    }
  });

  app.delete("/toernooien/:id", async (req, res) => {
    const { id } = req.params;
    const [result] = await pool.execute(
      "DELETE FROM kraaktoernooien WHERE id = ?",
      [id]
    );
    if (result.affectedRows === 0) {
      // console.log(`Toernooi met id ${id} niet gevonden`);
      return res.status(404).json({ error: "Toernooi niet gevonden" });
    }
    res.sendStatus(204);
  });

  app.post("/spelers", async (req, res) => {
    const { naam } = req.body;
    const sp = await pool.execute(
      "SELECT * FROM spelers WHERE naam = ?", [naam]
    );
    if (!p[0].length > 0) {
      await pool.execute("INSERT INTO spelers (naam) VALUES (?)", [naam]);
    }
    res.sendStatus(201);
  });

  app.get("/spelers", async (req, res) => {
    const [rows] = await pool.execute("SELECT * FROM spelers ORDER BY naam ASC");
    res.json(rows);
  });

  function calculateTeamScores(matches, teams) {
    // console.log("Bereken team scores voor teams:", matches);
    const teamScores = teams.map((team, index) => ({ team, punten: 0 }));
    // console.log("Bereken team scores voor teams:", teamScores);
    matches.forEach((round, index) => {
      round.forEach((tafel) => {
        // console.log(`Ronde ${index + 1}: ${JSON.stringify(tafel)}`);
        const teamLIndex = teams.indexOf(tafel.teamL);
        const teamRIndex = teams.indexOf(tafel.teamR);
        // console.log(`Team L index: ${teamLIndex}, Team R index: ${teamRIndex}`);
        if (teamLIndex === -1 || teamRIndex === -1) {
          console.warn(`Team niet gevonden: ${match.teamL} of ${match.teamR}`);
          return;
        }
        teamScores[teamLIndex].punten += tafel.scoreL;
        teamScores[teamRIndex].punten += tafel.scoreR;
        // console.log(`Team L (${teamScores[teamLIndex].team}) score: ${tafel.scoreL}, Team R (${teamScores[teamRIndex].team}) score: ${tafel.scoreR}`);
      });
    });

    // Sorteer op punten aflopend, en wijs een ranking toe
    teamScores.sort((a, b) => b.punten - a.punten);
    teamScores.forEach((team, i) => {
      team.rank = i + 1;
    });

    return teamScores;
  }
  const getSpelersLijst = async () => {
    const [rows] = await pool.execute("SELECT * FROM spelers ORDER BY naam ASC");
    return rows;
  };
  // Added endpoint for ranking players
  app.get("/ranking", async (req, res) => {
    const allSpelers = await getSpelersLijst();
    const [toernooien] = await pool.execute("SELECT datum, teams, matches, finalMatches, groepstoernooi FROM kraaktoernooien");
    const puntenSchema = [12, 9, 6, 3];
    const spelerScores = {}
    toernooien.forEach((toernooi) => {
      // eerst alles op nul punten zetten
      allSpelers.forEach(player => {
        if (!spelerScores[player.naam]) {
          spelerScores[player.naam] = { totaal: 0, scores: [] };
        }
        spelerScores[player.naam].scores.push({ datum: toernooi.datum, punten: 0 });
      });
      // console.log("Toernooi:", toernooi.datum);
      const teams = JSON.parse(toernooi.teams || "[]");
      const matches = JSON.parse(toernooi.matches || "[]");
      const finalMatches = JSON.parse(toernooi.finalMatches || "[]");
      const groepstoernooi = toernooi.groepstoernooi || false;
      const deelnamePunt = 1; // Elk team krijgt 1 punt voor deelname
      let ranglijst = [];
      // Verwerk de teams
      // groepstoernooi
      if (groepstoernooi) {
        const [finale, derdePlek] = finalMatches
        const winnaar = finale.scoreR > finale.scoreL ? finale.teamR : finale.teamL;
        const tweede = winnaar === finale.teamR ? finale.teamL : finale.teamR;
        const derde = derdePlek.scoreR > derdePlek.scoreL ? derdePlek.teamR : derdePlek.teamL;
        const vierde = derde === derdePlek.teamR ? derdePlek.teamL : derdePlek.teamR;
        ranglijst = [winnaar, tweede, derde, vierde];
        // console.log("Ranglijst voor groepstoernooi:", ranglijst);

      } else {
        // reguliere toernooi
        const teamScores = calculateTeamScores(JSON.parse(toernooi.matches || "[]"), teams);
        // console.log("Team scores:", teamScores);
        // Wijs de teams toe aan de ranglijst
        for (let i = 0; i < 4; i++) {
          if (i >= teamScores.length) break; // Stop als er minder dan 4 teams zijn
          const team = teamScores[i].team;
          ranglijst.push(team);
        }
      }
      // voeg de overige teams toe aan de ranglijst 
      const geplaatsteTeams = new Set(ranglijst);
      teams.forEach((team, index) => {
        if (!geplaatsteTeams.has(team)) ranglijst.push(team);
      });
      // console.log("Ranglijst:", ranglijst);
      ranglijst.forEach((team, positie) => {
        if (!team) return;
        const punten = positie < 4 ? puntenSchema[positie] : deelnamePunt
        const spelers = team.split("/");
        spelers.forEach((speler, index) => {
          updateScore(spelerScores, speler, punten, toernooi.datum);
          updateTotaal(spelerScores, speler);
        });
      })

    })
    // console.log("Speler scores:", spelerScores);
    const ranking = Object.entries(spelerScores).map(([speler, { totaal, scores }]) => {
    // console.log(`Speler: ${speler}, Resultaten:`, scores);
      return { speler, totaal, scores };
    });
    ranking.sort((a, b) => b.totaal - a.totaal);
    updateRanking(ranking);
    // console.log("Ranglijst:", ranking);
    res.json(ranking);

  });

  function updateScore(spelerScores, spelerNaam, punten, datum) {
    const scores = spelerScores[spelerNaam].scores;
    const score = scores.find(s => s.datum === datum);
    if (score) {
      score.punten = punten;
    }
  }

  function updateTotaal(spelerScores, spelerNaam) {
    const totaal = berekenTotaal(spelerScores, spelerNaam);
    spelerScores[spelerNaam].totaal = totaal;
  }

  function updateRanking(spelers) {
    spelers.sort((a, b) => b.totaal - a.totaal);
    let vorigTotaal = null;
    let plaats = 0
    let offset= 1
    spelers.forEach((speler, index) => {
      if (speler.totaal !== vorigTotaal) {
        plaats = index + offset; // Plaats is 1-indexed
        vorigTotaal = speler.totaal;
      }
      speler.plaats = plaats;
    }
    );
    return spelers;

  }

  function berekenTotaal(spelerScores, spelerNaam) {
    const scores = spelerScores[spelerNaam].scores; 
    const best6 = scores
    .map(s => s.punten)
    .sort((a, b) => b - a) // sorteer op punten aflopend
    .filter(punten => punten > 0) // filter negatieve punten eruit
    .slice(0, 6); // neem de beste 6 scores

    return best6.reduce((totaal, punten) => totaal + punten, 0);
  }

  async function getOrCreatePlayer(naam) {
    const [rows] = await pool.execute(
      'SELECT id FROM spelers WHERE naam = ?',
      [naam]
    );
    if (rows.length > 0) return rows[0].id;

    const [result] = await pool.execute(
      'INSERT INTO spelers (naam) VALUES (?)',
      [naam]
    );
    return result.insertId;
  }

  async function isNewTeam(speler1Id, speler2Id) {
    // Zorg voor vaste volgorde (altijd laagste id eerst)
    const [id1, id2] = speler1Id < speler2Id
      ? [speler1Id, speler2Id]
      : [speler2Id, speler1Id];

    const [rows] = await pool.execute(
      `SELECT * FROM kraakTeams 
     WHERE (speler1 = ? AND speler2 = ?) OR (speler1 = ? AND speler2 = ?)`,
      [id1, id2, id2, id1]
    );
    if (rows.length > 0) return false;

    const [result] = await pool.execute(
      'INSERT INTO kraakTeams (speler1, speler2) VALUES (?, ?)',
      [id1, id2]
    );
    return true;
  }

  async function getNaamById(id) {
    const [rows] = await pool.execute("SELECT naam FROM spelers WHERE id = ?", [id]);
    return rows.length > 0 ? rows[0].naam : null;
  }

  app.get("/savedTeams", async (req, res) => {
    const [rows] = await pool.execute("SELECT * FROM kraakTeams");
    const teams = await Promise.all(rows.map(async row => ({
      team: `${await getNaamById(row.speler1)}/${await getNaamById(row.speler2)}`,
    })));
    // console.log(teams)
    teams.sort((a, b) => a.team.localeCompare(b.team));
    res.json(teams);
  });

  app.post("/standardTeams", async (req, res) => {
    const { teams } = req.body;
    if (!teams || !Array.isArray(teams) || teams.length === 0) {
      return res.status(400).json({ error: 'teams is verplicht en moet een niet-lege array zijn' });
    }
    // eerst alle standaarTeams verwijderen
    // dan hebben we altijd een exacte kopie van de localStorage
    // en kunnen we de teams opnieuw invoeren
    // dit is nodig omdat de teams in de localStorage kunnen worden aangepast
    // en we willen niet dat de oude teams blijven staan
    // await pool.execute("DELETE FROM spelers");  
    await pool.execute("DELETE FROM kraakTeams");

    const insertedTeamIds = [];

    for (const team of teams) {
      const [sp1Naam, sp2Naam] = team.players;
      if (!sp1Naam || !sp2Naam) continue;

      try {
        const sp1Id = await getOrCreatePlayer(sp1Naam);
        const sp2Id = await getOrCreatePlayer(sp2Naam);

        const teamExists = await isNewTeam(sp1Id, sp2Id);
        if (!teamExists) {
          insertedTeamIds.push({ spelers: [sp1Naam, sp2Naam] });
        }

      } catch (err) {
        console.error(`Fout bij verwerken team ${sp1Naam} & ${sp2Naam}:`, err);
      }
    }

    res.status(201).json({ insertedTeamIds });
  });

  app.get("/teams", async (req, res) => {
    const [rows] = await pool.execute("SELECT * FROM kraakTeams");
    res.json(rows);
  });

  app.get("/teamSpelers", async (req, res) => {
    // deze view geeft de teams met spelernamen weer
    const [rows] = await pool.execute(
      "SELECT teamID, team FROM teamSpelers ORDER BY team"
    );
    res.json(rows);
  });

  app.post("/results", async (req, res) => {
    const { toernooiID, ronde, groep, tafel, teamA, teamB, scoreA, scoreB } =
      req.body;
    const rij = await pool.execute(
      "SELECT * FROM kraakToernooiRondes WHERE toernooiID = ? && ronde = ? && groep = ? && tafel = ?",
      [toernooiID, ronde, groep, tafel]
    );
    if (rij[0].length > 0) {
      await pool.execute(
        "UPDATE kraakToernooiRondes SET scoreA = ?, scoreB = ? WHERE toernooiID = ? && ronde = ? && groep = ? && tafel = ?",
        [scoreA, scoreB, toernooiID, ronde, groep, tafel]
      );
    } else {
      await pool.execute(
        "INSERT INTO kraakToernooiRondes (toernooiID, ronde, groep, tafel, teamA, teamB, scoreA, scoreB) VALUES (?, ?, ?, ?,?, ?, ?, ?)",
        [toernooiID, ronde, groep, tafel, teamA, teamB, scoreA, scoreB]
      );
    }
    res.sendStatus(201);
  });

  app.get("/results", async (req, res) => {
    const toernooiID = req.query.toernooiID;
    if (!toernooiID) {
      return res.status(400).json({ error: "toernooiID is verplicht" });
    }
    let sqlStr =
      "SELECT tn.id AS toernooiID, tn.datum, ktr.ronde, ktr.groep, ktr.tafel, ";
    sqlStr +=
      " ktr.teamA, ktr.scoreA, ktr.teamB, ktr.scoreB FROM kraakToernooiRondes ktr ";
    sqlStr += " JOIN kraaktoernooien tn ON tn.id = ktr.toernooiID ";
    sqlStr += " WHERE tn.id = ? ";
    sqlStr += " ORDER BY tn.datum, ktr.ronde, ktr.groep, ktr.tafel";
    // console.log("SQL:", sqlStr);
    const [rows] = await pool.execute(sqlStr, [toernooiID]);
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ error: "Geen resultaten gevonden voor dit toernooi" });
    }

    const results = rows.map((row) => ({
      datum: row.datum,
      ronde: row.ronde,
      groep: row.groep,
      tafel: row.tafel,
      teamA: row.teamA,
      scoreA: row.scoreA,
      teamB: row.teamB,
      scoreB: row.scoreB,
    }));
    res.json(results);
  });

  const port = process.env.PORT;
  app.listen(port, (0, 0, 0, 0), () =>
    console.log(`Server draait op http://localhost:${port}`)
  );
};

start();
