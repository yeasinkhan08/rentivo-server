module.exports = (app, collections) => {
  const { messagesCollection } = collections;

  // public: save a contact message
  app.post("/contact", async (req, res) => {
    try {
      const { name, email, message } = req.body;

      if (!name || !email || !message) {
        return res.status(400).send({ message: "All fields are required" });
      }
      if (!String(email).includes("@")) {
        return res.status(400).send({ message: "Enter a valid email" });
      }

      await messagesCollection.insertOne({
        name: String(name).slice(0, 100),
        email: String(email).slice(0, 200),
        message: String(message).slice(0, 2000),
        createdAt: new Date(),
      });

      res.send({ message: "Message received" });
    } catch (error) {
      console.error("Contact error:", error.message);
      res.status(500).send({ message: "Could not save your message" });
    }
  });
};
