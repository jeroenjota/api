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
    // console.log('Nieuwe toernooi ontvangen:', req.body);
    const { data } = req.body;
    sqlStr = "INSERT INTO kraaktoernooien (datum, teams, groups, matches, groupMatches, finalMatches, groepsToernooi, repeatRounds) ";
    sqlStr += "VALUES(?, ?, ?, ?, ?, ?, ?, ?)";
    await db.execute(sqlStr, [
      data.datum,
      JSON.stringify(data.teams),
      JSON.stringify(data.groups),
      JSON.stringify(data.matches),
      JSON.stringify(data.groupMatches),
      JSON.stringify(data.finalMatches),
      data.groepsToernooi,
      data.repeatRounds
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
      "SELECT * FROM kraaktoernooien ORDER BY datum DESC"
    );
    res.json(rows[0]);
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

  function getSpelerId(naam) {
    return db.execute("SELECT id FROM spelers WHERE naam = ?", [naam])
      .then(([rows]) => {
        if (rows.length > 0) {
          return rows[0].id;
        } else {
          // voeg de speler toe en return de id
          return db.execute("INSERT INTO spelers (naam) VALUES (?)", [naam])
            .then(([result]) => result.insertId);
        }
      });
  }

  app.post("/standardTeams", async (req, res) => {
    const { teams } = req.body;
    teams.array.forEach(team => {
      const sp1 = getSpelerId(team[0]);
      const sp2 = getSpelerId(team[1]);
      return db.execute(
        // check if team exists
        "SELECT * FROM kraakTeams WHERE (speler1 = ? AND speler2 = ?) || (speler1 = ? AND speler2 = ?)",
        [sp1, sp2, sp2, sp1]
      ).then(([rows]) => {
        if (rows.length === 0) {
          return db.execute(
            "INSERT INTO kraakTeams (speler1, speler2) VALUES (?, ?)",
            [sp1, sp2]
          );
        }
      });
    })
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
