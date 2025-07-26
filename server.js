// server.js

import express from "express";
import mysql from "mysql2/promise";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

let db;

const start = async () => {
  db = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  app.get('/ping', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.post("/toernooien", async (req, res) => {
    console.log('Nieuwe toernooi ontvangen:', req.body);
    const { datum, teams, matches, groups, groupMatches, finalMatches, groepsToernooi, repeatRounds } = req.body;
    console.log('Nieuwe toernooi data:', { datum, teams, matches, groups, groupMatches, finalMatches, groepsToernooi, repeatRounds });

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

    let sqlStr = "INSERT INTO kraaktoernooien (datum, teams, groups, matches, groupMatches, finalMatches, groepsToernooi, repeatRounds) ";
    sqlStr += "VALUES(?, ?, ?, ?, ?, ?, ?, ?)";
    await db.execute(sqlStr, [
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
    const [rows] = await db.execute(
      "SELECT * FROM kraaktoernooien ORDER BY datum DESC"
    );
    res.json(rows);
  });

  app.get("/toernooien/:id", async (req, res) => {
    const { id } = req.params;
    const [rows] = await db.execute(
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
      const [rows] = await db.execute(
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
    const [result] = await db.execute(
      "DELETE FROM kraaktoernooien WHERE id = ?",
      [id]
    );
    if (result.affectedRows === 0) {
      console.log(`Toernooi met id ${id} niet gevonden`);
      return res.status(404).json({ error: "Toernooi niet gevonden" });
    }
    res.sendStatus(204);
  });

  app.post("/spelers", async (req, res) => {
    const { naam } = req.body;
    const sp = await db.execute(
      "SELECT * FROM spelers WHERE naam = ?", [naam]
    );
    if (!p[0].length > 0) {
      await db.execute("INSERT INTO spelers (naam) VALUES (?)", [naam]);
    }
    res.sendStatus(201);
  });

  app.get("/spelers", async (req, res) => {
    const [rows] = await db.execute("SELECT * FROM spelers ORDER BY naam ASC");
    res.json(rows);
  });

  async function getOrCreatePlayer(naam) {
    const [rows] = await db.execute(
      'SELECT id FROM spelers WHERE naam = ?',
      [naam]
    );
    if (rows.length > 0) return rows[0].id;

    const [result] = await db.execute(
      'INSERT INTO spelers (naam) VALUES (?)',
      [naam]
    );
    return result.insertId;
  }

  async function getOrCreateTeam(speler1Id, speler2Id) {
    // Zorg voor vaste volgorde (altijd laagste id eerst)
    const [id1, id2] = speler1Id < speler2Id
      ? [speler1Id, speler2Id]
      : [speler2Id, speler1Id];

    const [rows] = await db.execute(
      `SELECT id FROM kraakTeams 
     WHERE (speler1 = ? AND speler2 = ?) OR (speler1 = ? AND speler2 = ?)`,
      [id1, id2, id2, id1]
    );
    if (rows.length > 0) return rows[0].id;

    const [result] = await db.execute(
      'INSERT INTO kraakTeams (speler1, speler2) VALUES (?, ?)',
      [id1, id2]
    );
    return result.insertId;
  }

  async function getNaamById(id) {
    const [rows] = await db.execute("SELECT naam FROM spelers WHERE id = ?", [id]);
    return rows.length > 0 ? rows[0].naam : null;
  }

  app.get("/savedTeams", async (req, res) => {
    const [rows] = await db.execute("SELECT * FROM kraakTeams");
    const teams = await Promise.all(rows.map(async row => ({
      team: `${await getNaamById(row.speler1)}/${await getNaamById(row.speler2)}`,
    })));
    console.log(teams)
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
    // await db.execute("DELETE FROM spelers");  
    await db.execute("DELETE FROM kraakTeams");

    const insertedTeamIds = [];

    for (const team of teams) {
      const [sp1Naam, sp2Naam] = team.players;
      if (!sp1Naam || !sp2Naam) continue;

      try {
        const sp1Id = await getOrCreatePlayer(sp1Naam);
        const sp2Id = await getOrCreatePlayer(sp2Naam);

        const teamId = await getOrCreateTeam(sp1Id, sp2Id);
        insertedTeamIds.push({ teamId, spelers: [sp1Naam, sp2Naam] });
      } catch (err) {
        console.error(`Fout bij verwerken team ${sp1Naam} & ${sp2Naam}:`, err);
      }
    }

    res.status(201).json({ insertedTeamIds });
  });

  app.get("/teams", async (req, res) => {
    const [rows] = await db.execute("SELECT * FROM kraakTeams");
    res.json(rows);
  });

  app.get("/teamSpelers", async (req, res) => {
    // deze view geeft de teams met spelernamen weer
    const [rows] = await db.execute(
      "SELECT teamID, team FROM teamSpelers ORDER BY team"
    );
    res.json(rows);
  });

  app.post("/results", async (req, res) => {
    const { toernooiID, ronde, groep, tafel, teamA, teamB, scoreA, scoreB } =
      req.body;
    const rij = await db.execute(
      "SELECT * FROM kraakToernooiRondes WHERE toernooiID = ? && ronde = ? && groep = ? && tafel = ?",
      [toernooiID, ronde, groep, tafel]
    );
    if (rij[0].length > 0) {
      await db.execute(
        "UPDATE kraakToernooiRondes SET scoreA = ?, scoreB = ? WHERE toernooiID = ? && ronde = ? && groep = ? && tafel = ?",
        [scoreA, scoreB, toernooiID, ronde, groep, tafel]
      );
    } else {
      await db.execute(
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
    console.log("SQL:", sqlStr);
    const [rows] = await db.execute(sqlStr, [toernooiID]);
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
