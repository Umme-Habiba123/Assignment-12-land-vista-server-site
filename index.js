// server/index.js
const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const port = process.env.PORT || 5000;

// const { getAuth } = require("firebase-admin/auth");
// const User = require("../models/User"); // MongoDB model

// Middleware------
app.use(cors());
app.use(express.json());

// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.jbcozto.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.jbcozto.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// const uri = "mongodb+srv://<db_username>:<db_password>@cluster0.jbcozto.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

const client = new MongoClient(uri, {
  serverApi: ServerApiVersion.v1,
});

async function run() {
  try {
    await client.connect();
    const db = client.db("realStateDB");
    const usersCollection = db.collection("users");
    const addPropertyCollection = db.collection("addProperties");
    const reviewCollection = db.collection("reviews");
    const wishlistCollection = db.collection("wishlist");
    const offersCollection = db.collection("offers");

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
      console.log("Received user:", req.body);
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
          createdAt: new Date().toISOString(),
        };

        const result = await usersCollection.insertOne(newUser);
        console.log("Inserted user ID:", result.insertedId);
        res.status(201).send({
          insertedId: result.insertedId,
          message: "✅ User registered successfully",
        });
      } catch (error) {
        console.error("❌ Failed to register user:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    // ✅ GET: All users (for ManageUsers)
    app.get("/users", async (req, res) => {
      try {
        const users = await usersCollection.find().toArray();
        res.send(users);
      } catch (error) {
        console.error("❌ Failed to fetch users:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    //  Get a Single User by Email
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      console.log(email);
      try {
        const user = await usersCollection.findOne({ email });
        if (!user) {
          return res.status(404).send({ message: "User not found" });
        }
        res.send(user);
      } catch (error) {
        res.status(500).send({ message: "Error fetching user" });
      }
    });

    // // ✅ Update User Info by Email
    // app.patch("/users/:email", async (req, res) => {
    //   try {
    //     const email = req.params.email;
    //     const updateData = req.body;

    //     const result = await usersCollection.updateOne(
    //       { email },
    //       { $set: updateData }
    //     );

    //     res.send({
    //       modifiedCount: result.modifiedCount,
    //       message: "User updated",
    //     });
    //   } catch (error) {
    //     res.status(500).send({ message: "Failed to update user" });
    //   }
    // });

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

    // PATCH /users/make-admin/:id---------
    app.patch("/users/make-admin/:id", async (req, res) => {
      const id = req.params.id;
      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role: "admin" } }
      );
      res.send(result);
    });

    // GET /users/admins
    app.get("/users/admins", async (req, res) => {
      try {
        const admins = await usersCollection.find({ role: "admin" }).toArray();
        res.send(admins);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch admins" });
      }
    });

    // Get user role by email--------
    app.get("/users/role/:email", async (req, res) => {
      const email = req.params.email;
      try {
        const user = await usersCollection.findOne({ email });

        if (!user) {
          return res.status(404).send({ message: "User not found" });
        }

        res.send({ role: user.role || "user" });
      } catch (error) {
        console.error("❌ Error fetching role:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    // PATCH /users/role/:id
    app.patch("/users/role/:id", async (req, res) => {
      const id = req.params.id;
      const { role } = req.body;

      const allowedRoles = ["admin", "agent", "fraud"];
      if (!allowedRoles.includes(role)) {
        return res.status(400).send({ error: "Invalid role" });
      }

      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role: role } }
      );

      res.send(result);
    });

    // Make agent----
    app.patch("/users/make-agent/:id", async (req, res) => {
      const id = req.params.id;
      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role: "agent" } }
      );
      res.send(result);
    });

    // PATCH PATCH /users/mark-fraud/:id---------
    app.patch("/users/mark-fraud/:id", async (req, res) => {
      const id = req.params.id;

      // 1. Mark user as fraud
      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role: "fraud" } }
      );

      // 2. Delete all properties added by that agent
      await addPropertyCollection.deleteMany({ agentId: id });

      res.send(result);
    });

    // server/routes/userRoutes.js----
    app.delete("/users/:id", async (req, res) => {
      const id = req.params.id;
      const email = req.query.email;

      // 1. Delete from MongoDB
      const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });

      // 2. Optional: delete from Firebase (you can skip if not using Firebase Admin SDK)
      // await admin.auth().getUserByEmail(email).then(user => {
      //   return admin.auth().deleteUser(user.uid);
      // }).catch(error => {
      //   console.error("Firebase deletion failed:", error);
      // });

      res.send({ success: true });
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
    app.get("/addProperties", async (req, res) => {
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

    // delete kore dibo pore-----
    app.get("/properties", async (req, res) => {
      try {
        const result = await addPropertyCollection
          .find() // No filter
          .sort({ createdAt: -1 })
          .toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch all properties" });
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
      console.log("Delete request received for id:", id);

      try {
        if (!ObjectId.isValid(id)) {
          console.log("Invalid ObjectId:", id);
          return res.status(400).send({ message: "Invalid property id" });
        }

        const result = await addPropertyCollection.deleteOne({
          _id: new ObjectId(id),
        });
        console.log("Delete result:", result);

        if (result.deletedCount === 0) {
          return res.status(404).send({ message: "Property not found" });
        }

        res.send({ message: "Property deleted successfully" });
      } catch (error) {
        console.error("Error during deleting property:", error);
        res.status(500).send({ message: "Failed to delete property" });
      }
    });

    // Get-all property-------------
    app.get("/all-properties", async (req, res) => {
      try {
        const verifiedProperties = await addPropertyCollection
          .find({ verificationStatus: "verified" })
          .sort({ createdAt: -1 })
          .toArray();

        res.send(verifiedProperties);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch properties" });
      }
    });
    0;

    // PATCH: manage property- Verify property
    app.patch("/properties/verify/:id", async (req, res) => {
      const id = req.params.id;

      try {
        const result = await addPropertyCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { verificationStatus: "verified" } }
        );
        res.send(result);
      } catch (err) {
        console.error("Error verifying property:", err);
        res.status(500).send({ message: "Failed to verify property" });
      }
    });

    // PATCH: manage property Reject property by admin
    app.patch("/properties/reject/:id", async (req, res) => {
      const id = req.params.id;

      try {
        const result = await addPropertyCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { verificationStatus: "rejected" } }
        );

        res.send(result);
      } catch (err) {
        console.error("❌ Error rejecting property:", err);
        res.status(500).send({ message: "Failed to reject property" });
      }
    });

    // post reviews----
    app.post("/reviews", async (req, res) => {
      const review = req.body;

      if (!review.propertyId || !review.userEmail || !review.review) {
        return res
          .status(400)
          .send({ message: "Missing required review fields" });
      }

      try {
        const result = await reviewCollection.insertOne({
          ...review,
          reviewedAt: new Date(),
        });

        res.send(result);
      } catch (error) {
        console.error("❌ Failed to add review:", error);
        res.status(500).send({ message: "Failed to add review" });
      }
    });

    // get reviews----
    app.get("/reviews/user", async (req, res) => {
      const userEmail = req.query.email;
      if (!userEmail) {
        return res.status(400).send({ message: "User email is required" });
      }
      try {
        const reviews = await reviewCollection.find({ userEmail }).toArray();
        res.send(reviews);
      } catch (error) {
        console.error("❌ Failed to load user reviews:", error);
        res.status(500).send({ message: "Failed to load user reviews" });
      }
    });

    // post wishlist----
    app.post("/wishlist", async (req, res) => {
      const {
        userEmail,
        propertyId,
        title,
        image,
        location,
        agentName,
        agentImage,
        verified,
        minPrice,
        maxPrice,
      } = req.body;

      const existing = await wishlistCollection.findOne({
        userEmail,
        propertyId: String(propertyId),
      });

      if (existing) {
        return res
          .status(409)
          .send({ message: "Property already in wishlist" });
      }

      const newWishlistItem = {
        userEmail,
        propertyId: String(propertyId),
        title,
        image,
        location,
        agentName,
        agentImage,
        verified,
        minPrice,
        maxPrice,
        createdAt: new Date(),
      };

      const result = await wishlistCollection.insertOne(newWishlistItem);

      res.send(result);
    });

    //  Get Wishlist by User Email (GET)--------
    app.get("/wishlist/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const result = await wishlistCollection
          .find({ userEmail: email })
          .toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching wishlist:", error.message);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // Delete Wishlist Item by ID--------
    // ✅ Remove from Wishlist by ID (DELETE)
    app.delete("/wishlist/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const result = await wishlistCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).send({ message: "Wishlist item not found" });
        }

        res.send({ message: "Wishlist item removed", id });
      } catch (error) {
        console.error("Error deleting wishlist item:", error.message);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // POST: Save offer to DB
 app.post("/offers", async (req, res) => {
  try {
    const {
      propertyId,
      title,
      location,
      image,
      agentName,
      offerAmount,
      buyerEmail,
      buyerName,
    } = req.body;

    // ✅ Basic validation
    if (!propertyId || !buyerEmail || !offerAmount || !title || !location || !agentName) {
      return res.status(400).send({ message: "Missing required fields" });
    }

    const newOffer = {
      propertyId: propertyId.toString(),
      title,
      location,
      image: image || "", // fallback in case image missing
      agentName,
      offerAmount: parseFloat(offerAmount),
      buyerEmail,
      buyerName,
      buyingDate: new Date(), // accurate buy date
      status: "pending",
      createdAt: new Date(),
    };

    const result = await offersCollection.insertOne(newOffer);
    console.log("Inserted offer:", result.insertedId);

    res.send({
      insertedId: result.insertedId,
      message: "Offer submitted successfully",
    });
  } catch (error) {
    console.error("Failed to submit offer:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
});


    //  Get All Offers by Logged-in User----
    app.get("/offers", async (req, res) => {
      const email = req.query.email;
      if (!email) return res.status(400).send({ message: "Email required" });
      const result = await offersCollection
        .find({ userEmail: email })
        .toArray();
      res.send(result);
    });

    // Get all offers for a specific user
    app.get("/offers/:email", async (req, res) => {
      const email = req.params.email;
      const result = await offersCollection
        .find({ buyerEmail: email })
        .toArray();
      res.send(result);
    });

    // Get Single Offer by ID (for payment page)
    app.get("/offers/:id", async (req, res) => {
      const id = req.params.id;
      const result = await offersCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    //Update Offer Status to “accepted” (Agent Dashboard থেকে)---
    app.patch("/offers/accept/:id", async (req, res) => {
      const id = req.params.id;
      const result = await offersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "accepted" } }
      );
      res.send(result);
    });

    //Complete Payment → Update Status to “bought” and add Transaction ID---
    app.patch("/offers/payment/:id", async (req, res) => {
      const id = req.params.id;
      const { transactionId } = req.body;
      const result = await offersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "bought", transactionId } }
      );
      res.send(result);
    });

    // get reviews--------
    app.get("/reviews", async (req, res) => {
      const { propertyId, email } = req.query;

      if (!propertyId && !email) {
        return res
          .status(400)
          .send({ message: "Property ID or email is required" });
      }

      try {
        let filter = {};
        if (propertyId) {
          filter.propertyId = propertyId;
        } else if (email) {
          filter.userEmail = email;
        }

        const reviews = await reviewCollection
          .find(filter)
          .sort({ reviewedAt: -1 })
          .toArray();

        res.send(reviews);
      } catch (error) {
        console.error("❌ Failed to load reviews:", error);
        res.status(500).send({ message: "Failed to load reviews" });
      }
    });

    //  Get All Reviews by User-------
    app.get("/reviews/user", async (req, res) => {
      const userEmail = req.query.email;
      if (!userEmail)
        return res.status(400).send({ message: "User email is required" });

      try {
        const reviews = await reviewCollection
          .aggregate([
            { $match: { userEmail } },
            {
              $lookup: {
                from: "addProperties", // আপনার প্রপার্টিজ কালেকশনের নাম
                localField: "propertyId",
                foreignField: "_id",
                as: "propertyDetails",
              },
            },
            { $unwind: "$propertyDetails" },
            {
              $project: {
                userEmail: 1,
                userName: 1,
                review: 1,
                reviewedAt: 1,
                propertyId: 1,
                propertyTitle: "$propertyDetails.title",
                agentName: "$propertyDetails.agentName",
              },
            },
          ])
          .toArray();

        res.send(reviews);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to load user reviews" });
      }
    });

    //  Delete a Review by ID----------
    app.delete("/reviews/:id", async (req, res) => {
      const id = req.params.id;
      const result = await reviewCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
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
