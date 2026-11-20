require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: [process.env.CLIENT_URL, "http://localhost:3000"],
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

async function run() {
  try {
    await client.connect();
    const db = client.db("RENTIVO");
    console.log("MongoDB connected");

    // routes will be added here step by step
  } catch (error) {
    console.error("MongoDB connection failed:", error);
  }
}
run();

app.get("/", (req, res) => {
  res.send("Rentivo server is running");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
