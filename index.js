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
    const usersCollection = db.collection("users");
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


    //  Add New User (only if doesn't exist)
    app.post("/users", async (req, res) => {
      try {
        const user = req.body;

        const existingUser = await usersCollection.findOne({
          email: user.email,
        });
        if (existingUser) {
          return res.status(200).send({ message: "User already exists" });
        }

        const newUser = {
          ...user,
          role: "user",
          isFirstLogin: true,
          createdAt: new Date(),
        };

        const result = await usersCollection.insertOne(newUser);
        res.status(201).send({
          insertedId: result.insertedId,
          message: "✅ User registered successfully",
        });
      } catch (error) {
        console.error("❌ Failed to register user:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });
    

    //  Get a Single User by Email
    app.get("/users/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const user = await usersCollection.findOne({ email });

        if (!user) {
          return res.status(404).send({ message: "User not found" });
        }

        res.send(user);
      } catch (error) {
        res.status(500).send({ message: "Error fetching user" });
      }
    });

    // update isFoirstLogin = false
    app.patch("/users/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const updateData = req.body;

        const result = await usersCollection.updateOne(
          { email },
          { $set: updateData }
        );

        res.send({
          modifiedCount: result.modifiedCount,
          message: "User updated",
        });
      } catch (error) {
        res.status(500).send({ message: "Failed to update user" });
      }
    });

    // addProperties Secure POST Route---
    app.post("/addProperties", async (req, res) => {
      try {
        const property = req.body;
        property.verificationStatus = "pending";
        property.createdAt = new Date();

        const result = await addPropertyCollection.insertOne(property);

        res.status(201).send({
          insertedId: result.insertedId,
          message: "✅ Property added successfully",
        });
      } catch (error) {
        console.error("❌ Failed to add property:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    //  GET: My Properties by agent email
    app.get("/properties", async (req, res) => {
      const agentEmail = req.query.agentEmail;
      if (!agentEmail) {
        return res.status(400).send({ message: "Agent email is required" });
      }

      try {
        const result = await addPropertyCollection
          .find({ agentEmail })
          .sort({ createdAt: -1 })
          .toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch properties" });
      }
    });

    // ✅ GET: Single Property by ID(my properties)
    app.get("/properties/:id", async (req, res) => {
      const id = req.params.id;

      try {
        const result = await addPropertyCollection.findOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch property" });
      }
    });

    //  PATCH: Update Property (my properties)
    app.patch("/properties/:id", async (req, res) => {
      const id = req.params.id;
      const updateData = req.body;

      try {
        const result = await addPropertyCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData }
        );
        res.send(result);
      } catch (error) {
        res.status(500).json({ message: "Failed to update property" });
      }
    });

    // DELETE: Remove Property (my Properties)
    app.delete("/properties/:id", async (req, res) => {
      const id = req.params.id;

      try {
        const result = await addPropertyCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to delete property" });
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
