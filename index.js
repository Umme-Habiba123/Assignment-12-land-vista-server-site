// server/index.js
const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const admin = require("firebase-admin");
const jwt = require("jsonwebtoken");

// Middleware------
app.use(cors());
app.use(express.json());

const serviceAccount = require("./firebase-admin-key.json");
const { verify } = require("jsonwebtoken");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.jbcozto.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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
    const paymentsCollection = db.collection("payments");
    const propertiesCollection = db.collection("properties");
    const soldPropertiesCollection = db.collection("soldProperties");
    const contactsCollection = db.collection('contacts')

    //Token Verification Middleware -----
    const verifyFBToken = async (req, res, next) => {
      console.log("header in middleware", req.headers);
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        console.log('authHeader', authHeader)
        return res.status(401).send({ message: "unauthorized access" });
      }

      const token = authHeader.split(" ")[1];
      if (!token) {

        return res.status(401).send({ message: "unauthorized access" });
      }

      // verify the toke----
      try {
        console.log('token', token)
        const decoded = await admin.auth().verifyIdToken(token);
        req.decoded = decoded;
      } catch (error) {
        console.log(error)
        return res.status(403).send({ message: "forbidden access" });
      }

      next();
    };

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      if (!user || user.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    const verifyAgent = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      if (!user || user.role !== "agent") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    app.post("/jwt", async (req, res) => {
      const { email } = req.body;

      try {
        const user = await usersCollection.findOne({ email });

        if (!user) {
          return res.status(401).send({ message: "Unauthorized access" });
        }

        const token = jwt.sign(
          { email: user.email, role: user.role },
          process.env.ACCESS_TOKEN_SECRET,
          { expiresIn: "7d" }
        );

        res.send({ token });
      } catch (err) {
        console.error("JWT error:", err);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    // sales section-----------
    app.get("/sales", async (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 3; // default 3
        const properties = await Property.find({ status: "verified", sale: true })
          .sort({ createdAt: -1 })
          .limit(limit);

        res.status(200).json(properties);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server Error" });
      }
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
          displayName: user.displayName || user.name || "Unnamed User",
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

    //GET: All users (for ManageUsers)
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
    app.get("/users/:email", verifyFBToken, async (req, res) => {
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

    app.patch("/users/:email", verifyFBToken, async (req, res) => {
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

    // GET /users/admins----
    app.get("/users/admins", async (req, res) => {
      try {
        const admins = await usersCollection.find({ role: "admin" }).toArray();
        res.send(admins);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch admins" });
      }
    });

    // Get user role by email--------
    app.get("/users/role/:email", verifyFBToken, async (req, res) => {
      const email = req.params.email;
      try {
        const user = await usersCollection.findOne({ email });

        if (!user) {
          return res.status(404).send({ message: "User not found" });
        }

        res.send({ role: user.role || "user" });
      } catch (error) {
        console.error(" Error fetching role:", error);
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

    app.patch("/properties/advertise/:id", async (req, res) => {
      try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid property id" });
        }

        const result = await addPropertyCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { isAdvertised: true } }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ message: "Property not found" });
        }

        res.send({ message: "Property advertised successfully" });
      } catch (error) {
        console.error("Error advertising property:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // GET /properties?isAdvertised=true&verificationStatus=verified
    app.get("/properties", async (req, res) => {
      try {
        const { isAdvertised, verificationStatus } = req.query;

        const query = {};

        if (isAdvertised !== undefined) {
          query.isAdvertised = isAdvertised === "true";
        }

        if (verificationStatus) {
          query.verificationStatus = verificationStatus;
        }

        const properties = await addPropertyCollection
          .find(query)
          .sort({ createdAt: -1 })
          .toArray();

        res.send(properties);
      } catch (error) {
        console.error("Failed to fetch properties:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.get("/advertised-properties", async (req, res) => {
      try {
        const advertisedProperties = await propertiesCollection
          .find({ advertised: true, isVerified: true }) // Verified ও advertise করা property
          .toArray();

        res.send(advertisedProperties);
      } catch (error) {
        console.error("Error fetching advertised properties:", error);
        res
          .status(500)
          .send({ message: "Failed to fetch advertised properties." });
      }
    });

    app.patch("/properties/advertise/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          advertised: true,
        },
      };
      const result = await propertiesCollection.updateOne(filter, updateDoc);
      res.send(result);
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

    //   const status = req.query.status;
    //   let query = {};

    //   if (status) {
    //     query.verificationStatus = status;
    //   }

    //   const result = await propertiesCollection.find(query).toArray();
    //   res.send(result);
    // });

    // উদাহরণ: node.js/express backend

    app.get("/properties", async (req, res) => {
      const status = req.query.status; // e.g. "verified"
      let filter = {};

      if (status) {
        filter.verificationStatus = status;
      }
      const properties = await db
        .collection("properties")
        .find(filter)
        .toArray();
      res.send(properties);
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

    //Get sold properties for a specific agent
    app.get(
      "/sold-properties",
      verifyFBToken,
      verifyAgent,
      async (req, res) => {
        const agentEmail = req.query.agentEmail;

        console.log("Fetching sold properties for:", agentEmail);

        if (!agentEmail) {
          return res
            .status(400)
            .json({ error: "agentEmail query parameter is required" });
        }

        try {
          const soldProperties = await paymentsCollection
            .aggregate([
              { $match: { status: "bought" } },
              {
                $lookup: {
                  from: "offers",
                  localField: "offerId",
                  foreignField: "_id",
                  as: "offerDetails",
                },
              },
              { $unwind: "$offerDetails" },
              { $match: { "offerDetails.agentEmail": agentEmail } },

              {
                $lookup: {
                  from: "addProperties",
                  localField: "offerDetails.propertyId",
                  foreignField: "_id",
                  as: "propertyDetails",
                },
              },
              { $unwind: "$propertyDetails" },

              {
                $project: {
                  _id: 1,
                  propertyTitle: "$propertyDetails.title",
                  propertyLocation: "$propertyDetails.location",
                  buyerEmail: "$offerDetails.buyerEmail",
                  buyerName: "$offerDetails.buyerName",
                  soldPrice: "$amount",
                  transactionId: 1,
                  date: 1,
                },
              },
            ])
            .toArray();

          console.log("Found sold properties:", soldProperties);

          res.json(soldProperties);
        } catch (error) {
          console.error("Error fetching sold properties:", error);
          res.status(500).json({ error: "Internal Server Error" });
        }
      }
    );

    // PATCH: manage property- Verify property
    app.patch("/admin/verify-property/:id", async (req, res) => {
      const id = req.params.id;
      const result = await addPropertyCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { verificationStatus: "verified" } }
      );
      res.send(result);
    });

    // PATCH: manage property Reject property by admin
    app.patch("/admin/reject-property/:id", async (req, res) => {
      const id = req.params.id;
      const result = await addPropertyCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { verificationStatus: "rejected" } }
      );
      res.send(result);
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

    app.post("/reviews", async (req, res) => {
      try {
        const {
          propertyId,
          userEmail,
          userName,
          propertyTitle,
          review,
          reviewedAt,
          reviewerImage,
        } = req.body;

        if (!propertyId || !userEmail || !review) {
          return res.status(400).json({ message: "Missing required fields" });
        }

        const newReview = {
          propertyId,
          userEmail,
          userName,
          propertyTitle,
          review,
          reviewedAt: reviewedAt ? new Date(reviewedAt) : new Date(),
          reviewerImage,
        };

        const result = await reviewCollection.insertOne(newReview);
        if (result.insertedId) {
          res.status(201).json({ message: "Review added successfully" });
        } else {
          res.status(500).json({ message: "Failed to add review" });
        }
      } catch (error) {
        console.error("Error saving review:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    app.get("/reviews", async (req, res) => {
      try {
        const reviews = await reviewCollection.find().toArray();
        res.send(reviews);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch reviews" });
      }
    });

    app.get("/reviews/latest", async (req, res) => {
      try {
        const latestReviews = await reviewCollection
          .find({})
          .sort({ reviewedAt: -1 })
          .limit(3)
          .project({
            userName: 1,
            review: 1,
            propertyTitle: 1,
            reviewerImage: 1,
          })
          .toArray();

        res.json(latestReviews);
      } catch (error) {
        console.error("Error fetching latest reviews:", error);
        res.status(500).json({ message: "Internal server error" });
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
    app.get("/wishlist/:email", verifyFBToken, async (req, res) => {
      try {
        const email = req.params.email;
        console.log("Fetching wishlist for:", email);

        if (req.decoded.email !== req.params.email) {
          return res.status(403).send({ message: "forbidden access" });
        }

        const wishlistItems = await wishlistCollection
          .find({ userEmail: email })
          .toArray();

        console.log("Wishlist items:", wishlistItems);

        const validPropertyIds = wishlistItems
          .map((item) => item.propertyId)
          .filter((id) => ObjectId.isValid(id)) // null/invalid বাদ
          .map((id) => new ObjectId(id));

        console.log("Valid property IDs:", validPropertyIds);

        const properties = await addPropertyCollection
          .find({ _id: { $in: validPropertyIds } })
          .toArray();

        console.log("Fetched properties:", properties);

        const mergedWishlist = wishlistItems.map((item) => {
          const property = properties.find(
            (p) => p._id.toString() === item.propertyId
          );

          return {
            ...item,
            ...property,
          };
        });

        res.send(mergedWishlist);
      } catch (error) {
        console.error("❌ Error fetching wishlist:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // Delete Wishlist Item by ID--------
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

    // Make a new offer -----
    app.post("/offers", async (req, res) => {
      try {
        const {
          propertyId,
          title,
          location,
          image,
          agentName,
          agentEmail,
          offerAmount,
          buyerEmail,
          buyerName,
        } = req.body;

        let finalAgentEmail = agentEmail?.toLowerCase();

        if (!finalAgentEmail) {
          const property = await addPropertyCollection.findOne({
            _id: new ObjectId(propertyId),
          });
          finalAgentEmail = property?.agentEmail?.toLowerCase() || "";
        }

        const newOffer = {
          propertyId: new ObjectId(propertyId),
          title,
          location,
          image: image || "",
          agentName,
          agentEmail: finalAgentEmail,
          offerAmount: parseFloat(offerAmount),
          buyerEmail: buyerEmail?.toLowerCase(),
          buyerName,
          buyingDate: new Date(),
          status: "pending",
          createdAt: new Date(),
        };

        const result = await offersCollection.insertOne(newOffer);
        res.send({
          insertedId: result.insertedId,
          message: "Offer submitted successfully",
        });
      } catch (error) {
        console.error("Failed to submit offer:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    //Get all offers by logged-in BUYER -----
    app.get("/offers", verifyFBToken, async (req, res) => {
      const email = req.query.email?.toLowerCase();

      // Check if email query exists----
      if (!email) {
        return res.status(400).send({ message: "Email is required in query" });
      }

      // 🔐 Check if the token's email matches the requested email
      if (req.decoded.email !== email) {
        return res
          .status(403)
          .send({ message: "Forbidden access: Email mismatch" });
      }

      try {
        const result = await offersCollection
          .find({ buyerEmail: email })
          .toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching offers:", error);
        res.status(500).send({ Fmessage: "Server error" });
      }
    });

    // Get offers assigned to logged-in AGENT -----------
    app.get(
      "/agent/requested-offers/:email",
      verifyFBToken,
      verifyAgent,
      async (req, res) => {
        try {
          const agentEmail = req.params.email?.toLowerCase();
          const offers = await offersCollection
            .find({ agentEmail: agentEmail })
            .toArray();
          res.send(offers);
        } catch (error) {
          console.error("Error fetching agent offers", error);
          res.status(500).send({ message: "Server error" });
        }
      }
    );

    // agent accept offer by id----------
    app.patch("/agent/accept-offer/:id", async (req, res) => {
      const id = req.params.id;
      const offer = await offersCollection.findOne({ _id: new ObjectId(id) });

      if (!offer) return res.status(404).send({ message: "Offer not found" });

      const { propertyId } = offer;

      // Accept the selected offer
      await offersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "accepted" } }
      );

      // Reject other offers for the same property
      await offersCollection.updateMany(
        {
          propertyId,
          _id: { $ne: new ObjectId(id) },
        },
        {
          $set: { status: "rejected" },
        }
      );

      res.send({ message: "Offer accepted and others rejected" });
    });

    //Reject only a single offer-------
    app.patch("/agent/reject-offer/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const result = await offersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "rejected" } }
        );

        if (result.modifiedCount === 0) {
          return res
            .status(404)
            .send({ message: "Offer not found or already rejected" });
        }

        res.send({ message: "Offer rejected" });
      } catch (error) {
        console.error("Error rejecting offer", error);
        res.status(500).send({ message: "Failed to reject offer" });
      }
    });

    //Get a single offer by ID (for Payment, Tracking etc.)-------------
    app.get("/offers/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const offer = await offersCollection.findOne({ _id: new ObjectId(id) });
        if (!offer) return res.status(404).send({ message: "Offer not found" });
        res.send(offer);
      } catch (error) {
        console.error("Error fetching offer", error);
        res.status(500).send({ message: "Server error" });
      }
    });

    //Delete all offers with missing agentEmail (Debug purpose only)-------
    app.delete("/debug/delete-bad-offers", async (req, res) => {
      const result = await offersCollection.deleteMany({
        agentEmail: { $in: [null, ""] },
      });
      res.send({ deleted: result.deletedCount });
    });

    app.post("/payments", async (req, res) => {
      try {
        const paymentData = req.body;

        // Simple validation
        if (
          !paymentData.offerId ||
          !paymentData.buyerEmail ||
          !paymentData.amount ||
          !paymentData.transactionId
        ) {
          return res
            .status(400)
            .json({ error: "Missing required payment fields." });
        }

        // Insert payment data into MongoDB
        const result = await paymentsCollection.insertOne({
          ...paymentData,
          offerId: new ObjectId(paymentData.offerId),
          propertyId: new ObjectId(paymentData.propertyId),
          createdAt: new Date(),
        });

        if (result.insertedId) {
          res.status(201).json({ insertedId: result.insertedId });
        } else {
          res.status(500).json({ error: "Failed to save payment." });
        }
      } catch (error) {
        console.error("Error in /payments:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    // /payments/mark-paid/:id------------
    app.patch("/payments/mark-paid/:id", async (req, res) => {
      const id = req.params.id;
      const { transactionId } = req.body;

      const result = await offersCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            status: "bought",
            transactionId: transactionId,
          },
        }
      );
      res.send(result);
    });

    //Make sure amount received & validated properly
    app.post("/create-payment-intent", async (req, res) => {
      const { amount } = req.body;
      const amountInCents = Math.round(amount * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({ clientSecret: paymentIntent.client_secret });
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
    app.get("/reviews/user", verifyFBToken, async (req, res) => {
      const userEmail = req.query.email;

      if (req.decoded.email !== userEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }

      if (!userEmail)
        return res.status(400).send({ message: "User email is required" });

      try {
        const reviews = await reviewCollection
          .aggregate([
            { $match: { userEmail } },
            {
              $lookup: {
                from: "addProperties",
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

    // POST route for booking contact------------------
    app.post("/contacts", async (req, res) => {
      try {
        const contact = {
          phone: req.body.phone,
          status: "pending",
          createdAt: new Date(),
        };
        const result = await contactsCollection.insertOne(contact);
        res.status(201).json(result);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
      }
    });


    // GET all contacts
    app.get("/contacts", async (req, res) => {
      try {
        const contacts = await contactsCollection.find().sort({ createdAt: -1 }).toArray();
        res.status(200).json(contacts);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
      }
    });

    // PATCH contact status
    app.patch("/contacts/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const status = req.body.status;
        const result = await contactsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } }
        );
        res.status(200).json(result);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
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
