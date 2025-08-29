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
  cors({
    origin: ["http://localhost:5173"], 
    credentials: true,
  })
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
    await client.connect();
    const db = client.db("smartPickDB");
    const queriesCollection = db.collection("queries");
    const recommendationsCollection = db.collection("recommendations");

    // =====================
    // QUERIES ROUTES
    // =====================
app.post("/queries", verifyFirebaseToken, async (req, res) => {
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
    

    
    // =====================
    // RECOMMENDATIONS ROUTES
    // =====================

    

    // Get recommendations for all queries of a user
    
    // TOP RECOMMENDED QUERIES
    

    await db.command({ ping: 1 });
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
