// server/index.js

const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.jbcozto.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  serverApi: ServerApiVersion.v1,
});

async function run() {
  try {
    await client.connect();
    const db = client.db("realStateDB");
    const addPropertyCollection = db.collection("addProperties");

    // 🔐 Token Verification Middleware (optional - if needed)
    app.use((req, res, next) => {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.split(" ")[1];
        // 👉 তুমি চাইলে এখানে Firebase/Custom JWT verify করতে পারো
        // যেমন: admin.auth().verifyIdToken(token).then(...) ...
        req.userToken = token; // just passing along
      }
      next();
    });


    // addProperties Secure POST Route---
    app.post("/addProperties", async (req, res) => {
      try {
        const property = req.body;
        property.verificationStatus = "pending";
        property.createdAt = new Date();

        const result = await addPropertyCollection.insertOne(property);

        res.status(201).json({
          insertedId: result.insertedId,
          message: "✅ Property added successfully",
        });
      } catch (error) {
        console.error("❌ Failed to add property:", error);
        res.status(500).json({ message: "Internal Server Error"  });
      }
    });

        // Root Route
    app.get("/", (req, res) => {
      res.send("🏡 Real Estate Server is running");
    });


    await db.command({ ping: 1 });
    console.log("✅ MongoDB connected and ping successful");

    app.listen(port, () => {
      console.log(` Server running on http://localhost:${port}`);
    });
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
  }
}

run().catch(console.dir);
