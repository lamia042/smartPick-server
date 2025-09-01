// server.js
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const admin = require("firebase-admin");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

// Initialize Firebase Admin
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
// Middleware
app.use(
  cors()
);
app.use(express.json());

// MongoDB URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.mpdvixn.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Firebase token verification middleware
const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer "))
    return res.status(401).send({ message: "Unauthorized" });

  const idToken = authHeader.split(" ")[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken; // contains email, uid, name, etc.
    next();
  } catch (err) {
    res.status(403).send({ message: "Forbidden: Invalid token" });
  }
};

// Main function
async function run() {
  try {
    const db = client.db("smartPickDB");
    const queriesCollection = db.collection("queries");
    const recommendationsCollection = db.collection("recommendations");

    // =====================
    // QUERIES ROUTES
    // =====================
    app.post("/queries", async (req, res) => {
      try {
        const newQuery = req.body;
        newQuery.date = new Date().toISOString();
        newQuery.recommendationCount = 0;
        newQuery.email = req.user.email; // from Firebase token
        newQuery.name = req.user.name || req.user.email;
        const result = await queriesCollection.insertOne(newQuery);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    app.get("/queries", async (req, res) => {
      try {
        const result = await queriesCollection.find().toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    app.get("/queries/:id", async (req, res) => {
      const { id } = req.params;
      try {
        const query = await queriesCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!query) return res.status(404).send({ message: "Query not found" });
        res.send(query);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    app.patch("/queries/:id/recommend", async (req, res) => {
      const { id } = req.params;
      try {
        const result = await queriesCollection.updateOne(
          { _id: new ObjectId(id) },
          { $inc: { recommendationCount: 1 } }
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    app.delete("/queries/:id", verifyFirebaseToken, async (req, res) => {
      const { id } = req.params;
      try {
        const query = await queriesCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!query) return res.status(404).send({ message: "Query not found" });
        if (query.email !== req.user.email)
          return res.status(403).send({ message: "Forbidden: Not your query" });

        await queriesCollection.deleteOne({ _id: new ObjectId(id) });
        res.send({ message: "Query deleted successfully" });
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // =====================
    // RECOMMENDATIONS ROUTES
    // =====================

    app.post("/recommendations", verifyFirebaseToken, async (req, res) => {
      try {
        const rec = req.body;
        rec.date = new Date().toISOString();
        rec.userEmail = req.user.email;

        const result = await recommendationsCollection.insertOne(rec);

        await queriesCollection.updateOne(
          { _id: new ObjectId(rec.queryId) },
          { $inc: { recommendationCount: 1 } }
        );

        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    app.get("/recommendations", async (req, res) => {
      const { queryId, userEmail } = req.query;
      const filter = {};
      if (queryId) filter.queryId = queryId;
      if (userEmail) filter.userEmail = userEmail;

      try {
        const recs = await recommendationsCollection.find(filter).toArray();
        res.send(recs);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    app.delete(
      "/recommendations/:id",
      verifyFirebaseToken,
      async (req, res) => {
        const { id } = req.params;
        try {
          const recommendation = await recommendationsCollection.findOne({
            _id: new ObjectId(id),
          });
          if (!recommendation)
            return res
              .status(404)
              .send({ message: "Recommendation not found" });
          if (recommendation.userEmail !== req.user.email)
            return res
              .status(403)
              .send({ message: "Forbidden: Not your recommendation" });

          await recommendationsCollection.deleteOne({ _id: new ObjectId(id) });
          await queriesCollection.updateOne(
            { _id: new ObjectId(recommendation.queryId) },
            { $inc: { recommendationCount: -1 } }
          );

          res.send({ message: "Recommendation deleted successfully" });
        } catch (error) {
          res.status(500).send({ message: error.message });
        }
      }
    );

    // Get recommendations for all queries of a user
    app.get(
      "/recommendationsForUser",
      verifyFirebaseToken,
      async (req, res) => {
        try {
          const userQueries = await queriesCollection
            .find({ email: req.user.email })
            .project({ _id: 1, queryTitle: 1 })
            .toArray();

          const queryIds = userQueries.map((q) => q._id.toString());

          const recommendations = await recommendationsCollection
            .find({ queryId: { $in: queryIds } })
            .toArray();

          const result = recommendations.map((rec) => {
            const query = userQueries.find(
              (q) => q._id.toString() === rec.queryId
            );
            return { ...rec, queryTitle: query?.queryTitle };
          });

          res.send(result);
        } catch (err) {
          console.error(err);
          res.status(500).send({ message: err.message });
        }
      }
    );

    // TOP RECOMMENDED QUERIES
    app.get("/top-queries", async (req, res) => {
      try {
        const topQueries = await queriesCollection
          .find()
          .sort({ recommendationCount: -1 })
          .limit(3)
          .toArray();
        res.send(topQueries);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    console.log("✅ Successfully connected to MongoDB!");
  } finally {
    // Keep the client open
  }
}

run().catch(console.dir);

// Root route
app.get("/", (req, res) => {
  res.send("SmartPick Server is Running...");
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
