require("dotenv").config();
const { MongoClient } = require("mongodb");

async function main() {
  const email = process.argv[2];
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const result = await client
    .db("RENTIVO")
    .collection("user")
    .updateOne({ email }, { $set: { role: "admin" } });
  console.log(
    result.matchedCount ? "Admin role set" : "User not found, register first",
  );
  await client.close();
}
main();
