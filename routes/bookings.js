const { ObjectId } = require("mongodb");
const Stripe = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const currency = process.env.STRIPE_CURRENCY || "usd";
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

// duration and total, always calculated on the server
function calculateTotal(item, startDate, endDate, quantity) {
  const msPerDay = 24 * 60 * 60 * 1000;
  const days =
    Math.round((new Date(endDate) - new Date(startDate)) / msPerDay) + 1;
  let units = days;
  if (item.rentalType === "Weekly") units = Math.ceil(days / 7);
  if (item.rentalType === "Monthly") units = Math.ceil(days / 30);
  return { days, units, total: item.price * units * quantity };
}

module.exports = (app, collections, middleware) => {
  const {
    usersCollection,
    equipmentCollection,
    bookingsCollection,
    paymentsCollection,
  } = collections;
  const { verifyToken, verifyRenter } = middleware;

  // how many units are still free for the chosen dates
  const getAvailable = async (item, startDate, endDate) => {
    const overlapping = await bookingsCollection
      .find({
        equipmentId: String(item._id),
        bookingStatus: "confirmed",
        startDate: { $lte: endDate },
        endDate: { $gte: startDate },
      })
      .toArray();
    const used = overlapping.reduce(
      (sum, booking) => sum + booking.quantity,
      0,
    );
    return item.quantity - used;
  };

  // customer: check the booking and start Stripe Checkout
  app.post(
    "/bookings/checkout",
    verifyToken,
    verifyRenter,
    async (req, res) => {
      try {
        const { equipmentId, startDate, endDate, contact, address, notes } =
          req.body;
        const quantity = Number(req.body.quantity);
        const today = new Date().toISOString().slice(0, 10);

        if (!ObjectId.isValid(equipmentId)) {
          return res.status(400).send({ message: "invalid equipment" });
        }
        if (!datePattern.test(startDate) || !datePattern.test(endDate)) {
          return res.status(400).send({ message: "invalid dates" });
        }
        if (startDate < today || endDate < startDate) {
          return res.status(400).send({ message: "choose valid rental dates" });
        }
        if (!Number.isInteger(quantity) || quantity < 1) {
          return res.status(400).send({ message: "invalid quantity" });
        }
        if (!contact || !address) {
          return res
            .status(400)
            .send({ message: "contact number and address are required" });
        }

        const item = await equipmentCollection.findOne({
          _id: new ObjectId(equipmentId),
          status: "approved",
        });
        if (!item) {
          return res.status(404).send({ message: "equipment not found" });
        }

        const available = await getAvailable(item, startDate, endDate);
        if (quantity > available) {
          return res.status(409).send({
            message: `Only ${Math.max(available, 0)} unit(s) available for these dates`,
          });
        }

        const { total } = calculateTotal(item, startDate, endDate, quantity);

        const session = await stripe.checkout.sessions.create({
          mode: "payment",
          customer_email: req.decoded.email,
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency,
                product_data: {
                  name: `${item.name} (${startDate} to ${endDate}, x${quantity})`,
                },
                unit_amount: Math.round(total * 100),
              },
            },
          ],
          metadata: {
            equipmentId,
            startDate,
            endDate,
            quantity: String(quantity),
            contact: String(contact).slice(0, 100),
            address: String(address).slice(0, 400),
            notes: String(notes || "").slice(0, 400),
            customerEmail: req.decoded.email,
          },
          success_url: `${process.env.CLIENT_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.CLIENT_URL}/equipment/${equipmentId}`,
        });

        res.send({ url: session.url });
      } catch (error) {
        console.error("Checkout error:", error.message);
        res.status(500).send({ message: "Could not start payment" });
      }
    },
  );

  // customer: after Stripe redirects back, verify payment and save the booking
  app.post("/bookings/confirm", verifyToken, verifyRenter, async (req, res) => {
    try {
      const { sessionId } = req.body;
      if (!sessionId) {
        return res.status(400).send({ message: "missing payment session" });
      }

      let session;
      try {
        session = await stripe.checkout.sessions.retrieve(sessionId);
      } catch (error) {
        return res.status(400).send({ message: "invalid payment session" });
      }

      if (session.payment_status !== "paid") {
        return res.status(400).send({ message: "payment was not completed" });
      }

      const m = session.metadata;
      if (m.customerEmail !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const item = await equipmentCollection.findOne({
        _id: new ObjectId(m.equipmentId),
      });
      const customer = await usersCollection.findOne({
        email: req.decoded.email,
      });
      if (!item) {
        return res.status(404).send({ message: "equipment no longer exists" });
      }

      // save the payment first; the unique index on sessionId blocks duplicates
      const bookingId = new ObjectId();
      try {
        await paymentsCollection.insertOne({
          sessionId,
          paymentIntent: session.payment_intent,
          bookingId: bookingId.toString(),
          customerEmail: req.decoded.email,
          ownerEmail: item.ownerEmail,
          amount: session.amount_total / 100,
          currency: session.currency,
          status: "paid",
          paidAt: new Date(),
        });
      } catch (error) {
        if (error.code === 11000) {
          const existing = await paymentsCollection.findOne({ sessionId });
          return res.send({
            message: "already confirmed",
            bookingId: existing.bookingId,
          });
        }
        throw error;
      }

      await bookingsCollection.insertOne({
        _id: bookingId,
        equipmentId: String(item._id),
        equipmentName: item.name,
        equipmentImage: item.image,
        ownerName: item.ownerName,
        ownerEmail: item.ownerEmail,
        customerName: customer?.name || "",
        customerEmail: req.decoded.email,
        startDate: m.startDate,
        endDate: m.endDate,
        quantity: Number(m.quantity),
        contact: m.contact,
        address: m.address,
        notes: m.notes || "",
        totalAmount: session.amount_total / 100,
        paymentStatus: "paid",
        bookingStatus: "confirmed",
        createdAt: new Date(),
      });

      res.send({
        message: "booking confirmed",
        bookingId: bookingId.toString(),
      });
    } catch (error) {
      console.error("Confirm error:", error.message);
      res.status(500).send({ message: "Could not confirm the booking" });
    }
  });
};
