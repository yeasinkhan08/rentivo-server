require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: [process.env.CLIENT_URL, "http://localhost:3000"].filter(Boolean),
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

app.get("/", (req, res) => {
  res.send("Rentivo server is running");
});

async function run() {
  try {
    await client.connect();
    const db = client.db("RENTIVO");
    console.log("MongoDB connected");

    // BetterAuth stores users in the "user" collection
    const usersCollection = db.collection("user");
    const equipmentCollection = db.collection("equipment");

    const { verifyToken, verifyOwner, verifyAdmin } =
      require("./middleware/auth")(usersCollection);

    // ---------- users ----------

    // get the logged-in user's role
    app.get("/users/role/:email", verifyToken, async (req, res) => {
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const user = await usersCollection.findOne({ email: req.params.email });
      res.send({ role: user?.role || "customer" });
    });

    // admin: all users
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const users = await usersCollection
        .find()
        .sort({ createdAt: -1 })
        .toArray();
      res.send(users);
    });

    // any logged-in user: update own profile
    // (must stay above "/users/:id/role" style routes to avoid id clashes)
    app.patch("/users/profile", verifyToken, async (req, res) => {
      const { name, image, phone, address } = req.body;
      const result = await usersCollection.updateOne(
        { email: req.decoded.email },
        { $set: { name, image, phone, address } },
      );
      res.send(result);
    });

    // admin: change a user's role
    app.patch("/users/:id/role", verifyToken, verifyAdmin, async (req, res) => {
      const { role } = req.body;
      if (!["customer", "owner", "admin"].includes(role)) {
        return res.status(400).send({ message: "invalid role" });
      }
      if (!ObjectId.isValid(req.params.id)) {
        return res.status(400).send({ message: "invalid id" });
      }
      const result = await usersCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: { role } },
      );
      res.send(result);
    });

    // ---------- equipment ----------
    require("./routes/equipment")(
      app,
      { usersCollection, equipmentCollection },
      { verifyToken, verifyOwner, verifyAdmin },
    );

    // bookings, payments, favorites and analytics routes will be added here

    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error("Server failed to start:", error);
  }
}

run();
